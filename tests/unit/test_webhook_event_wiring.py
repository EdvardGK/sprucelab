"""
Integration-style tests that pin where webhook events fire from.

Strategy: monkeypatch ``apps.automation.services.webhook_dispatcher.dispatch_event``
with a recording stub. Because every chokepoint imports the symbol lazily
(inside a try/except), patching the source module is enough to capture
calls from extraction code, the verification engine, and the IFC callback.

We do NOT exercise FastAPI here — IFCServiceClient is monkeypatched too,
so each chokepoint runs in a hermetic in-process flow.
"""
from __future__ import annotations

import json

import pytest


# IMPORTANT: do NOT import view modules at top of file. Importing
# ``apps.models.files_views`` (or anything that pulls DRF) before the
# autouse ``_open_permissions`` fixture runs forces DRF's
# ``APIView.authentication_classes`` / ``permission_classes`` to bind to
# the un-overridden settings, contaminating every later test in the
# session with 401s. Defer the import into the fixture / test bodies.


pytestmark = pytest.mark.django_db


@pytest.fixture
def project(db):
    from apps.projects.models import Project
    return Project.objects.create(name='wiring-test', description='pytest')


@pytest.fixture
def captured(monkeypatch):
    """Replace dispatch_event everywhere it is referenced and capture calls."""
    import apps.automation.services.webhook_dispatcher as webhook_dispatcher

    calls: list[tuple[str, dict, str | None]] = []

    def fake(event_type, payload, project_id=None):
        calls.append((event_type, payload, project_id))
        return []

    monkeypatch.setattr(webhook_dispatcher, 'dispatch_event', fake)
    return calls


def test_ifc_process_complete_fires_model_processed(client, project, captured, monkeypatch):
    from apps.models.models import Model, SourceFile
    # The view kicks a Celery task as the last thing it does (or falls back
    # to a daemon thread). Both can leak across tests, so stub them out.
    import apps.entities.tasks as entities_tasks

    class _FakeTask:
        @staticmethod
        def delay(*args, **kwargs):
            return None

        def __call__(self, *args, **kwargs):
            return None

    monkeypatch.setattr(
        entities_tasks, 'run_model_analysis_task', _FakeTask(), raising=False,
    )

    sf = SourceFile.objects.create(
        project=project, original_filename='walls.ifc', format='ifc',
        file_size=1, checksum_sha256='a' * 64,
    )
    model = Model.objects.create(
        project=project, name='walls',
        original_filename='walls.ifc',
        file_url='http://localhost/walls.ifc',
        file_size=1, checksum_sha256='a' * 64,
        version_number=1,
        source_file=sf,
        status='processing',
    )

    payload = {
        'model_id': str(model.id),
        'success': True,
        'status': 'parsed',
        'element_count': 42,
        'storey_count': 3,
        'system_count': 1,
        'type_count': 7,
        'ifc_schema': 'IFC4',
        'extraction_run_id': '00000000-0000-0000-0000-000000000000',
        'duration_seconds': 1.5,
    }
    resp = client.post(
        f'/api/models/{model.id}/process-complete/',
        data=json.dumps(payload),
        content_type='application/json',
    )
    assert resp.status_code == 200, resp.content

    events = [c for c in captured if c[0] == 'model.processed']
    assert len(events) == 1
    _, body, project_id = events[0]
    assert body['event'] == 'model.processed'
    assert body['model_id'] == str(model.id)
    assert body['format'] == 'ifc'
    assert body['stats']['element_count'] == 42
    assert body['stats']['type_count'] == 7
    assert project_id == str(project.id)


