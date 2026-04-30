"""
ViewSets for materials and material mappings.
"""
from datetime import datetime
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from ..models import Material, MaterialMapping
from ..serializers import MaterialWithMappingSerializer, MaterialMappingSerializer


class MaterialViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for materials with mapping status.

    GET /api/materials/?model={id} - List materials for a model (required)
    GET /api/materials/{id}/ - Get single material with mapping
    """
    queryset = Material.objects.select_related('mapping').all()
    serializer_class = MaterialWithMappingSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['model', 'category']
    search_fields = ['name', 'category']
    ordering = ['name']

    @action(detail=False, methods=['get'], url_path='summary')
    def mapping_summary(self, request):
        """
        Get mapping summary for a model.

        GET /api/materials/summary/?model={id}
        """
        model_id = request.query_params.get('model')
        if not model_id:
            return Response({'error': 'model parameter is required'}, status=status.HTTP_400_BAD_REQUEST)

        materials = Material.objects.filter(model_id=model_id)
        total = materials.count()

        mapped = materials.filter(mapping__mapping_status='mapped').count()
        pending = materials.filter(mapping__mapping_status='pending').count()
        ignored = materials.filter(mapping__mapping_status='ignored').count()
        review = materials.filter(mapping__mapping_status='review').count()
        unmapped = total - (mapped + pending + ignored + review)

        return Response({
            'total': total,
            'mapped': mapped,
            'pending': pending + unmapped,
            'ignored': ignored,
            'review': review,
            'progress_percent': round((mapped / total * 100) if total > 0 else 0, 1)
        })


class MaterialMappingViewSet(viewsets.ModelViewSet):
    """
    API endpoint for material mappings.

    GET /api/material-mappings/?material__model={id} - List mappings for a model
    POST /api/material-mappings/ - Create mapping
    PATCH /api/material-mappings/{id}/ - Update mapping
    DELETE /api/material-mappings/{id}/ - Delete mapping
    """
    queryset = MaterialMapping.objects.select_related('material').all()
    serializer_class = MaterialMappingSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['material', 'material__model', 'mapping_status']
    ordering = ['-updated_at']

    def perform_update(self, serializer):
        """Set mapped_at timestamp when status changes to mapped."""
        instance = serializer.save()
        if instance.mapping_status == 'mapped' and not instance.mapped_at:
            instance.mapped_at = datetime.now()
            instance.save(update_fields=['mapped_at'])
