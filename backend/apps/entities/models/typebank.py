"""
TypeBank models: collaborative type labeling system.
"""
from django.db import models
import uuid


class TypeBankEntry(models.Model):
    """
    A canonical type in the shared Type Bank.

    Identity is based on (ifc_class, type_name, predefined_type, material) tuple.
    All fields come from IfcTypeObject to avoid instance-level pollution.

    This model REPLACES TypeMapping for cross-model type classification.
    """
    MAPPING_STATUS = [
        ('pending', 'Pending'),
        ('mapped', 'Mapped'),
        ('ignored', 'Ignored'),
        ('review', 'Needs Review'),
        ('followup', 'Follow-up'),
    ]

    CONFIDENCE_CHOICES = [
        ('auto', 'Auto-detected'),
        ('manual', 'Manually labeled'),
        ('verified', 'Expert verified'),
        ('disputed', 'Disputed'),
    ]

    REPRESENTATIVE_UNIT = [
        ('pcs', 'Piece count'),
        ('m', 'Linear meter'),
        ('m2', 'Square meter'),
        ('m3', 'Cubic meter'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # === Core identity tuple (exact match, from IfcTypeObject only) ===
    ifc_class = models.CharField(
        max_length=100,
        help_text="IFC entity class (IfcWall, IfcColumn, etc.)"
    )
    type_name = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text="From IfcTypeObject.Name (clean, no instance IDs)"
    )
    predefined_type = models.CharField(
        max_length=50,
        blank=True,
        default='NOTDEFINED',
        help_text="Schema enum: STANDARD, USERDEFINED, NOTDEFINED"
    )
    material = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text="Primary IfcMaterial name from type"
    )

    # === Classification (labels applied by experts) ===
    ns3451_code = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="NS-3451 building part code"
    )
    ns3451 = models.ForeignKey(
        'NS3451Code',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='type_bank_entries',
        help_text="Reference to NS-3451 code lookup"
    )
    discipline = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="BIM discipline code (ARK, RIB, RIV, RIE, etc.)"
    )

    # === Semantic Type (PA0802/NS3451 normalization) ===
    semantic_type = models.ForeignKey(
        'SemanticType',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='type_bank_entries',
        help_text="Canonical semantic type (what this element ACTUALLY is)"
    )
    semantic_type_source = models.CharField(
        max_length=20,
        choices=[
            ('auto_rule', 'Auto: IFC Class Rule'),
            ('auto_pattern', 'Auto: Name Pattern'),
            ('manual', 'Manual Assignment'),
            ('verified', 'Verified by User'),
        ],
        null=True,
        blank=True,
        help_text="How the semantic type was assigned"
    )
    semantic_type_confidence = models.FloatField(
        null=True,
        blank=True,
        help_text="Confidence score (0.0-1.0) for auto-assigned types"
    )

    # === Metadata ===
    canonical_name = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Human-readable normalized name"
    )
    description = models.TextField(blank=True, null=True)
    representative_unit = models.CharField(
        max_length=10,
        choices=REPRESENTATIVE_UNIT,
        blank=True,
        null=True,
        help_text="Procurement-based unit (pcs, m, m2, m3)"
    )

    # === Instance context statistics (aggregated across observations) ===
    total_instance_count = models.IntegerField(
        default=0,
        help_text="Total instances observed across all models"
    )
    pct_is_external = models.FloatField(
        null=True,
        blank=True,
        help_text="% of instances with IsExternal=True"
    )
    pct_load_bearing = models.FloatField(
        null=True,
        blank=True,
        help_text="% of instances with LoadBearing=True"
    )
    pct_fire_rated = models.FloatField(
        null=True,
        blank=True,
        help_text="% of instances with non-empty FireRating"
    )

    # === Provenance ===
    source_model_count = models.IntegerField(
        default=1,
        help_text="How many models contributed observations"
    )
    mapping_status = models.CharField(
        max_length=20,
        choices=MAPPING_STATUS,
        default='pending'
    )
    confidence = models.CharField(
        max_length=20,
        choices=CONFIDENCE_CHOICES,
        blank=True,
        null=True
    )
    notes = models.TextField(blank=True, null=True)

    # === Audit ===
    created_by = models.CharField(max_length=255, blank=True, null=True)
    mapped_by = models.CharField(max_length=255, blank=True, null=True)
    mapped_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # === Human Verification Status ===
    # Three-tier system: pending -> auto -> verified/flagged
    # Only human action can verify (green) or flag (red)
    VERIFICATION_STATUS = [
        ('pending', 'Pending'),           # Not yet classified
        ('auto', 'Auto-classified'),      # Yellow - automation suggested, needs review
        ('verified', 'Verified'),         # Green - human approved
        ('flagged', 'Flagged'),           # Red - human rejected/needs attention
    ]
    verification_status = models.CharField(
        max_length=20,
        choices=VERIFICATION_STATUS,
        default='pending',
        help_text="Human verification status: pending/auto/verified/flagged"
    )
    verified_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='verified_type_bank_entries',
        help_text="User who verified or flagged this entry"
    )
    verified_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the entry was verified or flagged"
    )
    flag_reason = models.TextField(
        blank=True,
        null=True,
        help_text="Reason for flagging (required when verification_status='flagged')"
    )

    class Meta:
        app_label = 'entities'
        db_table = 'type_bank_entries'
        unique_together = ['ifc_class', 'type_name', 'predefined_type', 'material']
        indexes = [
            models.Index(fields=['ifc_class']),
            models.Index(fields=['mapping_status']),
            models.Index(fields=['ns3451_code']),
            models.Index(fields=['verification_status']),
        ]
        verbose_name = 'Type Bank Entry'
        verbose_name_plural = 'Type Bank Entries'

    def __str__(self):
        name = self.canonical_name or self.type_name or self.ifc_class
        return f"{name} ({self.ifc_class})"


