"""
IFC Processing Endpoint - Process IFC files and write to database.

This endpoint is called by Django to process uploaded IFC files.
Replaces Celery - Django calls this directly after upload.

Two-phase approach:
1. Quick stats returned immediately (<1 second)
2. Full processing continues in background
3. Callback to Django when complete
"""

import os
import asyncio
import tempfile
import shutil
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import Optional

import httpx

from models.schemas import ProcessRequest, ProcessResponse, QuickStatsResponse
from services.processing_orchestrator import processing_orchestrator
from services.ifc_parser import ifc_parser
from core.auth import verify_api_key
from config import settings

router = APIRouter(prefix="/ifc", tags=["ifc-processing"])


# Track background processing status
_processing_status: dict = {}


async def _download_ifc_file(url: str, model_id: str) -> str:
    """
    Download IFC file from URL to temp directory.

    Returns local file path. Caller must clean up temp directory.
    """
    temp_dir = tempfile.mkdtemp(prefix=f"ifc_{model_id}_", dir=settings.TEMP_DIR)
    ifc_path = os.path.join(temp_dir, "model.ifc")

    print(f"Downloading IFC from {url}")
    async with httpx.AsyncClient() as client:
        response = await client.get(url, timeout=300.0)
        response.raise_for_status()

        with open(ifc_path, "wb") as f:
            f.write(response.content)

    file_size_mb = os.path.getsize(ifc_path) / (1024 * 1024)
    print(f"Downloaded: {file_size_mb:.1f} MB to {ifc_path}")

    return ifc_path


@router.post("/process", response_model=QuickStatsResponse)
async def process_ifc_file(
    request: ProcessRequest,
    background_tasks: BackgroundTasks,
    auth: bool = Depends(verify_api_key),
) -> QuickStatsResponse:
    """
    Process an IFC file - returns quick stats immediately, full processing in background.

    Two-phase approach for fast UX:
    1. IMMEDIATE (<1s): Returns quick stats (floors, element counts, top types)
    2. BACKGROUND: Full metadata extraction + database writes
    3. CALLBACK: Notifies Django when complete

    Args:
        request: ProcessRequest with model_id and file_url (or file_path for local dev)

    Returns:
        QuickStatsResponse with immediate stats
    """
    # Get file path - download from URL if provided, otherwise use local path
    file_path = None
    temp_dir = None

    if request.file_url:
        # Download from URL (cloud storage / Supabase)
        try:
            file_path = await _download_ifc_file(request.file_url, request.model_id)
            temp_dir = os.path.dirname(file_path)
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to download IFC file: {str(e)}"
            )
    elif request.file_path:
        # Local file path (development)
        if not os.path.exists(request.file_path):
            raise HTTPException(
                status_code=400,
                detail=f"IFC file not found: {request.file_path}"
            )
        file_path = request.file_path
    else:
        raise HTTPException(
            status_code=400,
            detail="Either file_url or file_path must be provided"
        )

    # Validate file extension
    if not file_path.lower().endswith('.ifc'):
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Expected .ifc file"
        )

    # Phase 1: Extract quick stats (fast, synchronous)
    quick_stats = ifc_parser.quick_stats(file_path)

    if not quick_stats.success:
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to extract quick stats: {quick_stats.error}"
        )

    # Build callback URL
    callback_url = request.django_callback_url or f"{settings.DJANGO_URL}/api/models/{request.model_id}/process-complete/"

    # Phase 2: Schedule full processing in background
    _processing_status[request.model_id] = {
        "status": "processing",
        "quick_stats": quick_stats,
        "result": None,
        "error": None,
    }

    background_tasks.add_task(
        _process_full,
        request.model_id,
        file_path,
        request.skip_geometry,
        callback_url,
        temp_dir,  # Pass temp_dir for cleanup
    )

    # Return quick stats immediately
    return QuickStatsResponse(
        success=quick_stats.success,
        ifc_schema=quick_stats.ifc_schema,
        file_size_bytes=quick_stats.file_size_bytes,
        total_elements=quick_stats.total_elements,
        storey_count=quick_stats.storey_count,
        type_count=quick_stats.type_count,
        material_count=quick_stats.material_count,
        top_entity_types=quick_stats.top_entity_types,
        storey_names=quick_stats.storey_names,
        duration_ms=quick_stats.duration_ms,
        error=quick_stats.error,
    )


async def _process_full(
    model_id: str,
    file_path: str,
    skip_geometry: bool,
    callback_url: str,
    temp_dir: Optional[str] = None,
):
    """
    Background task for full processing.

    After processing completes, calls back to Django with results.
    Cleans up temp directory if one was created.
    """
    result = None
    error_msg = None

    try:
        print(f"[Background] Starting full processing for {model_id}")
        result = await processing_orchestrator.process_model(
            model_id=model_id,
            file_path=file_path,
            skip_geometry=skip_geometry,
        )

        _processing_status[model_id] = {
            "status": "completed" if result.success else "error",
            "result": result,
            "error": result.error,
        }
        print(f"[Background] Completed processing for {model_id}: {result.status}")

    except Exception as e:
        error_msg = str(e)
        print(f"[Background] Failed processing for {model_id}: {e}")
        _processing_status[model_id] = {
            "status": "error",
            "result": None,
            "error": error_msg,
        }

    finally:
        # Cleanup temp directory
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
            print(f"[Background] Cleaned up temp dir: {temp_dir}")

    # Call back to Django with results
    try:
        callback_data = {
            "model_id": model_id,
            "success": result.success if result else False,
            "status": result.status if result else "error",
            "element_count": result.element_count if result else 0,
            "storey_count": result.storey_count if result else 0,
            "system_count": result.system_count if result else 0,
            "property_count": result.property_count if result else 0,
            "material_count": result.material_count if result else 0,
            "type_count": result.type_count if result else 0,
            "ifc_schema": result.ifc_schema if result else None,
            "processing_report_id": result.processing_report_id if result else None,
            "duration_seconds": result.duration_seconds if result else 0,
            "error": error_msg or (result.error if result else None),
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                callback_url,
                json=callback_data,
                headers={"X-API-Key": settings.IFC_SERVICE_API_KEY},
                timeout=30.0,
            )
            if response.status_code != 200:
                print(f"[Background] Django callback failed: {response.status_code} - {response.text}")
            else:
                print(f"[Background] Django callback successful for {model_id}")

    except Exception as e:
        print(f"[Background] Failed to call Django callback: {e}")


