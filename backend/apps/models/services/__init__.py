"""
IFC Processing Services

Lite architecture for IFC file processing:
- parse_lite.py: Extract aggregate stats ONLY (fast, no DB writes)

The viewer loads IFC files directly via ThatOpen.
For full entity extraction, use FastAPI's /ifc/process endpoint.
"""

from .parse_lite import parse_ifc_stats, get_types_with_counts, get_materials_with_usage

__all__ = [
    'parse_ifc_stats',
    'get_types_with_counts',
    'get_materials_with_usage',
]
