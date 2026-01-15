"""
Health Check Schemas - Dashboard-ready output structures.

Philosophy:
- Validation is INFORMATIONAL, not gatekeeping
- Models have value regardless of issues
- Show, don't tell - surface what's there, let humans decide
- Never fail, always complete, always report
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum


class TrafficLight(str, Enum):
    """Traffic light status - intuitive at a glance."""
    GREEN = "green"   # No issues
    YELLOW = "yellow"  # Minor issues, informational
    RED = "red"       # Significant issues worth attention


class CheckResult(BaseModel):
    """Result of a single check within a cluster."""
    status: TrafficLight = TrafficLight.GREEN
    count: int = 0  # Number of elements affected
    message: Optional[str] = None  # Human-readable summary
    elements: List[str] = Field(default_factory=list)  # GUIDs of affected elements (first N)
    details: Optional[Dict[str, Any]] = None  # Additional context


class ClusterResult(BaseModel):
    """Result of a validation cluster (e.g., Identity, Spatial)."""
    status: TrafficLight = TrafficLight.GREEN
    checks: Dict[str, CheckResult] = Field(default_factory=dict)

    def compute_status(self):
        """Roll up status from individual checks."""
        if any(c.status == TrafficLight.RED for c in self.checks.values()):
            self.status = TrafficLight.RED
        elif any(c.status == TrafficLight.YELLOW for c in self.checks.values()):
            self.status = TrafficLight.YELLOW
        else:
            self.status = TrafficLight.GREEN


# =============================================================================
# Identity Cluster
# =============================================================================

class IdentityCluster(ClusterResult):
    """Identity & Metadata cluster results."""
    pass  # Uses base structure


# =============================================================================
# Spatial Cluster
# =============================================================================

class StoreyInfo(BaseModel):
    """Information about a building storey."""
    guid: str
    name: str
    elevation: Optional[float] = None
    element_count: int = 0


class SpatialCluster(ClusterResult):
    """Spatial hierarchy cluster results."""
    hierarchy: Optional[Dict[str, Any]] = None  # Project > Site > Building > Storey tree
    storeys: List[StoreyInfo] = Field(default_factory=list)


# =============================================================================
# Georeferencing Cluster
# =============================================================================

class CRSInfo(BaseModel):
    """Coordinate Reference System information."""
    name: Optional[str] = None
    epsg_code: Optional[int] = None
    geodetic_datum: Optional[str] = None
    map_projection: Optional[str] = None


class MapConversionInfo(BaseModel):
    """Map conversion parameters."""
    eastings: Optional[float] = None
    northings: Optional[float] = None
    orthogonal_height: Optional[float] = None
    x_axis_abscissa: Optional[float] = None
    x_axis_ordinate: Optional[float] = None
    scale: Optional[float] = None


class GeorefCluster(ClusterResult):
    """Georeferencing cluster results."""
    crs: Optional[CRSInfo] = None
    map_conversion: Optional[MapConversionInfo] = None
    true_north: Optional[List[float]] = None  # [x, y] direction
    site_reference: Optional[Dict[str, float]] = None  # lat, lon, elevation


# =============================================================================
# Semantic Cluster
# =============================================================================

class TypeBreakdown(BaseModel):
    """Breakdown of elements by IFC type."""
    ifc_type: str
    count: int
    percentage: float


class SemanticCluster(ClusterResult):
    """Semantic integrity cluster results."""
    type_breakdown: List[TypeBreakdown] = Field(default_factory=list)
    proxy_percentage: float = 0.0
    classification_coverage: float = 0.0  # % of elements with classification


# =============================================================================
# QTO (Quantity Take-Off)
# =============================================================================

class QTOByType(BaseModel):
    """Quantities aggregated by IFC type."""
    ifc_type: str
    count: int
    total_area: Optional[float] = None  # m2
    total_volume: Optional[float] = None  # m3
    total_length: Optional[float] = None  # m


class QTOByStorey(BaseModel):
    """Quantities aggregated by storey."""
    storey_name: str
    storey_guid: str
    element_count: int
    gross_area: Optional[float] = None
    types: Dict[str, int] = Field(default_factory=dict)  # {IfcWall: 12, IfcDoor: 5}


class QTOByMaterial(BaseModel):
    """Quantities aggregated by material."""
    material_name: str
    element_count: int
    total_volume: Optional[float] = None
    ifc_types: List[str] = Field(default_factory=list)


class QTOTotals(BaseModel):
    """Summary totals for the model."""
    element_count: int = 0
    space_count: int = 0
    storey_count: int = 0
    material_count: int = 0
    type_count: int = 0  # Distinct IFC types used

    # Areas (if extractable)
    gross_floor_area: Optional[float] = None
    net_floor_area: Optional[float] = None

    # Volumes (if extractable)
    total_volume: Optional[float] = None


class QTODataset(BaseModel):
    """Complete QTO dataset - dashboard-ready."""
    by_type: List[QTOByType] = Field(default_factory=list)
    by_storey: List[QTOByStorey] = Field(default_factory=list)
    by_material: List[QTOByMaterial] = Field(default_factory=list)
    totals: QTOTotals = Field(default_factory=QTOTotals)


# =============================================================================
# Model Metadata
# =============================================================================

class ModelMetadata(BaseModel):
    """Basic model information extracted during health check."""
    file_name: Optional[str] = None
    file_size_bytes: Optional[int] = None
    ifc_schema: Optional[str] = None  # IFC2X3, IFC4, IFC4X3
    authoring_application: Optional[str] = None
    organization: Optional[str] = None
    author: Optional[str] = None
    timestamp: Optional[str] = None  # Last modified
    mvd: Optional[str] = None  # Model View Definition if specified


# =============================================================================
# Complete Health Check Response
# =============================================================================

class HealthCheckResponse(BaseModel):
    """
    Complete health check response - dashboard-ready.

    This is the single output that feeds:
    - Traffic light dashboards (cluster statuses)
    - Detailed issue views (check results with element lists)
    - QTO dashboards (quantities by type/storey/material)
    - Model overview cards (metadata)
    """
    model_id: str
    overall_status: TrafficLight = TrafficLight.GREEN
    duration_seconds: float = 0.0

    # Model basics
    metadata: ModelMetadata = Field(default_factory=ModelMetadata)

    # Validation clusters (traffic light per cluster)
    identity: IdentityCluster = Field(default_factory=IdentityCluster)
    spatial: SpatialCluster = Field(default_factory=SpatialCluster)
    georef: GeorefCluster = Field(default_factory=GeorefCluster)
    semantic: SemanticCluster = Field(default_factory=SemanticCluster)

    # Quantity take-off dataset
    qto: QTODataset = Field(default_factory=QTODataset)

    # Processing notes (not errors - just observations)
    notes: List[str] = Field(default_factory=list)

    def compute_overall_status(self):
        """Roll up overall status from all clusters."""
        clusters = [self.identity, self.spatial, self.georef, self.semantic]

        if any(c.status == TrafficLight.RED for c in clusters):
            self.overall_status = TrafficLight.RED
        elif any(c.status == TrafficLight.YELLOW for c in clusters):
            self.overall_status = TrafficLight.YELLOW
        else:
            self.overall_status = TrafficLight.GREEN


class HealthCheckRequest(BaseModel):
    """Request to run health check on a model."""
    model_id: str
    file_url: Optional[str] = None  # If not provided, fetched from DB
    file_path: Optional[str] = None  # For local testing

    # Optional: limit element GUIDs in response (for large models)
    max_elements_per_check: int = 100

    # Optional: skip certain clusters
    skip_qto: bool = False
    skip_geometry_checks: bool = True  # Expensive, off by default
