"""
Project models for BIM Coordinator Platform.
"""
from django.db import models
import uuid


class Project(models.Model):
    """
    Top-level project container for IFC models.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'projects'
        ordering = ['-created_at']

    def __str__(self):
        return self.name

    def get_model_count(self):
        """Get number of models in this project."""
        return self.models.count()

    def get_latest_model(self):
        """Get the most recent model version."""
        return self.models.order_by('-version_number').first()

    def get_element_count(self):
        """Get total number of elements across all models."""
        from apps.entities.models import IFCEntity
        model_ids = self.models.values_list('id', flat=True)
        return IFCEntity.objects.filter(model_id__in=model_ids).count()

    # BEP (BIM Execution Plan) methods
    def get_active_bep(self):
        """Get currently active BEP for this project."""
        return self.beps.filter(status='active').first()

    def has_bep(self):
        """Check if project has an active BEP."""
        return self.beps.filter(status='active').exists()

    def get_bep_count(self):
        """Get number of BEPs (all versions)."""
        return self.beps.count()

    def get_bep_versions(self):
        """Get all BEP versions for this project."""
        return self.beps.all().order_by('-version')

    def get_config(self):
        """Get active project configuration."""
        return self.configs.filter(is_active=True).first()


class ProjectConfig(models.Model):
    """
    Project-specific configuration for validation and scope management.

    Stores settings as JSON for flexibility while maintaining audit trail.
    Each project can have multiple configs (versioned), with one active.

    Example config structure:
    {
        "project": {
            "code": "ST28",
            "source_url": "https://..."
        },
        "tfm": {
            "enabled": true,
            "primary_pset": "ST28_Felles",
            "property_name": "Sammensatt TFM-ID",
            "code_pattern": "^=\\d{3}\\.[A-Z0-9]{3,4}...",
            "secondary_psets": [...]
        },
        "auto_excluded": {
            "entities": ["IfcSite", "IfcSpace", ...],
            "type_patterns": ["ProvisionForVoid*", ...]
        },
        "type_scope": {
            "tfm": {
                "in": ["WISE Damper*"],
                "out": ["BI001T", "Mapress Bend*"]
            },
            "lca": {
                "in": ["*"],
                "out": ["ProvisionForVoid*"]
            }
        },
        "models": {
            "RIV": {"pattern": "ST28_RIV*.ifc", "innregulering": true},
            "RIE": {"pattern": "ST28_RIE*.ifc"}
        }
    }
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name='configs',
        help_text="Project this config belongs to"
    )

    # Version control
    version = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(
        default=True,
        help_text="Only one config can be active per project"
    )
    name = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Optional name for this config version"
    )

    # Configuration data (flexible JSON structure)
    config = models.JSONField(
        default=dict,
        help_text="Full configuration as JSON"
    )

    # Audit
    created_by = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        db_table = 'project_configs'
        ordering = ['-version']
        indexes = [
            models.Index(fields=['project', 'is_active']),
        ]
        verbose_name = 'Project Config'
        verbose_name_plural = 'Project Configs'

    def __str__(self):
        name = self.name or f"v{self.version}"
        active = " (active)" if self.is_active else ""
        return f"{self.project.name} - {name}{active}"

    def save(self, *args, **kwargs):
        """Ensure only one active config per project."""
        if self.is_active:
            ProjectConfig.objects.filter(
                project=self.project,
                is_active=True
            ).exclude(pk=self.pk).update(is_active=False)
        super().save(*args, **kwargs)

    # === Config accessors ===
    def get_tfm_config(self):
        """Get TFM-specific settings."""
        return self.config.get('tfm', {})

    def get_auto_excluded(self):
        """Get auto-excluded entities and patterns."""
        return self.config.get('auto_excluded', {})

    def get_type_scope(self, scope_type='tfm'):
        """Get type scope overrides for a specific context."""
        return self.config.get('type_scope', {}).get(scope_type, {})

    def get_model_config(self, discipline):
        """Get model-specific config for a discipline."""
        return self.config.get('models', {}).get(discipline, {})

    # === EIR/BEP Accessors (ISO 19650) ===

    def get_eir_config(self):
        """
        Get EIR (Employer's Information Requirements) configuration.

        Structure:
        {
            "requirements": [...],      # List of requirement objects
            "milestones": [...],        # Delivery milestones
            "deliverables": [...],      # Required deliverables per milestone
            "acceptance_criteria": {...} # Acceptance criteria per deliverable
        }
        """
        return self.config.get('eir', {})

    def get_bep_config(self):
        """
        Get BEP (BIM Execution Plan) configuration.

        Structure:
        {
            "mmi_scale": {...},         # MMI levels with required properties
            "required_psets": {...},    # Required property sets per IFC type
            "naming_conventions": {...}, # File and element naming rules
            "validation_rules": [...],  # Custom validation rules
            "classification_system": {...}, # NS3451/NS3457 settings
            "coordination_cycle": {...} # BCF workflow settings
        }
        """
        return self.config.get('bep', {})

    def get_mmi_config(self, level=None):
        """
        Get MMI (Model Maturity Index) configuration.

        Args:
            level: Specific MMI level (100, 200, 300, etc.) or None for all

        Returns:
            MMI config for level, or full MMI scale if level is None
        """
        mmi_scale = self.config.get('bep', {}).get('mmi_scale', {})
        if level is not None:
            return mmi_scale.get(str(level), {})
        return mmi_scale

    def get_required_psets(self, ifc_type=None):
        """
        Get required property sets.

        Args:
            ifc_type: Specific IFC type (e.g., 'IfcWall') or None for all

        Returns:
            Required psets for type, or all if type is None
        """
        psets = self.config.get('bep', {}).get('required_psets', {})
        if ifc_type is not None:
            return psets.get(ifc_type, [])
        return psets

    def get_validation_rules(self):
        """Get custom validation rules from BEP."""
        return self.config.get('bep', {}).get('validation_rules', [])

    def get_naming_conventions(self):
        """Get naming conventions for files and elements."""
        return self.config.get('bep', {}).get('naming_conventions', {})

    def get_classification_system(self):
        """
        Get classification system settings.

        Structure:
        {
            "ns3451": {"enabled": true, "property": "Bygningsdel"},
            "ns3457": {"enabled": true, "property": "Komponentkode"},
            "custom": {...}
        }
        """
        return self.config.get('bep', {}).get('classification_system', {})

    def get_coordination_cycle(self):
        """
        Get coordination cycle / BCF workflow settings.

        Structure:
        {
            "frequency": "weekly",
            "bcf_statuses": ["Activated", "On hold", "Resolved", "Closed"],
            "responsible_parties": {...}
        }
        """
        return self.config.get('bep', {}).get('coordination_cycle', {})

    # === Convenience Methods ===

    def is_mmi_compliant(self, target_level):
        """Check if config has rules defined for the target MMI level."""
        mmi_config = self.get_mmi_config(target_level)
        return bool(mmi_config.get('required_properties'))

    def get_target_mmi(self):
        """Get the current target MMI level for the project."""
        return self.config.get('bep', {}).get('target_mmi', 300)

    def set_target_mmi(self, level):
        """Set target MMI level (does not save)."""
        if 'bep' not in self.config:
            self.config['bep'] = {}
        self.config['bep']['target_mmi'] = level