@router.get("/process/status/{model_id}")
async def get_processing_status(
    model_id: str,
    auth: bool = Depends(verify_api_key),
):
    """
    Get the status of background processing for a model.

    Returns:
        - status: 'processing', 'completed', 'error'
        - result: Full ProcessResponse if completed
        - error: Error message if failed
    """
    if model_id not in _processing_status:
        raise HTTPException(
            status_code=404,
            detail=f"No processing found for model {model_id}"
        )

    status_info = _processing_status[model_id]

    if status_info["status"] == "completed" and status_info["result"]:
        result = status_info["result"]
        return {
            "status": "completed",
            "result": ProcessResponse(
                success=result.success,
                model_id=result.model_id,
                status=result.status,
                element_count=result.element_count,
                storey_count=result.storey_count,
                system_count=result.system_count,
                property_count=result.property_count,
                material_count=result.material_count,
                type_count=result.type_count,
                ifc_schema=result.ifc_schema,
                processing_report_id=result.processing_report_id,
                duration_seconds=result.duration_seconds,
                error=result.error,
                stage_results=result.stage_results,
                errors=result.errors,
            ),
        }

    return {
        "status": status_info["status"],
        "error": status_info.get("error"),
    }


async def _get_file_path(request: ProcessRequest) -> tuple[str, Optional[str]]:
    """
    Get local file path from request, downloading if URL provided.

    Returns:
        (file_path, temp_dir) - temp_dir is set if file was downloaded
    """
    if request.file_url:
        file_path = await _download_ifc_file(request.file_url, request.model_id)
        temp_dir = os.path.dirname(file_path)
        return file_path, temp_dir
    elif request.file_path:
        if not os.path.exists(request.file_path):
            raise HTTPException(
                status_code=400,
                detail=f"IFC file not found: {request.file_path}"
            )
        return request.file_path, None
    else:
        raise HTTPException(
            status_code=400,
            detail="Either file_url or file_path must be provided"
        )


@router.post("/process-sync", response_model=ProcessResponse)
async def process_ifc_file_sync(
    request: ProcessRequest,
    auth: bool = Depends(verify_api_key),
) -> ProcessResponse:
    """
    Process an IFC file synchronously (waits for completion).

    Use this for smaller files or when you need the full result immediately.
    For larger files, use /process which returns quick stats and processes
    in background.

    Args:
        request: ProcessRequest with model_id and file_url or file_path

    Returns:
        ProcessResponse with full counts and status
    """
    temp_dir = None
    try:
        file_path, temp_dir = await _get_file_path(request)

        # Validate file extension
        if not file_path.lower().endswith('.ifc'):
            raise HTTPException(
                status_code=400,
                detail="Invalid file type. Expected .ifc file"
            )

        # Process the file (blocking)
        result = await processing_orchestrator.process_model(
            model_id=request.model_id,
            file_path=file_path,
            skip_geometry=request.skip_geometry,
        )

        return ProcessResponse(
            success=result.success,
            model_id=result.model_id,
            status=result.status,
            element_count=result.element_count,
            storey_count=result.storey_count,
            system_count=result.system_count,
            property_count=result.property_count,
            material_count=result.material_count,
            type_count=result.type_count,
            ifc_schema=result.ifc_schema,
            processing_report_id=result.processing_report_id,
            duration_seconds=result.duration_seconds,
            error=result.error,
            stage_results=result.stage_results,
            errors=result.errors,
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"[process_ifc_file_sync] Error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Processing failed: {str(e)}"
        )
    finally:
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


@router.post("/reprocess", response_model=ProcessResponse)
async def reprocess_ifc_file(
    request: ProcessRequest,
    auth: bool = Depends(verify_api_key),
) -> ProcessResponse:
    """
    Reprocess an IFC file (delete existing data and re-parse).

    Same as /process-sync but first deletes existing data for the model.
    Use this when the IFC file has been updated or when you need
    to fix corrupted data.

    This runs synchronously to ensure clean state.
    """
    from repositories.ifc_repository import ifc_repository

    # Delete existing data first
    try:
        deleted = await ifc_repository.delete_model_data(request.model_id)
        print(f"[reprocess] Deleted existing data: {deleted}")
    except Exception as e:
        print(f"[reprocess] Warning: Could not delete existing data: {e}")

    # Process the file (sync)
    return await process_ifc_file_sync(request, auth)
