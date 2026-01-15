"""
IFC Validation Endpoint - Validate IFC models against BEP rules.

This endpoint is called by Django to validate IFC models.
Supports sync and async modes with callback to Django when complete.
"""

import asyncio
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import Optional, Dict, Any
import logging

from models.validation_schemas import (
    ValidationRequest,
    ValidationResult,
    ValidationStatus,
    Severity,
)
from services.validation import validation_orchestrator
from core.auth import verify_api_key
from config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ifc", tags=["ifc-validation"])


# Track validation status for async requests
_validation_status: Dict[str, Dict[str, Any]] = {}


@router.post("/validate", response_model=ValidationResult)
async def validate_ifc_model(
    request: ValidationRequest,
    background_tasks: BackgroundTasks,
    auth: bool = Depends(verify_api_key),
) -> ValidationResult:
    """
    Validate an IFC model against BEP rules.

    This endpoint supports two modes:
    1. SYNC (async_mode=False): Waits for validation to complete
    2. ASYNC (async_mode=True): Returns immediately, processes in background

    For async mode, use GET /ifc/validate/{model_id}/status to check progress,
    or provide a callback_url to be notified when complete.

    Args:
        request: ValidationRequest with model_id and optional bep_id, rule_types

    Returns:
        ValidationResult with issues and summary
    """
    if request.async_mode:
        # Async mode - return immediately, process in background
        _validation_status[request.model_id] = {
            "status": ValidationStatus.PENDING,
            "result": None,
            "error": None,
        }

        background_tasks.add_task(
            _validate_background,
            request,
        )

        # Return pending result
        return ValidationResult(
            model_id=request.model_id,
            overall_status=Severity.INFO,
            validation_status=ValidationStatus.PENDING,
            summary="Validation started in background",
        )

    # Sync mode - wait for completion
    try:
        result = await validation_orchestrator.validate_model(request)
        return result
    except Exception as e:
        logger.error(f"Validation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Validation failed: {str(e)}"
        )


async def _validate_background(request: ValidationRequest) -> None:
    """
    Background task for async validation.

    Updates status dict and calls back to Django when complete.
    """
    model_id = request.model_id

    try:
        logger.info(f"[Background] Starting validation for {model_id}")
        _validation_status[model_id]["status"] = ValidationStatus.RUNNING

        result = await validation_orchestrator.validate_model(request)

        _validation_status[model_id] = {
            "status": ValidationStatus.COMPLETED,
            "result": result,
            "error": None,
        }

        logger.info(
            f"[Background] Validation complete for {model_id}: "
            f"{result.overall_status.value}, {result.error_count} errors"
        )

    except Exception as e:
        logger.error(f"[Background] Validation failed for {model_id}: {e}")
        _validation_status[model_id] = {
            "status": ValidationStatus.FAILED,
            "result": None,
            "error": str(e),
        }


@router.get("/validate/{model_id}/status")
async def get_validation_status(
    model_id: str,
    auth: bool = Depends(verify_api_key),
) -> Dict[str, Any]:
    """
    Get the status of an async validation.

    Returns:
        - status: pending, running, completed, failed
        - result: ValidationResult if completed
        - error: Error message if failed
    """
    if model_id not in _validation_status:
        raise HTTPException(
            status_code=404,
            detail=f"No validation found for model {model_id}"
        )

    status_info = _validation_status[model_id]

    response = {
        "model_id": model_id,
        "status": status_info["status"].value,
        "error": status_info.get("error"),
    }

    if status_info["status"] == ValidationStatus.COMPLETED and status_info["result"]:
        response["result"] = status_info["result"].model_dump()

    return response


@router.post("/validate/quick")
async def quick_validate(
    request: ValidationRequest,
    auth: bool = Depends(verify_api_key),
) -> Dict[str, Any]:
    """
    Quick validation - runs only default GUID rules.

    Useful for fast preliminary checks before full BEP validation.
    Always runs synchronously.

    Returns:
        Simplified validation summary
    """
    # Force default rules only
    request.bep_id = None
    request.async_mode = False

    try:
        result = await validation_orchestrator.validate_model(request)

        return {
            "model_id": request.model_id,
            "passed": result.error_count == 0,
            "error_count": result.error_count,
            "warning_count": result.warning_count,
            "total_elements": result.total_elements,
            "elements_with_issues": result.elements_with_issues,
            "duration_seconds": result.duration_seconds,
            "summary": result.summary,
        }
    except Exception as e:
        logger.error(f"Quick validation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Quick validation failed: {str(e)}"
        )


@router.delete("/validate/{model_id}/status")
async def clear_validation_status(
    model_id: str,
    auth: bool = Depends(verify_api_key),
) -> Dict[str, str]:
    """
    Clear validation status from memory.

    Use this to clean up after retrieving async validation results.
    """
    if model_id in _validation_status:
        del _validation_status[model_id]
        return {"message": f"Validation status cleared for {model_id}"}

    return {"message": f"No validation status found for {model_id}"}
