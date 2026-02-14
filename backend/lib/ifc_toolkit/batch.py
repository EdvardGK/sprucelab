"""Multi-file processing with Norwegian BIM discipline awareness.

Solves real problems:
- Discovering all IFC files in a project folder
- Parsing filenames to identify discipline and building
- Auto-detecting the ARK (architecture) reference model
- Loading multiple models keyed by filename
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import ifcopenshell

from .context import detect_discipline, parse_filename
from .core import open_ifc


def discover_models(folder: str | Path) -> list[dict[str, Any]]:
    """Find all IFC files in a folder, parse filenames, group by discipline.

    Args:
        folder: Path to project folder containing IFC files.

    Returns:
        List of dicts with keys: path, filename, project, discipline,
        building, size_mb. Sorted by filename.
    """
    folder = Path(folder)
    files = sorted(list(folder.glob("*.ifc")) + list(folder.glob("*.ifczip")))

    models = []
    for f in files:
        info = parse_filename(f)
        models.append({
            "path": f,
            "filename": f.name,
            "project": info["project"],
            "discipline": info["discipline"],
            "building": info["building"],
            "size_mb": round(f.stat().st_size / (1024 * 1024), 1),
        })

    return models


def load_project(
    folder: str | Path,
) -> dict[str, ifcopenshell.file]:
    """Open all IFC files in a folder, keyed by filename.

    Args:
        folder: Path to project folder.

    Returns:
        Dict mapping filename to parsed IFC file object.
    """
    folder = Path(folder)
    files = sorted(list(folder.glob("*.ifc")) + list(folder.glob("*.ifczip")))

    models = {}
    for f in files:
        models[f.name] = open_ifc(f)

    return models


def find_ark_reference(models: dict[str, Any]) -> str | None:
    """Auto-detect the ARK (architecture) reference model from a set of models.

    In Norwegian BIM projects, the ARK model is the coordination reference
    for storey names and elevations. Excludes LARK (landscape architecture).

    Args:
        models: Dict with filenames as keys (from load_project or discover_models).

    Returns:
        Filename of the ARK model, or None if not found.
    """
    for name in models:
        discipline = detect_discipline(name)
        if discipline == "ARK":
            return name
    return None


def group_by_discipline(
    models: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """Group discovered models by discipline code.

    Args:
        models: List from discover_models().

    Returns:
        Dict mapping discipline code to list of model dicts.
        Models without detected discipline are grouped under "UNKNOWN".
    """
    groups: dict[str, list[dict]] = {}
    for m in models:
        key = m.get("discipline") or "UNKNOWN"
        groups.setdefault(key, []).append(m)
    return groups


def group_by_building(
    models: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """Group discovered models by building identifier.

    Args:
        models: List from discover_models().

    Returns:
        Dict mapping building code to list of model dicts.
        Models without detected building are grouped under "UNKNOWN".
    """
    groups: dict[str, list[dict]] = {}
    for m in models:
        key = m.get("building") or "UNKNOWN"
        groups.setdefault(key, []).append(m)
    return groups
