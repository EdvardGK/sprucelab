"""
REST API views for Scripting module.

Provides endpoints for:
- Script library management (CRUD)
- Script execution on models
- Execution history
- Automation workflows
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from .models import (
    Script,
    ScriptExecution,
    AutomationWorkflow,
    WorkflowExecution,
)
from .serializers import (
    ScriptSerializer,
    ScriptListSerializer,
    ScriptExecutionSerializer,
    ScriptExecutionListSerializer,
    ExecuteScriptRequestSerializer,
    AutomationWorkflowSerializer,
    WorkflowExecutionSerializer,
)
# ScriptRunner import will be added when execution endpoint is implemented
# from .services.runner import ScriptRunner


class ScriptViewSet(viewsets.ModelViewSet):
    """
    API endpoints for script library.

    - list: Get all scripts (filtered by category, public/private)
    - retrieve: Get script detail with code
    - create: Upload new script
    - update: Modify script
    - destroy: Delete script
    - execute: Execute script on a model
    """
    queryset = Script.objects.all()
    serializer_class = ScriptSerializer

    def get_serializer_class(self):
        """Use lightweight serializer for list view."""
        if self.action == 'list':
            return ScriptListSerializer
        return ScriptSerializer

    def get_queryset(self):
        """
        Filter scripts by category and visibility.

        Examples:
            /api/scripts/ - All public scripts
            /api/scripts/?category=validation - Validation scripts
            /api/scripts/?include_private=true - Include private scripts
        """
        queryset = Script.objects.all()

        # Only public scripts by default
        include_private = self.request.query_params.get('include_private', 'false')
        if include_private.lower() != 'true':
            queryset = queryset.filter(is_public=True)

        # Filter by category
        category = self.request.query_params.get('category', None)
        if category:
            queryset = queryset.filter(category=category)

        # Filter by name (search)
        name_query = self.request.query_params.get('name', None)
        if name_query:
            queryset = queryset.filter(name__icontains=name_query)

        return queryset.order_by('category', 'name')


class ScriptExecutionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoints for script execution history.

    - list: Get all executions (filtered by model, script, status)
    - retrieve: Get execution detail with full results
    """
    queryset = ScriptExecution.objects.all()
    serializer_class = ScriptExecutionSerializer

    def get_serializer_class(self):
        """Use lightweight serializer for list view."""
        if self.action == 'list':
            return ScriptExecutionListSerializer
        return ScriptExecutionSerializer

    def get_queryset(self):
        """
        Filter executions by model, script, or status.

        Examples:
            /api/script-executions/ - All executions
            /api/script-executions/?model={uuid} - Executions for specific model
            /api/script-executions/?script={uuid} - Executions of specific script
            /api/script-executions/?status=success - Only successful executions
        """
        queryset = ScriptExecution.objects.select_related('script', 'model').all()

        # Filter by model
        model_id = self.request.query_params.get('model', None)
        if model_id:
            queryset = queryset.filter(model_id=model_id)

        # Filter by script
        script_id = self.request.query_params.get('script', None)
        if script_id:
            queryset = queryset.filter(script_id=script_id)

        # Filter by status
        status_param = self.request.query_params.get('status', None)
        if status_param:
            queryset = queryset.filter(status=status_param)

        return queryset.order_by('-started_at')


class AutomationWorkflowViewSet(viewsets.ModelViewSet):
    """
    API endpoints for automation workflows.

    - list: Get all workflows
    - retrieve: Get workflow detail
    - create: Create new workflow
    - update: Modify workflow
    - destroy: Delete workflow
    - activate: Activate workflow
    - deactivate: Deactivate workflow
    """
    queryset = AutomationWorkflow.objects.all()
    serializer_class = AutomationWorkflowSerializer

    def get_queryset(self):
        """
        Filter workflows by project or trigger type.

        Examples:
            /api/workflows/ - All workflows
            /api/workflows/?project={uuid} - Workflows for specific project
            /api/workflows/?trigger_type=on_upload - Upload-triggered workflows
            /api/workflows/?is_active=true - Only active workflows
        """
        queryset = AutomationWorkflow.objects.select_related('script', 'project').all()

        # Filter by project
        project_id = self.request.query_params.get('project', None)
        if project_id:
            queryset = queryset.filter(project_id=project_id)

        # Filter by trigger type
        trigger_type = self.request.query_params.get('trigger_type', None)
        if trigger_type:
            queryset = queryset.filter(trigger_type=trigger_type)

        # Filter by active status
        is_active = self.request.query_params.get('is_active', None)
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')

        return queryset.order_by('name')

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """
        Activate a workflow.

        POST /api/workflows/{id}/activate/
        """
        workflow = self.get_object()
        workflow.is_active = True
        workflow.save()

        return Response({
            'status': 'success',
            'message': f'Workflow "{workflow.name}" activated',
            'is_active': True
        })

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """
        Deactivate a workflow.

        POST /api/workflows/{id}/deactivate/
        """
        workflow = self.get_object()
        workflow.is_active = False
        workflow.save()

        return Response({
            'status': 'success',
            'message': f'Workflow "{workflow.name}" deactivated',
            'is_active': False
        })


class WorkflowExecutionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoints for workflow execution history.

    - list: Get all workflow executions
    - retrieve: Get workflow execution detail
    """
    queryset = WorkflowExecution.objects.all()
    serializer_class = WorkflowExecutionSerializer

    def get_queryset(self):
        """Filter by workflow or model."""
        queryset = WorkflowExecution.objects.select_related('workflow', 'model', 'script_execution').all()

        # Filter by workflow
        workflow_id = self.request.query_params.get('workflow', None)
        if workflow_id:
            queryset = queryset.filter(workflow_id=workflow_id)

        # Filter by model
        model_id = self.request.query_params.get('model', None)
        if model_id:
            queryset = queryset.filter(model_id=model_id)

        return queryset.order_by('-executed_at')
