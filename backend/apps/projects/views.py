from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Project
from .serializers import ProjectSerializer


class ProjectViewSet(viewsets.ModelViewSet):
    """
    API endpoint for projects.

    list: Get all projects
    create: Create a new project
    retrieve: Get a single project
    update: Update a project
    partial_update: Partially update a project
    destroy: Delete a project
    """
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer

    @action(detail=True, methods=['get'])
    def models(self, request, pk=None):
        """Get all models for a project."""
        project = self.get_object()
        from apps.models.serializers import ModelSerializer
        models = project.models.all()
        serializer = ModelSerializer(models, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def statistics(self, request, pk=None):
        """Get project statistics."""
        project = self.get_object()
        return Response({
            'project_id': str(project.id),
            'name': project.name,
            'model_count': project.get_model_count(),
            'total_elements': project.get_element_count(),
            'created_at': project.created_at,
            'updated_at': project.updated_at,
        })
