"""
Layer 1: IFC Metadata Parsing Service

PHILOSOPHY:
- Extract ONLY metadata (GUID, type, name, properties, relationships)
- NO geometry extraction (that's Layer 2)
- NO validation judgement (that's Layer 3)
- ALWAYS succeeds unless file is corrupt
- FAST: Should complete in seconds even for large files

PURPOSE:
This creates the rock-solid "Layer 1" foundation that all other features build on.
"""
import ifcopenshell
import ifcopenshell.util.placement
import ifcopenshell.util.shape
import time
import numpy as np
from datetime import datetime
from django.db import transaction
from django.utils import timezone

from apps.entities.models import (
    IFCEntity, SpatialHierarchy, PropertySet,
    System, SystemMembership, Material, MaterialAssignment,
    IFCType, TypeAssignment, GraphEdge, ProcessingReport
)


def _extract_ifc_timestamp(ifc_file):
    """
    Extract timestamp from IfcOwnerHistory (CreationDate or LastModifiedDate).

    IFC stores timestamps as Unix epoch integers.

    Returns:
        timezone-aware datetime or None if not available
    """
    try:
        from django.utils import timezone as dj_timezone
        owner_histories = ifc_file.by_type('IfcOwnerHistory')
        if owner_histories:
            oh = owner_histories[0]
            # Prefer LastModifiedDate, fall back to CreationDate
            timestamp = getattr(oh, 'LastModifiedDate', None) or getattr(oh, 'CreationDate', None)
            if timestamp:
                # Make timezone-aware
                naive_dt = datetime.fromtimestamp(timestamp)
                return dj_timezone.make_aware(naive_dt)
    except Exception:
        pass
    return None


