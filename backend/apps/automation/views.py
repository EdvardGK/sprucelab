"""
API Views for Automation Pipeline System.
"""
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Pipeline,
    PipelineStep,
    CDEConnection,
    ProjectPipelineConfig,
    PipelineRun,
    PipelineStepRun,
    AgentRegistration,
)
from .serializers import (
    PipelineSerializer,
    PipelineListSerializer,
    PipelineStepSerializer,
    CDEConnectionSerializer,
    CDEConnectionCreateSerializer,
    ProjectPipelineConfigSerializer,
    PipelineRunSerializer,
    PipelineRunListSerializer,
    PipelineRunCreateSerializer,
    PipelineStepRunSerializer,
    AgentRegistrationSerializer,
    AgentRegistrationCreateSerializer,
    AgentHeartbeatSerializer,
    AgentJobClaimSerializer,
    AgentStepUpdateSerializer,
)


class PipelineViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Pipeline CRUD operations.

    list: List all pipelines
    create: Create a new pipeline
    retrieve: Get pipeline details with steps
    update/partial_update: Update pipeline
    delete: Delete pipeline
    run: Trigger a pipeline run
    duplicate: Duplicate a pipeline
    """
    queryset = Pipeline.objects.all()

    def get_serializer_class(self):
        if self.action == 'list':
            return PipelineListSerializer
        return PipelineSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        scope = self.request.query_params.get('scope')
        is_active = self.request.query_params.get('is_active')
        is_template = self.request.query_params.get('is_template')

        if scope:
            queryset = queryset.filter(scope=scope)
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        if is_template is not None:
            queryset = queryset.filter(is_template=is_template.lower() == 'true')

        return queryset

    @action(detail=True, methods=['post'])
    def run(self, request, pk=None):
        """Trigger a pipeline run."""
        pipeline = self.get_object()
        project_id = request.data.get('project_id')
        parameters = request.data.get('parameters', {})
        triggered_by = request.data.get('triggered_by', 'api')

        # Create the run
        run = PipelineRun.objects.create(
            pipeline=pipeline,
            project_id=project_id,
            trigger_type='manual',
            parameters=parameters,
            triggered_by=triggered_by,
            status='queued',
            steps_total=pipeline.steps.count()
        )

        # Create step run records
        for step in pipeline.steps.all():
            PipelineStepRun.objects.create(
                pipeline_run=run,
                step=step,
                status='pending'
            )

        serializer = PipelineRunSerializer(run)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """Duplicate a pipeline."""
        original = self.get_object()

        # Create copy
        new_pipeline = Pipeline.objects.create(
            name=f"{original.name} (Copy)",
            description=original.description,
            scope=original.scope,
            parameters_schema=original.parameters_schema,
            is_active=False,  # Duplicates start inactive
            is_template=False,
            author_name=request.data.get('author_name', 'System')
        )

        # Copy steps
        for step in original.steps.all():
            PipelineStep.objects.create(
                pipeline=new_pipeline,
                name=step.name,
                step_type=step.step_type,
                order=step.order,
                config=step.config,
                max_retries=step.max_retries,
                retry_delay_seconds=step.retry_delay_seconds,
                continue_on_failure=step.continue_on_failure,
                timeout_seconds=step.timeout_seconds
            )

        serializer = PipelineSerializer(new_pipeline)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PipelineStepViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Pipeline Steps (nested under pipelines).
    """
    serializer_class = PipelineStepSerializer

    def get_queryset(self):
        pipeline_id = self.kwargs.get('pipeline_pk')
        return PipelineStep.objects.filter(pipeline_id=pipeline_id)

    def perform_create(self, serializer):
        pipeline_id = self.kwargs.get('pipeline_pk')
        pipeline = get_object_or_404(Pipeline, pk=pipeline_id)
        serializer.save(pipeline=pipeline)

    @action(detail=False, methods=['post'])
    def reorder(self, request, pipeline_pk=None):
        """Reorder steps within a pipeline."""
        step_orders = request.data.get('step_orders', [])

        for item in step_orders:
            step_id = item.get('id')
            order = item.get('order')
            PipelineStep.objects.filter(id=step_id, pipeline_id=pipeline_pk).update(order=order)

        steps = PipelineStep.objects.filter(pipeline_id=pipeline_pk).order_by('order')
        serializer = self.get_serializer(steps, many=True)
        return Response(serializer.data)


class CDEConnectionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for CDE Connection CRUD operations.
    """
    queryset = CDEConnection.objects.all()

    def get_serializer_class(self):
        if self.action == 'create':
            return CDEConnectionCreateSerializer
        return CDEConnectionSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        project_id = self.request.query_params.get('project')
        cde_type = self.request.query_params.get('cde_type')

        if project_id:
            queryset = queryset.filter(project_id=project_id)
        if cde_type:
            queryset = queryset.filter(cde_type=cde_type)

        return queryset

    @action(detail=True, methods=['post'])
    def test(self, request, pk=None):
        """Test a CDE connection."""
        connection = self.get_object()

        # TODO: Implement actual connection test based on cde_type
        # For now, return a mock response
        return Response({
            'success': True,
            'message': f'Connection test for {connection.cde_type} not yet implemented',
            'connection_id': str(connection.id)
        })

    @action(detail=True, methods=['post'])
    def sync(self, request, pk=None):
        """Trigger a manual sync for this connection."""
        connection = self.get_object()

        # TODO: Implement actual sync
        connection.last_sync_at = timezone.now()
        connection.last_sync_status = 'pending'
        connection.save()

        return Response({
            'message': f'Sync triggered for {connection.name}',
            'connection_id': str(connection.id)
        })


class ProjectPipelineConfigViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Project Pipeline Configurations.
    """
    serializer_class = ProjectPipelineConfigSerializer
    queryset = ProjectPipelineConfig.objects.all()

    def get_queryset(self):
        queryset = super().get_queryset()
        project_id = self.request.query_params.get('project')
        pipeline_id = self.request.query_params.get('pipeline')

        if project_id:
            queryset = queryset.filter(project_id=project_id)
        if pipeline_id:
            queryset = queryset.filter(pipeline_id=pipeline_id)

        return queryset

    @action(detail=True, methods=['post'])
    def enable(self, request, pk=None):
        """Enable a pipeline for a project."""
        config = self.get_object()
        config.is_enabled = True
        config.save()
        serializer = self.get_serializer(config)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def disable(self, request, pk=None):
        """Disable a pipeline for a project."""
        config = self.get_object()
        config.is_enabled = False
        config.save()
        serializer = self.get_serializer(config)
        return Response(serializer.data)


class PipelineRunViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Pipeline Runs.
    """
    queryset = PipelineRun.objects.all()

    def get_serializer_class(self):
        if self.action == 'list':
            return PipelineRunListSerializer
        if self.action == 'create':
            return PipelineRunCreateSerializer
        return PipelineRunSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        pipeline_id = self.request.query_params.get('pipeline')
        project_id = self.request.query_params.get('project')
        status_filter = self.request.query_params.get('status')

        if pipeline_id:
            queryset = queryset.filter(pipeline_id=pipeline_id)
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        return queryset

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a running pipeline."""
        run = self.get_object()
        if run.status in ['running', 'queued', 'pending']:
            run.status = 'cancelled'
            run.completed_at = timezone.now()
            run.calculate_duration()
            run.save()

            # Mark pending steps as skipped
            run.step_runs.filter(status='pending').update(status='skipped')

        serializer = self.get_serializer(run)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def logs(self, request, pk=None):
        """Get full logs for a run."""
        run = self.get_object()
        step_runs = run.step_runs.select_related('step').order_by('step__order')

        logs = []
        for step_run in step_runs:
            logs.append({
                'step_name': step_run.step.name,
                'step_type': step_run.step.step_type,
                'status': step_run.status,
                'output_log': step_run.output_log,
                'error_message': step_run.error_message,
                'started_at': step_run.started_at,
                'completed_at': step_run.completed_at,
                'duration_ms': step_run.duration_ms,
            })

        return Response({
            'run_id': str(run.id),
            'pipeline_name': run.pipeline.name,
            'status': run.status,
            'steps': logs
        })


# Agent API Views (for spruce CLI)

