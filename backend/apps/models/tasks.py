"""
Celery tasks for IFC model processing.

This module contains async tasks for processing IFC files using Celery.
Tasks are executed by Celery workers and use Redis for message brokering.
Results are stored in the Django database via django-celery-results.
"""
from django.db import transaction
import time
import traceback
from celery import shared_task


@shared_task(bind=True, name='apps.models.tasks.process_ifc_task')
def process_ifc_task(self, model_id, file_path, skip_geometry=False, lod_level='low', target_triangles=2000):
    """
    Process an IFC file asynchronously using Celery (STAGED APPROACH).

    This task uses a layered architecture:
    1. Layer 1 (Parse): Extract metadata only (fast, always succeeds)
    2. Layer 2 (Geometry): Extract simplified geometry (LOD-LOW by default, ~2 minutes)
    3. Layer 3 (Validate): Run quality checks (reports issues)

    LOD STRATEGY:
    - Default: Generate LOW-LOD geometry (simplified, 2k triangles per element)
    - Protects against bad modeling (1M face vent → 2k triangles)
    - User sees correct shapes quickly (~2 minutes)
    - Optional: Generate HIGH-LOD (full detail) on demand later

    Args:
        model_id: UUID of the Model instance (as string)
        file_path: Full path to the IFC file
        skip_geometry: If True, skip geometry entirely (metadata only, <30s)
        lod_level: 'low' (simplified, default) or 'high' (full detail)
        target_triangles: Target triangle count for LOW-LOD (default: 2000)

    Returns:
        dict: Processing results with counts and metadata
    """
    from .models import Model
    from .services import parse_ifc_metadata, extract_geometry_for_model

    try:
        # Get model instance
        try:
            model = Model.objects.get(id=model_id)
        except Model.DoesNotExist:
            error_msg = f"Model {model_id} not found"
            print(f"❌ {error_msg}")
            raise Exception(error_msg)

        print(f"\n🔄 Starting LAYERED processing for model {model.name} (v{model.version_number})...")
        print(f"   File: {file_path}")
        print(f"   Stage 1: Parse metadata")
        print(f"   Stage 2: Extract geometry")
        print(f"   Stage 3: Validate (TODO)")

        # ==================== LAYER 1: Parse Metadata ====================
        print(f"\n{'='*80}")
        print(f"LAYER 1: PARSING METADATA (no geometry)")
        print(f"{'='*80}")

        parse_result = parse_ifc_metadata(model_id, file_path)

        # Check if parsing succeeded
        if parse_result.get('element_count', 0) == 0:
            raise Exception("Parsing failed: No elements extracted")

        print(f"\n✅ Layer 1 complete:")
        print(f"   Elements: {parse_result.get('element_count', 0)}")
        print(f"   Properties: {parse_result.get('property_count', 0)}")
        print(f"   Storeys: {parse_result.get('storey_count', 0)}")

        # ==================== LAYER 2: Extract Geometry (OPTIONAL) ====================
        geometry_result = None
        if skip_geometry:
            print(f"\n⏭️  LAYER 2: SKIPPED (geometry extraction deferred)")
            print(f"   Geometry can be extracted later via API endpoint")
            # Set geometry status to pending (will be extracted on-demand)
            with transaction.atomic():
                model.refresh_from_db()
                model.geometry_status = 'pending'
                model.save(update_fields=['geometry_status'])
        else:
            print(f"\n{'='*80}")
            print(f"LAYER 2: EXTRACTING GEOMETRY")
            print(f"{'='*80}")

            # Sequential processing (Celery workers are already parallel)
            # Note: Can't use multiprocessing.Pool inside Celery worker processes
            geometry_result = extract_geometry_for_model(
                model_id,
                file_path,
                parallel=False,  # Celery handles parallelism at task level
                lod_level=lod_level,
                target_triangles=target_triangles
            )

            print(f"\n✅ Layer 2 complete:")
            print(f"   Geometries extracted: {geometry_result.get('succeeded', 0)}")
            print(f"   Failed: {geometry_result.get('failed', 0)}")

        # ==================== Update Legacy Status Field ====================
        # For backward compatibility, update the legacy 'status' field
        with transaction.atomic():
            model.refresh_from_db()

            # Determine legacy status based on layer statuses
            # In metadata-only architecture, models are ready when parsing completes
            if model.parsing_status == 'parsed':
                model.status = 'ready'  # Geometry is optional, metadata is sufficient
            elif model.parsing_status == 'failed':
                model.status = 'error'
            else:
                model.status = 'processing'

            model.save(update_fields=['status'])

        print(f"\n{'='*80}")
        print(f"✅ LAYERED PROCESSING COMPLETE for {model.name} (v{model.version_number})")
        print(f"   Parsing: {model.parsing_status}")
        print(f"   Geometry: {model.geometry_status}")
        print(f"   Legacy status: {model.status}")
        print(f"{'='*80}\n")

        # Return combined results
        return {
            'model_id': str(model_id),
            'model_name': model.name,
            'version': model.version_number,
            'status': 'success',
            'parsing_status': model.parsing_status,
            'geometry_status': model.geometry_status,
            'layers': {
                'layer1_parse': parse_result,
                'layer2_geometry': geometry_result,
            }
        }

    except Exception as e:
        # Log the error
        error_msg = str(e)
        error_trace = traceback.format_exc()
        print(f"\n❌ Celery task failed for model {model_id}")
        print(f"   Error: {error_msg}")
        print(f"   Traceback:\n{error_trace}")

        # Update model status to error
        try:
            model = Model.objects.get(id=model_id)

            # Update layer-specific status
            if 'parsing' in error_msg.lower() or model.parsing_status != 'parsed':
                model.parsing_status = 'failed'

            # Update legacy status
            model.status = 'error'
            model.processing_error = error_msg
            model.save(update_fields=['status', 'processing_error', 'parsing_status'])
        except Exception as inner_e:
            print(f"❌ Could not update model status: {str(inner_e)}")

        # Re-raise exception so Celery marks task as failed
        raise


