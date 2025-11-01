"""
Layer 2: Geometry Extraction Service

PHILOSOPHY:
- Extract geometry for elements that were parsed in Layer 1
- CAN FAIL per element without losing metadata
- SLOW: Can take minutes for complex models (use PARALLEL PROCESSING)
- OPTIONAL: Can be run on-demand or in background
- RETRYABLE: Failed elements can be retried

PURPOSE:
This enriches the Layer 1 foundation with 3D geometry for visualization and analysis.

PERFORMANCE OPTIMIZATION (Per research):
- Geometry generation is 10-60x slower than parsing
- Must use parallel processing (4-8 workers) for acceptable performance
- Bulk database operations to minimize network overhead

LOD (LEVEL OF DETAIL) STRATEGY:
- Generate simplified geometry first (LOW-LOD: ~2000 triangles per element)
- Protects against bad modeling (1M face vent → 2k triangles)
- User sees correct shapes quickly
- Optional: Generate full detail (HIGH-LOD) on demand
"""
import ifcopenshell
import ifcopenshell.geom
import numpy as np
import time
from datetime import datetime
from django.db import transaction
from django.utils import timezone
from multiprocessing import Pool, cpu_count
from functools import partial

from apps.entities.models import IFCEntity, Geometry


def decimate_mesh(vertices, faces, target_triangles=2000):
    """
    Simplify a mesh to a target triangle count using quadric error decimation.

    This protects against bad modeling (1M face vent → 2k triangles) while
    maintaining the visual shape.

    Args:
        vertices: Nx3 numpy array of vertex positions
        faces: Mx3 numpy array of triangle indices
        target_triangles: Target number of triangles (default: 2000)

    Returns:
        (simplified_vertices, simplified_faces) or original if decimation fails
    """
    try:
        import trimesh

        # Create trimesh object
        mesh = trimesh.Trimesh(vertices=vertices, faces=faces)

        # Skip if already simple enough
        if len(faces) <= target_triangles:
            return vertices, faces

        # Calculate decimation ratio
        ratio = target_triangles / len(faces)

        # Simplify mesh using quadric error decimation
        simplified = mesh.simplify_quadric_decimation(int(len(faces) * ratio))

        print(f"   Decimated {len(faces)} → {len(simplified.faces)} triangles")

        return np.array(simplified.vertices), np.array(simplified.faces)

    except ImportError:
        # trimesh not installed, return original
        print("   Warning: trimesh not available, skipping decimation")
        return vertices, faces
    except Exception as e:
        # Decimation failed, return original
        print(f"   Warning: Decimation failed ({e}), using original mesh")
        return vertices, faces


def _extract_single_geometry(args):
    """
    Worker function for parallel geometry extraction.

    This runs in a separate process, so it CANNOT access Django ORM.
    Returns geometry data as dict for bulk insert.

    Args:
        args: Tuple of (file_path, entity_guid, entity_id, lod_level, target_triangles)

    Returns:
        dict: Geometry data or error info
    """
    file_path, entity_guid, entity_id, lod_level, target_triangles = args

    try:
        # Open IFC file (each worker gets its own file handle)
        ifc_file = ifcopenshell.open(file_path)

        # Get element by GUID
        ifc_element = ifc_file.by_guid(entity_guid)

        # Setup geometry settings
        settings = ifcopenshell.geom.settings()
        settings.set(settings.USE_WORLD_COORDS, True)

        # Extract geometry (CPU-intensive operation)
        shape = ifcopenshell.geom.create_shape(settings, ifc_element)

        # Get vertices and faces
        vertices = np.array(shape.geometry.verts).reshape(-1, 3)
        faces = np.array(shape.geometry.faces).reshape(-1, 3)

        # Validate
        if len(vertices) == 0 or len(faces) == 0:
            return {
                'status': 'failed',
                'entity_id': entity_id,
                'entity_guid': entity_guid,
                'error': 'Empty geometry (no vertices or faces)'
            }

        # Apply LOD decimation if requested (LOW-LOD only)
        original_triangle_count = len(faces)
        if lod_level == 'low' and target_triangles and len(faces) > target_triangles:
            vertices, faces = decimate_mesh(vertices, faces, target_triangles)
            decimated_triangle_count = len(faces)
            if decimated_triangle_count < original_triangle_count:
                print(f"   Decimated {entity_guid}: {original_triangle_count} → {decimated_triangle_count} triangles")

        # Calculate bounding box
        bbox_min_x = float(vertices[:, 0].min())
        bbox_min_y = float(vertices[:, 1].min())
        bbox_min_z = float(vertices[:, 2].min())
        bbox_max_x = float(vertices[:, 0].max())
        bbox_max_y = float(vertices[:, 1].max())
        bbox_max_z = float(vertices[:, 2].max())

        return {
            'status': 'success',
            'entity_id': entity_id,
            'entity_guid': entity_guid,
            'vertex_count': len(vertices),
            'triangle_count': len(faces),
            'bbox_min_x': bbox_min_x,
            'bbox_min_y': bbox_min_y,
            'bbox_min_z': bbox_min_z,
            'bbox_max_x': bbox_max_x,
            'bbox_max_y': bbox_max_y,
            'bbox_max_z': bbox_max_z,
            'vertices_bytes': vertices.tobytes(),
            'faces_bytes': faces.tobytes(),
        }

    except Exception as e:
        return {
            'status': 'failed',
            'entity_id': entity_id,
            'entity_guid': entity_guid,
            'error': str(e)
        }


