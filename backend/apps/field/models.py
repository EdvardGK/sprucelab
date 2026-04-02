"""
Field & Compliance models.

Construction compliance checklists for verifying handover documents
(models, drawings, production specs) against requirements (TEK17, NS standards,
project specs).

Input: model/drawing/production document handover
Output: completed checklists, photos, deviation reports → feeds back to
        handover, design, or automation workflows.
"""
import uuid
from django.db import models


class ChecklistTemplate(models.Model):
    """
    Reusable checklist template (e.g. "Rørkontroll bad", "Membran våtrom").

    System templates (is_system_template=True) are shared across all projects.
    Project-scoped templates belong to a specific project.
    """
    CATEGORY_CHOICES = [
        ('rør', 'Rør'),
        ('tetthet', 'Tetthet'),
        ('brann', 'Brann'),
        ('elektro', 'Elektro'),
        ('betong', 'Betong'),
        ('stål', 'Stål'),
        ('tre', 'Tre'),
        ('ventilasjon', 'Ventilasjon'),
        ('generell', 'Generell'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        related_name='checklist_templates',
        null=True, blank=True,
        help_text="Null for system templates shared across all projects"
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, default='generell')
    regulation_ref = models.CharField(
        max_length=255, blank=True, null=True,
        help_text="E.g. 'TEK17 kap. 15, NS 3055'"
    )
    is_system_template = models.BooleanField(default=False)
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'field_checklist_templates'
        ordering = ['name']

    def __str__(self):
        return self.name


class ChecklistTemplateItem(models.Model):
    """
    A single check point within a template.

    Defines what to check, against what reference, and acceptance criteria.
    When a checklist is instantiated from a template, CheckItems are created
    from these template items.
    """
    REFERENCE_TYPE_CHOICES = [
        ('drawing', 'Tegning'),
        ('tek17', 'TEK17'),
        ('product_manual', 'Produktblad'),
        ('design_spec', 'Prosjektbeskrivelse'),
        ('ns_standard', 'NS Standard'),
        ('custom', 'Annet'),
        ('none', 'Ingen'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template = models.ForeignKey(
        ChecklistTemplate,
        on_delete=models.CASCADE,
        related_name='items'
    )
    sort_order = models.PositiveIntegerField()
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True, null=True)

    # Reference: what is this checked against?
    reference_type = models.CharField(
        max_length=20, choices=REFERENCE_TYPE_CHOICES, default='none'
    )
    reference_code = models.CharField(max_length=255, blank=True, null=True)
    reference_description = models.TextField(blank=True, null=True)
    reference_document_url = models.URLField(blank=True, null=True)
    reference_page = models.CharField(max_length=50, blank=True, null=True)

    # Acceptance
    acceptance_criteria = models.TextField(blank=True, null=True)
    measurement_unit = models.CharField(max_length=20, blank=True, null=True)
    tolerance_min = models.DecimalField(
        max_digits=10, decimal_places=3, null=True, blank=True
    )
    tolerance_max = models.DecimalField(
        max_digits=10, decimal_places=3, null=True, blank=True
    )

    # Flags
    requires_photo = models.BooleanField(default=False)
    requires_measurement = models.BooleanField(default=False)
    is_critical = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'field_checklist_template_items'
        ordering = ['sort_order']

    def __str__(self):
        return f"{self.sort_order}. {self.title}"


class Checklist(models.Model):
    """
    A checklist instance on a project.

    Created from a template (optional) and assigned to a location.
    Lifecycle: draft → in_progress → completed → signed.
    """
    STATUS_CHOICES = [
        ('draft', 'Utkast'),
        ('in_progress', 'Pågår'),
        ('completed', 'Fullført'),
        ('signed', 'Signert'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        related_name='checklists'
    )
    template = models.ForeignKey(
        ChecklistTemplate,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='instances'
    )
    name = models.CharField(max_length=255)
    location = models.CharField(
        max_length=255, blank=True, null=True,
        help_text="E.g. '2. etasje, bad hovedsoverom'"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')

    # Assignment and lifecycle
    assigned_to = models.CharField(max_length=255, blank=True, null=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    signed_by = models.CharField(max_length=255, blank=True, null=True)
    signed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.CharField(max_length=255, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'field_checklists'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.get_status_display()})"

    @property
    def progress(self):
        """Calculate checklist progress stats."""
        items = self.items.all()
        total = items.count()
        if total == 0:
            return {'total': 0, 'ok': 0, 'deviations': 0, 'not_applicable': 0, 'pending': 0}
        return {
            'total': total,
            'ok': items.filter(status='ok').count(),
            'deviations': items.filter(status='deviation').count(),
            'not_applicable': items.filter(status='not_applicable').count(),
            'pending': items.filter(status='pending').count(),
        }


class CheckItem(models.Model):
    """
    A single check item within a checklist instance.

    Contains both the definition (what to check) and the worker's input
    (status, measurement, notes, deviation data).
    """
    STATUS_CHOICES = [
        ('pending', 'Venter'),
        ('ok', 'OK'),
        ('deviation', 'Avvik'),
        ('not_applicable', 'Ikke aktuelt'),
    ]
    REFERENCE_TYPE_CHOICES = ChecklistTemplateItem.REFERENCE_TYPE_CHOICES
    DEVIATION_RESPONSIBLE_CHOICES = [
        ('prosjekterende', 'Prosjekterende'),
        ('utførende', 'Utførende'),
        ('annet', 'Annet'),
    ]
    DEVIATION_ACTION_CHOICES = [
        ('stopp', 'Stopp arbeidet'),
        ('fortsett_med_forbehold', 'Fortsett med forbehold'),
        ('foreslå_løsning', 'Foreslå løsning'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    checklist = models.ForeignKey(
        Checklist,
        on_delete=models.CASCADE,
        related_name='items'
    )
    template_item = models.ForeignKey(
        ChecklistTemplateItem,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='instances'
    )
    sort_order = models.PositiveIntegerField()
    title = models.CharField(max_length=500)

    # Reference (copied from template item, can be overridden)
    reference_type = models.CharField(
        max_length=20, choices=REFERENCE_TYPE_CHOICES,
        blank=True, null=True
    )
    reference_code = models.CharField(max_length=255, blank=True, null=True)
    reference_description = models.TextField(blank=True, null=True)
    reference_document_url = models.URLField(blank=True, null=True)
    reference_page = models.CharField(max_length=50, blank=True, null=True)
    acceptance_criteria = models.TextField(blank=True, null=True)
    measurement_unit = models.CharField(max_length=20, blank=True, null=True)
    tolerance_min = models.DecimalField(
        max_digits=10, decimal_places=3, null=True, blank=True
    )
    tolerance_max = models.DecimalField(
        max_digits=10, decimal_places=3, null=True, blank=True
    )
    requires_photo = models.BooleanField(default=False)
    is_critical = models.BooleanField(default=False)

    # === Worker input ===
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    measured_value = models.DecimalField(
        max_digits=10, decimal_places=3, null=True, blank=True
    )
    notes = models.TextField(blank=True, null=True)
    checked_by = models.CharField(max_length=255, blank=True, null=True)
    checked_at = models.DateTimeField(null=True, blank=True)

    # === Deviation data ===
    deviation_description = models.TextField(blank=True, null=True)
    deviation_responsible = models.CharField(
        max_length=20, choices=DEVIATION_RESPONSIBLE_CHOICES,
        blank=True, null=True
    )
    deviation_action = models.CharField(
        max_length=30, choices=DEVIATION_ACTION_CHOICES,
        blank=True, null=True
    )
    deviation_resolved = models.BooleanField(default=False)
    deviation_resolved_by = models.CharField(max_length=255, blank=True, null=True)
    deviation_resolved_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'field_check_items'
        ordering = ['sort_order']

    def __str__(self):
        return f"{self.sort_order}. {self.title} [{self.get_status_display()}]"

    @property
    def is_out_of_tolerance(self):
        """Check if measured value is outside tolerance range."""
        if self.measured_value is None:
            return False
        if self.tolerance_min is not None and self.measured_value < self.tolerance_min:
            return True
        if self.tolerance_max is not None and self.measured_value > self.tolerance_max:
            return True
        return False
