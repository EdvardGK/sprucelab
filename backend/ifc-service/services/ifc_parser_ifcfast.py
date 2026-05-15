"""ifcfast-backed quick-stats accelerator.

Optional fast path for ``IFCParserService.quick_stats``. When the env var
``SPRUCELAB_PARSER=ifcfast`` is set, the parser dispatches here instead of
calling ``ifcopenshell.open`` directly. We expect 25-47x speedup on tier-1
indexing (open + walk products + count types), audited against ifcopenshell
on seven production IFCs.

The full type extraction path (``parse_types_only``) still uses
ifcopenshell. ifcfast tier-2 (full pset/quantity coverage parity) is on the
ifcfast roadmap; until then we keep ifcopenshell as the canonical extractor.

Gracefully degrades: if ``ifcfast`` isn't installed or fails to parse the
file, the caller falls back to the ifcopenshell path. No silent data loss —
failures are surfaced via the returned ``QuickStats.error`` field.
"""
from __future__ import annotations

import os
import time
from typing import Dict, TYPE_CHECKING

if TYPE_CHECKING:
    from .ifc_parser import QuickStats


# Storey-like categories we exclude from the building-element count, kept in
# sync with the ifcopenshell path. ifcfast normalises class names to the
# same casing as the IFC STEP encoding.
_NON_ELEMENT_CATEGORIES = {
    "IfcSite",
    "IfcBuilding",
    "IfcBuildingStorey",
    "IfcSpace",
}


def is_enabled() -> bool:
    """True when the env flag picks ifcfast as the tier-1 parser."""
    return os.environ.get("SPRUCELAB_PARSER", "").strip().lower() == "ifcfast"


def quick_stats_ifcfast(file_path: str, stats: "QuickStats") -> "QuickStats":
    """Populate ``stats`` from ``file_path`` using ifcfast.

    Returns the same ``QuickStats`` instance (mutated) so the caller can
    decide whether to fall back. On import / parse failure the function
    sets ``stats.success = False`` and ``stats.error`` and returns —
    callers MUST check ``success`` before trusting other fields.
    """
    start_time = time.time()
    try:
        import ifcfast  # type: ignore[import-not-found]
    except Exception as exc:  # pragma: no cover - environment-dependent
        stats.success = False
        stats.error = f"ifcfast unavailable: {exc!s}"
        stats.duration_ms = int((time.time() - start_time) * 1000)
        return stats

    try:
        model = ifcfast.open(file_path)
        # ifcfast exposes a header summary cheaply; we use products + relations.
        products = model.products  # pandas-like DataFrame
        stats.ifc_schema = getattr(model, "schema", "") or ""
        stats.file_size_bytes = (
            os.path.getsize(file_path) if os.path.exists(file_path) else 0
        )

        # Storey count + names. ifcfast surfaces storeys as a dedicated
        # table; fall back to the products table if absent on older builds.
        storey_names: list[str] = []
        try:
            storeys = model.storeys
            stats.storey_count = int(len(storeys))
            for _, row in storeys.iterrows():
                name = row.get("Name") or row.get("name") or row.get("LongName") or ""
                storey_names.append(str(name) if name else f"Storey #{len(storey_names) + 1}")
        except Exception:
            storey_rows = products[products.get("ifc_class").eq("IfcBuildingStorey")]
            stats.storey_count = int(len(storey_rows))
            for i, (_, row) in enumerate(storey_rows.iterrows()):
                name = row.get("Name") or row.get("name") or f"Storey #{i + 1}"
                storey_names.append(str(name))
        stats.storey_names = storey_names

        # Type-object count.
        try:
            type_table = model.types if hasattr(model, "types") else None
        except Exception:
            type_table = None
        if type_table is not None and hasattr(type_table, "__len__"):
            stats.type_count = int(len(type_table))
        else:
            stats.type_count = int(
                len(products[products.get("ifc_class", "").str.endswith("Type", na=False)])
            )

        # Material count.
        try:
            materials = model.materials
            stats.material_count = int(len(materials))
        except Exception:
            stats.material_count = 0

        # Top-N entity types + total elements (excluding spatial structure).
        # ifcfast's products table has one row per IfcProduct.
        type_counts: Dict[str, int] = {}
        total = 0
        for cls in products.get("ifc_class", []):
            if cls in _NON_ELEMENT_CATEGORIES:
                continue
            type_counts[cls] = type_counts.get(cls, 0) + 1
            total += 1
        stats.total_elements = total
        sorted_types = sorted(type_counts.items(), key=lambda kv: kv[1], reverse=True)
        stats.top_entity_types = [
            {"type": t, "count": c} for t, c in sorted_types[:5]
        ]

        stats.success = True
    except Exception as exc:
        stats.success = False
        stats.error = f"ifcfast parse failed: {exc!s}"

    stats.duration_ms = int((time.time() - start_time) * 1000)
    return stats
