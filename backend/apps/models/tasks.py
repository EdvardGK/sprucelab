"""
Celery tasks for IFC model processing.

This module contains async tasks for processing IFC files using Celery.
Tasks are executed by Celery workers and use Redis for message brokering.
Results are stored in the Django database via django-celery-results.
"""
from django.db import transaction
from django.conf import settings
import os
import tempfile
import time
import traceback
from celery import shared_task


def _ensure_local_file(model, file_path=None):
    """
    Ensure we have a local file path for processing.

    For cloud storage (Supabase), downloads the file to a temp location.
    Returns (local_path, is_temp) tuple.
    """
    use_cloud = getattr(settings, 'USE_SUPABASE_STORAGE', False)

    # If file_path exists locally, use it
    if file_path and os.path.exists(file_path):
        return file_path, False

    # For cloud storage or missing local file, download from file_url
    if model.file_url:
        import requests
        response = requests.get(model.file_url)
        response.raise_for_status()

        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.ifc')
        temp_file.write(response.content)
        temp_file.close()

        return temp_file.name, True

    raise FileNotFoundError(f"Cannot find IFC file for model {model.id}")


@shared_task(bind=True, name='apps.models.tasks.process_ifc_task')
def process_ifc_task(self, model_id, file_path=None, **kwargs):
    """
    Process an IFC file asynchronously using Celery (LITE APPROACH).

    NOTE: This task now uses the lite approach - aggregate stats only.
    For full entity extraction with types/materials in database,
    use FastAPI's /ifc/process endpoint instead.

    The viewer loads IFC files directly via ThatOpen - no geometry
    extraction needed in the backend.

    Args:
        model_id: UUID of the Model instance (as string)
        file_path: Full path to the IFC file (optional, uses file_url if not provided)
        **kwargs: Ignored (for backward compatibility with old callers)

    Returns:
        dict: Processing results with aggregate stats
    """
    from .models import Model
    from .services import parse_ifc_stats

    temp_file_to_cleanup = None

    try:
        # Get model instance
        try:
            model = Model.objects.get(id=model_id)
        except Model.DoesNotExist:
            error_msg = f"Model {model_id} not found"
            print(f"❌ {error_msg}")
            raise Exception(error_msg)

        # Ensure we have a local file (download from cloud if needed)
        local_path, is_temp = _ensure_local_file(model, file_path)
        if is_temp:
            temp_file_to_cleanup = local_path
            print(f"📥 Downloaded file from cloud storage to: {local_path}")

        print(f"\n🔄 Processing model {model.name} (v{model.version_number})...")
        print(f"   File: {local_path}")
        print(f"   Mode: Lite (stats only)")

        # ==================== PARSE STATS (LITE APPROACH) ====================
        # NOTE: This task now uses the lite approach - stats only, no entity CRUD.
        # For full entity extraction, use FastAPI's /ifc/process endpoint.
        print(f"\n{'='*80}")
        print(f"PARSING IFC STATS (lite approach - no entity CRUD)")
        print(f"{'='*80}")

        parse_result = parse_ifc_stats(local_path)

        # Check if parsing succeeded
        if parse_result.get('element_count', 0) == 0:
            raise Exception("Parsing failed: No elements found in file")

        print(f"\n✅ Stats extracted:")
        print(f"   Schema: {parse_result.get('ifc_schema', 'unknown')}")
        print(f"   Elements: {parse_result.get('element_count', 0)}")
        print(f"   Storeys: {parse_result.get('storey_count', 0)}")
        print(f"   Types: {parse_result.get('type_count', 0)}")
        print(f"   Materials: {parse_result.get('material_count', 0)}")

        # Note: Geometry is no longer extracted here - viewer loads IFC directly

        # ==================== Update Model with Stats ====================
        with transaction.atomic():
            model.refresh_from_db()
            model.ifc_schema = parse_result.get('ifc_schema', '')
            model.element_count = parse_result.get('element_count', 0)
            model.storey_count = parse_result.get('storey_count', 0)
            model.type_count = parse_result.get('type_count', 0)
            model.material_count = parse_result.get('material_count', 0)
            model.system_count = parse_result.get('system_count', 0)
            model.type_summary = parse_result.get('type_summary', {})
            model.parsing_status = 'parsed'
            model.status = 'ready'  # Ready immediately - viewer loads IFC directly
            model.save(update_fields=[
                'ifc_schema', 'element_count', 'storey_count',
                'type_count', 'material_count', 'system_count',
                'type_summary', 'parsing_status', 'status'
            ])

        print(f"\n{'='*80}")
        print(f"✅ PROCESSING COMPLETE for {model.name} (v{model.version_number})")
        print(f"   Status: ready")
        print(f"   Note: For full entity extraction, use FastAPI /ifc/process")
        print(f"{'='*80}\n")

        # Return results
        return {
            'model_id': str(model_id),
            'model_name': model.name,
            'version': model.version_number,
            'status': 'success',
            'parsing_status': 'parsed',
            'stats': parse_result,
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

    finally:
        # Clean up temp file if we downloaded from cloud storage
        if temp_file_to_cleanup and os.path.exists(temp_file_to_cleanup):
            try:
                os.unlink(temp_file_to_cleanup)
                print(f"🗑️  Cleaned up temp file: {temp_file_to_cleanup}")
            except Exception as cleanup_error:
                print(f"⚠️  Could not cleanup temp file: {cleanup_error}")


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
    from .services import parse_ifc_stats

    temp_file_to_cleanup = None

    try:
        # Get both models
        old_model = Model.objects.get(id=old_model_id)
        new_model = Model.objects.get(id=new_model_id)

        print(f"\n🔄 Starting revert task: v{old_model.version_number} → v{new_model.version_number}")

        # Update new model status
        new_model.status = 'processing'
        new_model.save(update_fields=['status'])

        # Ensure we have a local file (download from cloud if needed)
        local_path, is_temp = _ensure_local_file(old_model)
        if is_temp:
            temp_file_to_cleanup = local_path
            print(f"📥 Downloaded file from cloud storage to: {local_path}")

        # Process the file using lite approach
        result = parse_ifc_stats(local_path)

        # Update new model with results
        with transaction.atomic():
            new_model.refresh_from_db()
            new_model.status = 'ready'
            new_model.ifc_schema = result.get('ifc_schema', '')
            new_model.element_count = result.get('element_count', 0)
            new_model.storey_count = result.get('storey_count', 0)
            new_model.type_count = result.get('type_count', 0)
            new_model.material_count = result.get('material_count', 0)
            new_model.system_count = result.get('system_count', 0)
            new_model.type_summary = result.get('type_summary', {})
            new_model.parsing_status = 'parsed'
            new_model.save(update_fields=[
                'status', 'ifc_schema', 'element_count', 'storey_count',
                'type_count', 'material_count', 'system_count',
                'type_summary', 'parsing_status'
            ])

        print(f"✅ Revert task complete: Created v{new_model.version_number} from v{old_model.version_number}")

        return {
            'status': 'success',
            'old_version': old_model.version_number,
            'new_version': new_model.version_number,
            'model_id': str(new_model.id),
            'stats': result
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

    finally:
        # Clean up temp file if we downloaded from cloud storage
        if temp_file_to_cleanup and os.path.exists(temp_file_to_cleanup):
            try:
                os.unlink(temp_file_to_cleanup)
                print(f"🗑️  Cleaned up temp file: {temp_file_to_cleanup}")
            except Exception as cleanup_error:
                print(f"⚠️  Could not cleanup temp file: {cleanup_error}")


@shared_task(bind=True, name='apps.models.tasks.enrich_model_task')
def enrich_model_task(self, model_id, file_path=None, extract_properties=True, extract_relationships=True, run_validation=True):
    """
    Enrich a model with additional metadata beyond what web-ifc provides.

    This task runs AFTER the model is already viewable (status='ready').
    It adds database-level metadata for querying and analysis.

    Args:
        model_id: UUID of the Model instance
        file_path: Path to the IFC file (optional, will use model.file_url if not provided)
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

    temp_file_to_cleanup = None

    try:
        # Get model instance
        model = Model.objects.get(id=model_id)
        print(f"\n🔍 Starting enrichment for model: {model.name} (v{model.version_number})")

        # Ensure we have a local file (download from cloud if needed)
        local_path, is_temp = _ensure_local_file(model, file_path)
        if is_temp:
            temp_file_to_cleanup = local_path
            print(f"📥 Downloaded file from cloud storage to: {local_path}")

        results = {
            'model_id': str(model_id),
            'properties_extracted': 0,
            'relationships_extracted': 0,
            'validation_issues': 0,
        }

        # Open IFC file
        print(f"📂 Opening IFC file: {local_path}")
        ifc_file = ifcopenshell.open(local_path)

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

    finally:
        # Clean up temp file if we downloaded from cloud storage
        if temp_file_to_cleanup and os.path.exists(temp_file_to_cleanup):
            try:
                os.unlink(temp_file_to_cleanup)
                print(f"🗑️  Cleaned up temp file: {temp_file_to_cleanup}")
            except Exception as cleanup_error:
                print(f"⚠️  Could not cleanup temp file: {cleanup_error}")


@shared_task(bind=True, name='apps.models.tasks.process_ifc_lite_task')
def process_ifc_lite_task(self, model_id, file_path=None):
    """
    LITE IFC processing - extract aggregate stats only.

    NEW ARCHITECTURE (2024-12):
    - Only extracts aggregate statistics (counts, type summary)
    - NO database writes for individual entities/properties
    - Frontend queries IFC directly via FastAPI for element details
    - FAST: Completes in 1-5 seconds for any file size

    This replaces the heavy process_ifc_task that wrote 10k+ rows to Supabase.

    Args:
        model_id: UUID of the Model instance (as string)
        file_path: Full path to the IFC file (optional, uses model.file_url if not provided)

    Returns:
        dict: Processing results with aggregate stats
    """
    from .models import Model
    from .services import parse_ifc_stats

    temp_file_to_cleanup = None

    try:
        # Get model instance
        try:
            model = Model.objects.get(id=model_id)
        except Model.DoesNotExist:
            error_msg = f"Model {model_id} not found"
            print(f"❌ {error_msg}")
            raise Exception(error_msg)

        # Update status to processing
        model.status = 'processing'
        model.parsing_status = 'parsing'
        model.save(update_fields=['status', 'parsing_status'])

        # Ensure we have a local file (download from cloud if needed)
        local_path, is_temp = _ensure_local_file(model, file_path)
        if is_temp:
            temp_file_to_cleanup = local_path
            print(f"📥 Downloaded file from cloud storage to: {local_path}")

        print(f"\n🚀 [LITE] Processing model {model.name} (v{model.version_number})...")
        print(f"   File: {local_path}")
        print(f"   Mode: Aggregate stats only (no entity CRUD)")

        # ==================== Extract Stats ====================
        stats = parse_ifc_stats(local_path)

        print(f"\n✅ Stats extracted in {stats['duration_seconds']}s:")
        print(f"   Schema: {stats['ifc_schema']}")
        print(f"   Elements: {stats['element_count']}")
        print(f"   Storeys: {stats['storey_count']}")
        print(f"   Types: {stats['type_count']}")
        print(f"   Materials: {stats['material_count']}")
        print(f"   Systems: {stats['system_count']}")

        # ==================== Update Model ====================
        with transaction.atomic():
            model.refresh_from_db()
            model.ifc_schema = stats['ifc_schema']
            model.element_count = stats['element_count']
            model.storey_count = stats['storey_count']
            model.type_count = stats['type_count']
            model.material_count = stats['material_count']
            model.system_count = stats['system_count']
            model.type_summary = stats['type_summary']
            model.parsing_status = 'parsed'
            model.status = 'ready'  # Ready immediately - viewer loads IFC directly
            model.save(update_fields=[
                'ifc_schema', 'element_count', 'storey_count',
                'type_count', 'material_count', 'system_count',
                'type_summary', 'parsing_status', 'status'
            ])

        print(f"\n{'='*60}")
        print(f"✅ [LITE] PROCESSING COMPLETE for {model.name}")
        print(f"   Duration: {stats['duration_seconds']}s")
        print(f"   Status: ready")
        print(f"   Note: Query IFC via FastAPI for element details")
        print(f"{'='*60}\n")

        # Trigger fragment generation in background
        # This runs async - FastAPI handles actual conversion
        try:
            from .tasks import generate_fragments_task
            generate_fragments_task.delay(str(model_id))
            print(f"📦 Triggered fragment generation for {model.name}")
        except Exception as frag_error:
            # Fragment generation failure should not fail the parsing task
            print(f"⚠️  Could not trigger fragment generation: {frag_error}")

        return {
            'model_id': str(model_id),
            'model_name': model.name,
            'version': model.version_number,
            'status': 'success',
            'processing_mode': 'lite',
            'stats': stats,
        }

    except Exception as e:
        # Log the error
        error_msg = str(e)
        error_trace = traceback.format_exc()
        print(f"\n❌ [LITE] Task failed for model {model_id}")
        print(f"   Error: {error_msg}")
        print(f"   Traceback:\n{error_trace}")

        # Update model status to error
        try:
            model = Model.objects.get(id=model_id)
            model.parsing_status = 'failed'
            model.status = 'error'
            model.processing_error = error_msg
            model.save(update_fields=['status', 'processing_error', 'parsing_status'])
        except Exception as inner_e:
            print(f"❌ Could not update model status: {str(inner_e)}")

        raise

    finally:
        # Clean up temp file if we downloaded from cloud storage
        if temp_file_to_cleanup and os.path.exists(temp_file_to_cleanup):
            try:
                os.unlink(temp_file_to_cleanup)
                print(f"🗑️  Cleaned up temp file: {temp_file_to_cleanup}")
            except Exception as cleanup_error:
                print(f"⚠️  Could not cleanup temp file: {cleanup_error}")


@shared_task(bind=True, name='apps.models.tasks.generate_fragments_task', max_retries=2)
def generate_fragments_task(self, model_id):
    """
    Trigger fragment generation via FastAPI.

    This task is chained after process_ifc_lite_task completes.
    It calls FastAPI which handles the actual conversion in the background.

    Args:
        model_id: UUID of the Model instance (as string)

    Returns:
        dict: Trigger result from FastAPI
    """
    from .models import Model
    from .services.fragments import trigger_fragment_generation

    try:
        model = Model.objects.get(id=model_id)

        # Skip if model has no IFC file
        if not model.file_url:
            print(f"Skipping fragment generation for {model.name}: no IFC file")
            return {'status': 'skipped', 'reason': 'no_ifc_file'}

        # Skip if already generating or completed
        if model.fragments_status in ('generating', 'completed'):
            print(f"Skipping fragment generation for {model.name}: status={model.fragments_status}")
            return {'status': 'skipped', 'reason': f'already_{model.fragments_status}'}

        print(f"Triggering fragment generation for {model.name}")
        result = trigger_fragment_generation(str(model_id))
        return result

    except Exception as e:
        error_msg = str(e)
        print(f"Fragment generation trigger failed for {model_id}: {error_msg}")

        # Update model status
        try:
            model = Model.objects.get(id=model_id)
            model.fragments_status = 'failed'
            model.fragments_error = error_msg
            model.save(update_fields=['fragments_status', 'fragments_error'])
        except Exception:
            pass

        # Retry with exponential backoff
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=60 * (2 ** self.request.retries))

        return {'status': 'error', 'error': error_msg}


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
