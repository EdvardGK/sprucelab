"""
IFC Processing Services

Layered architecture for IFC file processing:
- Layer 1 (parse.py):     Extract raw IFC metadata (fast, always succeeds)
- Layer 2 (geometry.py):  Extract geometry (slow, can fail per element)
- Layer 3 (validation.py): Quality checks (reports issues, doesn't fail)
- Layer 4 (analysis.py):   Change detection, metrics
"""

from .parse import parse_ifc_metadata
from .geometry import extract_geometry_for_model
# from .validation import validate_ifc_model  # Already exists in services_validation.py
# from .analysis import detect_changes  # To be implemented

__all__ = [
    'parse_ifc_metadata',
    'extract_geometry_for_model',
]
