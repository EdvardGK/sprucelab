"""
REST API views for Field & Compliance module.
"""
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import ChecklistTemplate, ChecklistTemplateItem, Checklist, CheckItem
from .serializers import (
    ChecklistTemplateListSerializer,
    ChecklistTemplateDetailSerializer,
    ChecklistTemplateItemSerializer,
    ChecklistListSerializer,
    ChecklistDetailSerializer,
    CheckItemSerializer,
)


class ChecklistTemplateViewSet(viewsets.ModelViewSet):
    """CRUD for checklist templates."""
    queryset = ChecklistTemplate.objects.all()
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['project', 'category', 'is_system_template']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ChecklistTemplateDetailSerializer
        return ChecklistTemplateListSerializer


class ChecklistTemplateItemViewSet(viewsets.ModelViewSet):
    """CRUD for template items."""
    queryset = ChecklistTemplateItem.objects.all()
    serializer_class = ChecklistTemplateItemSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['template']


class ChecklistViewSet(viewsets.ModelViewSet):
    """
    CRUD for checklist instances.

    Custom actions:
    - POST instantiate/ - Create checklist from template
    """
    queryset = Checklist.objects.select_related('template').prefetch_related('items')
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['project', 'status', 'template']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ChecklistDetailSerializer
        return ChecklistListSerializer

    @action(detail=False, methods=['post'])
    def instantiate(self, request):
        """Create a checklist from a template, copying all template items."""
        template_id = request.data.get('template_id')
        project_id = request.data.get('project_id')
        location = request.data.get('location', '')
        name = request.data.get('name')

        if not template_id or not project_id:
            return Response(
                {'error': 'template_id and project_id are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            template = ChecklistTemplate.objects.prefetch_related('items').get(pk=template_id)
        except ChecklistTemplate.DoesNotExist:
            return Response(
                {'error': 'Template not found'},
                status=status.HTTP_404_NOT_FOUND,
            )

        checklist = Checklist.objects.create(
            project_id=project_id,
            template=template,
            name=name or template.name,
            location=location,
            status='draft',
        )

        # Copy template items to check items
        check_items = []
        for ti in template.items.all():
            check_items.append(CheckItem(
                checklist=checklist,
                template_item=ti,
                sort_order=ti.sort_order,
                title=ti.title,
                reference_type=ti.reference_type,
                reference_code=ti.reference_code,
                reference_description=ti.reference_description,
                reference_document_url=ti.reference_document_url,
                reference_page=ti.reference_page,
                acceptance_criteria=ti.acceptance_criteria,
                measurement_unit=ti.measurement_unit,
                tolerance_min=ti.tolerance_min,
                tolerance_max=ti.tolerance_max,
                requires_photo=ti.requires_photo,
                is_critical=ti.is_critical,
            ))
        CheckItem.objects.bulk_create(check_items)

        serializer = ChecklistDetailSerializer(checklist)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class CheckItemViewSet(viewsets.ModelViewSet):
    """
    CRUD for check items.

    Custom actions:
    - PATCH {id}/record/ - Record worker input (status, measurement, notes)
    - PATCH {id}/deviate/ - Record deviation with full data
    - PATCH {id}/resolve/ - Resolve a deviation
    """
    queryset = CheckItem.objects.select_related('checklist')
    serializer_class = CheckItemSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['checklist', 'status', 'is_critical']

    @action(detail=True, methods=['patch'])
    def record(self, request, pk=None):
        """Record worker input: status, measurement, notes."""
        item = self.get_object()
        item.status = request.data.get('status', item.status)
        if 'measured_value' in request.data:
            item.measured_value = request.data['measured_value']
        if 'notes' in request.data:
            item.notes = request.data['notes']
        item.checked_at = timezone.now()
        item.checked_by = request.data.get('checked_by', item.checked_by)

        # Clear deviation data if status is not deviation
        if item.status != 'deviation':
            item.deviation_description = None
            item.deviation_responsible = None
            item.deviation_action = None

        item.save()
        return Response(CheckItemSerializer(item).data)

    @action(detail=True, methods=['patch'])
    def deviate(self, request, pk=None):
        """Record deviation with description, responsible, action."""
        item = self.get_object()
        item.status = 'deviation'
        item.deviation_description = request.data.get('deviation_description')
        item.deviation_responsible = request.data.get('deviation_responsible')
        item.deviation_action = request.data.get('deviation_action')
        item.checked_at = timezone.now()
        item.checked_by = request.data.get('checked_by', item.checked_by)
        item.save()
        return Response(CheckItemSerializer(item).data)

    @action(detail=True, methods=['patch'])
    def resolve(self, request, pk=None):
        """Resolve a deviation."""
        item = self.get_object()
        if item.status != 'deviation':
            return Response(
                {'error': 'Item is not in deviation status'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        item.deviation_resolved = True
        item.deviation_resolved_at = timezone.now()
        item.deviation_resolved_by = request.data.get('resolved_by')
        item.save()
        return Response(CheckItemSerializer(item).data)
