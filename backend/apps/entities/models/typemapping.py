"""
Type and material mapping models: TypeMapping, TypeDefinitionLayer, MaterialMapping.
"""
from django.db import models
import uuid


class TypeMapping(models.Model):
    """
    User mapping of IFC type to standard classifications.
    """
    MAPPING_STATUS = [
        ('pending', 'Pending'),
        ('mapped', 'Mapped'),
        ('ignored', 'Ignored'),
        ('review', 'Needs Review'),
        ('followup', 'Follow-up'),  # Requires discipline manager review
    ]

    REPRESENTATIVE_UNIT = [
        ('pcs', 'Piece count'),
        ('m', 'Linear meter'),
        ('m2', 'Square meter'),
        ('m3', 'Cubic meter'),
    ]

    TYPE_CATEGORY_CHOICES = [
        ('generic', 'Generic (early stage)'),       # "Concrete Wall 250mm"
        ('specific', 'Specific (detailed design)'),  # "Skanska CW-250-A"
        ('product', 'Product (manufacturer)'),       # "Gyproc GU13 Fire"
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ifc_type = models.OneToOneField('IFCType', on_delete=models.CASCADE, related_name='mapping')

    # Standard classifications
    ns3451_code = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="NS-3451 building part code (e.g., '222')"
    )
    ns3451 = models.ForeignKey(
        'NS3451Code',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='type_mappings',
        help_text="Reference to NS-3451 code lookup"
    )
    product = models.ForeignKey(
        'ProductLibrary',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='type_mappings'
    )

    # Representative unit (procurement-based)
    representative_unit = models.CharField(
        max_length=10,
        choices=REPRESENTATIVE_UNIT,
        blank=True,
        null=True,
        help_text="Procurement-based representative unit (pcs, m, m2, m3)"
    )

    # Discipline (parsed from source model or manual)
    discipline = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="BIM discipline code (ARK, RIB, RIV, RIE, etc.)"
    )

    # Type category (generalization level)
    type_category = models.CharField(
        max_length=20,
        choices=TYPE_CATEGORY_CHOICES,
        default='specific',
        help_text="Level of type specificity (generic/specific/product)"
    )

    # Status tracking
    mapping_status = models.CharField(max_length=20, choices=MAPPING_STATUS, default='pending')
    confidence = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="Mapping confidence (auto/manual/high/low)"
    )
    notes = models.TextField(blank=True, null=True)

    # Audit
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
        related_name='verified_type_mappings',
        help_text="User who verified or flagged this mapping"
    )
    verified_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the mapping was verified or flagged"
    )
    flag_reason = models.TextField(
        blank=True,
        null=True,
        help_text="Reason for flagging (required when verification_status='flagged')"
    )

    # === Engine Verification Results ===
    verification_issues = models.JSONField(
        default=list,
        blank=True,
        help_text="Issues from last engine verification: [{rule_id, severity, message}]"
    )
    verified_engine_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the verification engine last ran on this type"
    )

    class Meta:
        app_label = 'entities'
        db_table = 'type_mappings'
        indexes = [
            models.Index(fields=['mapping_status']),
            models.Index(fields=['ns3451_code']),
            models.Index(fields=['verification_status']),
        ]

    def __str__(self):
        return f"{self.ifc_type.type_name} -> {self.ns3451_code or 'unmapped'}"


class TypeDefinitionLayer(models.Model):
    """
    Material layer/inventory for type definitions in the library/warehouse.

    Implements a two-level unit system:
    - Component (parent type): measured in representative_unit (m2, m, pcs)
    - Inventory (this layer): material quantity per 1 type unit ("recipe ratio")

    Example: Wall type measured in m2 contains per m2:
    - 0.25 m3 concrete (quantity_per_unit=0.25, material_unit=m3)
    - 20 kg rebar (quantity_per_unit=20, material_unit=kg)
    - 2.0 m2 gypsum (quantity_per_unit=2.0, material_unit=m2) - 4 layers

    Thickness_mm is optional for sandwich view visualization.
    """
    MATERIAL_UNIT_CHOICES = [
        ('m2', 'm\u00b2'),
        ('m', 'm'),
        ('m3', 'm\u00b3'),
        ('kg', 'kg'),
        ('pcs', 'pcs'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    type_mapping = models.ForeignKey(
        'TypeMapping',
        on_delete=models.CASCADE,
        related_name='definition_layers',
        help_text="The type mapping (library entry) this layer belongs to"
    )

    layer_order = models.IntegerField(
        help_text="Layer position (1 = exterior/outer, increasing inward)"
    )
    material_name = models.CharField(
        max_length=255,
        help_text="Material name for display (kept for backwards compat)"
    )

    # === Link to global Material Library ===
    material = models.ForeignKey(
        'MaterialLibrary',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='type_layers',
        help_text="Link to global MaterialLibrary entry (optional)"
    )

    # === Material classification (NS3457-8) ===
    ns3457_code = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="NS3457-8 material classification code"
    )
    ns3457_name = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="NS3457-8 material name (auto-filled from code)"
    )

    # === Quantity per type unit (the "recipe ratio") ===
    quantity_per_unit = models.FloatField(
        default=1.0,
        help_text="Amount of this material per 1 type unit (e.g., 0.25 m³/m²)"
    )
    material_unit = models.CharField(
        max_length=10,
        choices=MATERIAL_UNIT_CHOICES,
        default='m2',
        help_text="Unit for this material quantity (must match EPD expected unit)"
    )

    # === Visual thickness for sandwich diagram (optional) ===
    thickness_mm = models.FloatField(
        null=True,
        blank=True,
        help_text="Visual thickness in mm for sandwich diagram (optional)"
    )

    # === EPD/LCA reference ===
    epd_id = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="EPD database reference ID (optional)"
    )
    notes = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'entities'
        db_table = 'type_definition_layers'
        ordering = ['type_mapping', 'layer_order']
        unique_together = ['type_mapping', 'layer_order']

    def __str__(self):
        return f"Layer {self.layer_order}: {self.material_name} ({self.thickness_mm}mm)"


class MaterialMapping(models.Model):
    """
    User mapping of IFC material to standard data.
    """
    MAPPING_STATUS = [
        ('pending', 'Pending'),
        ('mapped', 'Mapped'),
        ('ignored', 'Ignored'),
        ('review', 'Needs Review'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    material = models.OneToOneField('Material', on_delete=models.CASCADE, related_name='mapping')

    # Standard data
    standard_name = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Normalized material name"
    )
    density_kg_m3 = models.FloatField(
        null=True,
        blank=True,
        help_text="Material density in kg/m\u00b3"
    )
    epd_reference = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="EPD database reference"
    )
    thermal_conductivity = models.FloatField(
        null=True,
        blank=True,
        help_text="W/(m\u00b7K)"
    )

    # Status tracking
    mapping_status = models.CharField(max_length=20, choices=MAPPING_STATUS, default='pending')
    notes = models.TextField(blank=True, null=True)

    # Audit
    mapped_by = models.CharField(max_length=255, blank=True, null=True)
    mapped_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'entities'
        db_table = 'material_mappings'
        indexes = [
            models.Index(fields=['mapping_status']),
            models.Index(fields=['standard_name']),
        ]

    def __str__(self):
        return f"{self.material.name} -> {self.standard_name or 'unmapped'}"
