"""
Graph Edge Extraction Functions

Extracts IFC relationships for graph visualization.
"""


def extract_graph_edges(model, ifc_file):
    """
    Extract all IFC relationships as graph edges.

    Extracts the following relationship types:
    - IfcRelContainedInSpatialStructure (spatial containment)
    - IfcRelAggregates (decomposition/aggregation)
    - IfcRelDefinesByType (type assignments)
    - IfcRelDefinesByProperties (property assignments)
    - IfcRelAssignsToGroup (group/system assignments)

    Args:
        model: Model instance
        ifc_file: Opened IFC file

    Returns:
        int: Number of edges created
    """
    from apps.entities.models import IFCEntity, GraphEdge

    edge_count = 0

    # Build GUID to Entity lookup for fast access
    entity_lookup = {}
    for entity in IFCEntity.objects.filter(model=model):
        entity_lookup[entity.ifc_guid] = entity

    print(f"Building graph edges for {len(entity_lookup)} entities...")

    # 1. Extract spatial containment relationships
    edge_count += extract_spatial_containment(model, ifc_file, entity_lookup)

    # 2. Extract aggregation relationships
    edge_count += extract_aggregation_relationships(model, ifc_file, entity_lookup)

    # 3. Extract type relationships
    edge_count += extract_type_relationships(model, ifc_file, entity_lookup)

    # 4. Extract property relationships
    edge_count += extract_property_relationships(model, ifc_file, entity_lookup)

    # 5. Extract group/system assignments
    edge_count += extract_group_assignments(model, ifc_file, entity_lookup)

    return edge_count


def extract_spatial_containment(model, ifc_file, entity_lookup):
    """Extract IfcRelContainedInSpatialStructure relationships."""
    from apps.entities.models import GraphEdge

    count = 0

    for rel in ifc_file.by_type('IfcRelContainedInSpatialStructure'):
        # Get the spatial structure element (building, storey, etc.)
        relating_structure = rel.RelatingStructure

        if relating_structure.GlobalId not in entity_lookup:
            continue

        source_entity = entity_lookup[relating_structure.GlobalId]

        # Get all elements contained in this structure
        for element in rel.RelatedElements:
            if element.GlobalId not in entity_lookup:
                continue

            target_entity = entity_lookup[element.GlobalId]

            # Create edge: Spatial Structure → Element
            GraphEdge.objects.create(
                model=model,
                source_entity=source_entity,
                target_entity=target_entity,
                relationship_type='IfcRelContainedInSpatialStructure',
                properties={
                    'relationship_name': 'ContainedIn',
                    'source_name': relating_structure.Name or '',
                    'target_name': element.Name or ''
                }
            )
            count += 1

    print(f"   - Spatial containment edges: {count}")
    return count


def extract_aggregation_relationships(model, ifc_file, entity_lookup):
    """Extract IfcRelAggregates relationships (decomposition)."""
    from apps.entities.models import GraphEdge

    count = 0

    for rel in ifc_file.by_type('IfcRelAggregates'):
        # Get the whole/parent object
        relating_object = rel.RelatingObject

        if relating_object.GlobalId not in entity_lookup:
            continue

        source_entity = entity_lookup[relating_object.GlobalId]

        # Get all parts/children
        for part in rel.RelatedObjects:
            if part.GlobalId not in entity_lookup:
                continue

            target_entity = entity_lookup[part.GlobalId]

            # Create edge: Whole → Part
            GraphEdge.objects.create(
                model=model,
                source_entity=source_entity,
                target_entity=target_entity,
                relationship_type='IfcRelAggregates',
                properties={
                    'relationship_name': 'Aggregates',
                    'source_name': getattr(relating_object, 'Name', '') or '',
                    'target_name': getattr(part, 'Name', '') or ''
                }
            )
            count += 1

    print(f"   - Aggregation edges: {count}")
    return count


def extract_type_relationships(model, ifc_file, entity_lookup):
    """Extract IfcRelDefinesByType relationships."""
    from apps.entities.models import GraphEdge

    count = 0

    for rel in ifc_file.by_type('IfcRelDefinesByType'):
        # Get the type object
        relating_type = rel.RelatingType

        if relating_type.GlobalId not in entity_lookup:
            continue

        source_entity = entity_lookup[relating_type.GlobalId]

        # Get all instances of this type
        for element in rel.RelatedObjects:
            if element.GlobalId not in entity_lookup:
                continue

            target_entity = entity_lookup[element.GlobalId]

            # Create edge: Type → Instance
            GraphEdge.objects.create(
                model=model,
                source_entity=source_entity,
                target_entity=target_entity,
                relationship_type='IfcRelDefinesByType',
                properties={
                    'relationship_name': 'DefinesByType',
                    'type_name': relating_type.Name or '',
                    'instance_name': element.Name or ''
                }
            )
            count += 1

    print(f"   - Type definition edges: {count}")
    return count


def extract_property_relationships(model, ifc_file, entity_lookup):
    """Extract IfcRelDefinesByProperties relationships."""
    from apps.entities.models import GraphEdge

    count = 0

    for rel in ifc_file.by_type('IfcRelDefinesByProperties'):
        # Get the property set
        property_definition = rel.RelatingPropertyDefinition

        # Skip if not a property set
        if not property_definition.is_a('IfcPropertySet'):
            continue

        pset_name = property_definition.Name

        # Get all elements that have this property set
        for element in rel.RelatedObjects:
            if element.GlobalId not in entity_lookup:
                continue

            source_entity = entity_lookup[element.GlobalId]

            # Note: We don't create a separate entity for property sets
            # Instead, we store this as an edge property
            # This is just for graph visualization - actual properties are in PropertySet table

            # We could optionally create edges here, but it might be too many
            # For now, skip - properties are already stored in property_sets table
            pass

    # Properties are already extracted in extract_property_sets()
    # Don't create graph edges for them as it would be too many
    print(f"   - Property edges: {count} (skipped - stored in property_sets table)")
    return count


def extract_group_assignments(model, ifc_file, entity_lookup):
    """Extract IfcRelAssignsToGroup relationships (systems, zones, etc.)."""
    from apps.entities.models import GraphEdge

    count = 0

    for rel in ifc_file.by_type('IfcRelAssignsToGroup'):
        # Get the group (system, zone, etc.)
        relating_group = rel.RelatingGroup

        if relating_group.GlobalId not in entity_lookup:
            continue

        source_entity = entity_lookup[relating_group.GlobalId]

        # Get all members of this group
        for element in rel.RelatedObjects:
            if element.GlobalId not in entity_lookup:
                continue

            target_entity = entity_lookup[element.GlobalId]

            # Create edge: Group → Member
            GraphEdge.objects.create(
                model=model,
                source_entity=source_entity,
                target_entity=target_entity,
                relationship_type='IfcRelAssignsToGroup',
                properties={
                    'relationship_name': 'AssignedToGroup',
                    'group_type': relating_group.is_a(),
                    'group_name': getattr(relating_group, 'Name', '') or '',
                    'member_name': getattr(element, 'Name', '') or ''
                }
            )
            count += 1

    print(f"   - Group assignment edges: {count}")
    return count
