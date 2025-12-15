"""
Pydantic schemas for API request/response models.
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime


# ============================================================================
# IFC File Operations
# ============================================================================


class IFCOpenRequest(BaseModel):
    """Request to open an IFC file from a URL or path."""

    file_url: Optional[str] = Field(None, description="URL to download IFC file from")
    file_path: Optional[str] = Field(None, description="Local path to IFC file")


class IFCOpenResponse(BaseModel):
    """Response after opening an IFC file."""

    file_id: str = Field(..., description="Unique ID for this loaded file (use for subsequent operations)")
    ifc_schema: str = Field(..., description="IFC schema version (e.g., IFC4, IFC2X3)")
    element_count: int = Field(..., description="Total number of IFC elements")
    type_count: int = Field(..., description="Number of type objects")
    spatial_elements: int = Field(..., description="Number of spatial elements (storeys, spaces)")
    file_size_mb: float = Field(..., description="File size in megabytes")


class ElementSummary(BaseModel):
    """Summary of an IFC element (for list views)."""

    guid: str = Field(..., description="IFC GlobalId (22-character unique identifier)")
    ifc_type: str = Field(..., description="IFC type (e.g., IfcWall, IfcDoor)")
    name: Optional[str] = Field(None, description="Element name")
    storey: Optional[str] = Field(None, description="Building storey name")


class ElementDetail(BaseModel):
    """Detailed view of an IFC element including properties."""

    guid: str
    ifc_type: str
    name: Optional[str] = None
    description: Optional[str] = None
    object_type: Optional[str] = None
    storey: Optional[str] = None
    properties: Dict[str, Dict[str, Any]] = Field(
        default_factory=dict,
        description="Property sets with their properties {pset_name: {prop_name: value}}"
    )
    quantities: Dict[str, Any] = Field(
        default_factory=dict,
        description="Quantities (area, volume, length, etc.)"
    )
    materials: List[str] = Field(
        default_factory=list,
        description="Associated material names"
    )
    type_name: Optional[str] = Field(None, description="Type object name if assigned")


class ElementListResponse(BaseModel):
    """Paginated list of elements."""

    elements: List[ElementSummary]
    total: int
    offset: int
    limit: int
    has_more: bool


# ============================================================================
# Bulk Property Editing
# ============================================================================


class PropertyEdit(BaseModel):
    """Single property edit operation."""

    guid: str = Field(..., description="Element GUID to edit")
    pset_name: str = Field(..., description="Property set name")
    property_name: str = Field(..., description="Property name")
    value: Any = Field(..., description="New value")
    value_type: Optional[str] = Field(None, description="IFC value type (e.g., IfcText, IfcReal)")


class BulkEditRequest(BaseModel):
    """Request for bulk property editing."""

    file_id: str = Field(..., description="ID of loaded IFC file")
    edits: List[PropertyEdit] = Field(..., description="List of property edits to apply")
    validate_before_apply: bool = Field(True, description="Validate edits before applying")


class BulkEditResponse(BaseModel):
    """Response from bulk edit operation."""

    success: bool
    edits_applied: int
    edits_failed: int
    errors: List[Dict[str, str]] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


# ============================================================================
# Validation
# ============================================================================


class ValidationRequest(BaseModel):
    """Request to validate an IFC file."""

    file_id: str
    rules: Optional[List[str]] = Field(None, description="Specific rules to run (None = all)")


class ValidationIssue(BaseModel):
    """Single validation issue."""

    severity: str = Field(..., description="error, warning, or info")
    rule: str = Field(..., description="Rule that triggered this issue")
    message: str
    element_guid: Optional[str] = None
    element_type: Optional[str] = None
    element_name: Optional[str] = None


class ValidationResponse(BaseModel):
    """Validation results."""

    valid: bool = Field(..., description="True if no errors (warnings allowed)")
    error_count: int
    warning_count: int
    info_count: int
    issues: List[ValidationIssue]
    validated_at: datetime


# ============================================================================
# Export
# ============================================================================


class ExportRequest(BaseModel):
    """Request to export modified IFC file."""

    file_id: str
    output_format: str = Field("ifc", description="Output format (ifc, ifczip)")
    include_changes_only: bool = Field(False, description="Only export modified elements")


class ExportResponse(BaseModel):
    """Response from export operation."""

    success: bool
    export_id: str = Field(..., description="ID to download the exported file")
    file_size_mb: float
    elements_exported: int
    download_url: Optional[str] = None


# ============================================================================
# IFC Processing (Django integration)
# ============================================================================


class QuickStatsResponse(BaseModel):
    """Quick stats returned immediately for fast UI feedback."""

    success: bool = Field(..., description="Whether quick stats extraction succeeded")
    ifc_schema: str = Field("", description="IFC schema version (IFC2X3, IFC4, etc.)")
    file_size_bytes: int = Field(0, description="File size in bytes")

    # Core counts
    total_elements: int = Field(0, description="Total number of building elements")
    storey_count: int = Field(0, description="Number of building storeys")
    type_count: int = Field(0, description="Number of type definitions")
    material_count: int = Field(0, description="Number of materials")

    # Top entity types
    top_entity_types: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Top 5 entity types by count, e.g. [{'type': 'IfcWall', 'count': 320}]"
    )

    # Storey names for quick spatial overview
    storey_names: List[str] = Field(
        default_factory=list,
        description="List of storey names"
    )

    # Timing
    duration_ms: int = Field(0, description="Time to extract quick stats in milliseconds")

    # Error if failed
    error: Optional[str] = Field(None, description="Error message if extraction failed")


class ProcessRequest(BaseModel):
    """Request to process an IFC file and write metadata to database."""

    model_id: str = Field(..., description="UUID of the Model in Django database")
    file_path: str = Field(..., description="Full path to the IFC file")
    skip_geometry: bool = Field(True, description="Skip geometry extraction (always True for now)")
    async_mode: bool = Field(False, description="Run processing in background (not implemented)")


class ProcessResponse(BaseModel):
    """Response from IFC processing operation."""

    success: bool = Field(..., description="Whether processing completed successfully")
    model_id: str = Field(..., description="UUID of the processed model")
    status: str = Field(..., description="Model status: 'parsing', 'parsed', 'ready', 'error'")

    # Counts
    element_count: int = Field(0, description="Number of elements extracted")
    storey_count: int = Field(0, description="Number of storeys extracted")
    system_count: int = Field(0, description="Number of systems extracted")
    property_count: int = Field(0, description="Number of properties extracted")
    material_count: int = Field(0, description="Number of materials extracted")
    type_count: int = Field(0, description="Number of types extracted")

    # Processing info
    ifc_schema: Optional[str] = Field(None, description="IFC schema version")
    processing_report_id: Optional[str] = Field(None, description="UUID of ProcessingReport")
    duration_seconds: float = Field(0.0, description="Processing duration in seconds")
    error: Optional[str] = Field(None, description="Error message if failed")

    # Detailed results (optional, can be omitted for brief responses)
    stage_results: Optional[List[Dict[str, Any]]] = Field(None, description="Per-stage results")
    errors: Optional[List[Dict[str, Any]]] = Field(None, description="List of errors encountered")
