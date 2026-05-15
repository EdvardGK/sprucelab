"""ifcfast-backed quick-stats accelerator.

Optional fast path for ``IFCParserService.quick_stats``. When the env var
``SPRUCELAB_PARSER=ifcfast`` is set, the parser dispatches here instead of
calling ``ifcopenshell.open`` directly. End-to-end measured speedup on
2026-05-15 against ifcopenshell 0.8.4.post1 on three production IFCs:
3.9-4.8x on 40 MB files (cold parse), 21x on 380 MB, and 71-362x on warm
cache hits (ifcfast persists a tier-1 index between processes).

The full type extraction path (``parse_types_only``) still uses
ifcopenshell. ifcfast tier-2 (full pset/quantity coverage parity) is on the
ifcfast roadmap; until then we keep ifcopenshell as the canonical extractor.

ifcfast 0.1.0 API contract (relevant here):
- ``model.storeys``: ``list[StoreyRow]`` (always populated).
- ``model.type_counts``: ``dict[str, int]`` of class -> instance count
  (pre-aggregated; equivalent to ``by_type("IfcProduct")`` walk).
- ``model.types()``, ``model.materials()``: lazy DataFrames, callable.
- ``model.products`` is ``list[ProductRow]`` on cold parse, empty on
  cache hit; ``model.products_df`` is the always-populated DataFrame.
  We avoid both by reading the pre-aggregated ``type_counts``.

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
        stats.ifc_schema = getattr(model, "schema", "") or ""
        stats.file_size_bytes = (
            os.path.getsize(file_path) if os.path.exists(file_path) else 0
        )

        # Storeys: model.storeys is list[StoreyRow] (always populated, both
        # cold parse and cache hit). Each row exposes .guid/.name/.elevation.
        storey_names: list[str] = []
        for i, row in enumerate(model.storeys):
            name = getattr(row, "name", None) or f"Storey #{i + 1}"
            storey_names.append(str(name))
        stats.storey_count = len(model.storeys)
        stats.storey_names = storey_names

        # IfcTypeObject and IfcMaterial counts are NOT comparable to
        # ifcopenshell's by_type() semantics from the tier-1 index:
        #   - model.types() returns {class_name: instance_count} — the
        #     same data as type_counts, not IfcTypeObject definitions.
        #   - model.materials is a per-element-assignment DataFrame; its
        #     distinct material_name count differs from the IfcMaterial
        #     entity count. Until ifcfast surfaces these tier-2 layers,
        #     report 0 so the QuickStats contract isn't misleading. The
        #     viewer / extraction path still runs ifcopenshell for the
        #     authoritative IfcType / IfcMaterial extraction.
        stats.type_count = 0
        stats.material_count = 0

        # Top-N entity types + total elements. ifcfast pre-aggregates
        # class -> instance count in model.type_counts (dict), which gives
        # the same answer as ifcopenshell's by_type("IfcProduct") walk
        # without iterating products_df. Verified parity on Sannergata_RIE
        # (16549), 3D modell_HI90 (41707), Sannergata_bygg_ARK_I (25370).
        type_counts_raw = dict(getattr(model, "type_counts", {}) or {})
        type_counts = {
            cls: int(cnt)
            for cls, cnt in type_counts_raw.items()
            if cls not in _NON_ELEMENT_CATEGORIES
        }
        stats.total_elements = sum(type_counts.values())
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
