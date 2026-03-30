"""
Celery tasks for entity-related background processing.
"""
import logging
import os
import tempfile
import traceback
import urllib.parse

from celery import shared_task
from django.conf import settings

logger = logging.getLogger(__name__)


def _resolve_ifc_path(file_url: str) -> tuple[str, bool]:
    """
    Resolve a model's file_url to a local file path.

    Returns (local_path, is_temp) — caller must clean up temp files.
    """
    import requests as req

    parsed = urllib.parse.urlparse(file_url)

    if not parsed.scheme or parsed.scheme == 'file':
        return file_url, False

    if parsed.scheme in ('http', 'https') and 'media/' in parsed.path:
        media_rel = parsed.path.split('media/', 1)[1]
        return str(settings.MEDIA_ROOT / media_rel), False

    # Remote URL (Supabase etc): download to temp file
    resp = req.get(file_url, timeout=120)
    resp.raise_for_status()
    suffix = '.ifczip' if file_url.lower().endswith('.ifczip') else '.ifc'
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    tmp.write(resp.content)
    tmp.close()
    return tmp.name, True


@shared_task(bind=True, name='apps.entities.tasks.run_model_analysis_task', max_retries=1)
def run_model_analysis_task(self, model_id: str):
    """
    Run type_analysis on a model's IFC file and store results.

    Auto-triggered after model processing completes (process_complete callback).
    Can also be triggered manually or retried.
    """
    from apps.models.models import Model as BIMModel
    from .services.analysis_ingestion import ingest_type_analysis

    temp_path = None

    try:
        model = BIMModel.objects.get(id=model_id)

        if not model.file_url:
            logger.warning("Model %s has no file_url, skipping analysis", model_id)
            return {'status': 'skipped', 'reason': 'no_file_url'}

        # Resolve file path
        file_path, is_temp = _resolve_ifc_path(model.file_url)
        if is_temp:
            temp_path = file_path

        logger.info("Running type_analysis for model %s (%s)", model.name, model_id)

        from ifc_toolkit.analyze import type_analysis
        data = type_analysis(file_path)
        analysis = ingest_type_analysis(str(model_id), data)

        logger.info(
            "Analysis complete for %s: %d types, %d storeys",
            model.name, analysis.total_types, analysis.total_storeys,
        )

        return {
            'status': 'success',
            'model_id': str(model_id),
            'total_types': analysis.total_types,
            'total_storeys': analysis.total_storeys,
        }

    except Exception as e:
        logger.error("Analysis failed for model %s: %s\n%s", model_id, e, traceback.format_exc())

        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=30)

        return {'status': 'error', 'error': str(e)}

    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except Exception:
                pass
