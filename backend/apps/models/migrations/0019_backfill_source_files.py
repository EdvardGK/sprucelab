"""
Phase 2 backfill: synthesize a SourceFile for every existing Model and an
ExtractionRun for every existing ProcessingReport.

This is the bridge from the old IFC-only schema to the layered file/extraction
foundation. ProcessingReport rows are preserved; the legacy table stays around
for one cycle so the dev page keeps working through the compat shim.

Reverse: noop. Backfill data is derivable from the originals on re-up.
"""
from __future__ import annotations

from django.db import migrations


# --- Format detection ------------------------------------------------------

def _detect_format(filename: str) -> str:
    if not filename:
        return "other"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    known = {
        "ifc", "las", "laz", "e57", "dwg", "dxf", "pdf", "docx", "xlsx",
        "pptx", "csv", "json", "xml", "svg",
    }
    return ext if ext in known else "other"


# --- Migration -------------------------------------------------------------

def forwards(apps, schema_editor):
    Model = apps.get_model("models", "Model")
    SourceFile = apps.get_model("models", "SourceFile")
    ExtractionRun = apps.get_model("models", "ExtractionRun")

    # ProcessingReport lives in the entities app and may be empty / absent in
    # fresh DBs. Use try/get_model so this migration is safe on both prod
    # (with thousands of reports) and a test DB (with none).
    try:
        ProcessingReport = apps.get_model("entities", "ProcessingReport")
    except LookupError:
        ProcessingReport = None

    # ---- Pass 1: create a SourceFile for every Model. -----------------
    # We deliberately do NOT dedup on (project, checksum) here — even if the
    # bytes are identical, separate Models historically tracked separate
    # uploads, and we want a stable 1:1 link. New uploads will dedup going
    # forward via the upload view.
    model_to_sf = {}
    for m in Model.objects.all().order_by("created_at"):
        sf = SourceFile.objects.create(
            project_id=m.project_id,
            original_filename=m.original_filename or f"{m.name}.ifc",
            file_url=m.file_url,
            file_size=m.file_size or 0,
            checksum_sha256=m.checksum_sha256 or "",
            format=_detect_format(m.original_filename or ""),
            mime_type="",
            version_number=m.version_number or 1,
            is_current=bool(getattr(m, "is_published", False)) or m.version_number == 1,
            uploaded_by_id=m.uploaded_by_id,
        )
        # Preserve the upload moment so the SourceFile row reads sensibly.
        SourceFile.objects.filter(pk=sf.pk).update(uploaded_at=m.created_at)
        model_to_sf[m.pk] = sf.pk

    # ---- Pass 2: link parent_file via Model.parent_model. -------------
    for m in Model.objects.exclude(parent_model__isnull=True):
        sf_id = model_to_sf.get(m.pk)
        parent_sf_id = model_to_sf.get(m.parent_model_id)
        if sf_id and parent_sf_id:
            SourceFile.objects.filter(pk=sf_id).update(parent_file_id=parent_sf_id)

    # ---- Pass 3: attach Model.source_file. ----------------------------
    for model_pk, sf_pk in model_to_sf.items():
        Model.objects.filter(pk=model_pk).update(source_file_id=sf_pk)

    # ---- Pass 4: ProcessingReport -> ExtractionRun. -------------------
    if ProcessingReport is None:
        return

    for r in ProcessingReport.objects.all().iterator(chunk_size=500):
        sf_id = model_to_sf.get(r.model_id)
        if not sf_id:
            # Orphan report (model was deleted) — skip.
            continue

        if r.catastrophic_failure:
            status = "failed"
        elif r.overall_status == "failed":
            status = "failed"
        else:
            # 'success' and 'partial' both land in completed; partials show up
            # in quality_report.
            status = "completed"

        # Fold ProcessingReport's verification_data + file/schema metadata
        # into the unified quality_report shape.
        quality_report = dict(r.verification_data or {})
        quality_report.setdefault("file_size_bytes", r.file_size_bytes or 0)
        if r.ifc_schema:
            quality_report.setdefault("ifc_schema", r.ifc_schema)
        quality_report.setdefault("total_entities_processed", r.total_entities_processed or 0)
        quality_report.setdefault("total_entities_skipped", r.total_entities_skipped or 0)
        quality_report.setdefault("total_entities_failed", r.total_entities_failed or 0)

        error_parts = []
        if r.failure_exception:
            error_parts.append(r.failure_exception)
        if r.errors:
            error_parts.append(f"{len(r.errors)} stage error(s)")
        error_message = "\n".join(error_parts) if error_parts else None

        ExtractionRun.objects.create(
            source_file_id=sf_id,
            status=status,
            completed_at=r.completed_at,
            duration_seconds=r.duration_seconds,
            discovered_crs=None,
            crs_source=None,
            crs_confidence=None,
            discovered_units={},
            quality_report=quality_report,
            log_entries=r.stage_results or [],
            error_message=error_message,
            extractor_version="ifc-service@legacy",
            task_id=None,
        )
        ExtractionRun.objects.filter(
            source_file_id=sf_id, started_at__isnull=False,
        ).order_by("-started_at").first()
        # Pin started_at to the original report timestamp.
        latest = ExtractionRun.objects.filter(
            source_file_id=sf_id
        ).order_by("-started_at").first()
        if latest and r.started_at:
            ExtractionRun.objects.filter(pk=latest.pk).update(started_at=r.started_at)


def reverse(apps, schema_editor):
    """Backfill is recoverable from the source rows; reverse is a noop."""
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("models", "0018_create_source_file_and_extraction_run"),
        ("entities", "0033_typed_property_values"),
    ]

    operations = [
        migrations.RunPython(forwards, reverse),
    ]
