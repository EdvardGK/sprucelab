"""
IDS Validation Run model.

Records IDS validation runs against IFC models using ifctester.
Stores results summary and detailed JSON report.
"""
from django.db import models
import uuid


class IDSValidationRun(models.Model):
    """
    Record of an IDS validation run against an IFC model.

    Stores request context, result summary, and detailed ifctester JSON report.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # What was validated
    model = models.ForeignKey(
        'models.Model',
        on_delete=models.CASCADE,
        related_name='ids_validation_runs',
    )
    ids_specification = models.ForeignKey(
        'bep.IDSSpecification',
        on_delete=models.CASCADE,
        related_name='validation_runs',
    )

    # Optional context
    eir = models.ForeignKey(
        'bep.EIR',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='validation_runs',
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=[
            ('pending', 'Pending'),
            ('running', 'Running'),
            ('completed', 'Completed'),
            ('failed', 'Failed'),
        ],
        default='pending',
    )

    # Results summary
    overall_pass = models.BooleanField(null=True)
    total_specifications = models.IntegerField(default=0)
    specifications_passed = models.IntegerField(default=0)
    specifications_failed = models.IntegerField(default=0)
    total_checks = models.IntegerField(default=0)
    checks_passed = models.IntegerField(default=0)
    checks_failed = models.IntegerField(default=0)

    # Detailed results
    results_json = models.JSONField(
        default=dict,
        help_text="Full ifctester JSON report output"
    )

    # Timing
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.FloatField(null=True, blank=True)

    # Error info
    error_message = models.TextField(blank=True)

    # Triggered by
    triggered_by = models.CharField(max_length=255, blank=True)

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'ids_validation_runs'
        ordering = ['-created_at']
        verbose_name = 'IDS Validation Run'
        verbose_name_plural = 'IDS Validation Runs'

    def __str__(self):
        return f"IDS Run {self.id[:8]} - {self.status}"