def parse_ifc_metadata(model_id, file_path):
    """
    Parse IFC file and extract ONLY metadata (no geometry).

    This is Layer 1: The foundation that always succeeds.

    Args:
        model_id: UUID of the Model instance
        file_path: Path to the IFC file

    Returns:
        dict: Parsing results with counts and timing
    """
    from apps.models.models import Model

    # Get model instance
    model = Model.objects.get(id=model_id)

    # Create processing report
    report = ProcessingReport.objects.create(
        model=model,
        overall_status='failed',  # Will update on success
    )

    start_time = time.time()
    stage_results = []
    errors = []

    # Default results
    results = {
        'ifc_schema': '',
        'element_count': 0,
        'storey_count': 0,
        'system_count': 0,
        'property_count': 0,
        'material_count': 0,
        'type_count': 0,
        'type_assignment_count': 0,
        'processing_report_id': str(report.id),
    }

    try:
        # ==================== STAGE: File Open ====================
        stage_start = time.time()
        print(f"\n📂 [LAYER 1] Opening IFC file: {file_path}")

        model.parsing_status = 'parsing'
        model.save(update_fields=['parsing_status'])

        try:
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

            # Extract IFC timestamp from IfcOwnerHistory
            ifc_timestamp = _extract_ifc_timestamp(ifc_file)
            results['ifc_timestamp'] = ifc_timestamp
            if ifc_timestamp:
                model.ifc_timestamp = ifc_timestamp
                model.save(update_fields=['ifc_timestamp'])
                print(f"✅ File opened: {ifc_schema}, IFC timestamp: {ifc_timestamp}")
            else:
                print(f"✅ File opened: {ifc_schema} (no timestamp in IfcOwnerHistory)")

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
            raise  # Can't continue without file

        # Use transaction for atomic operations
        with transaction.atomic():
            # ==================== STAGE: Spatial Hierarchy ====================
            stage_start = time.time()
            print("\n🏗️  [LAYER 1] Extracting spatial hierarchy...")
            storey_count, stage_errors = _extract_spatial_hierarchy(model, ifc_file)
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
            print(f"✅ Spatial hierarchy: {storey_count} elements ({len(stage_errors)} errors)")

            # ==================== STAGE: Materials ====================
            stage_start = time.time()
            print("\n🎨 [LAYER 1] Extracting materials...")
            material_count, stage_errors = _extract_materials(model, ifc_file)
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
            print(f"✅ Materials: {material_count} ({len(stage_errors)} errors)")

            # ==================== STAGE: Types ====================
            stage_start = time.time()
            print("\n📐 [LAYER 1] Extracting type definitions...")
            type_count, stage_errors = _extract_types(model, ifc_file)
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
            print(f"✅ Types: {type_count} ({len(stage_errors)} errors)")

            # ==================== STAGE: Systems ====================
            stage_start = time.time()
            print("\n⚙️  [LAYER 1] Extracting systems...")
            system_count, stage_errors = _extract_systems(model, ifc_file)
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
            print(f"✅ Systems: {system_count} ({len(stage_errors)} errors)")

            # ==================== STAGE: Elements (METADATA ONLY - NO GEOMETRY) ====================
            stage_start = time.time()
            print("\n📦 [LAYER 1] Extracting element metadata (NO GEOMETRY)...")
            element_count, stage_errors = _extract_elements_metadata(model, ifc_file)
            results['element_count'] = element_count

            stage_results.append({
                'stage': 'elements_metadata',
                'status': 'success' if len(stage_errors) == 0 else 'partial',
                'processed': element_count,
                'skipped': 0,
                'failed': len(stage_errors),
                'errors': [e['message'] for e in stage_errors],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Extracted {element_count} elements (metadata only)"
            })
            errors.extend(stage_errors)
            print(f"✅ Elements: {element_count} ({len(stage_errors)} errors)")

            # ==================== STAGE: Properties ====================
            stage_start = time.time()
            print("\n🏷️  [LAYER 1] Extracting property sets...")
            property_count, stage_errors = _extract_property_sets(model, ifc_file)
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
            print(f"✅ Properties: {property_count} ({len(stage_errors)} errors)")

            # ==================== STAGE: Type Assignments ====================
            stage_start = time.time()
            print("\n🔗 [LAYER 1] Extracting type assignments...")
            type_assignment_count, stage_errors = _extract_type_assignments(model, ifc_file)
            results['type_assignment_count'] = type_assignment_count

            stage_results.append({
                'stage': 'type_assignments',
                'status': 'success' if len(stage_errors) == 0 else 'partial',
                'processed': type_assignment_count,
                'skipped': 0,
                'failed': len(stage_errors),
                'errors': [e['message'] for e in stage_errors],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Extracted {type_assignment_count} type assignments"
            })
            errors.extend(stage_errors)
            print(f"✅ Type Assignments: {type_assignment_count} ({len(stage_errors)} errors)")

        # ==================== Parsing Complete ====================
        end_time = time.time()
        duration = end_time - start_time

        # Update model status
        model.parsing_status = 'parsed'
        model.ifc_schema = results['ifc_schema']
        model.element_count = results['element_count']
        model.storey_count = results['storey_count']
        model.system_count = results['system_count']
        model.save(update_fields=[
            'parsing_status', 'ifc_schema', 'element_count',
            'storey_count', 'system_count'
        ])

        # Update processing report
        report.overall_status = 'success' if len(errors) == 0 else 'partial'
        report.completed_at = timezone.now()
        report.duration_seconds = duration
        report.stage_results = stage_results
        report.errors = errors
        report.total_entities_processed = (
            results['element_count'] +
            results['storey_count'] +
            results['material_count'] +
            results['type_count'] +
            results['type_assignment_count'] +
            results['system_count']
        )
        report.summary = f"""
IFC Metadata Parsing Complete (Layer 1)
========================================
Duration: {duration:.2f}s
IFC Schema: {results['ifc_schema']}

Elements: {results['element_count']}
Storeys: {results['storey_count']}
Properties: {results['property_count']}
Materials: {results['material_count']}
Types: {results['type_count']}
Systems: {results['system_count']}

Errors: {len(errors)}

Note: Geometry extraction is Layer 2 (run separately)
"""
        report.save()

        print(f"\n{'='*80}")
        print(f"✅ [LAYER 1] IFC METADATA PARSING COMPLETE!")
        print(f"   Duration: {duration:.2f}s")
        print(f"   Elements: {results['element_count']} (metadata only, no geometry)")
        print(f"   Properties: {results['property_count']}")
        print(f"   Errors: {len(errors)}")
        print(f"   Next step: Extract geometry (Layer 2)")
        print(f"{'='*80}\n")

        return results

    except Exception as e:
        # Catastrophic failure
        end_time = time.time()
        duration = end_time - start_time

        error_msg = f"Catastrophic parsing failure: {str(e)}"
        print(f"\n❌ {error_msg}")

        # Update model status
        model.parsing_status = 'failed'
        model.save(update_fields=['parsing_status'])

        # Update report
        report.overall_status = 'failed'
        report.catastrophic_failure = True
        report.failure_exception = str(e)
        report.completed_at = timezone.now()
        report.duration_seconds = duration
        report.stage_results = stage_results
        report.errors = errors
        report.summary = f"CATASTROPHIC FAILURE\\n\\n{error_msg}"
        report.save()

        print(f"❌ Parsing failed after {duration:.2f}s")
        results['processing_report_id'] = str(report.id)

        raise


