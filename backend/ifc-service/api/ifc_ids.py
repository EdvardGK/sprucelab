"""
FastAPI endpoints for IDS (Information Delivery Specification) operations.

POST /api/v1/ifc/ids/validate   - Run ifctester validation against IFC
POST /api/v1/ifc/ids/parse      - Parse .ids XML to structured specs
POST /api/v1/ifc/ids/generate   - Generate .ids XML from structured specs
"""
import logging
import tempfile
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException

from models.ids_schemas import (
    IDSValidateRequest,
    IDSValidateResponse,
    IDSParseRequest,
    IDSParseResponse,
    IDSGenerateRequest,
    IDSGenerateResponse,
)
from services.ids_service import IDSService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ifc/ids", tags=["IDS"])

ids_service = IDSService()


@router.post("/validate", response_model=IDSValidateResponse)
async def validate_ids(request: IDSValidateRequest):
    """
    Run IDS validation against an IFC file using ifctester.

    Provide either file_path (local) or file_url (remote).
    Returns validation results with per-specification pass/fail.
    """
    # Resolve IFC file path
    ifc_path = None

    if request.file_path:
        ifc_path = request.file_path
        if not Path(ifc_path).exists():
            raise HTTPException(404, f"IFC file not found: {ifc_path}")
    elif request.file_url:
        # Download file to temp location
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.get(request.file_url)
                resp.raise_for_status()
                with tempfile.NamedTemporaryFile(
                    suffix='.ifc', delete=False
                ) as f:
                    f.write(resp.content)
                    ifc_path = f.name
        except Exception as e:
            raise HTTPException(502, f"Failed to download IFC file: {e}")
    else:
        raise HTTPException(400, "Either file_path or file_url is required")

    # Run validation
    try:
        result = ids_service.validate(ifc_path, request.ids_xml)
        return IDSValidateResponse(**result)
    except ValueError as e:
        return IDSValidateResponse(status="failed", error=str(e))
    except Exception as e:
        logger.exception("IDS validation failed")
        return IDSValidateResponse(status="failed", error=str(e))


@router.post("/parse", response_model=IDSParseResponse)
async def parse_ids(request: IDSParseRequest):
    """
    Parse IDS XML into structured specification JSON.

    Takes raw IDS XML content and returns parsed specifications
    in the structured_specs format used by the frontend.
    """
    try:
        result = ids_service.parse_ids_xml(request.ids_xml)
        return IDSParseResponse(**result)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("IDS parsing failed")
        raise HTTPException(500, f"Failed to parse IDS: {e}")


@router.post("/generate", response_model=IDSGenerateResponse)
async def generate_ids(request: IDSGenerateRequest):
    """
    Generate IDS XML from structured specifications.

    Takes structured_specs JSON and returns valid IDS XML string.
    """
    try:
        xml = ids_service.generate_xml(
            request.structured_specs,
            title=request.title,
            author=request.author,
        )
        return IDSGenerateResponse(
            ids_xml=xml,
            specification_count=len(request.structured_specs),
        )
    except Exception as e:
        logger.exception("IDS generation failed")
        raise HTTPException(500, f"Failed to generate IDS XML: {e}")