class TypeBankObservation(models.Model):
    """
    Records where a TypeBankEntry was observed in a specific model.

    Links the global Type Bank to per-model IFCType records.
    Tracks instance counts and property variations per observation.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    type_bank_entry = models.ForeignKey(
        'TypeBankEntry',
        on_delete=models.CASCADE,
        related_name='observations',
        help_text="The canonical type this observation links to"
    )
    source_model = models.ForeignKey(
        'models.Model',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='type_bank_observations',
        help_text="The model where this type was observed (null if model deleted)"
    )
    source_type = models.ForeignKey(
        'IFCType',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='type_bank_observation',
        help_text="The original IFCType record from this model (null if type deleted)"
    )

    # === Historical/Audit fields (Sprint 2: The Vault) ===
    is_historical = models.BooleanField(
        default=False,
        help_text="True if source model/type was deleted - observation preserved for audit trail"
    )
    archived_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When this observation became historical (source deleted)"
    )

    # === Statistics for this observation ===
    instance_count = models.IntegerField(
        default=0,
        help_text="Number of instances using this type in this model"
    )

    # Instance property stats for this observation
    pct_is_external = models.FloatField(null=True, blank=True)
    pct_load_bearing = models.FloatField(null=True, blank=True)
    pct_fire_rated = models.FloatField(null=True, blank=True)

    # Optional: capture any property variations observed
    property_variations = models.JSONField(
        default=dict,
        blank=True,
        help_text="Property value distributions observed (e.g., {'IsExternal': {'True': 85, 'False': 15}})"
    )

    observed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'entities'
        db_table = 'type_bank_observations'
        # Note: unique_together removed since source_type can be null (for historical observations)
        # Active observations should be unique per (type_bank_entry, source_type) - enforced in code
        indexes = [
            models.Index(fields=['source_model']),
            models.Index(fields=['observed_at']),
            models.Index(fields=['is_historical']),
            models.Index(fields=['type_bank_entry', 'is_historical']),
        ]

    def __str__(self):
        model_name = self.source_model.name if self.source_model else "(deleted model)"
        return f"{self.type_bank_entry} in {model_name}"


class TypeBankAlias(models.Model):
    """
    Alternative names for the same canonical type.

    Experts manually link naming variations (e.g., "GU13" <-> "Gyproc GU 13mm").
    No auto-merging - all aliases are explicit.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    canonical = models.ForeignKey(
        'TypeBankEntry',
        on_delete=models.CASCADE,
        related_name='aliases',
        help_text="The canonical type this is an alias for"
    )
    alias_type_name = models.CharField(
        max_length=255,
        help_text="The alternative type_name that maps to canonical"
    )
    alias_ifc_class = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="IFC class for alias (if different from canonical)"
    )
    alias_source = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Which software/project produced this alias"
    )

    created_by = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        app_label = 'entities'
        db_table = 'type_bank_aliases'
        indexes = [
            models.Index(fields=['alias_type_name']),
        ]

    def __str__(self):
        return f"'{self.alias_type_name}' -> {self.canonical}"


