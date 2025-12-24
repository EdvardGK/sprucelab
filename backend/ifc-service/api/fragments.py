"""
Fragment Generation API Endpoints.

Converts IFC files to ThatOpen Fragments format for 10-100x faster viewer loading.
"""

import asyncio
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from config import settings


router = APIRouter(prefix="/fragments", tags=["fragments"])


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
            raise Exception(f"Conversion failed: {result.stderr}")

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

        # Parse element count from script output (JSON line at end)
        element_count = 0
        for line in result.stdout.split('\n'):
            if line.startswith('{') and '"success":true' in line:
                import json
                data = json.loads(line)
                element_count = data.get('elementCount', 0)
                break

        return FragmentResult(
            model_id=model_id,
            fragments_url=fragments_url,
            size_mb=round(frag_size_mb, 2),
            element_count=element_count
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
    # Read file
    with open(file_path, "rb") as f:
        file_data = f.read()

    # Supabase Storage URL
    # Format: https://{project}.supabase.co/storage/v1/object/{bucket}/{path}
    supabase_url = os.getenv("SUPABASE_URL", "https://rtrgoqpsdmhhcmgietle.supabase.co")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY", "")

    bucket = "ifc-files"
    storage_path = f"models/{model_id}/model.frag"

    upload_url = f"{supabase_url}/storage/v1/object/{bucket}/{storage_path}"

    async with httpx.AsyncClient() as client:
        # Try to upload (upsert)
        response = await client.post(
            upload_url,
            content=file_data,
            headers={
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type": "application/octet-stream",
                "x-upsert": "true"
            },
            timeout=120.0
        )

        if response.status_code not in (200, 201):
            raise Exception(f"Supabase upload failed: {response.status_code} - {response.text}")

    # Return public URL
    public_url = f"{supabase_url}/storage/v1/object/public/{bucket}/{storage_path}"
    return public_url
