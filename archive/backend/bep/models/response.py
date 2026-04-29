"""
BEP Response models.

The delivery team's formal response to an EIR:
- BEPResponse: Overall response document linked to EIR + existing BEPConfiguration
- BEPResponseItem: Per-requirement compliance status, method, issues, wishes
"""
from django.db import models
import uuid


class BEPResponse(models.Model):
    """
    Formal BEP response to an EIR.

    The delivery team's response explaining how they will meet the EIR.
    Links to the existing BEPConfiguration for technical implementation details.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    eir = models.ForeignKey(
        'bep.EIR',
        on_delete=models.CASCADE,
        related_name='responses',
    )

    # Link to existing BEP system
    bep_configuration = models.ForeignKey(
        'bep.BEPConfiguration',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='eir_responses',
    )

    # Versioning
    version = models.IntegerField(default=1)
    status = models.CharField(
        max_length=20,
        choices=[
            ('draft', 'Draft'),
            ('submitted', 'Submitted'),
            ('accepted', 'Accepted'),
            ('revision_requested', 'Revision Requested'),
        ],
        default='draft',
    )

    # Respondent
    respondent_name = models.CharField(max_length=255, blank=True)
    respondent_organization = models.CharField(max_length=255, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    # General notes
    general_notes = models.TextField(blank=True)

    # Audit
    created_by = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'bep_responses'
        ordering = ['-created_at']
        unique_together = [['eir', 'version']]
        verbose_name = 'BEP Response'
        verbose_name_plural = 'BEP Responses'

    def __str__(self):
        return f"BEP Response v{self.version} to {self.eir} ({self.status})"


class BEPResponseItem(models.Model):
    """
    Response to a single EIR requirement.

    For each requirement, the delivery team provides:
    - Compliance status
    - How they'll meet it
    - Issues/concerns
    - Wishes/requests for modification
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    response = models.ForeignKey(
        BEPResponse,
        on_delete=models.CASCADE,
        related_name='items',
    )
    requirement = models.ForeignKey(
        'bep.EIRRequirement',
        on_delete=models.CASCADE,
        related_name='response_items',
    )

    # Compliance
    compliance_status = models.CharField(
        max_length=20,
        choices=[
            ('will_comply', 'Will Comply'),
            ('partially', 'Partially'),
            ('cannot_comply', 'Cannot Comply'),
            ('not_applicable', 'Not Applicable'),
            ('pending', 'Pending Review'),
        ],
        default='pending',
    )

    # How they'll meet it
    method_description = models.TextField(blank=True)

    # Issues and wishes
    issues = models.TextField(blank=True)
    wishes = models.TextField(blank=True)

    # Responsible discipline
    responsible_discipline = models.CharField(max_length=10, blank=True)

    # Tool/software notes
    tool_notes = models.TextField(blank=True)

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'bep_response_items'
        ordering = ['response', 'requirement__order']
        unique_together = [['response', 'requirement']]
        verbose_name = 'BEP Response Item'
        verbose_name_plural = 'BEP Response Items'

    def __str__(self):
        return f"{self.requirement.code}: {self.compliance_status}"
