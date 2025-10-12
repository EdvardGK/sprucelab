"""
IFC Processing Service

Extracts data from IFC files and stores in database.
"""
import ifcopenshell
import ifcopenshell.geom
import numpy as np
from django.db import transaction
from apps.entities.models import (
    IFCEntity, SpatialHierarchy, PropertySet,
    System, SystemMembership, Material, MaterialAssignment,
    IFCType, TypeAssignment, Geometry, GraphEdge, IFCValidationReport
)
from .services_graph import extract_graph_edges
from .services_validation import validate_ifc_file, get_validation_summary


def process_ifc_file(model_id, file_path):
    """
    Process an IFC file and extract all data to database.

    Args:
        model_id: UUID of the Model instance
        file_path: Path to the IFC file

    Returns:
        dict: Processing results with counts and schema info
    """
    from .models import Model

    # Get model instance
    model = Model.objects.get(id=model_id)

    # Open IFC file
    ifc_file = ifcopenshell.open(file_path)

    # Extract IFC schema
    ifc_schema = ifc_file.schema

    # Run validation FIRST (before extraction)
    print("\n🔍 Running IFC validation...")
    validation_report = validate_ifc_file(ifc_file)

    # Save validation report to database
    validation_summary = get_validation_summary(validation_report)
    validation_record = IFCValidationReport.objects.create(
        model=model,
        overall_status=validation_report['overall_status'],
        schema_valid=validation_report['schema_valid'],
        total_elements=validation_report['total_elements'],
        elements_with_issues=validation_report['elements_with_issues'],
        schema_errors=validation_report['schema_errors'],
        schema_warnings=validation_report['schema_warnings'],
        guid_issues=validation_report['guid_issues'],
        geometry_issues=validation_report['geometry_issues'],
        property_issues=validation_report['property_issues'],
        lod_issues=validation_report['lod_issues'],
        summary=validation_summary
    )

    print(validation_summary)

    # Initialize counters
    results = {
        'ifc_schema': ifc_schema,
        'element_count': 0,
        'storey_count': 0,
        'system_count': 0,
        'property_count': 0,
        'material_count': 0,
        'type_count': 0,
        'geometry_count': 0,
        'edge_count': 0,
        'validation_status': validation_report['overall_status'],
        'validation_id': str(validation_record.id),
    }

    # Use transaction for atomic operations
    with transaction.atomic():
        # Extract spatial hierarchy
        results['storey_count'] = extract_spatial_hierarchy(model, ifc_file)

        # Extract materials
        results['material_count'] = extract_materials(model, ifc_file)

        # Extract type objects
        results['type_count'] = extract_types(model, ifc_file)

        # Extract systems
        results['system_count'] = extract_systems(model, ifc_file)

        # Extract elements (main entities)
        element_count, geometry_count = extract_elements(model, ifc_file)
        results['element_count'] = element_count
        results['geometry_count'] = geometry_count

        # Extract property sets
        results['property_count'] = extract_property_sets(model, ifc_file)

        # Extract graph edges (relationships)
        results['edge_count'] = extract_graph_edges(model, ifc_file)

    # Log completion
    print(f"\n✅ IFC Processing Complete!")
    print(f"   - Elements: {results['element_count']}")
    print(f"   - Geometry extracted: {results['geometry_count']}")
    print(f"   - Properties: {results['property_count']}")
    print(f"   - Storeys: {results['storey_count']}")
    print(f"   - Systems: {results['system_count']}")
    print(f"   - Materials: {results['material_count']}")
    print(f"   - Types: {results['type_count']}")
    print(f"   - Graph edges: {results['edge_count']}\n")

    return results


def extract_spatial_hierarchy(model, ifc_file):
    """Extract project/site/building/storey hierarchy."""
    count = 0
    hierarchy_entities = {}  # Map GUID to IFCEntity for later linking

    # First create IFCEntity records for spatial elements
    # Get project
    project = ifc_file.by_type('IfcProject')
    if project:
        project = project[0]
        entity = IFCEntity.objects.create(
            model=model,
            ifc_guid=project.GlobalId,
            ifc_type='IfcProject',
            name=project.Name or 'Unnamed Project',
            has_geometry=False
        )
        hierarchy_entities[project.GlobalId] = entity

        SpatialHierarchy.objects.create(
            model=model,
            entity=entity,
            hierarchy_level='project'
        )
        count += 1

    # Get sites
    for site in ifc_file.by_type('IfcSite'):
        entity = IFCEntity.objects.create(
            model=model,
            ifc_guid=site.GlobalId,
            ifc_type='IfcSite',
            name=site.Name or 'Unnamed Site',
            has_geometry=False
        )
        hierarchy_entities[site.GlobalId] = entity

        SpatialHierarchy.objects.create(
            model=model,
            entity=entity,
            hierarchy_level='site'
        )
        count += 1

    # Get buildings
    for building in ifc_file.by_type('IfcBuilding'):
        entity = IFCEntity.objects.create(
            model=model,
            ifc_guid=building.GlobalId,
            ifc_type='IfcBuilding',
            name=building.Name or 'Unnamed Building',
            has_geometry=False
        )
        hierarchy_entities[building.GlobalId] = entity

        SpatialHierarchy.objects.create(
            model=model,
            entity=entity,
            hierarchy_level='building'
        )
        count += 1

    # Get storeys
    for storey in ifc_file.by_type('IfcBuildingStorey'):
        entity = IFCEntity.objects.create(
            model=model,
            ifc_guid=storey.GlobalId,
            ifc_type='IfcBuildingStorey',
            name=storey.Name or 'Unnamed Storey',
            has_geometry=False
        )
        hierarchy_entities[storey.GlobalId] = entity

        SpatialHierarchy.objects.create(
            model=model,
            entity=entity,
            hierarchy_level='storey'
        )
        count += 1

    return count


