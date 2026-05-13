"""
Fragment Generation API Endpoints.

Converts IFC files to ThatOpen Fragments format for 10-100x faster viewer loading.
"""

import asyncio
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from config import settings


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/fragments", tags=["fragments"])


# Subprocess returncodes that indicate the process was SIGKILL'd.
# -9 is the canonical POSIX value when `subprocess.run` itself reaps the child.
# 137 (128 + 9) appears when a shell layer is between us and the killed process
# (e.g. some container orchestrators surface OOM-kills this way).
_SIGKILL_RETURNCODES = (-9, 137)


def _classify_subprocess_failure(
    result: subprocess.CompletedProcess,
    model_id: str,
    file_size_mb: Optional[float],
) -> Exception:
    """Map a non-zero `subprocess.run` result to a structured log + Exception.

    Pulled out as a pure helper so the OOM-vs-generic branching is unit-testable
    without spinning up the full async pipeline. The caller is responsible for
    raising the returned Exception.
    """
    if result.returncode in _SIGKILL_RETURNCODES:
        logger.error(
            "fragments_oom",
            extra={
                "event": "fragments_oom",
                "model_id": model_id,
                "file_size_mb": file_size_mb,
                "returncode": result.returncode,
            },
        )
        return Exception(
            "OOM (SIGKILL during conversion) — file likely too large for "
            "Railway memory limit"
        )

    stderr = result.stderr or ""
    stderr_tail = stderr[-500:] if stderr else ""
    logger.error(
        "fragments_failed",
        extra={
            "event": "fragments_failed",
            "model_id": model_id,
            "returncode": result.returncode,
            "stderr_tail": stderr_tail,
        },
    )
    return Exception(
        f"Conversion failed (exit {result.returncode}): "
        f"{stderr or '<no stderr>'}"
    )


class FragmentRequest(BaseModel):
    """Request to generate fragments for an IFC model."""
    model_id: str
    ifc_url: str
    django_callback_url: Optional[str] = None


class FragmentResponse(BaseModel):
    """Response from fragment generation."""
    status: str
    model_id: str
    message: Optional[str] = None


class FragmentResult(BaseModel):
    """Result of fragment generation (sent to Django callback)."""
    model_id: str
    fragments_url: Optional[str] = None
    size_mb: Optional[float] = None
    element_count: Optional[int] = None
    fragments_format_version: Optional[str] = None
    thumbnail_url: Optional[str] = None
    error: Optional[str] = None


class ThumbnailOnlyResult(BaseModel):
    """Result of a thumbnail-only generation pass (used by the backfill)."""
    model_id: str
    thumbnail_url: Optional[str] = None
    error: Optional[str] = None


# Path to conversion script
SCRIPT_PATH = Path(__file__).parent.parent / "scripts" / "convert-to-fragments.mjs"


@router.post("/generate", response_model=FragmentResponse)
async def generate_fragments(request: FragmentRequest, background_tasks: BackgroundTasks):
    """
    Generate ThatOpen Fragments from IFC file.

    This endpoint queues fragment generation as a background task and returns immediately.
    When generation completes, it calls back to Django to update the model.

    Args:
        request: Contains model_id, ifc_url, and optional callback URL

    Returns:
        Status indicating generation has started
    """
    if not SCRIPT_PATH.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Conversion script not found at {SCRIPT_PATH}"
        )

    # Queue background task
    background_tasks.add_task(
        generate_fragments_background,
        request.model_id,
        request.ifc_url,
        request.django_callback_url or f"{settings.DJANGO_URL}/api/models/{request.model_id}/fragments-complete/"
    )

    return FragmentResponse(
        status="generating",
        model_id=request.model_id,
        message="Fragment generation started"
    )


@router.post("/generate-sync", response_model=FragmentResult)
async def generate_fragments_sync(request: FragmentRequest):
    """
    Generate fragments synchronously (waits for completion).

    Use this for testing or when you need to wait for the result.
    For production uploads, use /generate which runs in background.
    """
    if not SCRIPT_PATH.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Conversion script not found at {SCRIPT_PATH}"
        )

    result = await _generate_fragments(request.model_id, request.ifc_url)
    return result


