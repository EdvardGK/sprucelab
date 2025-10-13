"""
REST API serializers for Scripting module.

Serializes scripts, executions, workflows for API endpoints.
"""
from rest_framework import serializers
from .models import (
    Script,
    ScriptExecution,
    AutomationWorkflow,
    WorkflowExecution,
)


class ScriptSerializer(serializers.ModelSerializer):
    """Serialize executable scripts."""

    class Meta:
        model = Script
        fields = [
            'id', 'name', 'description', 'script_type', 'code',
            'parameters_schema', 'category', 'is_public', 'author_name',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ScriptListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing scripts (no code)."""

    execution_count = serializers.SerializerMethodField()

    class Meta:
        model = Script
        fields = [
            'id', 'name', 'description', 'script_type', 'category',
            'is_public', 'author_name', 'execution_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_execution_count(self, obj):
        """Count of successful executions."""
        return obj.executions.filter(status='success').count()


class ScriptExecutionSerializer(serializers.ModelSerializer):
    """Serialize script execution records."""

    script_name = serializers.CharField(source='script.name', read_only=True)
    model_name = serializers.CharField(source='model.name', read_only=True)

    class Meta:
        model = ScriptExecution
        fields = [
            'id', 'script', 'script_name', 'model', 'model_name',
            'status', 'parameters', 'started_at', 'completed_at',
            'duration_ms', 'output_log', 'result_data', 'result_files',
            'error_message', 'executed_by_name', 'created_at'
        ]
        read_only_fields = [
            'id', 'script_name', 'model_name', 'status', 'started_at',
            'completed_at', 'duration_ms', 'output_log', 'result_data',
            'result_files', 'error_message', 'created_at'
        ]


class ScriptExecutionListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing executions."""

    script_name = serializers.CharField(source='script.name', read_only=True)
    model_name = serializers.CharField(source='model.name', read_only=True)

    class Meta:
        model = ScriptExecution
        fields = [
            'id', 'script', 'script_name', 'model', 'model_name',
            'status', 'started_at', 'completed_at', 'duration_ms',
            'error_message', 'created_at'
        ]
        read_only_fields = ['id', 'script_name', 'model_name', 'created_at']


class ExecuteScriptRequestSerializer(serializers.Serializer):
    """Serializer for script execution request."""

    script_id = serializers.UUIDField(help_text="ID of script to execute")
    parameters = serializers.JSONField(
        required=False,
        default=dict,
        help_text="Parameters to pass to script (must match script's parameters_schema)"
    )


class AutomationWorkflowSerializer(serializers.ModelSerializer):
    """Serialize automation workflows."""

    script_name = serializers.CharField(source='script.name', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True, allow_null=True)

    class Meta:
        model = AutomationWorkflow
        fields = [
            'id', 'name', 'description', 'trigger_type', 'trigger_config',
            'script', 'script_name', 'default_parameters', 'is_active',
            'project', 'project_name', 'last_run_at', 'next_run_at',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'script_name', 'project_name', 'last_run_at', 'next_run_at', 'created_at', 'updated_at']


class WorkflowExecutionSerializer(serializers.ModelSerializer):
    """Serialize workflow execution records."""

    workflow_name = serializers.CharField(source='workflow.name', read_only=True)
    model_name = serializers.CharField(source='model.name', read_only=True, allow_null=True)

    class Meta:
        model = WorkflowExecution
        fields = [
            'id', 'workflow', 'workflow_name', 'model', 'model_name',
            'script_execution', 'status', 'triggered_by',
            'triggered_by_user_name', 'error_message', 'executed_at'
        ]
        read_only_fields = ['id', 'workflow_name', 'model_name', 'executed_at']