class TypeBankScope(models.Model):
    """
    Scope status for a type within a specific validation context.

    A single type can have different scopes for different purposes:
    - TFM: In scope (needs FM marking) vs out (passive infrastructure)
    - LCA: In scope (needs environmental data) vs out (not quantified)
    - Costing: In scope (needs pricing) vs out (included elsewhere)

    This enables flexible validation per use case.
    """
    SCOPE_TYPE_CHOICES = [
        ('tfm', 'TFM (FM Marking)'),
        ('lca', 'LCA (Life Cycle Assessment)'),
        ('qto', 'QTO (Quantity Takeoff)'),
        ('clash', 'Clash Control'),
        ('custom', 'Custom'),
    ]

    SCOPE_STATUS_CHOICES = [
        ('in', 'In Scope'),
        ('out', 'Out of Scope'),
        ('auto_excluded', 'Auto-excluded'),
        ('unknown', 'Unknown'),
    ]

    VALIDATION_STATUS_CHOICES = [
        ('complete', 'Complete'),
        ('partial', 'Partial'),
        ('missing', 'Missing'),
        ('dirty', 'Dirty (has data but should not)'),
        ('invalid', 'Invalid format'),
        ('na', 'Not applicable'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    type_bank_entry = models.ForeignKey(
        'TypeBankEntry',
        on_delete=models.CASCADE,
        related_name='scopes',
        help_text="The type this scope applies to"
    )
    project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        related_name='type_scopes',
        help_text="Project this scope is defined for"
    )

    # Scope definition
    scope_type = models.CharField(
        max_length=20,
        choices=SCOPE_TYPE_CHOICES,
        help_text="What validation context this scope applies to"
    )
    scope_type_custom = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Custom scope type name (when scope_type='custom')"
    )
    status = models.CharField(
        max_length=20,
        choices=SCOPE_STATUS_CHOICES,
        default='unknown',
        help_text="In/out of scope for this context"
    )
    reason = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Why this scope was assigned (config, auto_entity, auto_pattern, manual)"
    )
    comment = models.TextField(
        blank=True,
        null=True,
        help_text="User comment about scope decision"
    )

    # Validation status (for scopes that track compliance)
    validation_status = models.CharField(
        max_length=20,
        choices=VALIDATION_STATUS_CHOICES,
        default='na',
        help_text="Validation status within this scope"
    )
    coverage = models.FloatField(
        null=True,
        blank=True,
        help_text="Coverage percentage (0.0-1.0) for scopes that track completeness"
    )

    # Audit
    created_by = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'entities'
        db_table = 'type_bank_scopes'
        unique_together = ['type_bank_entry', 'project', 'scope_type']
        indexes = [
            models.Index(fields=['scope_type']),
            models.Index(fields=['status']),
            models.Index(fields=['validation_status']),
        ]
        verbose_name = 'Type Bank Scope'
        verbose_name_plural = 'Type Bank Scopes'

    def __str__(self):
        scope_name = self.scope_type_custom if self.scope_type == 'custom' else self.scope_type
        return f"{self.type_bank_entry} - {scope_name}: {self.status}"
