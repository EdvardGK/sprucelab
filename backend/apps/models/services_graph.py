"""
Graph Edge Extraction Functions

Extracts IFC relationships for graph visualization.
"""
from datetime import datetime


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
        tuple: (edge_count, errors)
    """
    from apps.entities.models import IFCEntity, GraphEdge

    edge_count = 0
    errors = []

    # Build GUID to Entity lookup for fast access
    entity_lookup = {}
    for entity in IFCEntity.objects.filter(model=model):
        entity_lookup[entity.ifc_guid] = entity

    print(f"Building graph edges for {len(entity_lookup)} entities...")

    # 1. Extract spatial containment relationships
    count, stage_errors = extract_spatial_containment(model, ifc_file, entity_lookup)
    edge_count += count
    errors.extend(stage_errors)

    # 2. Extract aggregation relationships
    count, stage_errors = extract_aggregation_relationships(model, ifc_file, entity_lookup)
    edge_count += count
    errors.extend(stage_errors)

    # 3. Extract type relationships
    count, stage_errors = extract_type_relationships(model, ifc_file, entity_lookup)
    edge_count += count
    errors.extend(stage_errors)

    # 4. Extract property relationships
    count, stage_errors = extract_property_relationships(model, ifc_file, entity_lookup)
    edge_count += count
    errors.extend(stage_errors)

    # 5. Extract group/system assignments
    count, stage_errors = extract_group_assignments(model, ifc_file, entity_lookup)
    edge_count += count
    errors.extend(stage_errors)

    return edge_count, errors


def extract_spatial_containment(model, ifc_file, entity_lookup):
    """
    Extract IfcRelContainedInSpatialStructure relationships.

    Returns:
        tuple: (count, errors)
    """
    from apps.entities.models import GraphEdge

    count = 0
    errors = []

    for rel in ifc_file.by_type('IfcRelContainedInSpatialStructure'):
        try:
            # Get the spatial structure element (building, storey, etc.)
            relating_structure = rel.RelatingStructure

            if relating_structure.GlobalId not in entity_lookup:
                continue

            source_entity = entity_lookup[relating_structure.GlobalId]

            # Get all elements contained in this structure
            for element in rel.RelatedElements:
                try:
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
                except Exception as e:
                    errors.append({
                        'stage': 'graph_edges',
                        'severity': 'warning',
                        'message': f"Failed to create spatial containment edge: {str(e)}",
                        'element_guid': element.GlobalId if hasattr(element, 'GlobalId') else None,
                        'element_type': element.is_a() if hasattr(element, 'is_a') else 'Unknown',
                        'timestamp': datetime.now().isoformat()
                    })
        except Exception as e:
            errors.append({
                'stage': 'graph_edges',
                'severity': 'warning',
                'message': f"Failed to process spatial containment relationship: {str(e)}",
                'element_guid': None,
                'element_type': 'IfcRelContainedInSpatialStructure',
                'timestamp': datetime.now().isoformat()
            })

    print(f"   - Spatial containment edges: {count}")
    return count, errors


def extract_aggregation_relationships(model, ifc_file, entity_lookup):
    """
    Extract IfcRelAggregates relationships (decomposition).

    Returns:
        tuple: (count, errors)
    """
    from apps.entities.models import GraphEdge

    count = 0
    errors = []

    for rel in ifc_file.by_type('IfcRelAggregates'):
        try:
            # Get the whole/parent object
            relating_object = rel.RelatingObject

            if relating_object.GlobalId not in entity_lookup:
                continue

            source_entity = entity_lookup[relating_object.GlobalId]

            # Get all parts/children
            for part in rel.RelatedObjects:
                try:
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
                except Exception as e:
                    errors.append({
                        'stage': 'graph_edges',
                        'severity': 'warning',
                        'message': f"Failed to create aggregation edge: {str(e)}",
                        'element_guid': part.GlobalId if hasattr(part, 'GlobalId') else None,
                        'element_type': part.is_a() if hasattr(part, 'is_a') else 'Unknown',
                        'timestamp': datetime.now().isoformat()
                    })
        except Exception as e:
            errors.append({
                'stage': 'graph_edges',
                'severity': 'warning',
                'message': f"Failed to process aggregation relationship: {str(e)}",
                'element_guid': None,
                'element_type': 'IfcRelAggregates',
                'timestamp': datetime.now().isoformat()
            })

    print(f"   - Aggregation edges: {count}")
    return count, errors


def extract_type_relationships(model, ifc_file, entity_lookup):
    """
    Extract IfcRelDefinesByType relationships.

    Returns:
        tuple: (count, errors)
    """
    from apps.entities.models import GraphEdge

    count = 0
    errors = []

    for rel in ifc_file.by_type('IfcRelDefinesByType'):
        try:
            # Get the type object
            relating_type = rel.RelatingType

            if relating_type.GlobalId not in entity_lookup:
                continue

            source_entity = entity_lookup[relating_type.GlobalId]

            # Get all instances of this type
            for element in rel.RelatedObjects:
                try:
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
                except Exception as e:
                    errors.append({
                        'stage': 'graph_edges',
                        'severity': 'warning',
                        'message': f"Failed to create type relationship edge: {str(e)}",
                        'element_guid': element.GlobalId if hasattr(element, 'GlobalId') else None,
                        'element_type': element.is_a() if hasattr(element, 'is_a') else 'Unknown',
                        'timestamp': datetime.now().isoformat()
                    })
        except Exception as e:
            errors.append({
                'stage': 'graph_edges',
                'severity': 'warning',
                'message': f"Failed to process type relationship: {str(e)}",
                'element_guid': None,
                'element_type': 'IfcRelDefinesByType',
                'timestamp': datetime.now().isoformat()
            })

    print(f"   - Type definition edges: {count}")
    return count, errors


def extract_property_relationships(model, ifc_file, entity_lookup):
    """
    Extract IfcRelDefinesByProperties relationships.

    Returns:
        tuple: (count, errors)
    """
    count = 0
    errors = []

    # Properties are already extracted in extract_property_sets()
    # Don't create graph edges for them as it would be too many
    print(f"   - Property edges: {count} (skipped - stored in property_sets table)")
    return count, errors


def extract_group_assignments(model, ifc_file, entity_lookup):
    """
    Extract IfcRelAssignsToGroup relationships (systems, zones, etc.).

    Returns:
        tuple: (count, errors)
    """
    from apps.entities.models import GraphEdge

    count = 0
    errors = []

    for rel in ifc_file.by_type('IfcRelAssignsToGroup'):
        try:
            # Get the group (system, zone, etc.)
            relating_group = rel.RelatingGroup

            if relating_group.GlobalId not in entity_lookup:
                continue

            source_entity = entity_lookup[relating_group.GlobalId]

            # Get all members of this group
            for element in rel.RelatedObjects:
                try:
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
                except Exception as e:
                    errors.append({
                        'stage': 'graph_edges',
                        'severity': 'warning',
                        'message': f"Failed to create group assignment edge: {str(e)}",
                        'element_guid': element.GlobalId if hasattr(element, 'GlobalId') else None,
                        'element_type': element.is_a() if hasattr(element, 'is_a') else 'Unknown',
                        'timestamp': datetime.now().isoformat()
                    })
        except Exception as e:
            errors.append({
                'stage': 'graph_edges',
                'severity': 'warning',
                'message': f"Failed to process group assignment relationship: {str(e)}",
                'element_guid': None,
                'element_type': 'IfcRelAssignsToGroup',
                'timestamp': datetime.now().isoformat()
            })

    print(f"   - Group assignment edges: {count}")
    return count, errors
