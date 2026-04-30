"""
Document extraction endpoint (Phase 6, Sprint 6.1).

Stateless: extract content from a PDF/DOCX/XLSX/PPTX and return JSON.
Persistence is Django's job — the FastAPI service does no DB writes here
(mirrors the Phase 5 drawing extractor pattern).
"""
from __future__ import annotations

import os
import tempfile
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException

from core.auth import verify_api_key
from models.schemas import (
    DocumentContentPayload,
    DocumentExtractRequest,
    DocumentExtractResponse,
)
from services.document_extractor import extract_document

router = APIRouter(prefix="/documents", tags=["documents"])


_SUPPORTED_FORMATS = ("pdf", "docx", "xlsx", "pptx")


async def _resolve_file_path(req: DocumentExtractRequest) -> tuple[str, Optional[str]]:
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
        temp_dir = tempfile.mkdtemp(prefix=f"document_{ext}_")
        local_path = os.path.join(temp_dir, f"document.{ext}")
        async with httpx.AsyncClient() as client:
            response = await client.get(req.file_url, timeout=300.0)
            response.raise_for_status()
            with open(local_path, "wb") as f:
                f.write(response.content)
        return (local_path, temp_dir)

    raise HTTPException(status_code=400, detail="Either file_url or file_path is required")


@router.post("/extract", response_model=DocumentExtractResponse)
async def extract_document_endpoint(
    request: DocumentExtractRequest,
    auth: bool = Depends(verify_api_key),
) -> DocumentExtractResponse:
    """
    Extract document content from a PDF/DOCX/XLSX/PPTX file.

    Synchronous: Document extraction is fast (a 10-page PDF is ~50ms via
    pymupdf), so a callback is not needed — Django can persist directly
    from the response.
    """
    fmt = request.format.lower()
    if fmt not in _SUPPORTED_FORMATS:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {fmt}")

    file_path, temp_dir = await _resolve_file_path(request)

    try:
        result = extract_document(file_path, fmt)
    finally:
        if temp_dir and os.path.exists(temp_dir):
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)

    return DocumentExtractResponse(
        success=result.success,
        format=result.format,
        documents=[
            DocumentContentPayload(
                page_index=d.page_index,
                markdown_content=d.markdown_content,
                structured_data=d.structured_data,
                page_count=d.page_count,
                structure=d.structure,
                extracted_images=d.extracted_images,
                search_text=d.search_text,
                extraction_method=d.extraction_method,
                is_document=d.is_document,
            )
            for d in result.documents
        ],
        log_entries=result.log_entries,
        quality_report=result.quality_report,
        duration_seconds=result.duration_seconds,
        error=result.error,
    )