def _extract_spatial_hierarchy(model, ifc_file):
    """Extract project/site/building/storey hierarchy (metadata only)."""
    count = 0
    errors = []

    # Project
    try:
        projects = ifc_file.by_type('IfcProject')
        if projects:
            project = projects[0]
            # Use get_or_create to handle duplicates gracefully
            entity, created = IFCEntity.objects.get_or_create(
                model=model,
                ifc_guid=project.GlobalId,
                defaults={
                    'ifc_type': 'IfcProject',
                    'name': project.Name or 'Unnamed Project',
                }
            )
            if not created:
                # Update if it already exists
                entity.ifc_type = 'IfcProject'
                entity.name = project.Name or 'Unnamed Project'
                entity.save()

            # Create spatial hierarchy only if not exists
            SpatialHierarchy.objects.get_or_create(
                model=model,
                entity=entity,
                defaults={'hierarchy_level': 'project'}
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

    # Sites
    for site in ifc_file.by_type('IfcSite'):
        try:
            entity, created = IFCEntity.objects.get_or_create(
                model=model,
                ifc_guid=site.GlobalId,
                defaults={
                    'ifc_type': 'IfcSite',
                    'name': site.Name or 'Unnamed Site',
                }
            )
            if not created:
                entity.name = site.Name or 'Unnamed Site'
                entity.save()

            SpatialHierarchy.objects.get_or_create(
                model=model,
                entity=entity,
                defaults={'hierarchy_level': 'site'}
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

    # Buildings
    for building in ifc_file.by_type('IfcBuilding'):
        try:
            entity, created = IFCEntity.objects.get_or_create(
                model=model,
                ifc_guid=building.GlobalId,
                defaults={
                    'ifc_type': 'IfcBuilding',
                    'name': building.Name or 'Unnamed Building',
                }
            )
            if not created:
                entity.name = building.Name or 'Unnamed Building'
                entity.save()

            SpatialHierarchy.objects.get_or_create(
                model=model,
                entity=entity,
                defaults={'hierarchy_level': 'building'}
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

    # Storeys
    for storey in ifc_file.by_type('IfcBuildingStorey'):
        try:
            entity, created = IFCEntity.objects.get_or_create(
                model=model,
                ifc_guid=storey.GlobalId,
                defaults={
                    'ifc_type': 'IfcBuildingStorey',
                    'name': storey.Name or 'Unnamed Storey',
                }
            )
            if not created:
                entity.name = storey.Name or 'Unnamed Storey'
                entity.save()

            SpatialHierarchy.objects.get_or_create(
                model=model,
                entity=entity,
                defaults={'hierarchy_level': 'storey'}
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


def _extract_materials(model, ifc_file):
    """Extract materials (metadata only)."""
    count = 0
    errors = []

    for material in ifc_file.by_type('IfcMaterial'):
        try:
            step_id = str(material.id())
            mat, created = Material.objects.get_or_create(
                model=model,
                material_guid=step_id,
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


def _extract_types(model, ifc_file):
    """Extract type objects (metadata only)."""
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


def _extract_type_assignments(model, ifc_file):
    """
    Extract type→entity assignments from IFC.

    Links IFCEntity records to their IFCType via IfcRelDefinesByType relationships.
    Must be called AFTER both entities and types have been extracted.
    """
    count = 0
    errors = []

    # Build lookup dictionaries for efficiency
    # GUID → IFCEntity
    entity_by_guid = {
        e.ifc_guid: e for e in IFCEntity.objects.filter(model=model)
    }
    # GUID → IFCType
    type_by_guid = {
        t.type_guid: t for t in IFCType.objects.filter(model=model)
    }

    # Process IfcRelDefinesByType relationships
    for rel in ifc_file.by_type('IfcRelDefinesByType'):
        try:
            relating_type = rel.RelatingType
            if not relating_type or not hasattr(relating_type, 'GlobalId'):
                continue

            type_guid = relating_type.GlobalId
            ifc_type_obj = type_by_guid.get(type_guid)

            if not ifc_type_obj:
                continue

            # Get related objects (elements that use this type)
            related_objects = rel.RelatedObjects or []

            for element in related_objects:
                if not hasattr(element, 'GlobalId'):
                    continue

                entity = entity_by_guid.get(element.GlobalId)
                if not entity:
                    continue

                # Create type assignment
                TypeAssignment.objects.get_or_create(
                    entity=entity,
                    type=ifc_type_obj,
                )
                count += 1

        except Exception as e:
            errors.append({
                'stage': 'type_assignments',
                'severity': 'warning',
                'message': f"Failed to extract type assignment: {str(e)}",
                'element_guid': None,
                'element_type': 'IfcRelDefinesByType',
                'timestamp': datetime.now().isoformat()
            })

    return count, errors


def _extract_systems(model, ifc_file):
    """Extract systems (metadata only)."""
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


def _extract_quantities(element):
    """
    Extract quantities from element (area, volume, length, height, perimeter).

    Reads from Qto_*BaseQuantities property sets - this is FAST (just reading properties,
    no geometry calculation).

    Args:
        element: IFC element

    Returns:
        dict with quantity values (all nullable)
    """
    quantities = {
        'area': None,
        'volume': None,
        'length': None,
        'height': None,
        'perimeter': None,
    }

    try:
        # Check if element has quantity sets
        if not hasattr(element, 'IsDefinedBy') or not element.IsDefinedBy:
            return quantities

        # Look for Qto_*BaseQuantities property sets
        for definition in element.IsDefinedBy:
            if definition.is_a('IfcRelDefinesByProperties'):
                prop_set = definition.RelatingPropertyDefinition

                # Look for quantity sets (Qto_* property sets)
                if prop_set.is_a('IfcElementQuantity'):
                    # Extract quantities from the set
                    for quantity in prop_set.Quantities:
                        quantity_name = quantity.Name.lower() if quantity.Name else ''

                        # Map common quantity names to our fields
                        if 'netfloorarea' in quantity_name or 'area' in quantity_name:
                            if quantity.is_a('IfcQuantityArea'):
                                quantities['area'] = float(quantity.AreaValue)

                        elif 'netvolume' in quantity_name or 'volume' in quantity_name:
                            if quantity.is_a('IfcQuantityVolume'):
                                quantities['volume'] = float(quantity.VolumeValue)

                        elif 'length' in quantity_name:
                            if quantity.is_a('IfcQuantityLength'):
                                quantities['length'] = float(quantity.LengthValue)

                        elif 'height' in quantity_name:
                            if quantity.is_a('IfcQuantityLength'):
                                quantities['height'] = float(quantity.LengthValue)

                        elif 'perimeter' in quantity_name:
                            if quantity.is_a('IfcQuantityLength'):
                                quantities['perimeter'] = float(quantity.LengthValue)

    except Exception as e:
        # If quantity extraction fails, return nulls (element just won't have quantities)
        pass

    return quantities


def _extract_elements_metadata(model, ifc_file):
    """
    Extract element metadata with UPSERT pattern (no geometry).

    UPSERT Strategy:
    - New entities (GUID not in DB): bulk_create
    - Existing entities (GUID in DB): bulk_update
    - Removed entities (in DB but not in file): mark is_removed=True

    This preserves user data (enrichment_status, validation_status, notes)
    while updating IFC data (type, name, quantities, etc.)
    """
    errors = []

    # Get all physical elements from IFC file
    elements = ifc_file.by_type('IfcElement')
    print(f"   Found {len(elements)} elements in IFC file")

    # PRE-FETCH all storeys into a dict for O(1) lookup
    storey_map = {
        entity.ifc_guid: entity.id
        for entity in IFCEntity.objects.filter(
            model=model,
            ifc_type='IfcBuildingStorey'
        ).only('id', 'ifc_guid')
    }
    print(f"   Pre-fetched {len(storey_map)} storeys for fast lookup")

    # PRE-FETCH existing entities by GUID for UPSERT
    existing_by_guid = {
        e.ifc_guid: e
        for e in IFCEntity.objects.filter(model=model).exclude(
            ifc_type__in=['IfcProject', 'IfcSite', 'IfcBuilding', 'IfcBuildingStorey']
        )
    }
    print(f"   Found {len(existing_by_guid)} existing entities in database")

    # Track which GUIDs we see in the new file
    seen_guids = set()

    # Prepare batches for bulk operations
    to_create = []
    to_update = []
    batch_size = 500

    # Fields to update (IFC data - not user data like enrichment_status)
    update_fields = [
        'express_id', 'ifc_type', 'predefined_type', 'object_type',
        'name', 'description', 'storey_id',
        'area', 'volume', 'length', 'height', 'perimeter',
        'is_removed',  # Reset is_removed flag for entities that reappear
    ]

    for element in elements:
        try:
            guid = element.GlobalId
            seen_guids.add(guid)

            # Extract quantities (area, volume, length, height, perimeter)
            quantities = _extract_quantities(element)

            # Get storey UUID (if assigned)
            storey_id = None
            if hasattr(element, 'ContainedInStructure') and element.ContainedInStructure:
                for rel in element.ContainedInStructure:
                    if rel.RelatingStructure.is_a('IfcBuildingStorey'):
                        storey_guid = rel.RelatingStructure.GlobalId
                        storey_id = storey_map.get(storey_guid)
                        break

            # Extract predefined type (e.g., STANDARD, NOTDEFINED)
            predefined_type = None
            if hasattr(element, 'PredefinedType') and element.PredefinedType:
                predefined_type = str(element.PredefinedType)

            # Extract object type (user-defined type string)
            object_type = None
            if hasattr(element, 'ObjectType') and element.ObjectType:
                object_type = str(element.ObjectType)

            # Entity data dict
            entity_data = {
                'express_id': element.id(),
                'ifc_type': element.is_a(),
                'predefined_type': predefined_type,
                'object_type': object_type,
                'name': element.Name or '',
                'description': getattr(element, 'Description', None),
                'storey_id': storey_id,
                'area': quantities['area'],
                'volume': quantities['volume'],
                'length': quantities['length'],
                'height': quantities['height'],
                'perimeter': quantities['perimeter'],
                'is_removed': False,  # Entity is present in file
            }

            if guid in existing_by_guid:
                # UPDATE existing entity
                existing = existing_by_guid[guid]
                for key, value in entity_data.items():
                    setattr(existing, key, value)
                to_update.append(existing)
            else:
                # CREATE new entity
                to_create.append(IFCEntity(
                    model=model,
                    ifc_guid=guid,
                    **entity_data
                ))

            # Batch operations when we reach batch_size
            if len(to_create) >= batch_size:
                IFCEntity.objects.bulk_create(to_create)
                print(f"   Created {len(to_create)} new entities...")
                to_create = []

            if len(to_update) >= batch_size:
                IFCEntity.objects.bulk_update(to_update, update_fields, batch_size=batch_size)
                print(f"   Updated {len(to_update)} existing entities...")
                to_update = []

        except Exception as e:
            errors.append({
                'stage': 'elements_metadata',
                'severity': 'error',
                'message': f"Failed to process element '{element.Name or element.GlobalId}': {str(e)}",
                'element_guid': element.GlobalId if hasattr(element, 'GlobalId') else None,
                'element_type': element.is_a() if hasattr(element, 'is_a') else 'IfcElement',
                'timestamp': datetime.now().isoformat()
            })

    # Insert/update remaining entities
    if to_create:
        IFCEntity.objects.bulk_create(to_create)
        print(f"   Created {len(to_create)} new entities...")

    if to_update:
        IFCEntity.objects.bulk_update(to_update, update_fields, batch_size=batch_size)
        print(f"   Updated {len(to_update)} existing entities...")

    # Mark removed entities (in DB but not in new file)
    removed_guids = set(existing_by_guid.keys()) - seen_guids
    removed_count = 0
    if removed_guids:
        removed_count = IFCEntity.objects.filter(
            model=model,
            ifc_guid__in=removed_guids
        ).update(is_removed=True)
        print(f"   Marked {removed_count} entities as removed")

    # Calculate totals
    created_count = len(elements) - len([g for g in seen_guids if g in existing_by_guid])
    updated_count = len([g for g in seen_guids if g in existing_by_guid])
    total_count = created_count + updated_count

    # Store version diff on model
    model.version_diff = {
        'entities': {
            'created': created_count,
            'updated': updated_count,
            'removed': removed_count,
            'total': total_count,
        }
    }
    model.save(update_fields=['version_diff'])

    return total_count, errors


def _extract_property_sets(model, ifc_file):
    """Extract property sets (metadata only) - BULK INSERT for performance."""
    count = 0
    errors = []

    # Batch size for bulk inserts
    BATCH_SIZE = 1000
    property_batch = []

    # Get all elements
    elements = ifc_file.by_type('IfcElement')

    # Pre-fetch all entities into a dict for O(1) lookup
    entity_map = {
        entity.ifc_guid: entity
        for entity in IFCEntity.objects.filter(model=model).only('id', 'ifc_guid')
    }

    for element in elements:
        # Get the IFCEntity for this element (fast dict lookup)
        entity = entity_map.get(element.GlobalId)
        if not entity:
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
                                prop_name = '<unknown>'
                                try:
                                    if prop.is_a('IfcPropertySingleValue'):
                                        prop_name = prop.Name
                                        prop_value = str(prop.NominalValue.wrappedValue) if prop.NominalValue else None
                                        prop_type = type(prop.NominalValue.wrappedValue).__name__ if prop.NominalValue else 'string'

                                        # Add to batch instead of creating immediately
                                        property_batch.append(PropertySet(
                                            entity=entity,
                                            pset_name=pset_name,
                                            property_name=prop_name,
                                            property_value=prop_value,
                                            property_type=prop_type
                                        ))
                                        count += 1

                                        # Bulk insert when batch is full
                                        if len(property_batch) >= BATCH_SIZE:
                                            PropertySet.objects.bulk_create(property_batch, ignore_conflicts=True)
                                            print(f"   Inserted {count} properties...")
                                            property_batch = []

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

    # Insert remaining properties
    if property_batch:
        PropertySet.objects.bulk_create(property_batch, ignore_conflicts=True)

    return count, errors
