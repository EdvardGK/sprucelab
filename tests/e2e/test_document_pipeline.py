"""
End-to-end: upload PDF / DOCX / XLSX through the universal /api/files/
endpoint, watch the orchestrator run the FastAPI document extractor and
land DocumentContent rows. Mirrors ``test_upload_pipeline.py`` shape.
"""
from __future__ import annotations

import time
from pathlib import Path

import pytest
import requests


pytestmark = [pytest.mark.django_db(transaction=True), pytest.mark.e2e]


def _wait_for_run(api_get, source_file_id: str, *, timeout_s: float = 60.0):
    deadline = time.time() + timeout_s
    runs = []
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
        if isinstance(body, dict) and 'results' in body:
            return body['results']
        return body

    return _get


def _upload(live_server, project, fixture_path: Path, mime: str) -> dict:
    with open(fixture_path, 'rb') as fh:
        resp = requests.post(
            f"{live_server.url}/api/files/",
            data={'project_id': str(project.id)},
            files={'file': (fixture_path.name, fh, mime)},
            timeout=30,
        )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_pdf_document_upload_creates_document_content(
    settings, live_server, fastapi_service, project, sample_pdf_document_path, api_get,
):
    """Dense A4 PDF -> document extractor lands one DocumentContent row."""
    settings.IFC_SERVICE_URL = fastapi_service['base_url']
    settings.IFC_SERVICE_API_KEY = 'test-key'

    body = _upload(live_server, project, Path(sample_pdf_document_path), 'application/pdf')
    assert body['format'] == 'pdf'
    sf_id = body['id']

    run = _wait_for_run(api_get, sf_id)
    assert run['status'] == 'completed', f"run failed: {run}"

    detail = requests.get(
        f"{live_server.url}/api/files/extractions/{run['id']}/", timeout=10,
    ).json()
    qr = detail['quality_report']
    # PDF dispatch runs both extractors -> drawing + document quality fields.
    assert qr.get('document_pages') == 1, qr
    assert qr.get('drawing_pages') == 0, qr
    assert qr.get('document_count') == 1, qr

    rows = api_get(f"/types/documents/?source_file={sf_id}")
    assert len(rows) == 1, rows
    assert rows[0]['format'] == 'pdf'
    assert rows[0]['extraction_method'] == 'text_layer'

    # /content/ returns the markdown body.
    content = requests.get(
        f"{live_server.url}/api/types/documents/{rows[0]['id']}/content/?as=markdown",
        timeout=10,
    ).json()
    assert 'Spesifikasjon REI60' in content['markdown']


def test_pdf_mixed_upload_creates_drawings_and_documents(
    settings, live_server, fastapi_service, project, sample_pdf_doc_and_drawing_path, api_get,
):
    """A PDF with one document page + one drawing page lands both kinds."""
    settings.IFC_SERVICE_URL = fastapi_service['base_url']
    settings.IFC_SERVICE_API_KEY = 'test-key'

    body = _upload(
        live_server, project, Path(sample_pdf_doc_and_drawing_path), 'application/pdf',
    )
    sf_id = body['id']
    run = _wait_for_run(api_get, sf_id)
    assert run['status'] == 'completed', f"run failed: {run}"

    detail = requests.get(
        f"{live_server.url}/api/files/extractions/{run['id']}/", timeout=10,
    ).json()
    qr = detail['quality_report']
    assert qr.get('sheet_count') == 2, qr  # drawing extractor saw 2 pages
    assert qr.get('document_pages') == 1, qr  # document extractor wrote 1 row

    drawings = api_get(f"/types/drawings/?source_file={sf_id}")
    assert {r['page_index'] for r in drawings} == {0, 1}

    documents = api_get(f"/types/documents/?source_file={sf_id}")
    assert len(documents) == 1
    assert documents[0]['page_index'] == 0


def test_docx_upload_creates_document_content(
    settings, live_server, fastapi_service, project, sample_docx_path, api_get,
):
    """DOCX upload -> structured extraction with markdown body."""
    settings.IFC_SERVICE_URL = fastapi_service['base_url']
    settings.IFC_SERVICE_API_KEY = 'test-key'

    body = _upload(
        live_server, project, Path(sample_docx_path),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    assert body['format'] == 'docx'
    sf_id = body['id']

    run = _wait_for_run(api_get, sf_id)
    assert run['status'] == 'completed', f"run failed: {run}"

    rows = api_get(f"/types/documents/?source_file={sf_id}")
    assert len(rows) == 1
    detail = requests.get(
        f"{live_server.url}/api/types/documents/{rows[0]['id']}/", timeout=10,
    ).json()
    assert '# Project Specification' in detail['markdown_content']
    assert detail['extraction_method'] == 'structured'


def test_xlsx_upload_creates_typed_structured_data(
    settings, live_server, fastapi_service, project, sample_xlsx_path, api_get,
):
    """XLSX upload -> structured_data with sheets/columns/types preserved."""
    settings.IFC_SERVICE_URL = fastapi_service['base_url']
    settings.IFC_SERVICE_API_KEY = 'test-key'

    body = _upload(
        live_server, project, Path(sample_xlsx_path),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    assert body['format'] == 'xlsx'
    sf_id = body['id']

    run = _wait_for_run(api_get, sf_id)
    assert run['status'] == 'completed', f"run failed: {run}"

    rows = api_get(f"/types/documents/?source_file={sf_id}")
    detail = requests.get(
        f"{live_server.url}/api/types/documents/{rows[0]['id']}/", timeout=10,
    ).json()
    sheets = detail['structured_data']['sheets']
    by_name = {s['name']: s for s in sheets}
    assert by_name['Quantities']['types'] == ['string', 'number', 'number', 'boolean']
    # numeric values survive the round-trip
    assert by_name['Quantities']['rows'][0][1] == 42


def test_universal_search_returns_pdf_match(
    settings, live_server, fastapi_service, project, sample_pdf_document_path, api_get,
):
    """After uploading a doc, /api/projects/{id}/search/?q= returns it."""
    settings.IFC_SERVICE_URL = fastapi_service['base_url']
    settings.IFC_SERVICE_API_KEY = 'test-key'

    _upload(live_server, project, Path(sample_pdf_document_path), 'application/pdf')

    sf_id = api_get(f"/files/?project={project.id}")[0]['id']
    _wait_for_run(api_get, sf_id)

    resp = requests.get(
        f"{live_server.url}/api/projects/{project.id}/search/?q=REI60",
        timeout=10,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body['count'] >= 1
    hit = body['results'][0]
    assert hit['format'] == 'pdf'
    assert hit['relevance'] >= 1
    assert 'rei60' in hit['snippet'].lower()
