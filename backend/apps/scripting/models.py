"""
Script execution system models for BIM Coordinator Platform.

This module provides:
- Script: Library of executable scripts (Python code)
- ScriptExecution: History of script runs
- AutomationWorkflow: Automated/scheduled workflows
- WorkflowExecution: History of workflow triggers
"""
from django.db import models
from django.contrib.postgres.fields import ArrayField
import uuid


class Script(models.Model):
    """
    Executable script in the library.

    Scripts are Python code that can be executed on models to perform
    validation, analysis, export, or transformation tasks.
    """
    SCRIPT_TYPES = [
        ('python', 'Python Script'),
        ('validation_rule', 'Validation Rule'),
        ('export', 'Export Script'),
    ]

    CATEGORIES = [
        ('validation', 'Validation'),
        ('export', 'Export'),
        ('transform', 'Transform'),
        ('analysis', 'Analysis'),
        ('reporting', 'Reporting'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    script_type = models.CharField(max_length=50, choices=SCRIPT_TYPES, default='python')
    code = models.TextField(help_text="Python code to execute")

    # JSON Schema for expected parameters
    # Example: {"type": "object", "properties": {"threshold": {"type": "number"}}}
    parameters_schema = models.JSONField(default=dict, blank=True)

    category = models.CharField(max_length=50, choices=CATEGORIES, default='analysis')
    is_public = models.BooleanField(default=True, help_text="Public scripts visible to all users")

    # Author tracking (Future: add FK to User model when auth is implemented)
    author_name = models.CharField(max_length=255, default='System', help_text="Script author")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'scripts'
        ordering = ['category', 'name']
        indexes = [
            models.Index(fields=['category']),
            models.Index(fields=['is_public']),
            models.Index(fields=['script_type']),
        ]

    def __str__(self):
        return f"{self.name} ({self.category})"


class ScriptExecution(models.Model):
    """
    Record of a script execution on a model.

    Tracks status, parameters, output, and results of each script run.
    """
    STATUS_CHOICES = [
        ('queued', 'Queued'),
        ('running', 'Running'),
        ('success', 'Success'),
        ('error', 'Error'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    script = models.ForeignKey(Script, on_delete=models.CASCADE, related_name='executions')
    model = models.ForeignKey('models.Model', on_delete=models.CASCADE, related_name='script_executions')

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='queued')

    # Execution parameters (actual values passed to script)
    parameters = models.JSONField(default=dict, blank=True)

    # Timing
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    duration_ms = models.IntegerField(null=True, blank=True, help_text="Execution time in milliseconds")

    # Output
    output_log = models.TextField(blank=True, null=True, help_text="Captured stdout/stderr")

    # Results
    result_data = models.JSONField(default=dict, blank=True, help_text="Structured results (counts, statistics)")
    result_files = models.JSONField(default=list, blank=True, help_text="Array of file URLs in storage")

    # Error handling
    error_message = models.TextField(blank=True, null=True)

    # Future: Track who executed
    executed_by_name = models.CharField(max_length=255, default='System', blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'script_executions'
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['script']),
            models.Index(fields=['model']),
            models.Index(fields=['status']),
            models.Index(fields=['-started_at']),
        ]

    def __str__(self):
        return f"{self.script.name} on {self.model.name} - {self.status}"

    def calculate_duration(self):
        """Calculate and update duration_ms from start/end times."""
        if self.started_at and self.completed_at:
            delta = self.completed_at - self.started_at
            self.duration_ms = int(delta.total_seconds() * 1000)


class AutomationWorkflow(models.Model):
    """
    Automated workflow that triggers script execution.

    Workflows can be triggered:
    - on_upload: When a new model is uploaded
    - scheduled: At regular intervals (cron-like)
    - manual: User-initiated
    """
    TRIGGER_TYPES = [
        ('on_upload', 'On Model Upload'),
        ('scheduled', 'Scheduled'),
        ('manual', 'Manual'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)

    trigger_type = models.CharField(max_length=50, choices=TRIGGER_TYPES)

    # Trigger configuration (JSON)
    # For scheduled: {"cron": "0 0 * * MON"}  (every Monday at midnight)
    # For on_upload: {"conditions": {"project_id": "..."}}
    trigger_config = models.JSONField(default=dict, blank=True)

    # Script to execute
    script = models.ForeignKey(Script, on_delete=models.CASCADE, related_name='workflows')

    # Default parameters to pass to script
    default_parameters = models.JSONField(default=dict, blank=True)

    # Active/inactive toggle
    is_active = models.BooleanField(default=True)

    # Scope (optional project filter)
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, null=True, blank=True, related_name='workflows')

    # Tracking
    last_run_at = models.DateTimeField(null=True, blank=True)
    next_run_at = models.DateTimeField(null=True, blank=True, help_text="For scheduled workflows")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'automation_workflows'
        ordering = ['name']
        indexes = [
            models.Index(fields=['trigger_type']),
            models.Index(fields=['is_active']),
            models.Index(fields=['project']),
            models.Index(fields=['next_run_at']),
        ]

    def __str__(self):
        return f"{self.name} ({self.trigger_type})"


class WorkflowExecution(models.Model):
    """
    Record of a workflow trigger.

    Links a workflow to its resulting script execution.
    """
    STATUS_CHOICES = [
        ('success', 'Success'),
        ('error', 'Error'),
        ('skipped', 'Skipped'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workflow = models.ForeignKey(AutomationWorkflow, on_delete=models.CASCADE, related_name='executions')
    model = models.ForeignKey('models.Model', on_delete=models.CASCADE, null=True, blank=True, related_name='workflow_executions')

    # Link to the actual script execution
    script_execution = models.ForeignKey(ScriptExecution, on_delete=models.SET_NULL, null=True, blank=True, related_name='workflow_trigger')

    status = models.CharField(max_length=20, choices=STATUS_CHOICES)

    # How was this triggered?
    triggered_by = models.CharField(max_length=50, help_text="upload, schedule, manual")

    # Future: Track who triggered (for manual workflows)
    triggered_by_user_name = models.CharField(max_length=255, blank=True, null=True)

    error_message = models.TextField(blank=True, null=True)
    executed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'workflow_executions'
        ordering = ['-executed_at']
        indexes = [
            models.Index(fields=['workflow']),
            models.Index(fields=['model']),
            models.Index(fields=['-executed_at']),
        ]

    def __str__(self):
        return f"{self.workflow.name} - {self.status}"
