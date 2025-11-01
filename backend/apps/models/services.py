"""
IFC Processing Service

Extracts data from IFC files and stores in database.

CRITICAL: All processing operations MUST create a ProcessingReport, even on catastrophic failure.
"""
import ifcopenshell
import ifcopenshell.geom
import numpy as np
import time
import traceback
from datetime import datetime
from django.db import transaction
from django.utils import timezone
from apps.entities.models import (
    IFCEntity, SpatialHierarchy, PropertySet,
    System, SystemMembership, Material, MaterialAssignment,
    IFCType, TypeAssignment, Geometry, GraphEdge, IFCValidationReport,
    ProcessingReport
)
from .services_graph import extract_graph_edges
from .services_validation import validate_ifc_file, get_validation_summary


def process_ifc_file(model_id, file_path):
    """
    Process an IFC file and extract all data to database.

    CRITICAL: This function ALWAYS creates a ProcessingReport, even if processing fails completely.

    Args:
        model_id: UUID of the Model instance
        file_path: Path to the IFC file

    Returns:
        dict: Processing results with counts, schema info, and report ID
    """
    from .models import Model

    # Get model instance
    model = Model.objects.get(id=model_id)

    # Create processing report immediately (BEFORE anything else)
    report = ProcessingReport.objects.create(
        model=model,
        overall_status='failed',  # Default to failed, will update on success
    )

    # Track overall timing
    start_time = time.time()
    stage_results = []
    errors = []

    # Default results (in case of catastrophic failure)
    results = {
        'ifc_schema': '',
        'element_count': 0,
        'storey_count': 0,
        'system_count': 0,
        'property_count': 0,
        'material_count': 0,
        'type_count': 0,
        'geometry_count': 0,
        'edge_count': 0,
        'validation_status': 'failed',
        'validation_id': None,
        'processing_report_id': str(report.id),
    }

    try:
        # ==================== STAGE: File Open ====================
        stage_start = time.time()
        try:
            print(f"\n📂 Opening IFC file: {file_path}")
            ifc_file = ifcopenshell.open(file_path)
            ifc_schema = ifc_file.schema

            # Update report with file info
            report.ifc_schema = ifc_schema
            import os
            report.file_size_bytes = os.path.getsize(file_path) if os.path.exists(file_path) else 0
            report.save()

            stage_results.append({
                'stage': 'file_open',
                'status': 'success',
                'processed': 1,
                'skipped': 0,
                'failed': 0,
                'errors': [],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f'Opened IFC file with schema {ifc_schema}'
            })

            results['ifc_schema'] = ifc_schema
            print(f"✅ File opened successfully: {ifc_schema}")

        except Exception as e:
            error_msg = f"Failed to open IFC file: {str(e)}"
            print(f"❌ {error_msg}")
            errors.append({
                'stage': 'file_open',
                'severity': 'critical',
                'message': error_msg,
                'element_guid': None,
                'element_type': None,
                'timestamp': datetime.now().isoformat()
            })
            stage_results.append({
                'stage': 'file_open',
                'status': 'failed',
                'processed': 0,
                'skipped': 0,
                'failed': 1,
                'errors': [error_msg],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': error_msg
            })
            raise  # Re-raise to trigger catastrophic failure handling

        # ==================== STAGE: Validation ====================
        stage_start = time.time()
        try:
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

            results['validation_status'] = validation_report['overall_status']
            results['validation_id'] = str(validation_record.id)

            stage_results.append({
                'stage': 'validation',
                'status': 'success',
                'processed': validation_report['total_elements'],
                'skipped': 0,
                'failed': validation_report['elements_with_issues'],
                'errors': [],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Validation: {validation_report['overall_status'].upper()}"
            })

            print(validation_summary)
            print(f"✅ Validation complete: {validation_report['overall_status']}")

        except Exception as e:
            error_msg = f"Validation failed: {str(e)}"
            print(f"⚠️  {error_msg}")
            errors.append({
                'stage': 'validation',
                'severity': 'warning',
                'message': error_msg,
                'element_guid': None,
                'element_type': None,
                'timestamp': datetime.now().isoformat()
            })
            stage_results.append({
                'stage': 'validation',
                'status': 'failed',
                'processed': 0,
                'skipped': 0,
                'failed': 1,
                'errors': [error_msg],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': error_msg
            })
            # Don't raise - validation failure is not catastrophic

        # Use transaction for atomic operations
        with transaction.atomic():
            # ==================== STAGE: Spatial Hierarchy ====================
            stage_start = time.time()
            storey_count, stage_errors = extract_spatial_hierarchy(model, ifc_file)
            results['storey_count'] = storey_count

            stage_results.append({
                'stage': 'spatial_hierarchy',
                'status': 'success' if len(stage_errors) == 0 else 'partial',
                'processed': storey_count,
                'skipped': 0,
                'failed': len(stage_errors),
                'errors': [e['message'] for e in stage_errors],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Extracted {storey_count} spatial elements"
            })
            errors.extend(stage_errors)
            print(f"✅ Spatial hierarchy: {storey_count} elements")

            # ==================== STAGE: Materials ====================
            stage_start = time.time()
            material_count, stage_errors = extract_materials(model, ifc_file)
            results['material_count'] = material_count

            stage_results.append({
                'stage': 'materials',
                'status': 'success' if len(stage_errors) == 0 else 'partial',
                'processed': material_count,
                'skipped': 0,
                'failed': len(stage_errors),
                'errors': [e['message'] for e in stage_errors],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Extracted {material_count} materials"
            })
            errors.extend(stage_errors)
            print(f"✅ Materials: {material_count}")

            # ==================== STAGE: Types ====================
            stage_start = time.time()
            type_count, stage_errors = extract_types(model, ifc_file)
            results['type_count'] = type_count

            stage_results.append({
                'stage': 'types',
                'status': 'success' if len(stage_errors) == 0 else 'partial',
                'processed': type_count,
                'skipped': 0,
                'failed': len(stage_errors),
                'errors': [e['message'] for e in stage_errors],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Extracted {type_count} type definitions"
            })
            errors.extend(stage_errors)
            print(f"✅ Types: {type_count}")

            # ==================== STAGE: Systems ====================
            stage_start = time.time()
            system_count, stage_errors = extract_systems(model, ifc_file)
            results['system_count'] = system_count

            stage_results.append({
                'stage': 'systems',
                'status': 'success' if len(stage_errors) == 0 else 'partial',
                'processed': system_count,
                'skipped': 0,
                'failed': len(stage_errors),
                'errors': [e['message'] for e in stage_errors],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Extracted {system_count} systems"
            })
            errors.extend(stage_errors)
            print(f"✅ Systems: {system_count}")

            # ==================== STAGE: Elements ====================
            stage_start = time.time()
            element_count, geometry_count, stage_errors = extract_elements(model, ifc_file)
            results['element_count'] = element_count
            results['geometry_count'] = geometry_count

            stage_results.append({
                'stage': 'elements',
                'status': 'success' if len(stage_errors) == 0 else 'partial',
                'processed': element_count,
                'skipped': 0,
                'failed': len(stage_errors),
                'errors': [e['message'] for e in stage_errors],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Extracted {element_count} elements ({geometry_count} with geometry)"
            })
            errors.extend(stage_errors)
            print(f"✅ Elements: {element_count} ({geometry_count} with geometry)")

            # ==================== STAGE: Property Sets ====================
            stage_start = time.time()
            property_count, stage_errors = extract_property_sets(model, ifc_file)
            results['property_count'] = property_count

            stage_results.append({
                'stage': 'properties',
                'status': 'success' if len(stage_errors) == 0 else 'partial',
                'processed': property_count,
                'skipped': 0,
                'failed': len(stage_errors),
                'errors': [e['message'] for e in stage_errors],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Extracted {property_count} properties"
            })
            errors.extend(stage_errors)
            print(f"✅ Properties: {property_count}")

            # ==================== STAGE: Graph Edges ====================
            stage_start = time.time()
            edge_count, stage_errors = extract_graph_edges(model, ifc_file)
            results['edge_count'] = edge_count

            stage_results.append({
                'stage': 'graph_edges',
                'status': 'success' if len(stage_errors) == 0 else 'partial',
                'processed': edge_count,
                'skipped': 0,
                'failed': len(stage_errors),
                'errors': [e['message'] for e in stage_errors],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Extracted {edge_count} relationships"
            })
            errors.extend(stage_errors)
            print(f"✅ Graph edges: {edge_count}")

        # ==================== Processing Complete ====================
        end_time = time.time()
        duration = end_time - start_time

        # Determine overall status
        has_critical_errors = any(e['severity'] == 'critical' for e in errors)
        has_errors = len(errors) > 0

        if has_critical_errors:
            overall_status = 'failed'
        elif has_errors:
            overall_status = 'partial'
        else:
            overall_status = 'success'

        # Update processing report
        report.overall_status = overall_status
        report.completed_at = timezone.now()
        report.duration_seconds = duration
        report.stage_results = stage_results
        report.errors = errors
        report.total_entities_processed = (
            results['element_count'] +
            results['storey_count'] +
            results['material_count'] +
            results['type_count'] +
            results['system_count']
        )
        report.total_entities_failed = len([e for e in errors if e['severity'] in ['error', 'critical']])
        report.summary = generate_processing_summary(results, stage_results, errors, duration)
        report.save()

        print(f"\n{'='*80}")
        print(f"✅ IFC Processing {overall_status.upper()}!")
        print(f"   Duration: {duration:.2f}s")
        print(f"   Elements: {results['element_count']}")
        print(f"   Geometry: {results['geometry_count']}")
        print(f"   Properties: {results['property_count']}")
        print(f"   Errors: {len(errors)}")
        print(f"   Report ID: {report.id}")
        print(f"{'='*80}\n")

        return results

    except Exception as e:
        # ==================== CATASTROPHIC FAILURE ====================
        end_time = time.time()
        duration = end_time - start_time

        error_msg = f"Catastrophic processing failure: {str(e)}"
        print(f"\n❌ {error_msg}")
        print(traceback.format_exc())

        # Update report with catastrophic failure details
        report.overall_status = 'failed'
        report.catastrophic_failure = True
        report.failure_exception = str(e)
        report.failure_traceback = traceback.format_exc()
        report.completed_at = timezone.now()
        report.duration_seconds = duration
        report.stage_results = stage_results
        report.errors = errors
        report.summary = f"CATASTROPHIC FAILURE\n\n{error_msg}\n\nSee failure_traceback for details."
        report.save()

        print(f"❌ Processing failed after {duration:.2f}s")
        print(f"   Report ID: {report.id}")

        # Update results with report ID before re-raising
        results['processing_report_id'] = str(report.id)

        # Re-raise the exception
        raise


