"""
ViewSet for model analysis data (type-first analysis from ifc-toolkit).
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from ..models import ModelAnalysis
from ..serializers import ModelAnalysisSerializer


class ModelAnalysisViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for model analysis data (from ifc-toolkit type_analysis).

    list: GET /api/model-analysis/?model={id}
    retrieve: GET /api/model-analysis/{id}/
    run_analysis: POST /api/model-analysis/run/?model={id}

    Returns the full analysis with nested storeys and types.
    """
    queryset = ModelAnalysis.objects.prefetch_related(
        'storeys',
        'types',
        'types__storey_distribution',
        'types__storey_distribution__storey',
    ).all()
    serializer_class = ModelAnalysisSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['model']

    @action(detail=False, methods=['post'], url_path='run')
    def run_analysis(self, request):
        """
        Run type_analysis() on a model's IFC file and store results.

        POST /api/model-analysis/run/
        Body: {"model": "uuid"}

        Requires the model to have a file_url pointing to an IFC file.
        """
        from ..services.analysis_ingestion import ingest_type_analysis

        model_id = request.data.get('model')
        if not model_id:
            return Response(
                {'error': 'model ID is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from apps.models.models import Model as BIMModel
            model = BIMModel.objects.get(id=model_id)
        except Exception:
            return Response(
                {'error': f'Model {model_id} not found'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Get the IFC file path
        if not model.file_url:
            return Response(
                {'error': 'Model has no IFC file'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from ifc_toolkit.analyze import type_analysis
            from django.conf import settings
            import urllib.parse
            import tempfile
            import requests as req

            file_url = model.file_url
            parsed = urllib.parse.urlparse(file_url)

            # Resolve file_url to a local file path
            if not parsed.scheme or parsed.scheme == 'file':
                # Already a local path
                file_path = file_url
            elif parsed.scheme in ('http', 'https') and 'media/' in parsed.path:
                # Local dev: Django-served media file
                media_rel = parsed.path.split('media/', 1)[1]
                file_path = str(settings.MEDIA_ROOT / media_rel)
            else:
                # Remote URL (Supabase etc): download to temp file
                resp = req.get(file_url, timeout=120)
                resp.raise_for_status()
                suffix = '.ifc'
                if file_url.lower().endswith('.ifczip'):
                    suffix = '.ifczip'
                tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
                tmp.write(resp.content)
                tmp.close()
                file_path = tmp.name

            try:
                data = type_analysis(file_path)
                analysis = ingest_type_analysis(str(model_id), data)
                serializer = self.get_serializer(analysis)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            finally:
                # Clean up temp file if we created one
                if file_path != file_url and not file_path.startswith(str(settings.MEDIA_ROOT)):
                    import os
                    os.unlink(file_path)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