@router.post("/thumbnail-only", response_model=ThumbnailOnlyResult)
async def generate_thumbnail_only(request: FragmentRequest):
    """Generate just the thumbnail PNG, skipping the fragments build.

    Used by the ``backfill_thumbnails`` Django management command to
    populate ``Model.thumbnail_url`` for models that pre-date the
    snapshot pipeline. Synchronous: caller waits for the URL and
    writes it back immediately.
    """
    result = await _generate_thumbnail_only(request.model_id, request.ifc_url)
    return result


async def _generate_thumbnail_only(model_id: str, ifc_url: str) -> ThumbnailOnlyResult:
    """Core thumbnail-only logic. Downloads IFC, renders PNG, uploads."""
    import asyncio as _asyncio
    from services.thumbnail_service import generate_thumbnail_png

    temp_dir = None
    try:
        temp_dir = tempfile.mkdtemp(prefix="thumbnail_", dir=settings.TEMP_DIR)
        ifc_path = os.path.join(temp_dir, "model.ifc")

        async with httpx.AsyncClient() as client:
            response = await client.get(ifc_url, timeout=300.0)
            response.raise_for_status()
            with open(ifc_path, "wb") as f:
                f.write(response.content)

        png_bytes = await _asyncio.get_event_loop().run_in_executor(
            None,
            lambda: generate_thumbnail_png(ifc_path),
        )

        storage_key = f"models/{model_id}/thumbnail.png"
        thumbnail_url = await _upload_bytes_to_supabase(
            storage_key=storage_key,
            data=png_bytes,
            content_type="image/png",
        )

        logger.info(
            "thumbnail_backfilled model_id=%s url=%s size_bytes=%d",
            model_id,
            thumbnail_url,
            len(png_bytes),
        )
        return ThumbnailOnlyResult(model_id=model_id, thumbnail_url=thumbnail_url)

    except Exception as exc:
        import traceback as _tb
        logger.error(
            "thumbnail_backfill_failed model_id=%s error=%s\n%s",
            model_id,
            exc,
            _tb.format_exc(),
        )
        return ThumbnailOnlyResult(model_id=model_id, error=str(exc))

    finally:
        if temp_dir and os.path.exists(temp_dir):
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)


async def generate_fragments_background(model_id: str, ifc_url: str, callback_url: str):
    """
    Background task for fragment generation.

    1. Downloads IFC from ifc_url
    2. Runs Node.js conversion script
    3. Uploads .frag to Supabase Storage
    4. Calls back to Django with result
    """
    result = await _generate_fragments(model_id, ifc_url)

    # Call back to Django
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                callback_url,
                json=result.model_dump(),
                headers={"X-API-Key": settings.IFC_SERVICE_API_KEY},
                timeout=30.0
            )
            if response.status_code != 200:
                print(f"Warning: Django callback failed with status {response.status_code}")
    except Exception as e:
        print(f"Error calling Django callback: {e}")