def extract_materials(model, ifc_file):
    """Extract materials from IFC file."""
    count = 0
    material_map = {}  # Map IFC material to database ID

    for material in ifc_file.by_type('IfcMaterial'):
        mat, created = Material.objects.get_or_create(
            model=model,
            name=material.Name or 'Unnamed Material',
            defaults={
                'category': getattr(material, 'Category', None),
            }
        )
        material_map[material.id()] = mat
        if created:
            count += 1

    return count


def extract_types(model, ifc_file):
    """Extract type objects (WallType, DoorType, etc.)."""
    count = 0

    for type_element in ifc_file.by_type('IfcTypeObject'):
        IFCType.objects.create(
            model=model,
            type_guid=type_element.GlobalId,
            ifc_type=type_element.is_a(),
            type_name=type_element.Name or 'Unnamed Type',
        )
        count += 1

    return count


def extract_systems(model, ifc_file):
    """Extract systems (HVAC, Electrical, Plumbing, etc.)."""
    count = 0

    for system in ifc_file.by_type('IfcSystem'):
        System.objects.create(
            model=model,
            system_guid=system.GlobalId,
            system_type=system.is_a(),
            system_name=system.Name or 'Unnamed System',
            description=getattr(system, 'Description', None)
        )
        count += 1

    return count


def extract_elements(model, ifc_file):
    """
    Extract all physical building elements with geometry.

    Returns:
        tuple: (element_count, geometry_count)
    """
    element_count = 0
    geometry_count = 0

    # Get all physical elements
    elements = ifc_file.by_type('IfcElement')

    # Setup geometry settings
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)

    for element in elements:
        # Only process elements with geometry
        if not element.Representation:
            continue

        # Get storey UUID (if assigned)
        storey_id = None
        if hasattr(element, 'ContainedInStructure') and element.ContainedInStructure:
            for rel in element.ContainedInStructure:
                if rel.RelatingStructure.is_a('IfcBuildingStorey'):
                    storey_guid = rel.RelatingStructure.GlobalId
                    # Find the IFCEntity with this GUID to get its UUID
                    try:
                        storey_entity = IFCEntity.objects.get(model=model, ifc_guid=storey_guid)
                        storey_id = storey_entity.id
                    except IFCEntity.DoesNotExist:
                        pass
                    break

        # Create entity record
        entity = IFCEntity.objects.create(
            model=model,
            ifc_guid=element.GlobalId,
            ifc_type=element.is_a(),
            name=element.Name or '',
            description=getattr(element, 'Description', None),
            storey_id=storey_id,
            has_geometry=True
        )
        element_count += 1

        # Extract geometry
        try:
            shape = ifcopenshell.geom.create_shape(settings, element)

            # Get vertices and faces
            vertices = np.array(shape.geometry.verts).reshape(-1, 3)
            faces = np.array(shape.geometry.faces).reshape(-1, 3)

            # Validate geometry
            if len(vertices) > 0 and len(faces) > 0:
                # Update entity with geometry info
                entity.vertex_count = len(vertices)
                entity.triangle_count = len(faces)

                # Calculate bounding box
                entity.bbox_min_x = float(vertices[:, 0].min())
                entity.bbox_min_y = float(vertices[:, 1].min())
                entity.bbox_min_z = float(vertices[:, 2].min())
                entity.bbox_max_x = float(vertices[:, 0].max())
                entity.bbox_max_y = float(vertices[:, 1].max())
                entity.bbox_max_z = float(vertices[:, 2].max())
                entity.save()

                # Store geometry
                Geometry.objects.create(
                    entity=entity,
                    vertices_original=vertices.tobytes(),  # Store as binary
                    faces_original=faces.tobytes()
                )
                geometry_count += 1

        except Exception as e:
            # Log error but continue processing
            print(f"Failed to extract geometry for {element.GlobalId}: {str(e)}")

    return element_count, geometry_count


def extract_property_sets(model, ifc_file):
    """Extract property sets (Psets) for all elements."""
    count = 0

    # Get all elements
    elements = ifc_file.by_type('IfcElement')

    for element in elements:
        # Get the IFCEntity for this element
        try:
            entity = IFCEntity.objects.get(model=model, ifc_guid=element.GlobalId)
        except IFCEntity.DoesNotExist:
            continue

        # Get property sets
        if hasattr(element, 'IsDefinedBy'):
            for definition in element.IsDefinedBy:
                if definition.is_a('IfcRelDefinesByProperties'):
                    property_set = definition.RelatingPropertyDefinition

                    if property_set.is_a('IfcPropertySet'):
                        pset_name = property_set.Name

                        # Extract individual properties
                        for prop in property_set.HasProperties:
                            if prop.is_a('IfcPropertySingleValue'):
                                prop_name = prop.Name
                                prop_value = str(prop.NominalValue.wrappedValue) if prop.NominalValue else None
                                prop_type = type(prop.NominalValue.wrappedValue).__name__ if prop.NominalValue else 'string'

                                PropertySet.objects.create(
                                    entity=entity,
                                    pset_name=pset_name,
                                    property_name=prop_name,
                                    property_value=prop_value,
                                    property_type=prop_type
                                )
                                count += 1

    return count
