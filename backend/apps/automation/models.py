"""
Automation Pipeline System for Sprucelab.

This module provides:
- Pipeline: Multi-step workflow templates
- PipelineStep: Individual actions within a pipeline
- CDEConnection: CDE credentials per project (Dalux, BIM360)
- ProjectPipelineConfig: Project opt-in/out for pipelines
- PipelineRun: Execution records
- PipelineStepRun: Per-step execution logs
- AgentRegistration: Registered CLI agents
"""
from django.db import models
from django.contrib.postgres.fields import ArrayField
import uuid
import hashlib
import secrets


class Pipeline(models.Model):
    """
    A pipeline is a reusable template of steps.
    Can be applied to single projects or multi-project flows.
    """
    SCOPE_CHOICES = [
        ('single_project', 'Single Project'),
        ('multi_project', 'Multi-Project'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    scope = models.CharField(max_length=20, choices=SCOPE_CHOICES, default='single_project')

    # JSON Schema for pipeline-level parameters
    parameters_schema = models.JSONField(default=dict, blank=True)

    is_active = models.BooleanField(default=True)
    is_template = models.BooleanField(
        default=False,
        help_text="Global template available to all projects"
    )

    author_name = models.CharField(max_length=255, default='System')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'automation_pipelines'
        ordering = ['name']
        indexes = [
            models.Index(fields=['is_active']),
            models.Index(fields=['scope']),
        ]

    def __str__(self):
        return f"{self.name} ({self.scope})"


class PipelineStep(models.Model):
    """
    Individual step within a pipeline.
    Steps are executed in order based on `order` field.
    """
    STEP_TYPES = [
        ('cde_sync', 'CDE Sync'),
        ('script', 'Script Execution'),
        ('file_transform', 'File Transform'),
        ('distribution', 'Distribution'),
        ('webhook', 'Webhook'),
        ('condition', 'Condition'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    pipeline = models.ForeignKey(
        Pipeline,
        on_delete=models.CASCADE,
        related_name='steps'
    )
    name = models.CharField(max_length=255)
    step_type = models.CharField(max_length=20, choices=STEP_TYPES)
    order = models.PositiveIntegerField(default=0)

    # Step configuration (type-specific JSON)
    # cde_sync: {"cde_type": "dalux", "action": "download", "folder_path": "/..."}
    # script: {"script_id": "uuid", "parameters": {...}}
    # file_transform: {"operation": "merge", "options": {...}}
    config = models.JSONField(default=dict)

    max_retries = models.PositiveIntegerField(default=3)
    retry_delay_seconds = models.PositiveIntegerField(default=60)
    continue_on_failure = models.BooleanField(default=False)
    timeout_seconds = models.PositiveIntegerField(default=3600)

    class Meta:
        db_table = 'automation_pipeline_steps'
        ordering = ['order']
        unique_together = ['pipeline', 'order']
        indexes = [
            models.Index(fields=['pipeline', 'order']),
            models.Index(fields=['step_type']),
        ]

    def __str__(self):
        return f"{self.pipeline.name} - Step {self.order}: {self.name}"


class CDEConnection(models.Model):
    """
    CDE credentials and configuration per project.
    Actual secrets stored in Supabase Vault, referenced by vault_secret_id.
    """
    CDE_TYPES = [
        ('dalux', 'Dalux'),
        ('bim360', 'BIM360/ACC'),
        ('trimble_connect', 'Trimble Connect'),
        ('sharepoint', 'SharePoint'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        related_name='cde_connections'
    )

    cde_type = models.CharField(max_length=30, choices=CDE_TYPES)
    name = models.CharField(max_length=255)

    # Non-sensitive config (project IDs, folder paths)
    config = models.JSONField(default=dict)

    # Reference to secret in Supabase Vault
    vault_secret_id = models.CharField(max_length=255, blank=True)

    is_active = models.BooleanField(default=True)
    last_sync_at = models.DateTimeField(null=True, blank=True)
    last_sync_status = models.CharField(max_length=20, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'automation_cde_connections'
        ordering = ['name']
        indexes = [
            models.Index(fields=['project']),
            models.Index(fields=['cde_type']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return f"{self.name} ({self.cde_type}) - {self.project.name}"


class ProjectPipelineConfig(models.Model):
    """
    Configuration for a pipeline on a specific project.
    Allows projects to opt-in/out of multi-project flows.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        related_name='pipeline_configs'
    )
    pipeline = models.ForeignKey(
        Pipeline,
        on_delete=models.CASCADE,
        related_name='project_configs'
    )

    # Override pipeline parameters for this project
    parameters_override = models.JSONField(default=dict, blank=True)

    is_enabled = models.BooleanField(default=True)

    # CDE connection to use for this pipeline
    cde_connection = models.ForeignKey(
        CDEConnection,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'automation_project_pipeline_configs'
        unique_together = ['project', 'pipeline']
        indexes = [
            models.Index(fields=['project']),
            models.Index(fields=['pipeline']),
            models.Index(fields=['is_enabled']),
        ]

    def __str__(self):
        status = "enabled" if self.is_enabled else "disabled"
        return f"{self.pipeline.name} on {self.project.name} ({status})"


class PipelineRun(models.Model):
    """
    Record of a complete pipeline execution.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('queued', 'Queued'),
        ('running', 'Running'),
        ('success', 'Success'),
        ('partial', 'Partial'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
    ]

    TRIGGER_TYPES = [
        ('manual', 'Manual'),
        ('scheduled', 'Scheduled'),
        ('cde_webhook', 'CDE Webhook'),
        ('cli', 'CLI Triggered'),
        ('daemon', 'Daemon Poll'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    pipeline = models.ForeignKey(
        Pipeline,
        on_delete=models.CASCADE,
        related_name='runs'
    )
    project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='pipeline_runs'
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    trigger_type = models.CharField(max_length=20, choices=TRIGGER_TYPES)

    # Runtime parameters
    parameters = models.JSONField(default=dict)

    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    duration_ms = models.IntegerField(null=True, blank=True)

    # Agent that executed this run
    agent_id = models.CharField(max_length=255, blank=True, null=True)
    agent_hostname = models.CharField(max_length=255, blank=True, null=True)

    triggered_by = models.CharField(max_length=255, blank=True)

    # Progress tracking
    steps_total = models.PositiveIntegerField(default=0)
    steps_completed = models.PositiveIntegerField(default=0)
    steps_failed = models.PositiveIntegerField(default=0)

    error_message = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'automation_pipeline_runs'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['pipeline']),
            models.Index(fields=['project']),
            models.Index(fields=['status']),
            models.Index(fields=['-created_at']),
            models.Index(fields=['agent_id']),
        ]

    def __str__(self):
        return f"{self.pipeline.name} run ({self.status}) - {self.created_at}"

    def calculate_duration(self):
        if self.started_at and self.completed_at:
            delta = self.completed_at - self.started_at
            self.duration_ms = int(delta.total_seconds() * 1000)


class PipelineStepRun(models.Model):
    """
    Record of individual step execution within a pipeline run.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('running', 'Running'),
        ('success', 'Success'),
        ('failed', 'Failed'),
        ('skipped', 'Skipped'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    pipeline_run = models.ForeignKey(
        PipelineRun,
        on_delete=models.CASCADE,
        related_name='step_runs'
    )
    step = models.ForeignKey(
        PipelineStep,
        on_delete=models.CASCADE,
        related_name='runs'
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )

    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    duration_ms = models.IntegerField(null=True, blank=True)

    attempt_number = models.PositiveIntegerField(default=1)

    output_log = models.TextField(blank=True)
    result_data = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True, null=True)

    # Files produced by this step (for chaining to next step)
    output_files = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = 'automation_pipeline_step_runs'
        ordering = ['step__order']
        indexes = [
            models.Index(fields=['pipeline_run']),
            models.Index(fields=['step']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f"{self.step.name} ({self.status})"

    def calculate_duration(self):
        if self.started_at and self.completed_at:
            delta = self.completed_at - self.started_at
            self.duration_ms = int(delta.total_seconds() * 1000)


class AgentRegistration(models.Model):
    """
    Registered local agents (spruce CLI instances).
    Agents authenticate with API keys and can pick up jobs.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    hostname = models.CharField(max_length=255)

    # API key hash (actual key shown once on creation)
    api_key_hash = models.CharField(max_length=64)

    last_seen_at = models.DateTimeField(null=True, blank=True)

    # Agent capabilities
    capabilities = models.JSONField(default=list, blank=True)

    # Projects this agent can serve (empty = all)
    projects = models.ManyToManyField(
        'projects.Project',
        blank=True,
        related_name='automation_agents'
    )

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'automation_agents'
        ordering = ['name']
        indexes = [
            models.Index(fields=['is_active']),
            models.Index(fields=['last_seen_at']),
        ]

    def __str__(self):
        return f"{self.name} ({self.hostname})"

    @classmethod
    def generate_api_key(cls):
        """Generate a new API key and return (key, hash)."""
        key = secrets.token_urlsafe(32)
        key_hash = hashlib.sha256(key.encode()).hexdigest()
        return key, key_hash

    def verify_api_key(self, key: str) -> bool:
        """Verify an API key against the stored hash."""
        key_hash = hashlib.sha256(key.encode()).hexdigest()
        return key_hash == self.api_key_hash
