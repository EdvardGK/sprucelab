"""
Drawing extraction endpoint (Phase 5).

Stateless: extract sheet metadata from a DWG/DXF/PDF and return JSON.
Persistence is Django's job — the FastAPI service does no DB writes here.
"""
from __future__ import annotations

import os
import tempfile
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException

from core.auth import verify_api_key
from models.schemas import (
    DrawingExtractRequest,
    DrawingExtractResponse,
    DrawingSheetPayload,
)
from services.drawing_extractor import extract_drawing

router = APIRouter(prefix="/drawings", tags=["drawings"])


async def _resolve_file_path(req: DrawingExtractRequest) -> tuple[str, Optional[str]]:
    """
    Resolve the request to a local file path. Returns (path, temp_dir).

    `temp_dir` is set when the file was downloaded; the caller cleans it up.
    """
    if req.file_path:
        if not os.path.exists(req.file_path):
            raise HTTPException(status_code=400, detail=f"file_path not found: {req.file_path}")
        return (req.file_path, None)

    if req.file_url:
        ext = req.format.lower()
        temp_dir = tempfile.mkdtemp(prefix=f"drawing_{ext}_")
        local_path = os.path.join(temp_dir, f"sheet.{ext}")
        async with httpx.AsyncClient() as client:
            response = await client.get(req.file_url, timeout=300.0)
            response.raise_for_status()
            with open(local_path, "wb") as f:
                f.write(response.content)
        return (local_path, temp_dir)

    raise HTTPException(status_code=400, detail="Either file_url or file_path is required")


@router.post("/extract", response_model=DrawingExtractResponse)
async def extract_drawing_endpoint(
    request: DrawingExtractRequest,
    auth: bool = Depends(verify_api_key),
) -> DrawingExtractResponse:
    """
    Extract sheet metadata from a drawing file.

    Synchronous: returns the extraction result inline. Drawings extract fast
    (a single PDF page is ~10ms with pymupdf), so a callback is not needed
    — Django can persist directly from the response.
    """
    fmt = request.format.lower()
    if fmt not in ("dxf", "dwg", "pdf"):
        raise HTTPException(status_code=400, detail=f"Unsupported format: {fmt}")

    file_path, temp_dir = await _resolve_file_path(request)

    try:
        result = extract_drawing(file_path, fmt)
    finally:
        if temp_dir and os.path.exists(temp_dir):
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)

    return DrawingExtractResponse(
        success=result.success,
        format=result.format,
        sheets=[
            DrawingSheetPayload(
                page_index=s.page_index,
                sheet_number=s.sheet_number,
                sheet_name=s.sheet_name,
                width_mm=s.width_mm,
                height_mm=s.height_mm,
                scale=s.scale,
                is_drawing=s.is_drawing,
                title_block_data=s.title_block_data,
                raw_metadata=s.raw_metadata,
            )
            for s in result.sheets
        ],
        log_entries=result.log_entries,
        quality_report=result.quality_report,
        duration_seconds=result.duration_seconds,
        error=result.error,
    )
