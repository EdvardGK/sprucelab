"""
BEP (BIM Execution Plan) models for ISO 19650 and POFIN compliance.

Implements project-centric BIM standards configuration following:
- ISO 19650-1:2018 (Organization and digitization of information)
- ISO 19650-2:2018 (Delivery phase of assets)
- buildingSMART Norway POFIN framework
- Norwegian MMI-veileder 2.0 scale (flexible 0-2000 range, standard uses 25-point increments)
"""
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
import uuid


class BEPConfiguration(models.Model):
    """
    BIM Execution Plan configuration for a project.

    Combines EIR (Exchange Information Requirements) and BEP into a single
    configuration that defines both requirements and how we'll validate them.

    Supports versioning: one project can have multiple BEPs, but only one active at a time.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        related_name='beps',
        help_text="Project this BEP applies to"
    )

    # Versioning
    version = models.IntegerField(default=1, help_text="BEP version number")
    status = models.CharField(
        max_length=20,
        choices=[
            ('draft', 'Draft'),
            ('active', 'Active'),
            ('archived', 'Archived'),
        ],
        default='draft',
        help_text="Status of this BEP version"
    )

    # Metadata
    name = models.CharField(
        max_length=255,
        default='BIM Execution Plan',
        help_text="BEP name or title"
    )
    description = models.TextField(
        blank=True,
        help_text="Description of this BEP and its purpose"
    )

    # ISO 19650 Documents
    eir_document_url = models.URLField(
        blank=True,
        null=True,
        help_text="Link to EIR PDF/document (client requirements)"
    )
    bep_document_url = models.URLField(
        blank=True,
        null=True,
        help_text="Link to BEP PDF/document (delivery team plan)"
    )

    # Framework
    framework = models.CharField(
        max_length=50,
        choices=[
            ('pofin', 'POFIN (buildingSMART Norge)'),
            ('iso19650', 'ISO 19650 Generic'),
            ('custom', 'Custom'),
        ],
        default='pofin',
        help_text="BIM framework this BEP follows"
    )

    # Common Data Environment structure
    cde_structure = models.JSONField(
        default=dict,
        blank=True,
        help_text="CDE folder structure (WIP/Shared/Published/Archive)"
    )

    # Audit
    created_by = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    activated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'bep_configurations'
        ordering = ['-created_at']
        unique_together = [['project', 'version']]
        verbose_name = 'BEP Configuration'
        verbose_name_plural = 'BEP Configurations'

    def __str__(self):
        return f"{self.project.name} - BEP v{self.version} ({self.status})"

    def activate(self):
        """Activate this BEP and archive previous active BEPs."""
        # Archive all other active BEPs for this project
        BEPConfiguration.objects.filter(
            project=self.project,
            status='active'
        ).update(status='archived')

        # Activate this one
        self.status = 'active'
        self.activated_at = timezone.now()
        self.save()


class TechnicalRequirement(models.Model):
    """
    Technical requirements for IFC models in this project.

    Defines IFC schema, coordinate systems, units, and other technical specifications.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bep = models.OneToOneField(
        BEPConfiguration,
        on_delete=models.CASCADE,
        related_name='technical_requirements',
        help_text="BEP this requirement belongs to"
    )

    # IFC Requirements
    ifc_schema = models.CharField(
        max_length=20,
        choices=[
            ('IFC2X3', 'IFC 2x3'),
            ('IFC4', 'IFC 4.0'),
            ('IFC4X3', 'IFC 4.3'),
        ],
        default='IFC4',
        help_text="Required IFC schema version"
    )

    model_view_definition = models.CharField(
        max_length=100,
        blank=True,
        help_text="MVD name (e.g., 'CoordinationView 2.0', 'ReferenceView')"
    )

    # Coordinate System
    coordinate_system_name = models.CharField(
        max_length=100,
        default='EPSG:25833',  # ETRS89 / UTM zone 33N (Norway)
        help_text="EPSG code or coordinate system name"
    )
    coordinate_system_description = models.TextField(
        blank=True,
        help_text="Description of coordinate system"
    )

    # Units
    length_unit = models.CharField(
        max_length=20,
        choices=[
            ('METRE', 'Meter'),
            ('MILLIMETRE', 'Millimeter'),
        ],
        default='METRE',
        help_text="Primary length unit"
    )
    area_unit = models.CharField(
        max_length=20,
        default='SQUARE_METRE',
        help_text="Area unit"
    )
    volume_unit = models.CharField(
        max_length=20,
        default='CUBIC_METRE',
        help_text="Volume unit"
    )

    # Precision
    geometry_tolerance = models.FloatField(
        default=0.001,
        help_text="Geometric tolerance in length units (e.g., 0.001m = 1mm)"
    )

    # File Requirements
    max_file_size_mb = models.IntegerField(
        default=500,
        help_text="Maximum IFC file size in MB"
    )

    # Additional Requirements
    requirements_json = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional technical requirements (custom fields)"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'technical_requirements'
        verbose_name = 'Technical Requirement'
        verbose_name_plural = 'Technical Requirements'

    def __str__(self):
        return f"Technical Requirements - {self.bep.project.name}"