def extract_spatial_hierarchy(model, ifc_file):
    """
    Extract project/site/building/storey hierarchy.

    Returns:
        tuple: (count, errors)
    """
    count = 0
    errors = []
    hierarchy_entities = {}  # Map GUID to IFCEntity for later linking

    # First create IFCEntity records for spatial elements
    # Get project
    try:
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
    except Exception as e:
        errors.append({
            'stage': 'spatial_hierarchy',
            'severity': 'error',
            'message': f"Failed to extract IfcProject: {str(e)}",
            'element_guid': None,
            'element_type': 'IfcProject',
            'timestamp': datetime.now().isoformat()
        })

    # Get sites
    for site in ifc_file.by_type('IfcSite'):
        try:
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
        except Exception as e:
            errors.append({
                'stage': 'spatial_hierarchy',
                'severity': 'error',
                'message': f"Failed to extract IfcSite '{site.Name}': {str(e)}",
                'element_guid': site.GlobalId if hasattr(site, 'GlobalId') else None,
                'element_type': 'IfcSite',
                'timestamp': datetime.now().isoformat()
            })

    # Get buildings
    for building in ifc_file.by_type('IfcBuilding'):
        try:
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
        except Exception as e:
            errors.append({
                'stage': 'spatial_hierarchy',
                'severity': 'error',
                'message': f"Failed to extract IfcBuilding '{building.Name}': {str(e)}",
                'element_guid': building.GlobalId if hasattr(building, 'GlobalId') else None,
                'element_type': 'IfcBuilding',
                'timestamp': datetime.now().isoformat()
            })

    # Get storeys
    for storey in ifc_file.by_type('IfcBuildingStorey'):
        try:
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
        except Exception as e:
            errors.append({
                'stage': 'spatial_hierarchy',
                'severity': 'error',
                'message': f"Failed to extract IfcBuildingStorey '{storey.Name}': {str(e)}",
                'element_guid': storey.GlobalId if hasattr(storey, 'GlobalId') else None,
                'element_type': 'IfcBuildingStorey',
                'timestamp': datetime.now().isoformat()
            })

    return count, errors


