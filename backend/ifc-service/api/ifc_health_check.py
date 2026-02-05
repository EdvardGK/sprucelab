"""
Health Check API Endpoints - Universal IFC model analysis.

Endpoints:
- POST /ifc/health-check - Full analysis with traffic lights + QTO
- GET /ifc/health-check/{model_id}/status - Check async analysis status
- POST /ifc/health-check/quick - Quick analysis (skip QTO)

Philosophy:
- Never fails, always returns structured data
- Dashboard-ready JSON output
- Traffic light summaries for quick assessment
- QTO dataset for quantity dashboards
"""

import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, Query

from core.auth import verify_api_key
from models.health_check_schemas import (
    HealthCheckRequest,
    HealthCheckResponse,
    TrafficLight,
)
from services.health_check import health_check_orchestrator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ifc", tags=["ifc-health-check"])

# In-memory status tracking for async analysis
_analysis_status: Dict[str, Dict[str, Any]] = {}


@router.post("/health-check", response_model=HealthCheckResponse)
async def run_health_check(
    request: HealthCheckRequest,
    background_tasks: BackgroundTasks,
    async_mode: bool = Query(False, description="Run in background, poll for results"),
    auth: bool = Depends(verify_api_key),
) -> HealthCheckResponse:
    """
    Run universal health check on IFC model.

    Returns:
    - Traffic light status per cluster (identity, spatial, georef, semantic)
    - QTO dataset (quantities by type/storey/material)
    - Model metadata
    - Detailed check results with affected element GUIDs

    This endpoint NEVER fails with an error - it always returns
    structured data. If issues occur during analysis, they're
    reported as notes or partial results, not exceptions.
    """
    if async_mode:
        # Start background analysis
        _analysis_status[request.model_id] = {
            "status": "pending",
            "result": None,
        }
        background_tasks.add_task(_analyze_background, request)

        # Return pending response
        return HealthCheckResponse(
            model_id=request.model_id,
            overall_status=TrafficLight.YELLOW,
            notes=["Analysis started in background - poll /health-check/{model_id}/status for results"]
        )

    # Synchronous analysis
    result = await health_check_orchestrator.analyze(request)
    return result


@router.get("/health-check/{model_id}/status")
async def get_health_check_status(
    model_id: str,
    auth: bool = Depends(verify_api_key),
) -> Dict[str, Any]:
    """
    Get status of async health check analysis.

    Returns:
    - status: pending | completed | failed
    - result: Full HealthCheckResponse when completed
    """
    if model_id not in _analysis_status:
        return {
            "status": "not_found",
            "message": f"No analysis found for model {model_id}"
        }

    entry = _analysis_status[model_id]

    if entry["status"] == "pending":
        return {"status": "pending", "message": "Analysis in progress"}

    if entry["status"] == "completed":
        return {
            "status": "completed",
            "result": entry["result"].model_dump() if entry["result"] else None
        }

    return {"status": entry["status"], "message": entry.get("message", "")}


@router.delete("/health-check/{model_id}/status")
async def clear_health_check_status(
    model_id: str,
    auth: bool = Depends(verify_api_key),
) -> Dict[str, str]:
    """Clear analysis status entry."""
    if model_id in _analysis_status:
        del _analysis_status[model_id]
        return {"status": "cleared"}
    return {"status": "not_found"}


@router.post("/health-check/quick", response_model=HealthCheckResponse)
async def quick_health_check(
    request: HealthCheckRequest,
    auth: bool = Depends(verify_api_key),
) -> HealthCheckResponse:
    """
    Quick health check - skips QTO extraction for faster results.

    Use this for rapid validation feedback. Full QTO can be
    extracted separately if needed.
    """
    request.skip_qto = True
    result = await health_check_orchestrator.analyze(request)
    return result


async def _analyze_background(request: HealthCheckRequest):
    """Background task for async analysis."""
    try:
        result = await health_check_orchestrator.analyze(request)
        _analysis_status[request.model_id] = {
            "status": "completed",
            "result": result,
        }
    except Exception as e:
        logger.error(f"Background analysis failed: {e}", exc_info=True)
        _analysis_status[request.model_id] = {
            "status": "failed",
            "message": str(e)[:200],
            "result": None,
        }
