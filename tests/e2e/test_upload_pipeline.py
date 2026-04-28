"""
End-to-end: upload an IFC, watch the orchestrator land a SourceFile and a
completed ExtractionRun.

Boots a real FastAPI subprocess (see conftest.fastapi_service) so the round
trip exercises the actual HTTP path Django uses in production.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import pytest
import requests


pytestmark = [pytest.mark.django_db(transaction=True), pytest.mark.e2e]


def _wait_for_run(api_get, source_file_id: str, *, timeout_s: float = 60.0):
    """Poll /api/files/<id>/extractions/ until the run leaves pending/running."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        runs = api_get(f"/files/{source_file_id}/extractions/")
        if runs and runs[0]['status'] in ('completed', 'failed'):
            return runs[0]
        time.sleep(0.5)
    raise AssertionError(f"ExtractionRun did not finish within {timeout_s}s; last={runs!r}")


@pytest.fixture
def api_get(live_server):
    base = live_server.url
    def _get(path: str):
        r = requests.get(f"{base}/api{path}", timeout=10)
        r.raise_for_status()
        body = r.json()
        # DRF list endpoints return {results: [...]}; collection of bare lists too.
        if isinstance(body, dict) and 'results' in body:
            return body['results']
        return body
    return _get


def test_universal_upload_creates_source_file_and_extraction_run(
    settings, live_server, fastapi_service, project, sample_ifc_path, api_get
):
    """
    POST /api/files/ -> SourceFile + ExtractionRun, run finishes 'completed',
    quality_report has the Phase 1 fields populated.
    """
    settings.IFC_SERVICE_URL = fastapi_service['base_url']
    settings.IFC_SERVICE_API_KEY = 'test-key'

    with open(sample_ifc_path, 'rb') as fh:
        resp = requests.post(
            f"{live_server.url}/api/files/",
            data={'project_id': str(project.id)},
            files={'file': (Path(sample_ifc_path).name, fh, 'application/ifc')},
            timeout=30,
        )
    assert resp.status_code == 201, resp.text
    body = resp.json()

    sf_id = body['id']
    assert body['format'] == 'ifc'
    assert body['original_filename'].endswith('.ifc')
    assert len(body['checksum_sha256']) == 64  # sha256 hex
    assert body['extraction_run'] is not None
    assert body['extraction_run']['status'] in ('pending', 'running', 'completed')

    # Wait for the orchestrator to finish.
    run = _wait_for_run(api_get, sf_id)
    assert run['status'] == 'completed', f"run failed: {run}"

    # Detail view exposes log_entries + quality_report.
    runs_full = api_get(f"/files/extractions/?source_file={sf_id}")
    assert len(runs_full) == 1

    detail = requests.get(
        f"{live_server.url}/api/files/extractions/{run['id']}/", timeout=10
    ).json()
    qr = detail['quality_report']
    assert qr.get('processing_mode') == 'types_only'
    # Synthetic IFC has 2 declared types + 1 untyped proxy.
    assert qr.get('type_count', 0) >= 2
    assert detail['log_entries'], "Phase 1 should have produced log entries"

    # Re-extract -> a second run is created.
    re = requests.post(
        f"{live_server.url}/api/files/{sf_id}/reprocess/", timeout=10
    )
    assert re.status_code == 202
    runs_after = api_get(f"/files/{sf_id}/extractions/")
    assert len(runs_after) == 2


def test_legacy_models_upload_still_creates_source_file(
    settings, live_server, fastapi_service, project, sample_ifc_path, api_get
):
    """
    /api/models/upload/ predates SourceFile; it must now create one under the
    hood and the resulting Model.source_file FK must be populated.
    """
    settings.IFC_SERVICE_URL = fastapi_service['base_url']
    settings.IFC_SERVICE_API_KEY = 'test-key'

    with open(sample_ifc_path, 'rb') as fh:
        resp = requests.post(
            f"{live_server.url}/api/models/upload/",
            data={'project_id': str(project.id), 'name': 'legacy-upload'},
            files={'file': (Path(sample_ifc_path).name, fh, 'application/ifc')},
            timeout=30,
        )
    assert resp.status_code == 201, resp.text

    # Source file appears in /api/files/.
    files = api_get(f"/files/?project={project.id}")
    assert any(f['format'] == 'ifc' for f in files)
    sf_id = files[0]['id']

    # Wait for extraction completion.
    run = _wait_for_run(api_get, sf_id)
    assert run['status'] == 'completed'

    # The flat extractions endpoint surfaces the same run.
    flat = api_get(f"/files/extractions/?source_file={sf_id}")
    assert any(r['id'] == run['id'] for r in flat), 'flat extractions endpoint should expose the run'


def test_dedup_same_bytes_into_same_project(
    settings, live_server, fastapi_service, project, sample_ifc_path
):
    """
    Two uploads of the same IFC bytes into the same project share one
    SourceFile (dedup on (project, checksum)).
    """
    settings.IFC_SERVICE_URL = fastapi_service['base_url']
    settings.IFC_SERVICE_API_KEY = 'test-key'

    def _post():
        with open(sample_ifc_path, 'rb') as fh:
            return requests.post(
                f"{live_server.url}/api/files/",
                data={'project_id': str(project.id)},
                files={'file': (Path(sample_ifc_path).name, fh, 'application/ifc')},
                timeout=30,
            )

    a = _post().json()
    b = _post().json()
    assert a['id'] == b['id'], "same bytes -> same SourceFile"
    assert a['version_number'] == b['version_number'] == 1