def test_drawing_dispatch_fires_model_processed(monkeypatch, project, captured):
    """DXF goes through ``_dispatch_drawing_extraction``; success path fires
    a single ``model.processed`` event."""
    import apps.models.files_views as files_views
    from apps.models.models import SourceFile
    sf = SourceFile.objects.create(
        project=project, original_filename='drawing.dxf', format='dxf',
        file_size=1, checksum_sha256='b' * 64,
    )

    # IFCServiceClient is constructed inside the dispatcher; replace its two
    # methods used along the success branch.
    monkeypatch.setattr(
        files_views.IFCServiceClient,
        'is_available',
        lambda self: True,
    )
    monkeypatch.setattr(
        files_views.IFCServiceClient,
        'extract_drawing',
        lambda self, file_url, fmt: {
            'success': True,
            'sheets': [
                {'page_index': 0, 'sheet_number': 'A-101', 'sheet_name': 'Plan'},
            ],
            'duration_seconds': 0.1,
            'log_entries': [],
            'quality_report': {'sheet_count': 1},
        },
    )

    viewset = files_views.SourceFileViewSet()
    run = viewset._dispatch_drawing_extraction(sf, 'http://localhost/drawing.dxf')
    assert run.status == 'completed'

    events = [c for c in captured if c[0] == 'model.processed']
    assert len(events) == 1
    body = events[0][1]
    assert body['format'] == 'dxf'
    assert body['source_file_id'] == str(sf.id)
    assert body['extraction_run_id'] == str(run.id)


def test_document_dispatch_fires_document_processed(monkeypatch, project, captured):
    import apps.models.files_views as files_views
    from apps.models.models import SourceFile
    sf = SourceFile.objects.create(
        project=project, original_filename='spec.docx', format='docx',
        file_size=1, checksum_sha256='c' * 64,
    )
    monkeypatch.setattr(
        files_views.IFCServiceClient,
        'is_available',
        lambda self: True,
    )
    monkeypatch.setattr(
        files_views.IFCServiceClient,
        'extract_document',
        lambda self, file_url, fmt: {
            'success': True,
            'documents': [
                {
                    'page_index': 0,
                    'is_document': True,
                    'markdown_content': '',
                    'extraction_method': 'structured',
                },
            ],
            'duration_seconds': 0.1,
            'log_entries': [],
            'quality_report': {'document_count': 1, 'document_pages': 1},
        },
    )
    monkeypatch.setattr(
        files_views.IFCServiceClient,
        'extract_claims',
        lambda self, markdown: {'claims': []},
    )

    viewset = files_views.SourceFileViewSet()
    run = viewset._dispatch_document_extraction(sf, 'http://localhost/spec.docx')
    assert run.status == 'completed'

    events = [c for c in captured if c[0] == 'document.processed']
    assert len(events) == 1
    body = events[0][1]
    assert body['format'] == 'docx'
    assert body['stats']['document_count'] == 1


def test_pdf_mixed_fires_both_roots(monkeypatch, project, captured):
    import apps.models.files_views as files_views
    from apps.models.models import SourceFile
    sf = SourceFile.objects.create(
        project=project, original_filename='mixed.pdf', format='pdf',
        file_size=1, checksum_sha256='d' * 64,
    )
    monkeypatch.setattr(
        files_views.IFCServiceClient,
        'is_available',
        lambda self: True,
    )
    monkeypatch.setattr(
        files_views.IFCServiceClient,
        'extract_drawing',
        lambda self, file_url, fmt: {
            'success': True,
            'sheets': [{'page_index': 0, 'sheet_number': 'A-1'}],
            'duration_seconds': 0.1,
            'log_entries': [],
            'quality_report': {'sheet_count': 1, 'drawing_pages': 1},
        },
    )
    monkeypatch.setattr(
        files_views.IFCServiceClient,
        'extract_document',
        lambda self, file_url, fmt: {
            'success': True,
            'documents': [
                {
                    'page_index': 1,
                    'is_document': True,
                    'markdown_content': '',
                    'extraction_method': 'structured',
                },
            ],
            'duration_seconds': 0.1,
            'log_entries': [],
            'quality_report': {'document_count': 1, 'document_pages': 1},
        },
    )
    monkeypatch.setattr(
        files_views.IFCServiceClient,
        'extract_claims',
        lambda self, markdown: {'claims': []},
    )

    viewset = files_views.SourceFileViewSet()
    run = viewset._dispatch_pdf_extraction(sf, 'http://localhost/mixed.pdf')
    assert run.status == 'completed'

    event_types = sorted(c[0] for c in captured)
    assert 'model.processed' in event_types
    assert 'document.processed' in event_types


