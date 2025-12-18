"""
IFC Processing Services

Layered architecture for IFC file processing:
- Layer 1 LITE (parse_lite.py): Extract aggregate stats ONLY (fast, no DB writes)
- Layer 1 FULL (parse.py):      Extract raw IFC metadata (writes to DB - DEPRECATED)
- Layer 2 (geometry.py):        Extract geometry (slow, can fail per element) - DEPRECATED
- Layer 3 (validation.py):      Quality checks (reports issues, doesn't fail)
- Layer 4 (analysis.py):        Change detection, metrics

NEW ARCHITECTURE (2024-12):
- Django stores ONLY aggregate stats on Model table
- FastAPI queries IFC files directly for element details
- No more 10k+ entity rows in Supabase
"""

from .parse import parse_ifc_metadata  # DEPRECATED - use parse_ifc_stats instead
from .geometry import extract_geometry_for_model  # DEPRECATED - viewer loads IFC directly
from .parse_lite import parse_ifc_stats, get_types_with_counts, get_materials_with_usage

__all__ = [
    # New lite approach (preferred)
    'parse_ifc_stats',
    'get_types_with_counts',
    'get_materials_with_usage',
    # Legacy (deprecated)
    'parse_ifc_metadata',
    'extract_geometry_for_model',
]
