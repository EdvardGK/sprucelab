"""
CRS (Coordinate Reference System) lookup via pyproj EPSG database.

Endpoints:
- GET /crs/{epsg_code} - Look up a specific EPSG code
- GET /crs/search?q=... - Search by name or code
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
import pyproj
from pyproj.database import query_crs_info

router = APIRouter(prefix="/crs", tags=["CRS"])


class CRSInfo(BaseModel):
    epsg_code: int
    name: str
    area_of_use: str | None = None
    bounds: list[float] | None = None  # [west, south, east, north]
    type: str  # PROJECTED, GEOGRAPHIC, etc.


class CRSSearchResult(BaseModel):
    results: list[CRSInfo]
    count: int


@router.get("/{epsg_code}", response_model=CRSInfo)
async def lookup_crs(epsg_code: int):
    """Look up a specific EPSG code."""
    try:
        crs = pyproj.CRS.from_epsg(epsg_code)
    except Exception:
        raise HTTPException(status_code=404, detail=f"EPSG:{epsg_code} not found")

    area = crs.area_of_use
    crs_type = "PROJECTED" if crs.is_projected else "GEOGRAPHIC" if crs.is_geographic else "OTHER"

    return CRSInfo(
        epsg_code=epsg_code,
        name=crs.name,
        area_of_use=area.name if area else None,
        bounds=list(area.bounds) if area else None,
        type=crs_type,
    )


@router.get("/search", response_model=CRSSearchResult)
async def search_crs(
    q: str = Query(..., min_length=1, description="Search by name or EPSG code"),
    limit: int = Query(20, le=50),
):
    """Search CRS by name or EPSG code."""
    # If query is a number, try direct lookup first
    if q.isdigit():
        try:
            crs = pyproj.CRS.from_epsg(int(q))
            area = crs.area_of_use
            crs_type = "PROJECTED" if crs.is_projected else "GEOGRAPHIC" if crs.is_geographic else "OTHER"
            return CRSSearchResult(
                results=[CRSInfo(
                    epsg_code=int(q),
                    name=crs.name,
                    area_of_use=area.name if area else None,
                    bounds=list(area.bounds) if area else None,
                    type=crs_type,
                )],
                count=1,
            )
        except Exception:
            pass

    # Text search across all EPSG projected + geographic CRS
    all_results = []
    for pj_type in ["PROJECTED_CRS", "GEOGRAPHIC_2D_CRS"]:
        all_results.extend(query_crs_info(auth_name="EPSG", pj_types=pj_type))

    q_lower = q.lower()
    matches = []
    for r in all_results:
        if q_lower in (r.name or "").lower() or q_lower in str(r.code):
            try:
                crs = pyproj.CRS.from_epsg(int(r.code))
                area = crs.area_of_use
                crs_type = "PROJECTED" if crs.is_projected else "GEOGRAPHIC"
                matches.append(CRSInfo(
                    epsg_code=int(r.code),
                    name=crs.name,
                    area_of_use=area.name if area else None,
                    bounds=list(area.bounds) if area else None,
                    type=crs_type,
                ))
            except Exception:
                continue
            if len(matches) >= limit:
                break

    return CRSSearchResult(results=matches, count=len(matches))
