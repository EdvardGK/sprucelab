"""
CRS (Coordinate Reference System) lookup via pyproj EPSG database.

Endpoints:
- GET /crs/norway - Curated Norwegian CRS codes (NTM, UTM, vertical datums, compounds)
- GET /crs/search?q=... - Search by name or code
- GET /crs/{epsg_code} - Look up a specific EPSG code
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
    type: str  # PROJECTED, GEOGRAPHIC, VERTICAL, COMPOUND
    is_compound: bool = False
    horizontal_epsg: int | None = None  # sub-CRS if compound
    vertical_epsg: int | None = None  # sub-CRS if compound


class CRSGroup(BaseModel):
    label: str
    codes: list[CRSInfo]


class NorwayCRSResponse(BaseModel):
    groups: list[CRSGroup]
    total: int


class CRSSearchResult(BaseModel):
    results: list[CRSInfo]
    count: int


# Curated Norwegian EPSG codes
_NORWAY_CODES = {
    "NTM + NN2000": list(range(5945, 5971)),  # NTM zone 5-30 + NN2000
    "UTM + NN2000": [5971, 5972, 5973, 5974, 5975, 5976],  # UTM 31N-36N + NN2000
    "NTM (kun horisontal)": list(range(5105, 5131)),  # NTM zone 5-30
    "UTM (kun horisontal)": [25831, 25832, 25833, 25834, 25835, 25836],
    "Høydesystem": [5941, 5776],  # NN2000, NN54
}

# Cache
_norway_cache: NorwayCRSResponse | None = None


def _build_crs_info(epsg_code: int) -> CRSInfo | None:
    """Build CRSInfo from EPSG code, returns None if not found."""
    try:
        crs = pyproj.CRS.from_epsg(epsg_code)
    except Exception:
        return None

    area = crs.area_of_use

    if crs.is_compound:
        crs_type = "COMPOUND"
    elif crs.is_projected:
        crs_type = "PROJECTED"
    elif crs.is_geographic:
        crs_type = "GEOGRAPHIC"
    elif crs.is_vertical:
        crs_type = "VERTICAL"
    else:
        crs_type = "OTHER"

    horizontal_epsg = None
    vertical_epsg = None
    if crs.is_compound and crs.sub_crs_list:
        for sub in crs.sub_crs_list:
            sub_epsg = sub.to_epsg()
            if sub.is_projected or sub.is_geographic:
                horizontal_epsg = sub_epsg
            elif sub.is_vertical:
                vertical_epsg = sub_epsg

    return CRSInfo(
        epsg_code=epsg_code,
        name=crs.name,
        area_of_use=area.name if area else None,
        bounds=list(area.bounds) if area else None,
        type=crs_type,
        is_compound=crs.is_compound,
        horizontal_epsg=horizontal_epsg,
        vertical_epsg=vertical_epsg,
    )


@router.get("/norway", response_model=NorwayCRSResponse)
async def norway_crs():
    """Curated Norwegian CRS codes: compound (NTM/UTM + NN2000), projected, vertical."""
    global _norway_cache
    if _norway_cache is not None:
        return _norway_cache

    groups = []
    total = 0
    for label, codes in _NORWAY_CODES.items():
        infos = []
        for code in codes:
            info = _build_crs_info(code)
            if info:
                infos.append(info)
        groups.append(CRSGroup(label=label, codes=infos))
        total += len(infos)

    _norway_cache = NorwayCRSResponse(groups=groups, total=total)
    return _norway_cache


@router.get("/search", response_model=CRSSearchResult)
async def search_crs(
    q: str = Query(..., min_length=1, description="Search by name or EPSG code"),
    limit: int = Query(20, le=50),
):
    """Search CRS by name or EPSG code."""
    # If query is a number, try direct lookup first
    if q.isdigit():
        info = _build_crs_info(int(q))
        if info:
            return CRSSearchResult(results=[info], count=1)

    # Text search across EPSG projected + geographic + vertical + compound CRS
    all_results = []
    for pj_type in ["PROJECTED_CRS", "GEOGRAPHIC_2D_CRS", "VERTICAL_CRS", "COMPOUND_CRS"]:
        all_results.extend(query_crs_info(auth_name="EPSG", pj_types=pj_type))

    q_lower = q.lower()
    matches = []
    for r in all_results:
        if q_lower in (r.name or "").lower() or q_lower in str(r.code):
            info = _build_crs_info(int(r.code))
            if info:
                matches.append(info)
            if len(matches) >= limit:
                break

    return CRSSearchResult(results=matches, count=len(matches))


@router.get("/{epsg_code}", response_model=CRSInfo)
async def lookup_crs(epsg_code: int):
    """Look up a specific EPSG code."""
    info = _build_crs_info(epsg_code)
    if not info:
        raise HTTPException(status_code=404, detail=f"EPSG:{epsg_code} not found")
    return info
