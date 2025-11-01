"""
Fragment Storage Service

Converts IFC models to ThatOpen Fragments format and stores them in Supabase.
Fragments load 10-100x faster than raw IFC files.

Architecture:
1. IFC file → Node.js script (@thatopen/components) → Fragments file
2. Upload Fragments to Supabase Storage
3. Frontend loads Fragments directly (fast path)

Usage:
    from apps.models.services.fragments import generate_fragments_for_model

    result = generate_fragments_for_model(model_id='abc-123')
    # Returns: {'fragments_url': '...', 'size_mb': 12.5}
"""
import os
import subprocess
import tempfile
from pathlib import Path
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils import timezone
from apps.models.models import Model


def generate_fragments_for_model(model_id: str) -> dict:
    """
    Generate ThatOpen Fragments file for an IFC model.

    This function:
    1. Downloads IFC file from Supabase Storage
    2. Runs Node.js script to convert IFC → Fragments
    3. Uploads Fragments file to Supabase Storage
    4. Updates Model with fragments_url

    Args:
        model_id: UUID of the Model

    Returns:
        dict: {
            'fragments_url': URL to fragments file,
            'size_mb': File size in MB,
            'element_count': Number of elements
        }

    Raises:
        ValueError: If model not found or has no IFC file
        subprocess.CalledProcessError: If conversion fails
    """
    try:
        model = Model.objects.get(id=model_id)
    except Model.DoesNotExist:
        raise ValueError(f"Model {model_id} not found")

    if not model.file_url:
        raise ValueError(f"Model {model_id} has no IFC file")

    print(f"🔧 Generating Fragments for model: {model.name}")

    # Get IFC file path from Supabase Storage
    # file_url format: https://xxx.supabase.co/storage/v1/object/public/ifc-files/models/abc-123/model.ifc
    # We need to download it or get the local path
    ifc_file_path = _get_ifc_file_path(model)

    # Create temp output directory
    with tempfile.TemporaryDirectory() as temp_dir:
        output_path = os.path.join(temp_dir, 'model.frag')

        # Get path to Node.js conversion script
        script_path = _get_conversion_script_path()

        print(f"  📂 IFC file: {ifc_file_path}")
        print(f"  🔧 Running conversion script: {script_path}")

        # Run Node.js conversion script
        try:
            result = subprocess.run(
                [
                    'node',
                    str(script_path),
                    ifc_file_path,
                    output_path
                ],
                capture_output=True,
                text=True,
                check=True,
                timeout=300  # 5 minutes max
            )

            print(result.stdout)

        except subprocess.TimeoutExpired:
            raise Exception(f"Fragment conversion timed out after 5 minutes")
        except subprocess.CalledProcessError as e:
            print(f"  ❌ Conversion failed:")
            print(f"  STDOUT: {e.stdout}")
            print(f"  STDERR: {e.stderr}")
            raise Exception(f"Fragment conversion failed: {e.stderr}")

        # Check if output file was created
        if not os.path.exists(output_path):
            raise Exception("Fragment file was not generated")

        # Read Fragments file
        with open(output_path, 'rb') as f:
            fragments_data = f.read()

        # Upload to Supabase Storage
        storage_path = f'models/{model_id}/model.frag'

        # Delete existing fragments file if any
        if model.fragments_url:
            try:
                old_path = _extract_storage_path(model.fragments_url)
                default_storage.delete(old_path)
            except Exception as e:
                print(f"  ⚠️  Failed to delete old fragments: {e}")

        # Save new fragments file
        storage_url = default_storage.save(storage_path, ContentFile(fragments_data))
        full_url = default_storage.url(storage_url)

        # Calculate size
        size_mb = len(fragments_data) / (1024 * 1024)

        # Update model
        model.fragments_url = full_url
        model.fragments_size_mb = size_mb
        model.fragments_generated_at = timezone.now()
        model.save(update_fields=['fragments_url', 'fragments_size_mb', 'fragments_generated_at'])

        print(f"  ✅ Fragments saved: {size_mb:.2f} MB")
        print(f"  🔗 URL: {full_url}")

        return {
            'fragments_url': full_url,
            'size_mb': size_mb,
            'element_count': model.element_count
        }


def _get_ifc_file_path(model: Model) -> str:
    """
    Get local file path for IFC file.

    If using Supabase Storage, this might need to download the file first.
    For now, assumes file is accessible locally.
    """
    if not model.file_url:
        raise ValueError("Model has no file_url")

    # If file_url is a Supabase URL, we need to download it or use local path
    # For development, assume files are in MEDIA_ROOT
    # TODO: Handle Supabase file download if needed

    # Extract path from URL
    # Example URL: http://localhost:8000/media/models/abc-123/model.ifc
    # or: https://xxx.supabase.co/storage/v1/object/public/ifc-files/models/abc-123/model.ifc

    if 'supabase' in model.file_url:
        # Download from Supabase
        import requests
        response = requests.get(model.file_url)
        response.raise_for_status()

        # Save to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.ifc') as temp_file:
            temp_file.write(response.content)
            return temp_file.name
    else:
        # Local file - extract path from URL
        # Remove /media/ prefix and get actual file path
        from django.conf import settings
        relative_path = model.file_url.replace('/media/', '')
        local_path = os.path.join(settings.MEDIA_ROOT, relative_path)

        if not os.path.exists(local_path):
            raise FileNotFoundError(f"IFC file not found at: {local_path}")

        return local_path


def _get_conversion_script_path() -> Path:
    """
    Get path to Node.js conversion script.

    Script location: frontend/scripts/convert-to-fragments.mjs
    """
    # Get project root (backend/apps/models/services/fragments.py → project root)
    current_file = Path(__file__)  # .../backend/apps/models/services/fragments.py
    backend_dir = current_file.parent.parent.parent.parent  # .../backend
    project_root = backend_dir.parent  # project root
    script_path = project_root / 'frontend' / 'scripts' / 'convert-to-fragments.mjs'

    if not script_path.exists():
        raise FileNotFoundError(
            f"Conversion script not found at: {script_path}\n"
            f"Please create frontend/scripts/convert-to-fragments.mjs"
        )

    return script_path


def _extract_storage_path(url: str) -> str:
    """
    Extract storage path from full URL.

    Example:
        Input:  http://localhost:8000/media/models/abc-123/model.frag
        Output: models/abc-123/model.frag
    """
    if '/media/' in url:
        return url.split('/media/')[-1]
    elif '/storage/v1/object/public/' in url:
        # Supabase URL
        return url.split('/storage/v1/object/public/')[-1].split('/', 1)[-1]
    else:
        # Fallback: return as-is
        return url


def delete_fragments_for_model(model_id: str) -> bool:
    """
    Delete Fragments file for a model.

    Args:
        model_id: UUID of the Model

    Returns:
        bool: True if deleted, False if no fragments existed
    """
    try:
        model = Model.objects.get(id=model_id)
    except Model.DoesNotExist:
        raise ValueError(f"Model {model_id} not found")

    if not model.fragments_url:
        return False

    try:
        storage_path = _extract_storage_path(model.fragments_url)
        default_storage.delete(storage_path)

        model.fragments_url = None
        model.fragments_size_mb = None
        model.fragments_generated_at = None
        model.save(update_fields=['fragments_url', 'fragments_size_mb', 'fragments_generated_at'])

        print(f"✅ Deleted fragments for model: {model.name}")
        return True

    except Exception as e:
        print(f"❌ Failed to delete fragments: {e}")
        raise
