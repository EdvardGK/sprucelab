"""
ViewSets for the document layer (Phase 6, Sprint 6.1).

- DocumentContentViewSet — read + filter; `content` action returns the body
  in markdown or JSON form so callers don't have to slurp every field every
  time they want to render a document.

Search lives in `views/search.py` next to this — separate ViewSet because
search results span both DocumentContent and (later) DrawingSheet/IFCType.
"""
from __future__ import annotations

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import DocumentContent
from ..serializers import (
    DocumentContentSerializer,
    DocumentContentListSerializer,
)


class DocumentContentViewSet(viewsets.ReadOnlyModelViewSet):
    """
    /api/types/documents/ — list and detail for extracted document content.

    Filters:
      ?project=<uuid>
      ?scope=<uuid>
      ?source_file=<uuid>
      ?format=pdf|docx|xlsx|pptx   matches SourceFile.format
      ?extraction_method=text_layer|ocr|structured
    """
    queryset = DocumentContent.objects.all()
    serializer_class = DocumentContentSerializer

    def get_serializer_class(self):
        if self.action == 'list':
            return DocumentContentListSerializer
        return DocumentContentSerializer

    def get_queryset(self):
        qs = DocumentContent.objects.select_related(
            'source_file', 'extraction_run', 'scope',
        )

        project_id = self.request.query_params.get('project')
        if project_id:
            qs = qs.filter(source_file__project_id=project_id)

        scope_id = self.request.query_params.get('scope')
        if scope_id:
            qs = qs.filter(scope_id=scope_id)

        sf_id = self.request.query_params.get('source_file')
        if sf_id:
            qs = qs.filter(source_file_id=sf_id)

        fmt = self.request.query_params.get('format')
        if fmt:
            qs = qs.filter(source_file__format=fmt)

        method = self.request.query_params.get('extraction_method')
        if method:
            qs = qs.filter(extraction_method=method)

        return qs.order_by('source_file_id', 'page_index')

    @action(detail=True, methods=['get'], url_path='content')
    def content(self, request, pk=None):
        """
        Return the document body without metadata.

        Query: ?as=markdown|json (default markdown)
        - markdown: {"markdown": "..."}
        - json: structured_data for XLSX, or {"markdown": "..."} fallback

        ``as`` is intentionally NOT named ``format`` to avoid colliding with
        DRF's content-negotiation format suffix (which would 404 unknown
        renderer names).
        """
        doc = self.get_object()
        fmt = (request.query_params.get('as') or 'markdown').lower()
        if fmt == 'json':
            if doc.structured_data:
                return Response(doc.structured_data)
            return Response({'markdown': doc.markdown_content})
        return Response({'markdown': doc.markdown_content})