def test_claim_extracted_fires_with_ids(monkeypatch, project, captured):
    import apps.models.files_views as files_views
    from apps.entities.models import Claim, DocumentContent
    from apps.models.models import ExtractionRun, SourceFile
    sf = SourceFile.objects.create(
        project=project, original_filename='spec.pdf', format='pdf',
        file_size=1, checksum_sha256='e' * 64,
    )
    run = ExtractionRun.objects.create(source_file=sf, status='running')
    doc = DocumentContent.objects.create(
        source_file=sf, extraction_run=run,
        page_index=0,
        markdown_content='Brannvegg skal ha minst EI 60.',
        extraction_method='structured',
    )

    monkeypatch.setattr(
        files_views.IFCServiceClient,
        'extract_claims',
        lambda self, markdown: {
            'claims': [
                {
                    'statement': 'Brannvegg skal ha minst EI 60.',
                    'normalized': {
                        'predicate': 'fire_resistance',
                        'subject': 'brannvegg',
                        'value': 'EI 60',
                    },
                    'claim_type': 'rule',
                    'confidence': 0.92,
                    'source_location': {},
                },
            ],
        },
    )

    total = files_views.SourceFileViewSet._extract_claims_from_documents(
        sf, run, [doc],
    )
    assert total == 1

    events = [c for c in captured if c[0] == 'claim.extracted']
    assert len(events) == 1
    body = events[0][1]
    assert body['claim_count'] == 1
    assert len(body['claim_ids']) == 1
    # Verify the ids point to the actual Claim row
    assert Claim.objects.filter(pk=body['claim_ids'][0]).exists()


def test_claim_extracted_skips_when_no_claims(monkeypatch, project, captured):
    import apps.models.files_views as files_views
    from apps.entities.models import DocumentContent
    from apps.models.models import ExtractionRun, SourceFile
    sf = SourceFile.objects.create(
        project=project, original_filename='spec.pdf', format='pdf',
        file_size=1, checksum_sha256='f' * 64,
    )
    run = ExtractionRun.objects.create(source_file=sf, status='running')
    doc = DocumentContent.objects.create(
        source_file=sf, extraction_run=run,
        page_index=0, markdown_content='Some narrative text.',
        extraction_method='structured',
    )
    monkeypatch.setattr(
        files_views.IFCServiceClient,
        'extract_claims',
        lambda self, markdown: {'claims': []},
    )
    total = files_views.SourceFileViewSet._extract_claims_from_documents(
        sf, run, [doc],
    )
    assert total == 0
    assert [c for c in captured if c[0] == 'claim.extracted'] == []


def test_verification_complete_fires(project, captured):
    from apps.entities.services.verification_engine import VerificationEngine
    from apps.models.models import Model, SourceFile
    sf = SourceFile.objects.create(
        project=project, original_filename='walls.ifc', format='ifc',
        file_size=1, checksum_sha256='9' * 64,
    )
    model = Model.objects.create(
        project=project, name='walls',
        original_filename='walls.ifc',
        file_url='http://localhost/walls.ifc',
        file_size=1, checksum_sha256='9' * 64,
        version_number=1,
        source_file=sf,
        status='ready',
    )
    # Engine handles zero-types case fine; we just need the call site to fire.
    result = VerificationEngine().verify_model(str(model.id))
    assert result.model_id == str(model.id)

    events = [c for c in captured if c[0] == 'verification.complete']
    assert len(events) == 1
    body = events[0][1]
    assert body['model_id'] == str(model.id)
    assert 'health_score' in body
    assert 'passed' in body and 'failed' in body
