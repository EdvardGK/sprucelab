"""Filename parsing and discipline detection for Norwegian BIM conventions.

Norwegian BIM filename pattern: {PROJECT}_{DISCIPLINE}_{BUILDING}.ifc
Example: LBK_ARK_C.ifc -> project=LBK, discipline=ARK, building=C
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

# Discipline code -> full name
DISCIPLINE_CODES: dict[str, str] = {
    "ARK": "Architecture",
    "IARK": "Internal Architecture",
    "LARK": "Landscape Architecture",
    "RIB": "Structural Concrete",
    "RIBp": "Structural Prefab",
    "RIG": "Earthworks",
    "RIV": "HVAC General",
    "RIVr": "Plumbing",
    "RIVv": "Ventilation",
    "RIVspr": "Sprinklers",
    "RIVA": "Water/Wastewater",
    "RIE": "Electrical",
    "FASADE": "Facade",
}

# Discipline code -> display color (hex)
DISCIPLINE_COLORS: dict[str, str] = {
    "ARK": "#3B82F6",
    "IARK": "#8B5CF6",
    "LARK": "#10B981",
    "RIB": "#EF4444",
    "RIBp": "#F97316",
    "RIG": "#78716C",
    "RIV": "#06B6D4",
    "RIVr": "#0EA5E9",
    "RIVv": "#14B8A6",
    "RIVspr": "#F43F5E",
    "RIVA": "#0284C7",
    "RIE": "#EAB308",
    "FASADE": "#A855F7",
}

# Ordered patterns: more specific disciplines first to avoid partial matches
_DISCIPLINE_PATTERNS: list[tuple[str, str]] = [
    (r"(?:^|_|-|\s)IARK(?:_|-|\s|\.|$)", "IARK"),
    (r"(?:^|_|-|\s)LARK(?:_|-|\s|\.|$)", "LARK"),
    (r"(?:^|_|-|\s)ARK(?:_|-|\s|\.|$)", "ARK"),
    (r"(?:^|_|-|\s)RIBp(?:_|-|\s|\.|$)", "RIBp"),
    (r"(?:^|_|-|\s)RIB(?:_|-|\s|\.|$)", "RIB"),
    (r"(?:^|_|-|\s)RIG(?:_|-|\s|\.|$)", "RIG"),
    (r"(?:^|_|-|\s)RIVA(?:_|-|\s|\.|$)", "RIVA"),
    (r"(?:^|_|-|\s)RIVspr(?:_|-|\s|\.|$)", "RIVspr"),
    (r"(?:^|_|-|\s)RIVr(?:_|-|\s|\.|$)", "RIVr"),
    (r"(?:^|_|-|\s)RIVv(?:_|-|\s|\.|$)", "RIVv"),
    (r"(?:^|_|-|\s)RIV(?:_|-|\s|\.|$)", "RIV"),
    (r"(?:^|_|-|\s)RIE(?:_|-|\s|\.|$)", "RIE"),
    (r"(?:^|_|-|\s)[Ff]asade(?:_|-|\s|\.|$)", "FASADE"),
]


def parse_filename(path: str | Path) -> dict[str, Any]:
    """Parse project name, discipline, and building from an IFC filename.

    Expects pattern: {PROJECT}_{DISCIPLINE}_{BUILDING}.ifc

    Args:
        path: File path or filename.

    Returns:
        Dict with keys: project, discipline, building.
        Values are None when not detected.
    """
    stem = Path(path).stem
    parts = stem.split("_")

    discipline = detect_discipline(str(path))

    if len(parts) < 2:
        return {"project": stem, "discipline": discipline, "building": None}
    elif len(parts) == 2:
        return {"project": parts[0], "discipline": discipline, "building": None}
    else:
        return {"project": parts[0], "discipline": discipline, "building": parts[-1]}


def detect_discipline(ifc_or_path: Any) -> str | None:
    """Detect discipline code from a filename or IFC file path.

    Matches against Norwegian BIM discipline codes (ARK, RIB, RIV, etc.)
    using ordered regex patterns to handle overlapping codes correctly
    (e.g., LARK before ARK, RIVv before RIV).

    Args:
        ifc_or_path: Filename string, Path object, or IFC file object
            (uses schema attribute to distinguish).

    Returns:
        Discipline code string (e.g. 'ARK', 'RIB') or None.
    """
    # Get filename string
    if hasattr(ifc_or_path, "schema"):
        # IFC file object - can't detect from filename alone
        return None
    filename = Path(str(ifc_or_path)).name

    for pattern, code in _DISCIPLINE_PATTERNS:
        if re.search(pattern, filename, re.IGNORECASE):
            return code

    return None
