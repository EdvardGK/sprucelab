"""
URL configuration for Automation Pipeline API.

Available endpoints:

Pipeline Management:
- GET/POST   /api/automation/pipelines/           - List/Create pipelines
- GET/PATCH  /api/automation/pipelines/{id}/      - Get/Update pipeline
- DELETE     /api/automation/pipelines/{id}/      - Delete pipeline
- POST       /api/automation/pipelines/{id}/run/  - Trigger pipeline run
- POST       /api/automation/pipelines/{id}/duplicate/ - Duplicate pipeline

Pipeline Steps:
- GET/POST   /api/automation/pipelines/{id}/steps/           - List/Create steps
- POST       /api/automation/pipelines/{id}/steps/reorder/   - Reorder steps

CDE Connections:
- GET/POST   /api/automation/cde-connections/          - List/Create connections
- GET/PATCH  /api/automation/cde-connections/{id}/     - Get/Update connection
- DELETE     /api/automation/cde-connections/{id}/     - Delete connection
- POST       /api/automation/cde-connections/{id}/test/ - Test connection
- POST       /api/automation/cde-connections/{id}/sync/ - Trigger sync

Project Pipeline Configs:
- GET/POST   /api/automation/project-configs/              - List/Create configs
- GET/PATCH  /api/automation/project-configs/{id}/         - Get/Update config
- POST       /api/automation/project-configs/{id}/enable/  - Enable pipeline
- POST       /api/automation/project-configs/{id}/disable/ - Disable pipeline

Pipeline Runs:
- GET/POST   /api/automation/runs/              - List/Create runs
- GET        /api/automation/runs/{id}/         - Get run detail
- POST       /api/automation/runs/{id}/cancel/  - Cancel run
- GET        /api/automation/runs/{id}/logs/    - Get full logs

Agent API (for spruce CLI):
- POST       /api/automation/agent/register/                        - Register agent
- POST       /api/automation/agent/heartbeat/                       - Agent heartbeat
- GET        /api/automation/agent/jobs/                            - Poll for jobs
- POST       /api/automation/agent/jobs/{run_id}/claim/             - Claim a job
- POST       /api/automation/agent/jobs/{run_id}/step/{step_id}/start/    - Start step
- POST       /api/automation/agent/jobs/{run_id}/step/{step_id}/complete/ - Complete step
- POST       /api/automation/agent/jobs/{run_id}/complete/          - Complete run
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    PipelineViewSet,
    PipelineStepViewSet,
    CDEConnectionViewSet,
    ProjectPipelineConfigViewSet,
    PipelineRunViewSet,
    AgentRegisterView,
    AgentHeartbeatView,
    AgentJobsView,
    AgentJobClaimView,
    AgentStepStartView,
    AgentStepCompleteView,
    AgentRunCompleteView,
)

# Main router for top-level resources
router = DefaultRouter()
router.register(r'pipelines', PipelineViewSet, basename='pipelines')
router.register(r'cde-connections', CDEConnectionViewSet, basename='cde-connections')
router.register(r'project-configs', ProjectPipelineConfigViewSet, basename='project-configs')
router.register(r'runs', PipelineRunViewSet, basename='runs')

# Nested steps under pipelines (using explicit paths)
steps_list = PipelineStepViewSet.as_view({
    'get': 'list',
    'post': 'create'
})
steps_reorder = PipelineStepViewSet.as_view({
    'post': 'reorder'
})
steps_detail = PipelineStepViewSet.as_view({
    'get': 'retrieve',
    'patch': 'partial_update',
    'put': 'update',
    'delete': 'destroy'
})

urlpatterns = [
    # ViewSet routes
    path('', include(router.urls)),

    # Nested steps routes
    path('pipelines/<uuid:pipeline_pk>/steps/', steps_list, name='pipeline-steps-list'),
    path('pipelines/<uuid:pipeline_pk>/steps/reorder/', steps_reorder, name='pipeline-steps-reorder'),
    path('pipelines/<uuid:pipeline_pk>/steps/<uuid:pk>/', steps_detail, name='pipeline-steps-detail'),

    # Agent API routes
    path('agent/register/', AgentRegisterView.as_view(), name='agent-register'),
    path('agent/heartbeat/', AgentHeartbeatView.as_view(), name='agent-heartbeat'),
    path('agent/jobs/', AgentJobsView.as_view(), name='agent-jobs'),
    path('agent/jobs/<uuid:run_id>/claim/', AgentJobClaimView.as_view(), name='agent-job-claim'),
    path('agent/jobs/<uuid:run_id>/step/<uuid:step_id>/start/', AgentStepStartView.as_view(), name='agent-step-start'),
    path('agent/jobs/<uuid:run_id>/step/<uuid:step_id>/complete/', AgentStepCompleteView.as_view(), name='agent-step-complete'),
    path('agent/jobs/<uuid:run_id>/complete/', AgentRunCompleteView.as_view(), name='agent-run-complete'),
]
