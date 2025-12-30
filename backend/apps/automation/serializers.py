"""
Serializers for Automation Pipeline API.
"""
from rest_framework import serializers
from apps.projects.models import Project
from .models import (
    Pipeline,
    PipelineStep,
    CDEConnection,
    ProjectPipelineConfig,
    PipelineRun,
    PipelineStepRun,
    AgentRegistration,
)


class PipelineStepSerializer(serializers.ModelSerializer):
    """Serializer for pipeline steps."""

    class Meta:
        model = PipelineStep
        fields = [
            'id', 'name', 'step_type', 'order', 'config',
            'max_retries', 'retry_delay_seconds', 'continue_on_failure', 'timeout_seconds'
        ]
        read_only_fields = ['id']


class PipelineSerializer(serializers.ModelSerializer):
    """Serializer for pipelines with nested steps."""
    steps = PipelineStepSerializer(many=True, read_only=True)
    run_count = serializers.SerializerMethodField()
    last_run = serializers.SerializerMethodField()

    class Meta:
        model = Pipeline
        fields = [
            'id', 'name', 'description', 'scope', 'parameters_schema',
            'is_active', 'is_template', 'author_name',
            'steps', 'run_count', 'last_run',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_run_count(self, obj):
        return obj.runs.count()

    def get_last_run(self, obj):
        last = obj.runs.order_by('-created_at').first()
        if last:
            return {
                'id': str(last.id),
                'status': last.status,
                'created_at': last.created_at.isoformat(),
            }
        return None


class PipelineListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for pipeline lists."""
    step_count = serializers.SerializerMethodField()
    run_count = serializers.SerializerMethodField()

    class Meta:
        model = Pipeline
        fields = [
            'id', 'name', 'description', 'scope',
            'is_active', 'is_template', 'author_name',
            'step_count', 'run_count', 'created_at'
        ]

    def get_step_count(self, obj):
        return obj.steps.count()

    def get_run_count(self, obj):
        return obj.runs.count()


class CDEConnectionSerializer(serializers.ModelSerializer):
    """Serializer for CDE connections (excludes sensitive data)."""
    project_name = serializers.CharField(source='project.name', read_only=True)

    class Meta:
        model = CDEConnection
        fields = [
            'id', 'name', 'cde_type', 'project', 'project_name', 'config',
            'is_active', 'last_sync_at', 'last_sync_status',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'last_sync_at', 'last_sync_status']


class CDEConnectionCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating CDE connections with credentials."""
    credentials = serializers.JSONField(write_only=True, required=False)

    class Meta:
        model = CDEConnection
        fields = [
            'id', 'name', 'cde_type', 'project', 'config', 'credentials',
            'is_active'
        ]
        read_only_fields = ['id']

    def create(self, validated_data):
        credentials = validated_data.pop('credentials', None)
        connection = super().create(validated_data)

        if credentials:
            # TODO: Store credentials in Supabase Vault
            # vault_secret_id = store_in_vault(credentials)
            # connection.vault_secret_id = vault_secret_id
            # connection.save()
            pass

        return connection


class ProjectPipelineConfigSerializer(serializers.ModelSerializer):
    """Serializer for project pipeline configurations."""
    pipeline_name = serializers.CharField(source='pipeline.name', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True)

    class Meta:
        model = ProjectPipelineConfig
        fields = [
            'id', 'project', 'project_name', 'pipeline', 'pipeline_name',
            'parameters_override', 'is_enabled', 'cde_connection',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class PipelineStepRunSerializer(serializers.ModelSerializer):
    """Serializer for step run records."""
    step_name = serializers.CharField(source='step.name', read_only=True)
    step_type = serializers.CharField(source='step.step_type', read_only=True)
    step_order = serializers.IntegerField(source='step.order', read_only=True)

    class Meta:
        model = PipelineStepRun
        fields = [
            'id', 'step', 'step_name', 'step_type', 'step_order',
            'status', 'attempt_number',
            'started_at', 'completed_at', 'duration_ms',
            'output_log', 'result_data', 'error_message', 'output_files'
        ]
        read_only_fields = ['id']


class PipelineRunSerializer(serializers.ModelSerializer):
    """Serializer for pipeline runs with nested step runs."""
    pipeline_name = serializers.CharField(source='pipeline.name', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True)
    step_runs = PipelineStepRunSerializer(many=True, read_only=True)
    progress_percent = serializers.SerializerMethodField()

    class Meta:
        model = PipelineRun
        fields = [
            'id', 'pipeline', 'pipeline_name', 'project', 'project_name',
            'status', 'trigger_type', 'parameters',
            'started_at', 'completed_at', 'duration_ms',
            'agent_id', 'agent_hostname', 'triggered_by',
            'steps_total', 'steps_completed', 'steps_failed',
            'progress_percent', 'error_message',
            'step_runs', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    def get_progress_percent(self, obj):
        if obj.steps_total == 0:
            return 0
        return int((obj.steps_completed / obj.steps_total) * 100)


class PipelineRunListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for run lists."""
    pipeline_name = serializers.CharField(source='pipeline.name', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True)
    progress_percent = serializers.SerializerMethodField()

    class Meta:
        model = PipelineRun
        fields = [
            'id', 'pipeline', 'pipeline_name', 'project', 'project_name',
            'status', 'trigger_type',
            'steps_total', 'steps_completed', 'steps_failed', 'progress_percent',
            'duration_ms', 'agent_hostname', 'created_at'
        ]

    def get_progress_percent(self, obj):
        if obj.steps_total == 0:
            return 0
        return int((obj.steps_completed / obj.steps_total) * 100)


class PipelineRunCreateSerializer(serializers.ModelSerializer):
    """Serializer for triggering a new pipeline run."""

    class Meta:
        model = PipelineRun
        fields = ['pipeline', 'project', 'trigger_type', 'parameters', 'triggered_by']

    def create(self, validated_data):
        pipeline = validated_data['pipeline']
        run = super().create(validated_data)

        # Create step run records for each step
        steps = pipeline.steps.all()
        run.steps_total = steps.count()
        run.save()

        for step in steps:
            PipelineStepRun.objects.create(
                pipeline_run=run,
                step=step,
                status='pending'
            )

        return run


class AgentRegistrationSerializer(serializers.ModelSerializer):
    """Serializer for agent registration."""
    project_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Project.objects.all(),
        source='projects',
        required=False
    )

    class Meta:
        model = AgentRegistration
        fields = [
            'id', 'name', 'hostname', 'capabilities', 'project_ids',
            'is_active', 'last_seen_at', 'created_at'
        ]
        read_only_fields = ['id', 'last_seen_at', 'created_at']


class AgentRegistrationCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a new agent (returns API key once)."""
    api_key = serializers.CharField(read_only=True)

    class Meta:
        model = AgentRegistration
        fields = ['id', 'name', 'hostname', 'capabilities', 'api_key']
        read_only_fields = ['id', 'api_key']

    def create(self, validated_data):
        api_key, api_key_hash = AgentRegistration.generate_api_key()
        agent = AgentRegistration.objects.create(
            api_key_hash=api_key_hash,
            **validated_data
        )
        # Attach the API key to return it once
        agent.api_key = api_key
        return agent


# Agent API Serializers (for CLI communication)

class AgentHeartbeatSerializer(serializers.Serializer):
    """Serializer for agent heartbeat."""
    agent_id = serializers.UUIDField()
    hostname = serializers.CharField()
    capabilities = serializers.ListField(child=serializers.CharField(), required=False)


class AgentJobClaimSerializer(serializers.Serializer):
    """Serializer for claiming a job."""
    agent_id = serializers.UUIDField()
    agent_hostname = serializers.CharField()


class AgentStepUpdateSerializer(serializers.Serializer):
    """Serializer for updating step status from agent."""
    status = serializers.ChoiceField(choices=['running', 'success', 'failed', 'skipped'])
    output_log = serializers.CharField(required=False, allow_blank=True)
    result_data = serializers.JSONField(required=False)
    error_message = serializers.CharField(required=False, allow_blank=True)
    output_files = serializers.ListField(child=serializers.CharField(), required=False)
