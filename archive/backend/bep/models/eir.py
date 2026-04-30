"""
EIR (Employer's Information Requirements) and IDS (Information Delivery Specification) models.

Implements the ISO 19650 information management loop:
- EIR: Client defines what information is needed per project
- EIRRequirement: Individual requirements within an EIR
- IDSSpecification: Machine-readable validation specs (buildingSMART IDS standard)
"""
from django.db import models
import uuid


class EIR(models.Model):
    """
    Employer's Information Requirements document.

    The EIR is the client's set of information requirements for a project.
    Contains structured requirements and linked IDS specifications.
    One project can have multiple EIR versions (revisions).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        related_name='eirs',
    )

    # Identity
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    version = models.IntegerField(default=1)
    status = models.CharField(
        max_length=20,
        choices=[
            ('draft', 'Draft'),
            ('issued', 'Issued'),
            ('responded', 'Responded'),
            ('agreed', 'Agreed'),
            ('superseded', 'Superseded'),
        ],
        default='draft',
    )

    # Issuer
    issuer_name = models.CharField(max_length=255, blank=True)
    issuer_organization = models.CharField(max_length=255, blank=True)
    issued_at = models.DateTimeField(null=True, blank=True)

    # Framework context
    framework = models.CharField(
        max_length=50,
        choices=[
            ('iso19650', 'ISO 19650'),
            ('ns8360', 'NS 8360'),
            ('pofin', 'POFIN'),
            ('custom', 'Custom'),
        ],
        default='iso19650',
    )

    # Technical defaults
    ifc_version = models.CharField(
        max_length=20,
        choices=[
            ('IFC2X3', 'IFC 2x3'),
            ('IFC4', 'IFC 4.0'),
            ('IFC4X3', 'IFC 4.3'),
        ],
        default='IFC4',
    )
    classification_system = models.CharField(
        max_length=50,
        choices=[
            ('ns3451', 'NS 3451'),
            ('omniclass', 'OmniClass'),
            ('uniclass', 'Uniclass'),
            ('custom', 'Custom'),
        ],
        default='ns3451',
    )

    # Audit
    created_by = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'eir_documents'
        ordering = ['-created_at']
        unique_together = [['project', 'version']]
        verbose_name = 'EIR'
        verbose_name_plural = 'EIRs'

    def __str__(self):
        return f"{self.project.name} - EIR v{self.version} ({self.status})"


class IDSSpecification(models.Model):
    """
    Stored IDS (Information Delivery Specification).

    Can be:
    - Imported from .ids XML file
    - Authored in the platform (structured JSON, rendered to IDS XML on demand)
    - Standalone library entry reusable across projects

    ids_xml stores the IDS XML content.
    structured_specs stores parsed specification data for UI rendering.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Can belong to an EIR, or be standalone (library)
    eir = models.ForeignKey(
        EIR,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='ids_specifications',
    )

    # Identity
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    author = models.CharField(max_length=255, blank=True)
    version = models.CharField(max_length=50, blank=True)

    # IDS content - dual storage
    ids_xml = models.TextField(
        blank=True,
        help_text="Complete IDS XML content (from import or generated from structured_specs)"
    )
    structured_specs = models.JSONField(
        default=list,
        help_text="Parsed/authored specifications as JSON array"
    )

    # Source tracking
    source = models.CharField(
        max_length=20,
        choices=[
            ('imported', 'Imported from .ids file'),
            ('authored', 'Authored in platform'),
            ('library', 'From IDS library'),
        ],
        default='authored',
    )
    original_filename = models.CharField(max_length=255, blank=True)

    # IFC version applicability
    ifc_versions = models.JSONField(
        default=list,
        help_text="e.g. ['IFC4', 'IFC4X3']"
    )

    # Stats
    specification_count = models.IntegerField(default=0)

    # Library flag
    is_library = models.BooleanField(
        default=False,
        help_text="If True, reusable across projects"
    )

    # Audit
    created_by = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'ids_specifications'
        ordering = ['-created_at']
        verbose_name = 'IDS Specification'
        verbose_name_plural = 'IDS Specifications'

    def __str__(self):
        return f"{self.title} ({self.source})"


class EIRRequirement(models.Model):
    """
    A single requirement within an EIR.

    Requirements can be:
    - Informational (text description)
    - IDS-backed (linked to IDSSpecification for automated checking)
    - Both
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    eir = models.ForeignKey(EIR, on_delete=models.CASCADE, related_name='requirements')

    # Identity
    code = models.CharField(
        max_length=50,
        help_text="Requirement code (e.g. EIR-001, PROP-03)"
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    instructions = models.TextField(
        blank=True,
        help_text="Guidance on how to meet this requirement"
    )

    # Category
    category = models.CharField(
        max_length=50,
        choices=[
            ('technical', 'Technical'),
            ('property', 'Property'),
            ('classification', 'Classification'),
            ('geometry', 'Geometry'),
            ('coordination', 'Coordination'),
            ('naming', 'Naming'),
            ('general', 'General'),
        ],
        default='general',
    )

    # Severity
    severity = models.CharField(
        max_length=20,
        choices=[
            ('mandatory', 'Mandatory'),
            ('recommended', 'Recommended'),
            ('optional', 'Optional'),
        ],
        default='mandatory',
    )

    # Scope
    applies_to_disciplines = models.JSONField(default=list, blank=True)
    applies_to_ifc_types = models.JSONField(default=list, blank=True)
    applies_from_mmi_level = models.IntegerField(null=True, blank=True)

    # IDS link (optional)
    ids_specification = models.ForeignKey(
        IDSSpecification,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='eir_requirements',
    )

    # Ordering
    order = models.IntegerField(default=0)

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'eir_requirements'
        ordering = ['eir', 'order', 'code']
        unique_together = [['eir', 'code']]
        verbose_name = 'EIR Requirement'
        verbose_name_plural = 'EIR Requirements'

    def __str__(self):
        return f"{self.code}: {self.title}"
