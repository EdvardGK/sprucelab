"""
REST API views for 3D Viewer module.

Provides endpoints for:
- Viewer groups (organize models by building, phase, discipline, etc.)
- Model assignments (add models to groups with coordination data)
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import ViewerGroup, ViewerModel
from .serializers import (
    ViewerGroupSerializer,
    ViewerGroupListSerializer,
    ViewerModelSerializer,
)


class ViewerGroupViewSet(viewsets.ModelViewSet):
    """
    API endpoints for viewer groups.

    - list: Get all groups (optionally filtered by project)
    - retrieve: Get group detail with nested models
    - create: Create new group
    - update: Update group (name, description, parent, display_order, etc.)
    - destroy: Delete group (cascades to model assignments)
    """
    queryset = ViewerGroup.objects.all()
    serializer_class = ViewerGroupSerializer

    def get_serializer_class(self):
        """Use lightweight serializer for list view."""
        if self.action == 'list':
            return ViewerGroupListSerializer
        return ViewerGroupSerializer

    def get_queryset(self):
        """
        Filter groups by project if ?project= is provided.

        Examples:
            /api/viewer-groups/ - All groups
            /api/viewer-groups/?project={uuid} - Groups for specific project
        """
        queryset = ViewerGroup.objects.select_related('project', 'parent', 'created_by').prefetch_related(
            'models',
            'models__model',
        )

        # Filter by project
        project_id = self.request.query_params.get('project', None)
        if project_id:
            queryset = queryset.filter(project_id=project_id)

        return queryset.order_by('display_order', 'name')

    def perform_create(self, serializer):
        """Set created_by to current user (if authenticated)."""
        if self.request.user.is_authenticated:
            serializer.save(created_by=self.request.user)
        else:
            serializer.save()


class ViewerModelViewSet(viewsets.ModelViewSet):
    """
    API endpoints for viewer model assignments.

    - list: Get all model assignments (optionally filtered by group or project)
    - retrieve: Get model assignment details
    - create: Add model to group
    - update: Update coordination data (offset, visibility, color)
    - destroy: Remove model from group
    """
    queryset = ViewerModel.objects.all()
    serializer_class = ViewerModelSerializer

    def get_queryset(self):
        """
        Filter model assignments by group or project.

        Examples:
            /api/viewer-models/ - All model assignments
            /api/viewer-models/?group={uuid} - Models in specific group
            /api/viewer-models/?project={uuid} - Models in project's groups
        """
        queryset = ViewerModel.objects.select_related('group', 'group__project', 'model')

        # Filter by group
        group_id = self.request.query_params.get('group', None)
        if group_id:
            queryset = queryset.filter(group_id=group_id)

        # Filter by project (through group)
        project_id = self.request.query_params.get('project', None)
        if project_id:
            queryset = queryset.filter(group__project_id=project_id)

        return queryset.order_by('display_order')

    @action(detail=True, methods=['patch'])
    def coordinate(self, request, pk=None):
        """
        Update coordination data for a model.

        PATCH /api/viewer-models/{id}/coordinate/

        Body:
        {
            "offset_x": 100.0,
            "offset_y": 50.0,
            "offset_z": 0.0,
            "rotation": 90.0
        }

        Returns updated model assignment.
        """
        viewer_model = self.get_object()

        # Update coordination fields if provided
        for field in ['offset_x', 'offset_y', 'offset_z', 'rotation']:
            if field in request.data:
                setattr(viewer_model, field, request.data[field])

        viewer_model.save()

        serializer = self.get_serializer(viewer_model)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def batch_update(self, request):
        """
        Batch update multiple model assignments.

        POST /api/viewer-models/batch-update/

        Body:
        {
            "updates": [
                {
                    "id": "uuid-1",
                    "offset_x": 100.0,
                    "is_visible": true
                },
                {
                    "id": "uuid-2",
                    "opacity": 0.5
                }
            ]
        }

        Returns:
        {
            "status": "success",
            "updated_count": 2
        }
        """
        updates = request.data.get('updates', [])

        if not updates:
            return Response(
                {'error': 'No updates provided'},
                status=status.HTTP_400_BAD_REQUEST
            )

        updated_count = 0
        for update in updates:
            model_id = update.get('id')
            if not model_id:
                continue

            try:
                viewer_model = ViewerModel.objects.get(id=model_id)

                # Update fields if provided
                for field in ['offset_x', 'offset_y', 'offset_z', 'rotation',
                              'is_visible', 'opacity', 'color_override', 'display_order']:
                    if field in update:
                        setattr(viewer_model, field, update[field])

                viewer_model.save()
                updated_count += 1

            except ViewerModel.DoesNotExist:
                continue

        return Response({
            'status': 'success',
            'updated_count': updated_count
        })