def extract_geometry_for_model(model_id, file_path=None, element_ids=None, parallel=True, num_workers=None, lod_level='low', target_triangles=2000):
    """
    Extract geometry for elements in a model.

    PERFORMANCE: Uses parallel processing (4-8 workers) to speed up geometry extraction.
    Per research: Geometry generation is 10-60x slower than parsing, so parallelization is critical.

    IMPORTANT: When running inside Django-Q workers (daemon processes), parallel MUST be False
    because daemon processes cannot spawn child processes. Django-Q handles parallelism
    at the task level instead.

    LOD STRATEGY: Generate simplified geometry to protect against bad modeling.
    - 1M face vent → 2k triangles (still looks correct)
    - 30k vert chute → 2k vert version (visually identical)
    - User sees correct shapes quickly, can upgrade to full detail later

    Args:
        model_id: UUID of the Model instance
        file_path: Path to IFC file (required if not already loaded)
        element_ids: Optional list of specific element IDs to process (None = all pending)
        parallel: Use multiprocessing (default: True). Set False when in Django-Q worker.
        num_workers: Number of worker processes (default: cpu_count() - 1, max 8)
        lod_level: 'low' (simplified, default), 'high' (full detail)
        target_triangles: Target triangle count for LOD decimation (default: 2000)

    Returns:
        dict: Results with counts and timing
    """
    from apps.models.models import Model
    import multiprocessing

    # CRITICAL: Detect if we're running in a daemon process (Django-Q worker)
    # Daemon processes cannot spawn child processes, so force sequential processing
    try:
        if multiprocessing.current_process().daemon:
            print("⚠️  Running in daemon process (Django-Q worker), forcing sequential processing...")
            parallel = False
    except Exception:
        # If we can't detect, play it safe and use sequential
        pass

    # Get model instance
    model = Model.objects.get(id=model_id)

    start_time = time.time()

    # Update model status
    model.geometry_status = 'extracting'
    model.save(update_fields=['geometry_status'])

    print(f"\n🔷 [LAYER 2] Starting geometry extraction for model: {model.name}")

    results = {
        'processed': 0,
        'succeeded': 0,
        'failed': 0,
        'skipped': 0,
        'errors': []
    }

    try:
        # Open IFC file
        if not file_path:
            # Try to get file path from model
            if model.file_url:
                from django.core.files.storage import default_storage
                file_path = default_storage.path(model.file_url.replace('/media/', ''))
            else:
                raise ValueError("No file_path provided and model has no file_url")

        print(f"📂 IFC file path: {file_path}")

        # Get elements to process
        if element_ids:
            entities = list(IFCEntity.objects.filter(id__in=element_ids, model=model).values('id', 'ifc_guid'))
            print(f"   Processing {len(entities)} specific elements...")
        else:
            # Get all entities with pending geometry
            entities = list(IFCEntity.objects.filter(
                model=model,
                geometry_status='pending'
            ).values('id', 'ifc_guid'))
            print(f"   Found {len(entities)} elements with pending geometry...")

        if not entities:
            print("   No entities to process!")
            return results

        # Determine number of workers
        if not num_workers:
            num_workers = min(cpu_count() - 1, 8)  # Leave 1 core free, max 8 workers
            num_workers = max(num_workers, 1)  # At least 1 worker

        print(f"   Using {num_workers} parallel workers for geometry extraction...")
        print(f"   LOD level: {lod_level}, Target triangles: {target_triangles if lod_level == 'low' else 'full detail'}")

        # Prepare args for parallel processing: [(file_path, guid, entity_id, lod_level, target_triangles), ...]
        worker_args = [(file_path, entity['ifc_guid'], entity['id'], lod_level, target_triangles) for entity in entities]

        # PARALLEL GEOMETRY EXTRACTION
        if parallel and num_workers > 1:
            print(f"   Starting parallel extraction with {num_workers} workers...")
            with Pool(processes=num_workers) as pool:
                # Map extraction across workers
                geometry_results = pool.map(_extract_single_geometry, worker_args)
        else:
            print("   Using sequential extraction (parallel=False or num_workers=1)...")
            geometry_results = [_extract_single_geometry(args) for args in worker_args]

        print(f"   Geometry extraction complete! Processing {len(geometry_results)} results...")

        # BULK DATABASE SAVES (much faster than individual saves)
        geometries_to_create = []
        entities_to_update = []

        entity_map = {e['id']: e for e in entities}  # Fast lookup

        for result in geometry_results:
            results['processed'] += 1

            if result['status'] == 'success':
                # Successful geometry extraction
                results['succeeded'] += 1

                # Prepare Geometry object for bulk create
                geometries_to_create.append(Geometry(
                    entity_id=result['entity_id'],
                    vertex_count=result['vertex_count'],
                    triangle_count=result['triangle_count'],
                    bbox_min_x=result['bbox_min_x'],
                    bbox_min_y=result['bbox_min_y'],
                    bbox_min_z=result['bbox_min_z'],
                    bbox_max_x=result['bbox_max_x'],
                    bbox_max_y=result['bbox_max_y'],
                    bbox_max_z=result['bbox_max_z'],
                    vertices_original=result['vertices_bytes'],
                    faces_original=result['faces_bytes'],
                ))

                # Mark entity for update (we'll bulk update later)
                entities_to_update.append({
                    'id': result['entity_id'],
                    'geometry_status': 'completed',
                    'has_geometry': True,
                    'vertex_count': result['vertex_count'],
                    'triangle_count': result['triangle_count'],
                    'bbox_min_x': result['bbox_min_x'],
                    'bbox_min_y': result['bbox_min_y'],
                    'bbox_min_z': result['bbox_min_z'],
                    'bbox_max_x': result['bbox_max_x'],
                    'bbox_max_y': result['bbox_max_y'],
                    'bbox_max_z': result['bbox_max_z'],
                })

            else:
                # Failed geometry extraction
                results['failed'] += 1
                results['errors'].append({
                    'element_guid': result['entity_guid'],
                    'element_type': 'Unknown',
                    'error': result['error']
                })

                # Mark entity as failed
                entities_to_update.append({
                    'id': result['entity_id'],
                    'geometry_status': 'failed',
                })

            # Progress logging
            if results['processed'] % 500 == 0:
                print(f"   Progress: {results['processed']}/{len(geometry_results)} processed, {results['succeeded']} succeeded...")

        # BULK INSERT GEOMETRIES (single database roundtrip per batch)
        print(f"   Bulk inserting {len(geometries_to_create)} geometries...")
        if geometries_to_create:
            Geometry.objects.bulk_create(geometries_to_create, batch_size=100, ignore_conflicts=True)

        # BULK UPDATE ENTITIES (much faster than individual saves)
        print(f"   Bulk updating {len(entities_to_update)} entity statuses...")
        if entities_to_update:
            # Group by what fields need updating
            completed_updates = [e for e in entities_to_update if e.get('geometry_status') == 'completed']
            failed_updates = [e for e in entities_to_update if e.get('geometry_status') == 'failed']

            # Update completed entities (with geometry data)
            for entity_data in completed_updates:
                IFCEntity.objects.filter(id=entity_data['id']).update(
                    geometry_status=entity_data['geometry_status'],
                    has_geometry=entity_data['has_geometry'],
                    vertex_count=entity_data['vertex_count'],
                    triangle_count=entity_data['triangle_count'],
                    bbox_min_x=entity_data['bbox_min_x'],
                    bbox_min_y=entity_data['bbox_min_y'],
                    bbox_min_z=entity_data['bbox_min_z'],
                    bbox_max_x=entity_data['bbox_max_x'],
                    bbox_max_y=entity_data['bbox_max_y'],
                    bbox_max_z=entity_data['bbox_max_z'],
                )

            # Update failed entities (just status)
            if failed_updates:
                failed_ids = [e['id'] for e in failed_updates]
                IFCEntity.objects.filter(id__in=failed_ids).update(geometry_status='failed')

        # Update model status
        end_time = time.time()
        duration = end_time - start_time

        if results['failed'] == 0:
            model.geometry_status = 'completed'
        elif results['succeeded'] > 0:
            model.geometry_status = 'partial'
        else:
            model.geometry_status = 'failed'

        model.save(update_fields=['geometry_status'])

        results['duration_seconds'] = duration

        print(f"\n{'='*80}")
        print(f"✅ [LAYER 2] GEOMETRY EXTRACTION COMPLETE!")
        print(f"   Duration: {duration:.2f}s")
        print(f"   Processed: {results['processed']}")
        print(f"   Succeeded: {results['succeeded']}")
        print(f"   Failed: {results['failed']}")
        print(f"   Skipped: {results['skipped']}")
        if results['failed'] > 0:
            print(f"   ⚠️  {results['failed']} elements failed (metadata preserved)")
        print(f"{'='*80}\n")

        return results

    except Exception as e:
        # Catastrophic failure
        end_time = time.time()
        duration = end_time - start_time

        error_msg = f"Catastrophic geometry extraction failure: {str(e)}"
        print(f"\n❌ {error_msg}")

        # Update model status
        model.geometry_status = 'failed'
        model.save(update_fields=['geometry_status'])

        print(f"❌ Geometry extraction failed after {duration:.2f}s")

        raise


