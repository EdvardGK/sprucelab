"""Core IFC operations: open files.

For unit detection, use ifcopenshell.util.unit.calculate_unit_scale(ifc) directly.
For properties, use ifcopenshell.util.element.get_psets(element).
For materials, use ifcopenshell.util.element.get_materials(element).
"""

from pathlib import Path

import ifcopenshell


def open_ifc(path: str | Path) -> ifcopenshell.file:
    """Open an IFC or IFCzip file.

    Args:
        path: Path to .ifc or .ifczip file.

    Returns:
        Parsed IFC file object.

    Raises:
        FileNotFoundError: If file does not exist.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"IFC file not found: {path}")
    return ifcopenshell.open(str(path))
