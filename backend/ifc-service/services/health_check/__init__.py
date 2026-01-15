"""
Health Check Service - Universal IFC model analysis.

Philosophy:
- Never fail, always complete, always report
- Validation is informational, not gatekeeping
- Models have value regardless of issues
- Output is dashboard-ready JSON
"""

from .orchestrator import HealthCheckOrchestrator, health_check_orchestrator
from .checkers import (
    IdentityChecker,
    SpatialChecker,
    GeorefChecker,
    SemanticChecker,
    QTOExtractor,
)

__all__ = [
    "HealthCheckOrchestrator",
    "health_check_orchestrator",
    "IdentityChecker",
    "SpatialChecker",
    "GeorefChecker",
    "SemanticChecker",
    "QTOExtractor",
]
