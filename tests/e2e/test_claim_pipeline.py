"""
End-to-end: upload a claim-rich PDF, watch claims land in the inbox, then
promote one and assert the promotion lands in ProjectConfig.

The test exercises every Sprint 6.2 surface in one round-trip:
  - Django dispatch runs the FastAPI document extractor + claim extractor
  - DocumentContent + Claim rows persist with the right provenance
  - ?dry_run=true returns the would-be diff WITHOUT persisting
  - POST /promote/ writes into ProjectConfig.config['claim_derived_rules']
  - The Claim's status flips to 'promoted' with derived_from_claim back-link

Mirrors the e2e patterns from ``test_upload_pipeline.py`` and
``test_document_pipeline.py``.
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


def test_pdf_upload_extracts_and_promotes_claim(
    settings, live_server, fastapi_service, project, sample_pdf_claim_corpus_path, api_get,
):
    """End-to-end kill-dead-docs slice: upload, extract claims, promote one."""
    settings.IFC_SERVICE_URL = fastapi_service['base_url']
    settings.IFC_SERVICE_API_KEY = 'test-key'

    # 1. Upload the claim-rich PDF
    with open(sample_pdf_claim_corpus_path, 'rb') as fh:
        resp = requests.post(
            f"{live_server.url}/api/files/",
            data={'project_id': str(project.id)},
            files={'file': (Path(sample_pdf_claim_corpus_path).name, fh, 'application/pdf')},
            timeout=30,
        )
    assert resp.status_code == 201, resp.text
    sf_id = resp.json()['id']

    # 2. Wait for the extraction run to complete and surface a claim_count
    run = _wait_for_run(api_get, sf_id)
    assert run['status'] == 'completed', f"run failed: {run}"

    detail = requests.get(
        f"{live_server.url}/api/files/extractions/{run['id']}/", timeout=10,
    ).json()
    qr = detail['quality_report']
    assert qr.get('claim_count', 0) > 0, qr

    # 3. List unresolved claims for this project — should include several
    claims = api_get(f"/types/claims/?project={project.id}&status=unresolved")
    assert len(claims) > 0
    fire_claim = next(
        (c for c in claims
         if c['normalized'].get('predicate') == 'fire_resistance_class'),
        None,
    )
    assert fire_claim is not None, f'expected a fire_resistance_class claim in {claims!r}'
    claim_id = fire_claim['id']

    # 4. dry_run=true returns the would-be diff without persisting
    dry = requests.post(
        f"{live_server.url}/api/types/claims/{claim_id}/promote/?dry_run=true",
        json={},
        timeout=10,
    )
    assert dry.status_code == 200, dry.text
    dry_body = dry.json()
    assert dry_body['dry_run'] is True
    assert dry_body['would_set_status'] == 'promoted'
    assert dry_body['rule_entry']['_claim_id'] == claim_id

    # Claim still unresolved after the dry-run.
    detail_after_dry = requests.get(
        f"{live_server.url}/api/types/claims/{claim_id}/", timeout=10,
    ).json()
    assert detail_after_dry['status'] == 'unresolved'

    # 5. Real promote — writes the rule into ProjectConfig.config
    real = requests.post(
        f"{live_server.url}/api/types/claims/{claim_id}/promote/",
        json={},
        timeout=10,
    )
    assert real.status_code == 200, real.text
    real_body = real.json()
    assert real_body['dry_run'] is False
    assert real_body['status'] == 'promoted'
    assert real_body['config_section'] == 'claim_derived_rules'

    # 6. Claim now reads back as promoted with derived_from_claim provenance
    detail_after_promote = requests.get(
        f"{live_server.url}/api/types/claims/{claim_id}/", timeout=10,
    ).json()
    assert detail_after_promote['status'] == 'promoted'
    assert detail_after_promote['promoted_to_config'] == real_body['config_id']
    assert detail_after_promote['config_payload']['_claim_id'] == claim_id

    # 7. Re-promotion of the same claim is now a 409 (state machine enforced)
    dup = requests.post(
        f"{live_server.url}/api/types/claims/{claim_id}/promote/",
        json={},
        timeout=10,
    )
    assert dup.status_code == 409, dup.text


def test_reject_and_supersede_endpoints(
    settings, live_server, fastapi_service, project, sample_pdf_claim_corpus_path, api_get,
):
    """Smoke-test the reject and supersede endpoints land on real claims."""
    settings.IFC_SERVICE_URL = fastapi_service['base_url']
    settings.IFC_SERVICE_API_KEY = 'test-key'

    with open(sample_pdf_claim_corpus_path, 'rb') as fh:
        requests.post(
            f"{live_server.url}/api/files/",
            data={'project_id': str(project.id)},
            files={'file': (Path(sample_pdf_claim_corpus_path).name, fh, 'application/pdf')},
            timeout=30,
        )
    sf_id = api_get(f"/files/?project={project.id}")[0]['id']
    _wait_for_run(api_get, sf_id)

    claims = api_get(f"/types/claims/?project={project.id}&status=unresolved")
    assert len(claims) >= 2

    # Reject one with a reason.
    target = claims[0]
    rej = requests.post(
        f"{live_server.url}/api/types/claims/{target['id']}/reject/",
        json={'reason': 'Out of project scope'},
        timeout=10,
    )
    assert rej.status_code == 200, rej.text
    assert rej.json()['status'] == 'rejected'

    # Reject without a reason -> 409 (service raises ClaimStateError).
    blank = requests.post(
        f"{live_server.url}/api/types/claims/{claims[1]['id']}/reject/",
        json={'reason': '   '},
        timeout=10,
    )
    assert blank.status_code == 409, blank.text

    # Supersede with a real newer claim id from the same project.
    older = claims[1]
    newer = next(c for c in claims if c['id'] != older['id'])
    sup = requests.post(
        f"{live_server.url}/api/types/claims/{older['id']}/supersede/",
        json={'superseded_by_claim_id': newer['id']},
        timeout=10,
    )
    assert sup.status_code == 200, sup.text
    assert sup.json()['status'] == 'superseded'

    # The older claim now reads as superseded.
    older_detail = requests.get(
        f"{live_server.url}/api/types/claims/{older['id']}/", timeout=10,
    ).json()
    assert older_detail['status'] == 'superseded'
    assert older_detail['superseded_by'] == newer['id']
