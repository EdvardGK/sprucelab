"""
Ingestion service for type_analysis() output.

Takes the dict from ifc_toolkit.analyze.type_analysis() and populates
ModelAnalysis, AnalysisStorey, AnalysisType, and AnalysisTypeStorey tables.
"""
from __future__ import annotations

import logging
from typing import Any

from django.db import transaction

from ..models import (
    ModelAnalysis, AnalysisStorey, AnalysisType, AnalysisTypeStorey,
)

logger = logging.getLogger(__name__)


@transaction.atomic
def ingest_type_analysis(model_id: str, data: dict[str, Any]) -> ModelAnalysis:
    """
    Write type_analysis() output to the analysis tables.

    Replaces any existing analysis for this model (cascade delete).

    Args:
        model_id: UUID of the Model instance.
        data: Output dict from ifc_toolkit.analyze.type_analysis().
              Keys: model_analysis, storeys, types.

    Returns:
        The created ModelAnalysis instance.
    """
    # Delete existing analysis (cascade handles storeys, types, type_storeys)
    ModelAnalysis.objects.filter(model_id=model_id).delete()

    ma_data = data["model_analysis"]

    # Create ModelAnalysis
    analysis = ModelAnalysis.objects.create(
        model_id=model_id,
        ifc_schema=ma_data.get("ifc_schema", ""),
        file_size_mb=ma_data.get("file_size_mb"),
        application=ma_data.get("application", ""),
        total_types=ma_data.get("total_types", 0),
        total_products=ma_data.get("total_products", 0),
        total_storeys=ma_data.get("total_storeys", 0),
        total_spaces=ma_data.get("total_spaces", 0),
        duplicate_guid_count=ma_data.get("duplicate_guid_count", 0),
        units=ma_data.get("units", {}),
        coordinates=ma_data.get("coordinates", {}),
        project_name=ma_data.get("project_name", ""),
        site_name=ma_data.get("site_name", ""),
        building_name=ma_data.get("building_name", ""),
    )

    # Create storeys (bulk)
    storey_by_name: dict[str, AnalysisStorey] = {}
    storey_objs = []
    for s in data.get("storeys", []):
        obj = AnalysisStorey(
            analysis=analysis,
            name=s["name"],
            elevation=s.get("elevation"),
            height=s.get("height"),
            element_count=s.get("element_count", 0),
        )
        storey_objs.append(obj)

    if storey_objs:
        created_storeys = AnalysisStorey.objects.bulk_create(storey_objs)
        for s in created_storeys:
            storey_by_name[s.name] = s

    # Create types + type_storeys
    type_objs = []
    type_storey_pairs: list[tuple[int, dict]] = []  # (index in type_objs, storey_dist entry)

    for i, t in enumerate(data.get("types", [])):
        obj = AnalysisType(
            analysis=analysis,
            type_class=t.get("type_class", ""),
            type_name=t.get("type_name"),
            element_class=t.get("element_class", ""),
            predefined_type=t.get("predefined_type"),
            instance_count=t.get("instance_count", 0),
            is_empty=t.get("is_empty", False),
            is_proxy=t.get("is_proxy", False),
            is_untyped=t.get("is_untyped", False),
            loadbearing_true=t.get("loadbearing_true", 0),
            loadbearing_false=t.get("loadbearing_false", 0),
            loadbearing_unset=t.get("loadbearing_unset", 0),
            is_external_true=t.get("is_external_true", 0),
            is_external_false=t.get("is_external_false", 0),
            is_external_unset=t.get("is_external_unset", 0),
            fire_rating_set=t.get("fire_rating_set", 0),
            fire_rating_unset=t.get("fire_rating_unset", 0),
            primary_representation=t.get("primary_representation", ""),
            mapped_item_count=t.get("mapped_item_count", 0),
            mapped_source_count=t.get("mapped_source_count", 0),
            reuse_ratio=t.get("reuse_ratio"),
        )
        type_objs.append(obj)

        for sd in t.get("storey_distribution", []):
            type_storey_pairs.append((i, sd))

    created_types = []
    if type_objs:
        created_types = AnalysisType.objects.bulk_create(type_objs)

    # Create type_storey cross-references
    ts_objs = []
    for type_idx, sd in type_storey_pairs:
        storey_name = sd.get("storey", "")
        storey_obj = storey_by_name.get(storey_name)
        if not storey_obj:
            continue
        ts_objs.append(AnalysisTypeStorey(
            analysis=analysis,
            type=created_types[type_idx],
            storey=storey_obj,
            instance_count=sd.get("count", 0),
        ))

    if ts_objs:
        AnalysisTypeStorey.objects.bulk_create(ts_objs)

    logger.info(
        "Ingested analysis for model %s: %d types, %d storeys, %d type-storey pairs",
        model_id, len(created_types), len(storey_by_name), len(ts_objs),
    )

    return analysis
