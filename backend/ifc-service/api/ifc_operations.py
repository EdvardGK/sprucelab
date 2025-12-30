"""
IFC Operations API endpoints.

Handles:
- Loading IFC files (upload, URL, path)
- Querying elements
- Element details with properties
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Query, Depends
from typing import Optional

from services.ifc_loader import ifc_loader
from models.schemas import (
    IFCOpenRequest,
    IFCOpenResponse,
    ElementSummary,
    ElementDetail,
    ElementListResponse,
    MeshGeometry,
    TypeInstance,
    TypeInstancesResponse,
)
from core.auth import optional_api_key

router = APIRouter(prefix="/ifc", tags=["ifc"])


@router.post("/open", response_model=IFCOpenResponse)
async def open_ifc_file(
    file: UploadFile = File(...),
    _auth: bool = Depends(optional_api_key),
):
    """
    Load an IFC file into memory for processing.

    The file is cached and a file_id is returned for use in subsequent operations.
    Files are cached for up to 1 hour (configurable).

    Returns file_id and basic statistics about the loaded file.
    """
    # Validate file type
    if not file.filename.lower().endswith((".ifc", ".ifczip")):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Must be .ifc or .ifczip",
        )

    try:
        # Read file content
        content = await file.read()

        # Load into ifcopenshell
        file_id, ifc_file = await ifc_loader.load_from_bytes(content, file.filename)

        # Get file info
        info = ifc_loader.get_file_info(file_id)

        return IFCOpenResponse(**info)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process IFC file: {str(e)}")


@router.post("/open/url", response_model=IFCOpenResponse)
async def open_ifc_from_url(
    request: IFCOpenRequest,
    _auth: bool = Depends(optional_api_key),
):
    """
    Load an IFC file from a URL (e.g., Supabase storage).

    Useful for processing files already uploaded to cloud storage.
    """
    if not request.file_url:
        raise HTTPException(status_code=400, detail="file_url is required")

    try:
        file_id, ifc_file = await ifc_loader.load_from_url(request.file_url)
        info = ifc_loader.get_file_info(file_id)
        return IFCOpenResponse(**info)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load IFC from URL: {str(e)}")


@router.post("/open/path", response_model=IFCOpenResponse)
async def open_ifc_from_path(
    request: IFCOpenRequest,
    _auth: bool = Depends(optional_api_key),
):
    """
    Load an IFC file from a local file path.

    Useful for processing files on the server filesystem.
    """
    if not request.file_path:
        raise HTTPException(status_code=400, detail="file_path is required")

    try:
        file_id, ifc_file = await ifc_loader.load_from_path(request.file_path)
        info = ifc_loader.get_file_info(file_id)
        return IFCOpenResponse(**info)

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load IFC file: {str(e)}")


@router.get("/{file_id}/info", response_model=IFCOpenResponse)
async def get_file_info(file_id: str):
    """Get information about a loaded IFC file."""
    try:
        info = ifc_loader.get_file_info(file_id)
        return IFCOpenResponse(**info)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{file_id}/elements", response_model=ElementListResponse)
async def get_elements(
    file_id: str,
    ifc_type: Optional[str] = Query(None, description="Filter by IFC type (e.g., IfcWall, IfcDoor)"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(100, ge=1, le=10000, description="Max elements to return"),
):
    """
    Get paginated list of elements from a loaded IFC file.

    Supports filtering by IFC type (e.g., IfcWall, IfcColumn, IfcDoor).
    Returns basic info for list views - use /elements/{guid} for full details.
    """
    try:
        elements, total = ifc_loader.get_elements(
            file_id=file_id,
            ifc_type=ifc_type,
            offset=offset,
            limit=limit,
        )

        return ElementListResponse(
            elements=[ElementSummary(**e) for e in elements],
            total=total,
            offset=offset,
            limit=limit,
            has_more=(offset + limit) < total,
        )

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{file_id}/elements/{guid}", response_model=ElementDetail)
async def get_element_detail(file_id: str, guid: str):
    """
    Get detailed information about a single element by GUID.

    Includes:
    - All property sets and their properties
    - Quantities (area, volume, length, etc.)
    - Associated materials
    - Type object name
    - Storey location
    """
    try:
        detail = ifc_loader.get_element_detail(file_id, guid)
        return ElementDetail(**detail)

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{file_id}/elements/by-express-id/{express_id}", response_model=ElementDetail)
async def get_element_by_express_id(file_id: str, express_id: int):
    """
    Get detailed information about a single element by Express ID (step_id).

    This is useful when you have the element's Express ID from ThatOpen/web-ifc
    but don't have the GUID.

    Includes same data as get_element_detail.
    """
    try:
        detail = ifc_loader.get_element_by_express_id(file_id, express_id)
        return ElementDetail(**detail)

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{file_id}/geometry/{guid}", response_model=MeshGeometry)
async def get_element_geometry(file_id: str, guid: str):
    """
    Get mesh geometry (vertices, faces) for a single element.

    Returns triangulated mesh data suitable for Plotly Mesh3d or Three.js.
    Coordinates are in world space.

    Used by the TypeInstanceViewer for 3D previews.
    """
    try:
        geometry = ifc_loader.get_element_geometry(file_id, guid)
        return MeshGeometry(**geometry)

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{file_id}/types/{type_guid}/instances", response_model=TypeInstancesResponse)
async def get_type_instances(file_id: str, type_guid: str):
    """
    Get all instances (occurrences) of a specific IFC type.

    Queries the IFC file directly using IfcRelDefinesByType relationship.
    Returns list of instance GUIDs and basic info for filtering in the viewer.

    Used by TypeInstanceViewer to filter model to show only instances of selected type.
    """
    try:
        instances, total = ifc_loader.get_type_instances(file_id, type_guid)
        return TypeInstancesResponse(
            instances=[TypeInstance(**inst) for inst in instances],
            total_count=total,
            type_guid=type_guid,
        )

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{file_id}")
async def unload_file(
    file_id: str,
    _auth: bool = Depends(optional_api_key),
):
    """
    Unload a file from memory and clean up temp files.

    Use this to free resources when done with a file.
    """
    success = ifc_loader.unload_file(file_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"File {file_id} not found")

    return {"status": "unloaded", "file_id": file_id}


@router.get("/loaded")
async def list_loaded_files():
    """List all currently loaded file IDs."""
    file_ids = ifc_loader.get_loaded_files()
    return {
        "loaded_files": file_ids,
        "count": len(file_ids),
    }