def extract_materials(model, ifc_file):
    """
    Extract materials from IFC file.

    Note: IfcMaterial does NOT have GlobalId (doesn't inherit from IfcRoot).
    We use the IFC step ID (material.id()) as material_guid for reference.

    Returns:
        tuple: (count, errors)
    """
    count = 0
    errors = []

    for material in ifc_file.by_type('IfcMaterial'):
        try:
            # IfcMaterial doesn't have GlobalId - use step ID instead
            step_id = str(material.id())

            mat, created = Material.objects.get_or_create(
                model=model,
                material_guid=step_id,  # Use IFC step ID as unique identifier
                defaults={
                    'name': material.Name or 'Unnamed Material',
                    'category': getattr(material, 'Category', None),
                }
            )
            if created:
                count += 1
        except Exception as e:
            errors.append({
                'stage': 'materials',
                'severity': 'warning',
                'message': f"Failed to extract material '{material.Name}': {str(e)}",
                'element_guid': None,
                'element_type': 'IfcMaterial',
                'timestamp': datetime.now().isoformat()
            })

    return count, errors


def extract_types(model, ifc_file):
    """
    Extract type objects (WallType, DoorType, etc.).

    Returns:
        tuple: (count, errors)
    """
    count = 0
    errors = []

    for type_element in ifc_file.by_type('IfcTypeObject'):
        try:
            IFCType.objects.create(
                model=model,
                type_guid=type_element.GlobalId,
                ifc_type=type_element.is_a(),
                type_name=type_element.Name or 'Unnamed Type',
            )
            count += 1
        except Exception as e:
            errors.append({
                'stage': 'types',
                'severity': 'warning',
                'message': f"Failed to extract type '{type_element.Name}': {str(e)}",
                'element_guid': type_element.GlobalId if hasattr(type_element, 'GlobalId') else None,
                'element_type': type_element.is_a() if hasattr(type_element, 'is_a') else 'IfcTypeObject',
                'timestamp': datetime.now().isoformat()
            })

    return count, errors


