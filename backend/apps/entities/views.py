"""
API views for entities app.
"""
from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend
from .models import ProcessingReport
from .serializers import ProcessingReportSerializer


class ProcessingReportViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for viewing processing reports.

    list: Get all processing reports
    retrieve: Get a single processing report

    Filtering:
    - ?model={model_id} - Filter by model
    - ?overall_status=success|partial|failed - Filter by status
    - ?catastrophic_failure=true|false - Filter by catastrophic failures only

    Ordering:
    - ?ordering=-started_at (default: newest first)
    - ?ordering=duration_seconds (sort by duration)
    - ?ordering=total_entities_failed (sort by failure count)
    """
    queryset = ProcessingReport.objects.all()
    serializer_class = ProcessingReportSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['model', 'overall_status', 'catastrophic_failure']
    ordering_fields = ['started_at', 'duration_seconds', 'total_entities_failed']
    ordering = ['-started_at']  # Default: newest first