async def _generate_fragments(model_id: str, ifc_url: str) -> FragmentResult:
    """
    Core fragment generation logic.

    Downloads IFC, converts to fragments, uploads to storage.
    """
    temp_dir = None

    try:
        # Create temp directory for this conversion
        temp_dir = tempfile.mkdtemp(prefix="fragments_", dir=settings.TEMP_DIR)
        ifc_path = os.path.join(temp_dir, "model.ifc")
        frag_path = os.path.join(temp_dir, "model.frag")

        print(f"Generating fragments for model {model_id}")
        print(f"  IFC URL: {ifc_url}")

        # 1. Download IFC file
        print("  Downloading IFC file...")
        async with httpx.AsyncClient() as client:
            response = await client.get(ifc_url, timeout=300.0)
            response.raise_for_status()

            with open(ifc_path, "wb") as f:
                f.write(response.content)

        file_size_mb = os.path.getsize(ifc_path) / (1024 * 1024)
        print(f"  Downloaded: {file_size_mb:.1f} MB")

        # 2. Run Node.js conversion script
        print("  Running conversion script...")
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: subprocess.run(
                ["node", str(SCRIPT_PATH), ifc_path, frag_path],
                capture_output=True,
                text=True,
                timeout=600,  # 10 minutes max
                env={**os.environ, "NODE_OPTIONS": "--max-old-space-size=4096"}
            )
        )

        if result.returncode != 0:
            raise _classify_subprocess_failure(result, model_id, file_size_mb)

        print(result.stdout)

        # Check output file exists
        if not os.path.exists(frag_path):
            raise Exception("Fragment file was not generated")

        frag_size_mb = os.path.getsize(frag_path) / (1024 * 1024)
        print(f"  Fragment size: {frag_size_mb:.2f} MB")

        # 3. Upload to Supabase Storage
        print("  Uploading to storage...")
        fragments_url = await _upload_to_supabase(model_id, frag_path)

        print(f"  Uploaded: {fragments_url}")

        # Parse converter stdout — JSON result line at end. The v3 converter
        # (IfcImporter-based) emits `fragments_format_version: 'v3'` and no
        # longer reports element_count (FragmentsModels enumerates items
        # via the worker on first load).
        element_count = 0
        format_version = 'v2'  # legacy default if a stale converter emits no version
        for line in result.stdout.split('\n'):
            if line.startswith('{') and '"success":true' in line:
                import json
                data = json.loads(line)
                element_count = data.get('elementCount', 0)
                format_version = data.get('fragments_format_version', 'v2')
                break

        # 4. Generate thumbnail (best-effort — failure must NOT abort fragments)
        thumbnail_url: Optional[str] = None
        try:
            print("  Generating thumbnail...")
            import asyncio as _asyncio
            from services.thumbnail_service import generate_thumbnail_png

            png_bytes = await _asyncio.get_event_loop().run_in_executor(
                None,
                lambda: generate_thumbnail_png(ifc_path),
            )
            thumbnail_storage_key = f"models/{model_id}/thumbnail.png"
            thumbnail_url = await _upload_bytes_to_supabase(
                storage_key=thumbnail_storage_key,
                data=png_bytes,
                content_type="image/png",
            )
            print(f"  Thumbnail uploaded: {thumbnail_url}")
            logger.info(
                "thumbnail_uploaded model_id=%s url=%s size_bytes=%d",
                model_id,
                thumbnail_url,
                len(png_bytes),
            )
        except Exception as thumb_exc:
            import traceback as _tb
            logger.error(
                "thumbnail_failed model_id=%s error=%s\n%s",
                model_id,
                thumb_exc,
                _tb.format_exc(),
            )
            print(f"  Warning: thumbnail generation failed (fragments still OK): {thumb_exc}")

        return FragmentResult(
            model_id=model_id,
            fragments_url=fragments_url,
            size_mb=round(frag_size_mb, 2),
            element_count=element_count,
            fragments_format_version=format_version,
            thumbnail_url=thumbnail_url,
        )

    except Exception as e:
        print(f"Fragment generation failed: {e}")
        return FragmentResult(
            model_id=model_id,
            error=str(e)
        )

    finally:
        # Cleanup temp files
        if temp_dir and os.path.exists(temp_dir):
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)


async def _upload_to_supabase(model_id: str, file_path: str) -> str:
    """
    Upload fragment file to Supabase Storage.

    Returns the public URL of the uploaded file.
    """
    storage_key = f"models/{model_id}/model.frag"
    return await _upload_bytes_to_supabase(
        storage_key=storage_key,
        data=open(file_path, "rb").read(),
        content_type="application/octet-stream",
    )


async def _upload_bytes_to_supabase(
    storage_key: str,
    data: bytes,
    content_type: str = "application/octet-stream",
) -> str:
    """
    Upload arbitrary bytes to Supabase Storage under *storage_key*.

    Args:
        storage_key: Path inside the bucket, e.g. ``models/<id>/thumbnail.png``.
        data:         Raw bytes to upload.
        content_type: MIME type (default ``application/octet-stream``).

    Returns:
        Public URL of the uploaded object.
    """
    # Supabase Storage URL
    # Format: https://{project}.supabase.co/storage/v1/object/{bucket}/{path}
    supabase_url = os.getenv("SUPABASE_URL", "https://rtrgoqpsdmhhcmgietle.supabase.co")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY", "")

    bucket = "ifc-files"

    upload_url = f"{supabase_url}/storage/v1/object/{bucket}/{storage_key}"

    async with httpx.AsyncClient() as client:
        # Upsert so re-generation overwrites the previous thumbnail
        response = await client.post(
            upload_url,
            content=data,
            headers={
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type": content_type,
                "x-upsert": "true",
            },
            timeout=120.0,
        )

        if response.status_code not in (200, 201):
            raise Exception(f"Supabase upload failed: {response.status_code} - {response.text}")

    # Return public URL
    public_url = f"{supabase_url}/storage/v1/object/public/{bucket}/{storage_key}"
    return public_url