class AgentRegisterView(APIView):
    """Register a new agent."""

    def post(self, request):
        serializer = AgentRegistrationCreateSerializer(data=request.data)
        if serializer.is_valid():
            agent = serializer.save()
            return Response({
                'id': str(agent.id),
                'name': agent.name,
                'api_key': agent.api_key,  # Only returned once!
                'message': 'Agent registered. Save this API key - it will not be shown again.'
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AgentHeartbeatView(APIView):
    """Agent heartbeat to report status."""

    def post(self, request):
        serializer = AgentHeartbeatSerializer(data=request.data)
        if serializer.is_valid():
            agent_id = serializer.validated_data['agent_id']
            try:
                agent = AgentRegistration.objects.get(id=agent_id, is_active=True)
                agent.last_seen_at = timezone.now()
                agent.hostname = serializer.validated_data.get('hostname', agent.hostname)
                if 'capabilities' in serializer.validated_data:
                    agent.capabilities = serializer.validated_data['capabilities']
                agent.save()
                return Response({'status': 'ok'})
            except AgentRegistration.DoesNotExist:
                return Response({'error': 'Agent not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AgentJobsView(APIView):
    """Get pending jobs for an agent to pick up."""

    def get(self, request):
        agent_id = request.query_params.get('agent_id')
        if not agent_id:
            return Response({'error': 'agent_id required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            agent = AgentRegistration.objects.get(id=agent_id, is_active=True)
        except AgentRegistration.DoesNotExist:
            return Response({'error': 'Agent not found'}, status=status.HTTP_404_NOT_FOUND)

        # Find queued runs
        runs = PipelineRun.objects.filter(status='queued')

        # Filter by agent's project access
        if agent.projects.exists():
            runs = runs.filter(project__in=agent.projects.all())

        # Return oldest first
        runs = runs.order_by('created_at')[:10]

        jobs = []
        for run in runs:
            jobs.append({
                'run_id': str(run.id),
                'pipeline_id': str(run.pipeline.id),
                'pipeline_name': run.pipeline.name,
                'project_id': str(run.project.id) if run.project else None,
                'parameters': run.parameters,
                'steps': [
                    {
                        'step_id': str(step.id),
                        'step_name': step.name,
                        'step_type': step.step_type,
                        'order': step.order,
                        'config': step.config,
                        'timeout_seconds': step.timeout_seconds,
                    }
                    for step in run.pipeline.steps.all()
                ]
            })

        return Response({'jobs': jobs})


class AgentJobClaimView(APIView):
    """Claim a job for execution."""

    def post(self, request, run_id):
        serializer = AgentJobClaimSerializer(data=request.data)
        if serializer.is_valid():
            try:
                run = PipelineRun.objects.get(id=run_id, status='queued')
                run.status = 'running'
                run.agent_id = str(serializer.validated_data['agent_id'])
                run.agent_hostname = serializer.validated_data['agent_hostname']
                run.started_at = timezone.now()
                run.save()
                return Response({'status': 'claimed', 'run_id': str(run.id)})
            except PipelineRun.DoesNotExist:
                return Response({'error': 'Run not found or already claimed'}, status=status.HTTP_404_NOT_FOUND)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AgentStepStartView(APIView):
    """Mark a step as started."""

    def post(self, request, run_id, step_id):
        try:
            step_run = PipelineStepRun.objects.get(
                pipeline_run_id=run_id,
                step_id=step_id
            )
            step_run.status = 'running'
            step_run.started_at = timezone.now()
            step_run.save()
            return Response({'status': 'started'})
        except PipelineStepRun.DoesNotExist:
            return Response({'error': 'Step run not found'}, status=status.HTTP_404_NOT_FOUND)


class AgentStepCompleteView(APIView):
    """Mark a step as completed (success or failure)."""

    def post(self, request, run_id, step_id):
        serializer = AgentStepUpdateSerializer(data=request.data)
        if serializer.is_valid():
            try:
                step_run = PipelineStepRun.objects.get(
                    pipeline_run_id=run_id,
                    step_id=step_id
                )
                step_run.status = serializer.validated_data['status']
                step_run.completed_at = timezone.now()
                step_run.calculate_duration()
                step_run.output_log = serializer.validated_data.get('output_log', '')
                step_run.result_data = serializer.validated_data.get('result_data', {})
                step_run.error_message = serializer.validated_data.get('error_message', '')
                step_run.output_files = serializer.validated_data.get('output_files', [])
                step_run.save()

                # Update run progress
                run = step_run.pipeline_run
                if step_run.status == 'success':
                    run.steps_completed += 1
                elif step_run.status == 'failed':
                    run.steps_failed += 1
                run.save()

                return Response({'status': 'updated'})
            except PipelineStepRun.DoesNotExist:
                return Response({'error': 'Step run not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AgentRunCompleteView(APIView):
    """Mark a run as completed."""

    def post(self, request, run_id):
        try:
            run = PipelineRun.objects.get(id=run_id)
            run.completed_at = timezone.now()
            run.calculate_duration()

            # Determine final status
            if run.steps_failed > 0:
                if run.steps_completed > 0:
                    run.status = 'partial'
                else:
                    run.status = 'failed'
            else:
                run.status = 'success'

            run.error_message = request.data.get('error_message', '')
            run.save()

            return Response({
                'status': run.status,
                'duration_ms': run.duration_ms
            })
        except PipelineRun.DoesNotExist:
            return Response({'error': 'Run not found'}, status=status.HTTP_404_NOT_FOUND)
