"""
ViewSets for the drawing layer (Phase 5).

- DrawingSheetViewSet — read + filter; `register` action attaches a
  DrawingRegistration computed from two paper-grid pairs.
- TitleBlockTemplateViewSet — full CRUD per project.
"""
from __future__ import annotations

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.models.models import ExtractionRun
from ..models import DrawingSheet, TitleBlockTemplate, DrawingRegistration
from ..serializers import (
    DrawingSheetSerializer, DrawingSheetListSerializer,
    TitleBlockTemplateSerializer, DrawingRegistrationSerializer,
)
from ..services.drawing_registration import (
    compute_similarity_transform, resolve_grid_intersection,
)


def _bool_param(value, default=False):
    if value is None:
        return default
    return str(value).lower() in ('1', 'true', 'yes')


class DrawingSheetViewSet(viewsets.ReadOnlyModelViewSet):
    """
    /api/types/drawings/ — list and detail for drawing sheets.

    Filters:
      ?project=<uuid>  scope to a project
      ?scope=<uuid>    scope to a ProjectScope
      ?source_file=<uuid>
      ?is_drawing=true|false  filter on raw_metadata.is_drawing flag
    """
    queryset = DrawingSheet.objects.all()
    serializer_class = DrawingSheetSerializer

    def get_serializer_class(self):
        if self.action == 'list':
            return DrawingSheetListSerializer
        return DrawingSheetSerializer

    def get_queryset(self):
        qs = DrawingSheet.objects.select_related('source_file', 'extraction_run', 'scope')

        project_id = self.request.query_params.get('project')
        if project_id:
            qs = qs.filter(source_file__project_id=project_id)

        scope_id = self.request.query_params.get('scope')
        if scope_id:
            qs = qs.filter(scope_id=scope_id)

        sf_id = self.request.query_params.get('source_file')
        if sf_id:
            qs = qs.filter(source_file_id=sf_id)

        is_drawing = self.request.query_params.get('is_drawing')
        if is_drawing is not None:
            qs = qs.filter(raw_metadata__is_drawing=_bool_param(is_drawing))

        return qs.order_by('source_file_id', 'page_index')

    @action(detail=True, methods=['post'], url_path='register')
    def register(self, request, pk=None):
        """
        Attach (or replace) a DrawingRegistration on this sheet.

        Body shape:
          {
            "ref1": {"paper_x": float, "paper_y": float, "grid_u": "A", "grid_v": "1"},
            "ref2": {"paper_x": float, "paper_y": float, "grid_u": "B", "grid_v": "3"},
            "grid_source_run": "<extraction_run uuid>"   # IFC run with discovered_grid
          }

        The server resolves the grid labels via ExtractionRun.discovered_grid,
        computes the affine transform, and persists the result.
        """
        sheet = self.get_object()
        ref1 = request.data.get('ref1') or {}
        ref2 = request.data.get('ref2') or {}
        grid_source_run_id = request.data.get('grid_source_run')

        for key in ('paper_x', 'paper_y', 'grid_u', 'grid_v'):
            if key not in ref1 or key not in ref2:
                return Response(
                    {'error': f"Both ref1 and ref2 require '{key}'"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if not grid_source_run_id:
            return Response(
                {'error': "grid_source_run is required (IFC ExtractionRun id)"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            grid_run = ExtractionRun.objects.get(pk=grid_source_run_id)
        except ExtractionRun.DoesNotExist:
            return Response(
                {'error': f"ExtractionRun {grid_source_run_id} not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        ref1_model = resolve_grid_intersection(
            grid_run.discovered_grid or {}, str(ref1['grid_u']), str(ref1['grid_v']),
        )
        ref2_model = resolve_grid_intersection(
            grid_run.discovered_grid or {}, str(ref2['grid_u']), str(ref2['grid_v']),
        )
        if ref1_model is None or ref2_model is None:
            return Response(
                {'error': 'Could not resolve one or both grid intersections from discovered_grid'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            matrix = compute_similarity_transform(
                paper1=(float(ref1['paper_x']), float(ref1['paper_y'])),
                model1=ref1_model,
                paper2=(float(ref2['paper_x']), float(ref2['paper_y'])),
                model2=ref2_model,
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        registration, _ = DrawingRegistration.objects.update_or_create(
            drawing_sheet=sheet,
            defaults={
                'ref1_paper_x': float(ref1['paper_x']),
                'ref1_paper_y': float(ref1['paper_y']),
                'ref1_grid_u': str(ref1['grid_u']),
                'ref1_grid_v': str(ref1['grid_v']),
                'ref2_paper_x': float(ref2['paper_x']),
                'ref2_paper_y': float(ref2['paper_y']),
                'ref2_grid_u': str(ref2['grid_u']),
                'ref2_grid_v': str(ref2['grid_v']),
                'transform_matrix': matrix,
                'grid_source_run': grid_run,
            },
        )
        return Response(
            DrawingRegistrationSerializer(registration).data,
            status=status.HTTP_201_CREATED,
        )


class TitleBlockTemplateViewSet(viewsets.ModelViewSet):
    """
    /api/types/title-block-templates/ — per-project CRUD.

    Filter: ?project=<uuid>
    """
    queryset = TitleBlockTemplate.objects.all()
    serializer_class = TitleBlockTemplateSerializer

    def get_queryset(self):
        qs = TitleBlockTemplate.objects.all()
        project_id = self.request.query_params.get('project')
        if project_id:
            qs = qs.filter(project_id=project_id)
        return qs.order_by('project_id', 'name')