class MMIScaleDefinition(models.Model):
    """
    Definition of an MMI level for this project.

    Based on Norwegian MMI-veileder 2.0 (October 2022).
    Standard defines 19 official levels (0, 100, 125, 150...500, 600) with 25-point increments.
    Projects can define custom levels between 0-2000 as needed.
    (NOT 1-7 like generic LOD!)
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bep = models.ForeignKey(
        BEPConfiguration,
        on_delete=models.CASCADE,
        related_name='mmi_scale',
        help_text="BEP this MMI definition belongs to"
    )

    # MMI Level (Norwegian scale - flexible 0-2000)
    mmi_level = models.IntegerField(
        validators=[MinValueValidator(0), MaxValueValidator(2000)],
        help_text="MMI level (0-2000). Standard uses 0, 100, 125, 150...500, 600 with 25-point increments. Projects can add custom levels."
    )

    # Human-readable names
    name = models.CharField(
        max_length=100,
        help_text="Norwegian name from MMI-veileder (e.g., 'Grunnlagsinformasjon', 'Konseptinformasjon')"
    )
    name_en = models.CharField(
        max_length=100,
        blank=True,
        default='',
        help_text="English name from MMI-veileder (e.g., 'Foundation information', 'Concept information')"
    )
    description = models.TextField(
        help_text="What this MMI level means for THIS project"
    )

    # Official MMI-veileder 2.0 color codes
    color_hex = models.CharField(
        max_length=7,
        blank=True,
        default='',
        help_text="Hex color code from MMI-veileder 2.0 (e.g., '#BE2823' for MMI 100). Leave blank for custom levels."
    )
    color_rgb = models.CharField(
        max_length=20,
        blank=True,
        default='',
        help_text="RGB color from MMI-veileder 2.0 (e.g., '190,40,35' for MMI 100). Leave blank for custom levels."
    )

    # Geometry Requirements
    geometry_requirements = models.JSONField(
        default=dict,
        help_text="""
        Example:
        {
            "detail_level": "symbolic|approximate|detailed|as_built",
            "min_vertex_count": 8,
            "requires_3d": true,
            "collision_ready": false
        }
        """
    )

    # Information Requirements
    information_requirements = models.JSONField(
        default=dict,
        help_text="""
        Example:
        {
            "requires_name": true,
            "requires_description": false,
            "requires_classification": true,
            "requires_material": true,
            "requires_system_membership": false,
            "min_property_count": 5
        }
        """
    )

    # Discipline-specific rules
    discipline_specific_rules = models.JSONField(
        default=dict,
        blank=True,
        help_text="""
        Example:
        {
            "ARK": {"requires_loadbearing": true},
            "RIV": {"requires_structural_analysis": true},
            "ELEKT": {"requires_circuit_info": true}
        }
        """
    )

    # Usage tracking
    applies_to_disciplines = models.JSONField(
        default=list,
        blank=True,
        help_text="List of discipline codes this MMI applies to ['ARK', 'RIV', 'ELEKT']"
    )

    # Order
    display_order = models.IntegerField(
        default=0,
        help_text="Sort order in UI"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'mmi_scale_definitions'
        ordering = ['bep', 'mmi_level']
        unique_together = [['bep', 'mmi_level']]
        verbose_name = 'MMI Scale Definition'
        verbose_name_plural = 'MMI Scale Definitions'

    def __str__(self):
        return f"MMI {self.mmi_level}: {self.name}"


class NamingConvention(models.Model):
    """
    Naming convention rule for this project.

    Supports regex patterns and template strings for validating names.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bep = models.ForeignKey(
        BEPConfiguration,
        on_delete=models.CASCADE,
        related_name='naming_conventions',
        help_text="BEP this convention belongs to"
    )

    # Rule category
    category = models.CharField(
        max_length=50,
        choices=[
            ('file_naming', 'File Naming'),
            ('element_naming', 'Element Naming'),
            ('layer_naming', 'Layer Naming'),
            ('classification', 'Classification System'),
            ('discipline_code', 'Discipline Code'),
        ],
        help_text="Type of naming rule"
    )

    # Rule definition
    name = models.CharField(
        max_length=100,
        help_text="Rule name"
    )
    description = models.TextField(
        help_text="What this rule enforces"
    )

    # Pattern (regex or template)
    pattern = models.CharField(
        max_length=500,
        help_text="Regex pattern or template string (e.g., '{project}_{discipline}_{type}_{number}.ifc')"
    )
    pattern_type = models.CharField(
        max_length=20,
        choices=[
            ('regex', 'Regular Expression'),
            ('template', 'Template String'),
        ],
        default='template',
        help_text="Pattern type"
    )

    # Examples
    examples = models.JSONField(
        default=list,
        blank=True,
        help_text="Array of example valid names: ['ARK-001_Building_A.ifc', 'RIV-002_Foundation.ifc']"
    )

    # Discipline-specific
    applies_to_disciplines = models.JSONField(
        default=list,
        blank=True,
        help_text="Empty = all disciplines. ['ARK', 'RIV'] = only those"
    )

    # Validation
    is_required = models.BooleanField(
        default=True,
        help_text="Must pass this check?"
    )
    error_message = models.TextField(
        default="Name does not match project naming convention",
        help_text="Error message to show when validation fails"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'naming_conventions'
        ordering = ['bep', 'category']
        verbose_name = 'Naming Convention'
        verbose_name_plural = 'Naming Conventions'

    def __str__(self):
        return f"{self.category}: {self.name}"

    def validate_name(self, name: str):
        """Validate a name against this convention."""
        import re

        if self.pattern_type == 'regex':
            if not re.match(self.pattern, name):
                return False, self.error_message
        elif self.pattern_type == 'template':
            # Template validation logic (future)
            pass

        return True, ""


class RequiredPropertySet(models.Model):
    """
    Required property set for a specific IFC type at a specific MMI level.

    Defines which Psets are required for which element types at which MMI levels.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bep = models.ForeignKey(
        BEPConfiguration,
        on_delete=models.CASCADE,
        related_name='required_property_sets',
        help_text="BEP this requirement belongs to"
    )

    # Scope
    ifc_type = models.CharField(
        max_length=50,
        help_text="IFC type (e.g., 'IfcWall', 'IfcDoor'). Use '*' for all types."
    )
    mmi_level = models.IntegerField(
        help_text="Minimum MMI level where this Pset is required"
    )

    # Property Set
    pset_name = models.CharField(
        max_length=100,
        help_text="Property set name (e.g., 'Pset_WallCommon', 'Pset_DoorCommon')"
    )

    # Required Properties
    required_properties = models.JSONField(
        default=list,
        help_text="""
        Array of required property definitions:
        [
            {
                "name": "LoadBearing",
                "type": "IfcBoolean",
                "validation": {"required": true}
            },
            {
                "name": "FireRating",
                "type": "IfcLabel",
                "validation": {"required": true, "pattern": "^(REI|EI)\\d+$"}
            }
        ]
        """
    )

    # Optional Properties
    optional_properties = models.JSONField(
        default=list,
        blank=True,
        help_text="Array of property names that are optional but recommended"
    )

    # Discipline-specific
    applies_to_disciplines = models.JSONField(
        default=list,
        blank=True,
        help_text="Empty = all disciplines"
    )

    # Validation
    is_required = models.BooleanField(default=True)
    severity = models.CharField(
        max_length=20,
        choices=[
            ('error', 'Error'),
            ('warning', 'Warning'),
            ('info', 'Info'),
        ],
        default='error',
        help_text="Severity if this Pset is missing"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'required_property_sets'
        ordering = ['bep', 'ifc_type', 'mmi_level']
        verbose_name = 'Required Property Set'
        verbose_name_plural = 'Required Property Sets'

    def __str__(self):
        return f"{self.ifc_type} → {self.pset_name} (MMI {self.mmi_level}+)"


class ValidationRule(models.Model):
    """
    Validation rule for quality control.

    Defines checks that models must pass (GUID uniqueness, geometry requirements, etc.)
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bep = models.ForeignKey(
        BEPConfiguration,
        on_delete=models.CASCADE,
        related_name='validation_rules',
        help_text="BEP this rule belongs to"
    )

    # Rule identification
    rule_code = models.CharField(
        max_length=50,
        help_text="Unique code (e.g., 'GUID-001', 'GEOM-002')"
    )
    name = models.CharField(
        max_length=100,
        help_text="Rule name"
    )
    description = models.TextField(
        help_text="What this rule checks"
    )

    # Rule type
    rule_type = models.CharField(
        max_length=50,
        choices=[
            ('guid', 'GUID Validation'),
            ('geometry', 'Geometry Validation'),
            ('property', 'Property Validation'),
            ('naming', 'Naming Convention'),
            ('classification', 'Classification'),
            ('relationship', 'Relationship'),
            ('clash', 'Clash Detection'),
            ('custom', 'Custom Script'),
        ],
        help_text="Type of validation"
    )

    # Severity
    severity = models.CharField(
        max_length=20,
        choices=[
            ('error', 'Error - Must fix'),
            ('warning', 'Warning - Should fix'),
            ('info', 'Info - Nice to have'),
        ],
        default='error',
        help_text="Severity level"
    )

    # Rule definition (how to check)
    rule_definition = models.JSONField(
        default=dict,
        help_text="""
        Rule logic definition. Structure depends on rule_type:

        For 'guid':
        {
            "check": "uniqueness",
            "allow_duplicates": false
        }

        For 'geometry':
        {
            "check": "has_3d_geometry",
            "min_vertex_count": 8,
            "applies_to_types": ["IfcWall", "IfcSlab"]
        }

        For 'property':
        {
            "check": "has_property",
            "pset_name": "Pset_WallCommon",
            "property_name": "LoadBearing",
            "applies_to_types": ["IfcWall"]
        }

        For 'custom':
        {
            "script_id": "uuid-of-validation-script"
        }
        """
    )

    # Scope
    applies_to_ifc_types = models.JSONField(
        default=list,
        blank=True,
        help_text="Empty = all types. ['IfcWall', 'IfcDoor'] = only those"
    )
    applies_to_disciplines = models.JSONField(
        default=list,
        blank=True,
        help_text="Empty = all disciplines"
    )
    min_mmi_level = models.IntegerField(
        null=True,
        blank=True,
        help_text="Only apply this rule at this MMI level or above"
    )

    # Error message
    error_message_template = models.TextField(
        default="Validation failed",
        help_text="Error message template. Use {placeholders} for dynamic values."
    )

    # Enable/disable
    is_active = models.BooleanField(
        default=True,
        help_text="Is this rule active?"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'validation_rules'
        ordering = ['bep', 'severity', 'rule_code']
        unique_together = [['bep', 'rule_code']]
        verbose_name = 'Validation Rule'
        verbose_name_plural = 'Validation Rules'

    def __str__(self):
        return f"{self.rule_code}: {self.name} ({self.severity})"


class SubmissionMilestone(models.Model):
    """
    Project delivery milestone with requirements.

    Tracks when different deliverables are due and what MMI level they should achieve.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bep = models.ForeignKey(
        BEPConfiguration,
        on_delete=models.CASCADE,
        related_name='milestones',
        help_text="BEP this milestone belongs to"
    )

    # Milestone identification
    name = models.CharField(
        max_length=100,
        help_text="E.g., 'Preliminary Design', 'Detailed Design', 'For Construction'"
    )
    description = models.TextField(blank=True)

    # Requirements
    target_mmi = models.IntegerField(
        help_text="Expected MMI level for this milestone"
    )
    required_disciplines = models.JSONField(
        default=list,
        help_text="List of disciplines that must deliver: ['ARK', 'RIV', 'ELEKT']"
    )

    # Schedule
    target_date = models.DateField(
        help_text="When should this be delivered?"
    )
    submission_deadline = models.DateField(
        null=True,
        blank=True,
        help_text="Hard deadline (if different from target)"
    )

    # Review checklist
    review_checklist = models.JSONField(
        default=list,
        help_text="""
        Review checklist items:
        [
            {"item": "Clash detection completed", "required": true},
            {"item": "All GUIDs unique", "required": true},
            {"item": "Property sets complete", "required": true},
            {"item": "Naming conventions followed", "required": false}
        ]
        """
    )

    # Status tracking
    status = models.CharField(
        max_length=20,
        choices=[
            ('upcoming', 'Upcoming'),
            ('in_progress', 'In Progress'),
            ('review', 'Under Review'),
            ('approved', 'Approved'),
            ('rejected', 'Rejected'),
        ],
        default='upcoming',
        help_text="Milestone status"
    )

    # Order
    milestone_order = models.IntegerField(
        default=0,
        help_text="Sort order"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'submission_milestones'
        ordering = ['bep', 'milestone_order', 'target_date']
        verbose_name = 'Submission Milestone'
        verbose_name_plural = 'Submission Milestones'

    def __str__(self):
        return f"{self.name} (MMI {self.target_mmi}) - {self.target_date}"