def extract_geometry_for_elements(element_ids, file_path):
    """
    Extract geometry for specific elements.

    Args:
        element_ids: List of IFCEntity UUIDs
        file_path: Path to IFC file

    Returns:
        dict: Results with counts
    """
    if not element_ids:
        return {'processed': 0, 'succeeded': 0, 'failed': 0, 'errors': []}

    # Get model from first entity
    first_entity = IFCEntity.objects.get(id=element_ids[0])
    model_id = first_entity.model.id

    # Call main extraction function
    return extract_geometry_for_model(
        model_id=model_id,
        file_path=file_path,
        element_ids=element_ids
    )


def retry_failed_geometry(model_id, file_path=None):
    """
    Retry geometry extraction for elements that previously failed.

    Args:
        model_id: UUID of the Model instance
        file_path: Path to IFC file (required if not already loaded)

    Returns:
        dict: Results with counts
    """
    from apps.models.models import Model

    model = Model.objects.get(id=model_id)

    # Get all entities with failed geometry
    failed_entities = IFCEntity.objects.filter(
        model=model,
        geometry_status='failed'
    )

    failed_count = failed_entities.count()
    if failed_count == 0:
        print("No failed elements to retry")
        return {'processed': 0, 'succeeded': 0, 'failed': 0, 'errors': []}

    print(f"🔁 Retrying geometry extraction for {failed_count} failed elements...")

    # Reset status to pending
    failed_entities.update(geometry_status='pending')

    # Extract geometry
    return extract_geometry_for_model(
        model_id=model_id,
        file_path=file_path,
        element_ids=list(failed_entities.values_list('id', flat=True))
    )
