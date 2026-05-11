"""
ObservationViewSet — read-only API over the Layer-1 observation log.

Filters supported (query params):
  - source_file=<uuid>      — pin to one file
  - sheet=<uuid>            — pin to one DrawingSheet
  - extraction_run=<uuid>   — pin to a specific run (for diffing across runs)
  - project=<uuid>          — span all files in a project
  - category=<category>     — repeatable; CSV or multi-occurrence
  - search=<substring>      — case-insensitive search over key + content
  - page_index=<int>        — for PDFs with many pages
"""
from __future__ import annotations

from rest_framework import viewsets

from ..models import Observation
from ..serializers import ObservationSerializer


def _split_csv(value):
    if not value:
        return []
    return [v.strip() for v in value.split(',') if v.strip()]


class ObservationViewSet(viewsets.ReadOnlyModelViewSet):
    """List + retrieve over the observation log. No mutations from the API."""

    queryset = Observation.objects.all()
    serializer_class = ObservationSerializer

    def get_queryset(self):
        qs = Observation.objects.all().select_related('source_file', 'sheet', 'extraction_run')

        params = self.request.query_params
        source_file = params.get('source_file')
        if source_file:
            qs = qs.filter(source_file_id=source_file)
        sheet = params.get('sheet')
        if sheet:
            qs = qs.filter(sheet_id=sheet)
        extraction_run = params.get('extraction_run')
        if extraction_run:
            qs = qs.filter(extraction_run_id=extraction_run)
        project = params.get('project')
        if project:
            qs = qs.filter(source_file__project_id=project)

        category_csv = params.get('category')
        categories = _split_csv(category_csv)
        # Also accept repeated ?category=foo&category=bar
        categories += params.getlist('category')
        categories = [c for c in dict.fromkeys(categories) if c]
        if categories:
            qs = qs.filter(category__in=categories)

        page_index = params.get('page_index')
        if page_index is not None and page_index != '':
            try:
                qs = qs.filter(page_index=int(page_index))
            except ValueError:
                pass

        search = (params.get('search') or '').strip()
        if search:
            from django.db.models import Q
            qs = qs.filter(Q(content__icontains=search) | Q(key__icontains=search))

        return qs.order_by('source_file_id', 'sheet_id', 'page_index', 'category', 'key')
