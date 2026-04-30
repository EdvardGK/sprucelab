"""
ViewSets for the universal file layer (Layer 0 / Layer 1).

- SourceFileViewSet exposes /api/files/ — list, upload, detail, reprocess.
- ExtractionRunViewSet exposes /api/files/extractions/ — read-only access for
  agent / dashboard consumption (also available nested via the source-file
  detail action).

For now the universal upload only handles IFC (delegates to the same FastAPI
extractor the legacy /api/models/upload/ uses). Future formats hook in here.
"""
from __future__ import annotations

import hashlib
import logging
import os
from pathlib import Path

from django.conf import settings
from django.core.files.storage import default_storage
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.projects.models import Project

from .models import ExtractionRun, Model, SourceFile
from .serializers import (
    ExtractionRunListSerializer,
    ExtractionRunSerializer,
    SourceFileListSerializer,
    SourceFileSerializer,
    SourceFileUploadSerializer,
)
from .services.fastapi_client import IFCServiceClient

logger = logging.getLogger(__name__)


def _fire_event(event_type: str, payload: dict, project_id: str | None) -> None:
    """
    Fire-and-forget webhook dispatch. Imported lazily so circular import
    issues during app startup never break the extraction flow, and wrapped
    in try/except so a dispatcher bug never propagates into extraction.
    """
    try:
        from apps.automation.services.webhook_dispatcher import dispatch_event
        dispatch_event(event_type, payload, project_id=project_id)
    except Exception:
        logger.exception('webhook dispatch (%s) failed', event_type)


def store_uploaded_file(project: Project, uploaded_file) -> tuple[str, str, str, int]:
    """
    Persist an upload to storage and compute its checksum.

    Returns (storage_path, file_url, checksum_sha256, file_size).
    """
    storage_path = f"source_files/{project.id}/{uploaded_file.name}"
    uploaded_file.seek(0)
    saved_path = default_storage.save(storage_path, uploaded_file)
    file_url = default_storage.url(saved_path)
    if file_url.startswith('/'):
        file_url = f"{settings.DJANGO_URL}{file_url}"

    uploaded_file.seek(0)
    sha = hashlib.sha256()
    for chunk in uploaded_file.chunks():
        sha.update(chunk)
    checksum = sha.hexdigest()

    return saved_path, file_url, checksum, uploaded_file.size


def get_or_create_source_file(
    *,
    project: Project,
    original_filename: str,
    file_url: str,
    file_size: int,
    checksum: str,
    uploaded_by,
    mime_type: str = "",
) -> SourceFile:
    """
    Dedup on (project, checksum). Returns the existing SourceFile if the same
    bytes already exist in the project; otherwise creates a new one.

    Versioning: a NEW upload of the same filename with different bytes bumps
    version_number, marks previous versions is_current=False.
    """
    if checksum:
        existing = SourceFile.objects.filter(
            project=project, checksum_sha256=checksum
        ).order_by('-version_number').first()
        if existing:
            return existing

    fmt = SourceFile.detect_format(original_filename)

    # Find latest version for this filename (regardless of bytes) to bump the
    # version chain.
    latest_named = SourceFile.objects.filter(
        project=project, original_filename=original_filename,
    ).order_by('-version_number').first()

    if latest_named:
        SourceFile.objects.filter(
            project=project, original_filename=original_filename,
        ).update(is_current=False)
        version_number = latest_named.version_number + 1
        parent_file = latest_named
    else:
        version_number = 1
        parent_file = None

    return SourceFile.objects.create(
        project=project,
        original_filename=original_filename,
        file_url=file_url,
        file_size=file_size,
        checksum_sha256=checksum,
        format=fmt,
        mime_type=mime_type,
        version_number=version_number,
        parent_file=parent_file,
        is_current=True,
        uploaded_by=uploaded_by,
    )