def extract_systems(model, ifc_file):
    """
    Extract systems (HVAC, Electrical, Plumbing, etc.).

    Returns:
        tuple: (count, errors)
    """
    count = 0
    errors = []

    for system in ifc_file.by_type('IfcSystem'):
        try:
            System.objects.create(
                model=model,
                system_guid=system.GlobalId,
                system_type=system.is_a(),
                system_name=system.Name or 'Unnamed System',
                description=getattr(system, 'Description', None)
            )
            count += 1
        except Exception as e:
            errors.append({
                'stage': 'systems',
                'severity': 'warning',
                'message': f"Failed to extract system '{system.Name}': {str(e)}",
                'element_guid': system.GlobalId if hasattr(system, 'GlobalId') else None,
                'element_type': system.is_a() if hasattr(system, 'is_a') else 'IfcSystem',
                'timestamp': datetime.now().isoformat()
            })

    return count, errors


def extract_elements(model, ifc_file):
    """
    Extract all physical building elements with geometry.

    Returns:
        tuple: (element_count, geometry_count, errors)
    """
    element_count = 0
    geometry_count = 0
    errors = []

    # Get all physical elements
    elements = ifc_file.by_type('IfcElement')

    # Setup geometry settings
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)

    for element in elements:
        # Only process elements with geometry
        if not element.Representation:
            continue

        # Use savepoint for each element so one failure doesn't break the whole transaction
        try:
            with transaction.atomic():
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
                    errors.append({
                        'stage': 'elements',
                        'severity': 'warning',
                        'message': f"Failed to extract geometry for '{element.Name or element.GlobalId}': {str(e)}",
                        'element_guid': element.GlobalId,
                        'element_type': element.is_a(),
                        'timestamp': datetime.now().isoformat()
                    })

        except Exception as e:
            errors.append({
                'stage': 'elements',
                'severity': 'error',
                'message': f"Failed to process element '{element.Name or element.GlobalId}': {str(e)}",
                'element_guid': element.GlobalId if hasattr(element, 'GlobalId') else None,
                'element_type': element.is_a() if hasattr(element, 'is_a') else 'IfcElement',
                'timestamp': datetime.now().isoformat()
            })

    return element_count, geometry_count, errors


