"""
Claim extraction endpoint (Phase 6, Sprint 6.2).

Stateless: receive a markdown body, return claim candidates. Persistence is
Django's job — Django reads DocumentContent rows from its DB and posts the
markdown to this endpoint, then writes the resulting Claim rows itself.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from core.auth import verify_api_key
from models.schemas import (
    ClaimCandidatePayload,
    ClaimExtractRequest,
    ClaimExtractResponse,
)
from services.claim_extractor import extract_claims

router = APIRouter(prefix="/claims", tags=["claims"])


@router.post("/extract", response_model=ClaimExtractResponse)
async def extract_claims_endpoint(
    request: ClaimExtractRequest,
    auth: bool = Depends(verify_api_key),
) -> ClaimExtractResponse:
    """
    Run heuristic claim extraction over a markdown body.

    Synchronous: heuristics finish in milliseconds even on full specs (one
    regex pass over the line-split text). Sprint 6.3 will add an LLM pass
    with cost gating; this endpoint stays the entry point either way.
    """
    result = extract_claims(request.markdown)
    return ClaimExtractResponse(
        success=result.success,
        claims=[
            ClaimCandidatePayload(
                statement=c.statement,
                normalized=c.normalized,
                claim_type=c.claim_type,
                confidence=c.confidence,
                source_location=c.source_location,
            )
            for c in result.claims
        ],
        log_entries=result.log_entries,
        quality_report=result.quality_report,
        duration_seconds=result.duration_seconds,
        error=result.error,
    )
