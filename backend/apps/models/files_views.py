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
        """Route to the format-specific extractor. IFC + drawings (DXF/DWG/PDF) wired."""
        if source_file.format in ('dxf', 'dwg', 'pdf'):
            return self._dispatch_drawing_extraction(source_file, file_url)

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
        return run


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