def extract_property_sets(model, ifc_file):
    """
    Extract property sets (Psets) for all elements.

    Returns:
        tuple: (count, errors)
    """
    count = 0
    errors = []

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
                try:
                    if definition.is_a('IfcRelDefinesByProperties'):
                        property_set = definition.RelatingPropertyDefinition

                        if property_set.is_a('IfcPropertySet'):
                            pset_name = property_set.Name

                            # Extract individual properties
                            for prop in property_set.HasProperties:
                                prop_name = '<unknown>'  # Initialize to avoid NameError
                                try:
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
                                except Exception as e:
                                    errors.append({
                                        'stage': 'properties',
                                        'severity': 'warning',
                                        'message': f"Failed to extract property '{prop_name}' from '{pset_name}': {str(e)}",
                                        'element_guid': element.GlobalId,
                                        'element_type': element.is_a(),
                                        'timestamp': datetime.now().isoformat()
                                    })
                except Exception as e:
                    errors.append({
                        'stage': 'properties',
                        'severity': 'warning',
                        'message': f"Failed to process property definition for '{element.Name or element.GlobalId}': {str(e)}",
                        'element_guid': element.GlobalId if hasattr(element, 'GlobalId') else None,
                        'element_type': element.is_a() if hasattr(element, 'is_a') else 'IfcElement',
                        'timestamp': datetime.now().isoformat()
                    })

    return count, errors


def generate_processing_summary(results, stage_results, errors, duration):
    """
    Generate human-readable processing summary.

    Args:
        results: Processing results dict
        stage_results: List of stage result dicts
        errors: List of error dicts
        duration: Processing duration in seconds

    Returns:
        str: Summary text
    """
    lines = []

    lines.append("IFC Processing Report")
    lines.append("=" * 80)
    lines.append(f"Duration: {duration:.2f}s")
    lines.append(f"IFC Schema: {results['ifc_schema']}")
    lines.append("")

    lines.append("Stage Results:")
    lines.append("-" * 80)
    for stage in stage_results:
        status_icon = "✅" if stage['status'] == 'success' else "⚠️" if stage['status'] == 'partial' else "❌"
        lines.append(f"{status_icon} {stage['stage']}: {stage['message']} ({stage['duration_ms']}ms)")

    lines.append("")
    lines.append("Final Counts:")
    lines.append("-" * 80)
    lines.append(f"Elements: {results['element_count']}")
    lines.append(f"Geometry: {results['geometry_count']}")
    lines.append(f"Properties: {results['property_count']}")
    lines.append(f"Storeys: {results['storey_count']}")
    lines.append(f"Systems: {results['system_count']}")
    lines.append(f"Materials: {results['material_count']}")
    lines.append(f"Types: {results['type_count']}")
    lines.append(f"Relationships: {results['edge_count']}")

    if errors:
        lines.append("")
        lines.append(f"Errors and Warnings ({len(errors)}):")
        lines.append("-" * 80)

        # Group errors by severity
        critical = [e for e in errors if e['severity'] == 'critical']
        error_list = [e for e in errors if e['severity'] == 'error']
        warnings = [e for e in errors if e['severity'] == 'warning']

        if critical:
            lines.append(f"❌ CRITICAL ({len(critical)}):")
            for err in critical[:5]:  # Show first 5
                lines.append(f"   - {err['message']}")

        if error_list:
            lines.append(f"❌ ERRORS ({len(error_list)}):")
            for err in error_list[:5]:  # Show first 5
                lines.append(f"   - {err['message']}")

        if warnings:
            lines.append(f"⚠️  WARNINGS ({len(warnings)}):")
            for err in warnings[:5]:  # Show first 5
                lines.append(f"   - {err['message']}")

        if len(errors) > 15:
            lines.append(f"   ... and {len(errors) - 15} more issues")

    lines.append("")
    lines.append("=" * 80)

    return "\n".join(lines)
