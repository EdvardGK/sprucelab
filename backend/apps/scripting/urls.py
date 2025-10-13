"""
URL configuration for Scripting API.

Available endpoints:
- /api/scripts/ - Script library CRUD
- /api/script-executions/ - Execution history
- /api/workflows/ - Automation workflows CRUD
- /api/workflows/{id}/activate/ - Activate workflow
- /api/workflows/{id}/deactivate/ - Deactivate workflow
- /api/workflow-executions/ - Workflow execution history
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ScriptViewSet,
    ScriptExecutionViewSet,
    AutomationWorkflowViewSet,
    WorkflowExecutionViewSet,
)

# Router for all scripting-related endpoints
router = DefaultRouter()
router.register(r'scripts', ScriptViewSet, basename='scripts')
router.register(r'script-executions', ScriptExecutionViewSet, basename='script-executions')
router.register(r'workflows', AutomationWorkflowViewSet, basename='workflows')
router.register(r'workflow-executions', WorkflowExecutionViewSet, basename='workflow-executions')

urlpatterns = router.urls