class SourceFileViewSet(viewsets.ModelViewSet):
    """
    /api/files/ — universal Layer 0 surface.

    list, retrieve, destroy via standard ModelViewSet. Upload via POST,
    multipart. Re-extract via /reprocess/.
    """
    queryset = SourceFile.objects.all()
    serializer_class = SourceFileSerializer
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        qs = SourceFile.objects.all()
        project_id = self.request.query_params.get('project')
        if project_id:
            qs = qs.filter(project_id=project_id)
        scope_id = self.request.query_params.get('scope')
        if scope_id:
            qs = qs.filter(scope_id=scope_id)
        fmt = self.request.query_params.get('format')
        if fmt:
            qs = qs.filter(format=fmt)
        is_current = self.request.query_params.get('is_current')
        if is_current is not None:
            qs = qs.filter(is_current=is_current.lower() in ('1', 'true', 'yes'))
        return qs.select_related('project').order_by('-uploaded_at')

    def get_serializer_class(self):
        if self.action == 'list':
            return SourceFileListSerializer
        if self.action == 'create':
            return SourceFileUploadSerializer
        return SourceFileSerializer

    def create(self, request, *args, **kwargs):
        """Universal upload. Auto-detects format, dispatches the right extractor."""
        upload = SourceFileUploadSerializer(data=request.data)
        upload.is_valid(raise_exception=True)
        uploaded_file = upload.validated_data['file']
        project_id = upload.validated_data['project_id']
        project = get_object_or_404(Project, pk=project_id)

        _saved, file_url, checksum, file_size = store_uploaded_file(project, uploaded_file)

        sf = get_or_create_source_file(
            project=project,
            original_filename=uploaded_file.name,
            file_url=file_url,
            file_size=file_size,
            checksum=checksum,
            uploaded_by=request.user if request.user.is_authenticated else None,
            mime_type=getattr(uploaded_file, 'content_type', '') or '',
        )

        # Dispatch extraction for known formats. Today: IFC only.
        run = self._dispatch_extraction(sf, file_url)

        body = SourceFileSerializer(sf, context={'request': request}).data
        body['extraction_run'] = ExtractionRunSerializer(run).data if run else None
        return Response(body, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def extractions(self, request, pk=None):
        """List extraction runs for a SourceFile."""
        sf = self.get_object()
        runs = sf.extraction_runs.order_by('-started_at')
        return Response(ExtractionRunListSerializer(runs, many=True).data)

    @action(detail=True, methods=['post'])
    def reprocess(self, request, pk=None):
        """Trigger a fresh extraction over the same SourceFile."""
        sf = self.get_object()
        if not sf.file_url:
            return Response(
                {'error': 'SourceFile has no file_url, cannot re-extract'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        run = self._dispatch_extraction(sf, sf.file_url)
        return Response(
            ExtractionRunSerializer(run).data if run else {'status': 'unsupported_format'},
            status=status.HTTP_202_ACCEPTED,
        )

    # ------------------------------------------------------------------
    # Extraction dispatch
    # ------------------------------------------------------------------

    def _dispatch_extraction(self, source_file: SourceFile, file_url: str):
        """
        Route to the format-specific extractor.

        - IFC: legacy parser via FastAPI + callback
        - DXF/DWG: drawing extractor only
        - PDF: drawing extractor (drawing pages) + document extractor (document pages)
        - DOCX/XLSX/PPTX: document extractor only
        """
        if source_file.format in ('dxf', 'dwg'):
            return self._dispatch_drawing_extraction(source_file, file_url)

        if source_file.format == 'pdf':
            # Mixed PDFs are common (specs with embedded drawings, drawing
            # sets with title-block notes). Run both extractors over the same
            # file; each one is responsible for ignoring pages that aren't
            # its concern via the shared _looks_like_document_page heuristic.
            return self._dispatch_pdf_extraction(source_file, file_url)

        if source_file.format in ('docx', 'xlsx', 'pptx'):
            return self._dispatch_document_extraction(source_file, file_url)

        if source_file.format != 'ifc':
            # Unsupported format: create a noop ExtractionRun marked failed so
            # there's still a row to look at.
            return ExtractionRun.objects.create(
                source_file=source_file,
                status='failed',
                error_message=f"No extractor registered for format '{source_file.format}'",
            )

        # Create a Model row so the legacy IFC pipeline keeps working.
        # Versioning: derive from existing models matching name+project.
        name = Path(source_file.original_filename).stem
        latest = Model.objects.filter(
            project=source_file.project, name=name,
        ).order_by('-version_number').first()
        version_number = (latest.version_number + 1) if latest else 1
        parent_model = latest

        model = Model.objects.create(
            project=source_file.project,
            name=name,
            original_filename=source_file.original_filename,
            file_url=file_url,
            file_size=source_file.file_size,
            checksum_sha256=source_file.checksum_sha256,
            version_number=version_number,
            parent_model=parent_model,
            source_file=source_file,
            status='processing',
            uploaded_by=source_file.uploaded_by,
        )

        run = ExtractionRun.objects.create(
            source_file=source_file,
            status='pending',
        )

        client = IFCServiceClient()
        if not client.is_available():
            run.status = 'failed'
            run.error_message = 'FastAPI ifc-service unavailable'
            run.save(update_fields=['status', 'error_message'])
            model.status = 'error'
            model.processing_error = run.error_message
            model.save(update_fields=['status', 'processing_error'])
            return run

        callback_url = f"{settings.DJANGO_URL}/api/models/{model.id}/process-complete/"
        try:
            client.process_ifc(
                model_id=str(model.id),
                file_url=file_url,
                skip_geometry=True,
                callback_url=callback_url,
                source_file_id=str(source_file.id),
                extraction_run_id=str(run.id),
            )
        except Exception as exc:
            run.status = 'failed'
            run.error_message = str(exc)
            run.save(update_fields=['status', 'error_message'])
        return run

    def _dispatch_drawing_extraction(self, source_file: SourceFile, file_url: str):
        """
        Synchronous drawing pipeline: call FastAPI, persist DrawingSheet rows
        from the response, finalize the ExtractionRun in one request.
        """
        from datetime import timezone as _tz, datetime as _dt
        from apps.entities.models import DrawingSheet

        run = ExtractionRun.objects.create(
            source_file=source_file,
            status='running',
        )

        client = IFCServiceClient()
        if not client.is_available():
            run.status = 'failed'
            run.error_message = 'FastAPI ifc-service unavailable'
            run.completed_at = _dt.now(_tz.utc)
            run.save(update_fields=['status', 'error_message', 'completed_at'])
            return run

        try:
            response = client.extract_drawing(file_url=file_url, fmt=source_file.format)
        except Exception as exc:
            run.status = 'failed'
            run.error_message = str(exc)
            run.completed_at = _dt.now(_tz.utc)
            run.save(update_fields=['status', 'error_message', 'completed_at'])
            return run

        sheets = response.get('sheets') or []
        for sheet_payload in sheets:
            DrawingSheet.objects.create(
                source_file=source_file,
                extraction_run=run,
                scope=source_file.scope,
                page_index=sheet_payload.get('page_index', 0),
                sheet_number=sheet_payload.get('sheet_number') or '',
                sheet_name=sheet_payload.get('sheet_name') or '',
                width_mm=sheet_payload.get('width_mm'),
                height_mm=sheet_payload.get('height_mm'),
                scale=sheet_payload.get('scale') or '',
                title_block_data=sheet_payload.get('title_block_data') or {},
                raw_metadata={
                    **(sheet_payload.get('raw_metadata') or {}),
                    'is_drawing': sheet_payload.get('is_drawing', True),
                },
            )

        run.status = 'completed' if response.get('success') else 'failed'
        run.duration_seconds = response.get('duration_seconds')
        run.log_entries = response.get('log_entries') or []
        run.quality_report = response.get('quality_report') or {}
        run.error_message = response.get('error') or ''
        run.completed_at = _dt.now(_tz.utc)
        run.save(update_fields=[
            'status', 'duration_seconds', 'log_entries',
            'quality_report', 'error_message', 'completed_at',
        ])

        if run.status == 'completed':
            _fire_event('model.processed', {
                'event': 'model.processed',
                'project_id': str(source_file.project_id) if source_file.project_id else None,
                'source_file_id': str(source_file.id),
                'format': source_file.format,
                'extraction_run_id': str(run.id),
                'stats': {
                    'sheet_count': len(sheets),
                    **(run.quality_report or {}),
                },
                'occurred_at': _dt.now(_tz.utc).isoformat(),
            }, project_id=str(source_file.project_id) if source_file.project_id else None)
        return run

    def _dispatch_document_extraction(self, source_file: SourceFile, file_url: str):
        """
        Synchronous document pipeline: call FastAPI, persist DocumentContent
        rows from the response, finalize the ExtractionRun in one request.
        """
        from datetime import timezone as _tz, datetime as _dt
        from apps.entities.models import DocumentContent

        run = ExtractionRun.objects.create(
            source_file=source_file,
            status='running',
        )

        client = IFCServiceClient()
        if not client.is_available():
            run.status = 'failed'
            run.error_message = 'FastAPI ifc-service unavailable'
            run.completed_at = _dt.now(_tz.utc)
            run.save(update_fields=['status', 'error_message', 'completed_at'])
            return run

        try:
            response = client.extract_document(file_url=file_url, fmt=source_file.format)
        except Exception as exc:
            run.status = 'failed'
            run.error_message = str(exc)
            run.completed_at = _dt.now(_tz.utc)
            run.save(update_fields=['status', 'error_message', 'completed_at'])
            return run

        documents = self._persist_document_payloads(
            source_file, run, response.get('documents') or [],
        )

        quality_report = dict(response.get('quality_report') or {})

        # Heuristic claim extraction on top of the substrate (Sprint 6.2).
        # Counts roll into the same quality_report dict so dashboards see one
        # number per run instead of having to join two updates.
        claim_count = self._extract_claims_from_documents(source_file, run, documents)
        if claim_count:
            quality_report['claim_count'] = claim_count

        run.status = 'completed' if response.get('success') else 'failed'
        run.duration_seconds = response.get('duration_seconds')
        run.log_entries = response.get('log_entries') or []
        run.quality_report = quality_report
        run.error_message = response.get('error') or ''
        run.completed_at = _dt.now(_tz.utc)
        run.save(update_fields=[
            'status', 'duration_seconds', 'log_entries',
            'quality_report', 'error_message', 'completed_at',
        ])

        if run.status == 'completed':
            _fire_event('document.processed', {
                'event': 'document.processed',
                'project_id': str(source_file.project_id) if source_file.project_id else None,
                'source_file_id': str(source_file.id),
                'format': source_file.format,
                'extraction_run_id': str(run.id),
                'stats': {
                    'document_count': len(documents),
                    **(quality_report or {}),
                },
                'occurred_at': _dt.now(_tz.utc).isoformat(),
            }, project_id=str(source_file.project_id) if source_file.project_id else None)
        return run

    def _dispatch_pdf_extraction(self, source_file: SourceFile, file_url: str):
        """
        PDFs may carry both drawing pages and document pages. Run both
        extractors and merge the outcomes onto a single ExtractionRun:

        * drawing extractor writes one DrawingSheet per page (already has
          per-page is_drawing flag)
        * document extractor writes one DocumentContent per document page
          (skips drawing pages)
        * quality_report aggregates the counts so a UI can see "this PDF
          gave us 3 drawing sheets + 4 document pages"
        """
        from datetime import timezone as _tz, datetime as _dt
        from apps.entities.models import DrawingSheet, DocumentContent

        run = ExtractionRun.objects.create(
            source_file=source_file,
            status='running',
        )

        client = IFCServiceClient()
        if not client.is_available():
            run.status = 'failed'
            run.error_message = 'FastAPI ifc-service unavailable'
            run.completed_at = _dt.now(_tz.utc)
            run.save(update_fields=['status', 'error_message', 'completed_at'])
            return run

        log_entries: list = []
        merged_quality: dict = {}
        any_failure_message = ''
        all_succeeded = True
        total_duration = 0.0

        # Drawings first (so per-page metadata is in place before documents
        # rely on the same is_drawing classification).
        try:
            drawing_response = client.extract_drawing(file_url=file_url, fmt='pdf')
        except Exception as exc:
            drawing_response = None
            all_succeeded = False
            any_failure_message = f'drawing extractor: {exc}'

        if drawing_response is not None:
            for sheet_payload in drawing_response.get('sheets') or []:
                DrawingSheet.objects.create(
                    source_file=source_file,
                    extraction_run=run,
                    scope=source_file.scope,
                    page_index=sheet_payload.get('page_index', 0),
                    sheet_number=sheet_payload.get('sheet_number') or '',
                    sheet_name=sheet_payload.get('sheet_name') or '',
                    width_mm=sheet_payload.get('width_mm'),
                    height_mm=sheet_payload.get('height_mm'),
                    scale=sheet_payload.get('scale') or '',
                    title_block_data=sheet_payload.get('title_block_data') or {},
                    raw_metadata={
                        **(sheet_payload.get('raw_metadata') or {}),
                        'is_drawing': sheet_payload.get('is_drawing', True),
                    },
                )
            log_entries.extend(drawing_response.get('log_entries') or [])
            qr = drawing_response.get('quality_report') or {}
            merged_quality.update({
                'sheet_count': qr.get('sheet_count', 0),
                'drawing_pages': qr.get('drawing_pages', 0),
                'document_pages_via_drawings': qr.get('document_pages', 0),
            })
            total_duration += float(drawing_response.get('duration_seconds') or 0.0)
            if not drawing_response.get('success', False):
                all_succeeded = False
                any_failure_message = (
                    any_failure_message
                    or drawing_response.get('error')
                    or 'drawing extractor failed'
                )

        # Documents second (skips pages classified as drawings).
        try:
            document_response = client.extract_document(file_url=file_url, fmt='pdf')
        except Exception as exc:
            document_response = None
            all_succeeded = False
            any_failure_message = (
                any_failure_message or f'document extractor: {exc}'
            )

        documents: list = []
        if document_response is not None:
            documents = self._persist_document_payloads(
                source_file, run, document_response.get('documents') or [],
            )
            log_entries.extend(document_response.get('log_entries') or [])
            qr = document_response.get('quality_report') or {}
            merged_quality.update({
                'document_count': qr.get('document_count', 0),
                'document_pages': qr.get('document_pages', 0),
                'drawing_pages_via_documents': qr.get('drawing_pages', 0),
                'total_chars': qr.get('total_chars', 0),
            })
            total_duration += float(document_response.get('duration_seconds') or 0.0)
            if not document_response.get('success', False):
                all_succeeded = False
                any_failure_message = (
                    any_failure_message
                    or document_response.get('error')
                    or 'document extractor failed'
                )

        # Heuristic claims (Sprint 6.2) — folded into merged_quality before
        # the run is finalized so dashboards see one number per run.
        claim_count = self._extract_claims_from_documents(source_file, run, documents)
        if claim_count:
            merged_quality['claim_count'] = claim_count

        run.status = 'completed' if all_succeeded else 'failed'
        run.duration_seconds = total_duration
        run.log_entries = log_entries
        run.quality_report = merged_quality
        run.error_message = '' if all_succeeded else any_failure_message
        run.completed_at = _dt.now(_tz.utc)
        run.save(update_fields=[
            'status', 'duration_seconds', 'log_entries',
            'quality_report', 'error_message', 'completed_at',
        ])

        if run.status == 'completed':
            now = _dt.now(_tz.utc).isoformat()
            project_id_str = str(source_file.project_id) if source_file.project_id else None
            base = {
                'project_id': project_id_str,
                'source_file_id': str(source_file.id),
                'format': source_file.format,
                'extraction_run_id': str(run.id),
                'occurred_at': now,
            }
            # PDFs can carry both drawing pages and document pages — emit both
            # roots iff their respective extractor produced rows. An agent
            # subscribed to one root never has to filter on payload.format.
            sheet_count = merged_quality.get('sheet_count', 0)
            if sheet_count:
                _fire_event('model.processed', {
                    **base,
                    'event': 'model.processed',
                    'stats': {
                        'sheet_count': sheet_count,
                        'drawing_pages': merged_quality.get('drawing_pages', 0),
                    },
                }, project_id=project_id_str)
            doc_count = merged_quality.get('document_count', 0)
            if doc_count:
                _fire_event('document.processed', {
                    **base,
                    'event': 'document.processed',
                    'stats': {
                        'document_count': doc_count,
                        'document_pages': merged_quality.get('document_pages', 0),
                        'total_chars': merged_quality.get('total_chars', 0),
                        'claim_count': merged_quality.get('claim_count', 0),
                    },
                }, project_id=project_id_str)
        return run

    @staticmethod
    def _persist_document_payloads(
        source_file: SourceFile,
        run: ExtractionRun,
        payloads: list,
    ) -> list:
        """
        Persist DocumentContent rows from a FastAPI documents/extract response.

        Returns the persisted list so the caller can run claim extraction
        on the same rows after the run is finalized (claim counts roll into
        the final quality_report).
        """
        from apps.entities.models import DocumentContent

        persisted: list[DocumentContent] = []
        for payload in payloads:
            # Drawing-classified PDF pages come back with is_document=False;
            # skip them — the drawing extractor already handled them.
            if not payload.get('is_document', True):
                continue
            doc = DocumentContent.objects.create(
                source_file=source_file,
                extraction_run=run,
                scope=source_file.scope,
                page_index=payload.get('page_index', 0),
                markdown_content=payload.get('markdown_content') or '',
                structured_data=payload.get('structured_data') or {},
                page_count=payload.get('page_count', 1),
                structure=payload.get('structure') or {},
                extracted_images=payload.get('extracted_images') or [],
                search_text=payload.get('search_text') or '',
                extraction_method=payload.get('extraction_method', 'structured'),
            )
            persisted.append(doc)
        return persisted

    @staticmethod
    def _extract_claims_from_documents(
        source_file: SourceFile,
        run: ExtractionRun,
        documents: list,
    ) -> int:
        """
        Run heuristic claim extraction on each DocumentContent's markdown.

        Failure-isolated: if the FastAPI claim extractor errors, the run
        still finalizes — claims are an additive layer on top of the
        substrate, not a gate. Returns the total claim count so the caller
        can roll it into ``run.quality_report``.
        """
        from apps.entities.models import Claim
        from datetime import datetime as _dt, timezone as _tz

        if not documents:
            return 0

        client = IFCServiceClient()
        total_claims = 0
        new_claim_ids: list[str] = []
        for doc in documents:
            markdown = doc.markdown_content or ''
            if not markdown.strip():
                continue
            try:
                response = client.extract_claims(markdown=markdown)
            except Exception:
                # Don't fail the run on claim extraction errors — log only.
                continue
            for cand in response.get('claims') or []:
                claim = Claim.objects.create(
                    source_file=source_file,
                    document=doc,
                    extraction_run=run,
                    scope=source_file.scope,
                    statement=cand.get('statement') or '',
                    normalized=cand.get('normalized') or {},
                    claim_type=cand.get('claim_type', 'rule'),
                    confidence=cand.get('confidence', 0.0),
                    source_location={
                        **(cand.get('source_location') or {}),
                        'document_id': str(doc.id),
                        'page': doc.page_index,
                    },
                )
                new_claim_ids.append(str(claim.id))
                total_claims += 1
        if total_claims:
            project_id_str = str(source_file.project_id) if source_file.project_id else None
            _fire_event('claim.extracted', {
                'event': 'claim.extracted',
                'project_id': project_id_str,
                'source_file_id': str(source_file.id),
                'extraction_run_id': str(run.id),
                'claim_count': total_claims,
                'claim_ids': new_claim_ids,
                'occurred_at': _dt.now(_tz.utc).isoformat(),
            }, project_id=project_id_str)
        return total_claims


class ExtractionRunViewSet(viewsets.ReadOnlyModelViewSet):
    """
    /api/files/extractions/ — flat read-only access to runs.

    Useful for dashboards that want to scroll across runs without fetching one
    SourceFile at a time.
    """
    queryset = ExtractionRun.objects.all()
    serializer_class = ExtractionRunSerializer

    def get_queryset(self):
        qs = ExtractionRun.objects.all()
        sf_id = self.request.query_params.get('source_file')
        if sf_id:
            qs = qs.filter(source_file_id=sf_id)
        st = self.request.query_params.get('status')
        if st:
            qs = qs.filter(status=st)
        return qs.select_related('source_file').order_by('-started_at')

    def get_serializer_class(self):
        if self.action == 'list':
            return ExtractionRunListSerializer
        return ExtractionRunSerializer