@shared_task(bind=True, name='apps.models.tasks.revert_model_task')
def revert_model_task(self, old_model_id, new_model_id):
    """
    Revert to an old model version by re-processing its file.

    This task creates a new version from an old model's file,
    effectively "reverting" to that version.

    Args:
        old_model_id: UUID of the old model to revert to
        new_model_id: UUID of the newly created model instance

    Returns:
        dict: Revert results
    """
    from .models import Model
    from .services import process_ifc_file
    from django.core.files.storage import default_storage

    try:
        # Get both models
        old_model = Model.objects.get(id=old_model_id)
        new_model = Model.objects.get(id=new_model_id)

        print(f"\n🔄 Starting revert task: v{old_model.version_number} → v{new_model.version_number}")

        # Update new model status
        new_model.status = 'processing'
        new_model.save(update_fields=['status'])

        # Get file path
        file_url = old_model.file_url.replace('/media/', '') if old_model.file_url else None
        if not file_url:
            raise Exception("Old model has no file URL")

        full_path = default_storage.path(file_url)

        # Process the file
        result = process_ifc_file(new_model.id, full_path)

        # Update new model with results
        with transaction.atomic():
            new_model.refresh_from_db()
            new_model.status = 'ready'
            new_model.ifc_schema = result.get('ifc_schema', '')
            new_model.element_count = result.get('element_count', 0)
            new_model.storey_count = result.get('storey_count', 0)
            new_model.system_count = result.get('system_count', 0)
            new_model.save(update_fields=[
                'status', 'ifc_schema', 'element_count',
                'storey_count', 'system_count'
            ])

        print(f"✅ Revert task complete: Created v{new_model.version_number} from v{old_model.version_number}")

        return {
            'status': 'success',
            'old_version': old_model.version_number,
            'new_version': new_model.version_number,
            'model_id': str(new_model.id),
            **result
        }

    except Exception as e:
        error_msg = str(e)
        print(f"❌ Revert task failed: {error_msg}")

        # Update new model status to error
        try:
            new_model = Model.objects.get(id=new_model_id)
            new_model.status = 'error'
            new_model.processing_error = f"Revert failed: {error_msg}"
            new_model.save(update_fields=['status', 'processing_error'])
        except:
            pass

        # Re-raise so Celery marks as failed
        raise


@shared_task(bind=True, name='apps.models.tasks.enrich_model_task')
def enrich_model_task(self, model_id, file_path, extract_properties=True, extract_relationships=True, run_validation=True):
    """
    Enrich a model with additional metadata beyond what web-ifc provides.

    This task runs AFTER the model is already viewable (status='ready').
    It adds database-level metadata for querying and analysis.

    Args:
        model_id: UUID of the Model instance
        file_path: Path to the IFC file
        extract_properties: Extract property sets (Psets)
        extract_relationships: Extract spatial/containment relationships
        run_validation: Run BEP validation checks

    Returns:
        dict: Enrichment results
    """
    from .models import Model
    from apps.entities.models import IFCEntity, IFCProperty
    import ifcopenshell
    import ifcopenshell.util.element as Element

    try:
        # Get model instance
        model = Model.objects.get(id=model_id)
        print(f"\n🔍 Starting enrichment for model: {model.name} (v{model.version_number})")

        results = {
            'model_id': str(model_id),
            'properties_extracted': 0,
            'relationships_extracted': 0,
            'validation_issues': 0,
        }

        # Open IFC file
        print(f"📂 Opening IFC file: {file_path}")
        ifc_file = ifcopenshell.open(file_path)

        # ==================== Extract Properties ====================
        if extract_properties:
            print(f"\n{'='*80}")
            print(f"ENRICHMENT: Extracting property sets (Psets)")
            print(f"{'='*80}")

            # Get all entities from database
            entities = IFCEntity.objects.filter(model=model)
            print(f"Processing properties for {entities.count()} entities...")

            properties_to_create = []
            for entity in entities:
                try:
                    # Get IFC element by GUID
                    ifc_element = ifc_file.by_guid(entity.ifc_guid)

                    # Extract all properties
                    psets = Element.get_psets(ifc_element)

                    for pset_name, props in psets.items():
                        if not isinstance(props, dict):
                            continue

                        for prop_name, prop_value in props.items():
                            # Skip metadata fields
                            if prop_name in ['id', 'type']:
                                continue

                            # Convert value to string
                            value_str = str(prop_value) if prop_value is not None else None

                            properties_to_create.append(IFCProperty(
                                entity=entity,
                                pset_name=pset_name,
                                property_name=prop_name,
                                property_value=value_str
                            ))

                            results['properties_extracted'] += 1

                    # Batch create every 1000 properties
                    if len(properties_to_create) >= 1000:
                        IFCProperty.objects.bulk_create(properties_to_create, batch_size=500, ignore_conflicts=True)
                        print(f"  Saved {len(properties_to_create)} properties...")
                        properties_to_create = []

                except Exception as e:
                    print(f"  Warning: Failed to extract properties for {entity.ifc_guid}: {e}")

            # Save remaining properties
            if properties_to_create:
                IFCProperty.objects.bulk_create(properties_to_create, batch_size=500, ignore_conflicts=True)
                print(f"  Saved {len(properties_to_create)} properties")

            print(f"✅ Extracted {results['properties_extracted']} properties")

        # ==================== Extract Relationships ====================
        if extract_relationships:
            print(f"\n{'='*80}")
            print(f"ENRICHMENT: Extracting spatial/containment relationships")
            print(f"{'='*80}")

            # TODO: Implement relationship extraction
            # - IfcRelContainedInSpatialStructure (elements → storeys → buildings)
            # - IfcRelAggregates (assemblies)
            # - IfcRelConnects (connections between elements)

            print("  (Relationship extraction not yet implemented)")

        # ==================== Run Validation ====================
        if run_validation:
            print(f"\n{'='*80}")
            print(f"ENRICHMENT: Running validation checks")
            print(f"{'='*80}")

            # TODO: Implement validation
            # - BEP compliance checks
            # - Schema validation
            # - GUID uniqueness
            # - Property completeness

            print("  (Validation not yet implemented)")

        print(f"\n{'='*80}")
        print(f"✅ ENRICHMENT COMPLETE for {model.name} (v{model.version_number})")
        print(f"   Properties: {results['properties_extracted']}")
        print(f"   Relationships: {results['relationships_extracted']}")
        print(f"{'='*80}\n")

        return {
            'status': 'success',
            **results
        }

    except Exception as e:
        error_msg = str(e)
        error_trace = traceback.format_exc()
        print(f"\n❌ Enrichment task failed for model {model_id}")
        print(f"   Error: {error_msg}")
        print(f"   Traceback:\n{error_trace}")

        # Note: We don't update model status to 'error' because
        # the model is already viewable. Enrichment failure is non-critical.

        raise


@shared_task(bind=True, name='apps.models.tasks.debug_task')
def debug_task(self):
    """
    Simple debug task to test Celery setup.

    Usage:
        from apps.models.tasks import debug_task

        result = debug_task.delay()
        print(f"Task ID: {result.id}")
    """
    import time

    print("Debug task started!")
    time.sleep(2)
    print("Debug task completed!")

    return {
        'status': 'success',
        'message': 'Celery is working!',
        'timestamp': time.time()
    }
