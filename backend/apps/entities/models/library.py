"""
Library models: MaterialLibrary, ProductLibrary, ProductComposition, EPD, normalization.
"""
from django.db import models
import uuid


# Shared choices for reused status
REUSED_STATUS_CHOICES = [
    ('new', 'New'),
    ('existing_kept', 'Existing Kept'),
    ('reused', 'Reused'),
    ('existing_waste', 'Existing Waste'),
]

# Material category choices aligned with Enova EPD categories (36+ confirmed)
MATERIAL_CATEGORY_CHOICES = [
    # Structural
    ('steel_structural', 'Structural Steel'),
    ('rebar', 'Reinforcement Steel'),
    ('concrete_cast', 'Cast-in-place Concrete'),
    ('concrete_hollowcore', 'Hollow Core Slab'),
    ('wood_glulam', 'Glulam'),
    ('wood_clt', 'CLT/Massivtre'),
    ('wood_structural', 'Structural Timber'),
    ('wood_treated', 'Treated Wood'),
    # Boards
    ('gypsum_standard', 'Gypsum Board Standard'),
    ('gypsum_wetroom', 'Gypsum Board Wetroom'),
    ('osb', 'OSB Board'),
    ('chipboard', 'Chipboard'),
    # Insulation
    ('mineral_wool_inner', 'Mineral Wool Inner Wall'),
    ('mineral_wool_outer', 'Mineral Wool Outer Wall'),
    ('mineral_wool_roof', 'Mineral Wool Roof'),
    ('glass_wool', 'Glass Wool'),
    ('insulation_eps', 'EPS Insulation'),
    ('insulation_xps', 'XPS Insulation'),
    # Finishes
    ('paint_interior', 'Interior Paint'),
    ('paint_exterior', 'Exterior Paint'),
    ('tile_ceramic', 'Ceramic Tile'),
    ('tile_adhesive', 'Tile Adhesive'),
    ('parquet', 'Parquet'),
    ('linoleum', 'Linoleum'),
    ('vinyl', 'Vinyl Flooring'),
    ('carpet', 'Carpet'),
    ('screed', 'Screed/Levelling'),
    # Membranes
    ('vapor_barrier', 'Vapor Barrier'),
    ('wetroom_membrane', 'Wetroom Membrane'),
    ('pvc_roof', 'PVC Roofing'),
    # Windows/Doors
    ('window', 'Window'),
    ('door_interior', 'Interior Door'),
    ('glass_facade', 'Glass Facade'),
    ('glass_wall_interior', 'Interior Glass Wall'),
    # Masonry
    ('block_lightweight', 'Lightweight Block'),
    ('brick', 'Brick'),
    # Other
    ('aggregate', 'Aggregate/Pukk'),
    ('aluminium', 'Aluminium'),
    ('copper', 'Copper'),
    ('pvc_pipe', 'PVC (pipes)'),
    ('pe_pipe', 'PE (pipes)'),
    ('other', 'Other'),
]

# Unit choices for materials
MATERIAL_UNIT_CHOICES = [
    ('m3', 'm\u00b3'),
    ('m2', 'm\u00b2'),
    ('m', 'm'),
    ('kg', 'kg'),
]


class MaterialLibrary(models.Model):
    """
    Global material library for normalized material categories.

    Each entry represents a HOMOGENEOUS material category.
    Composite materials are handled via TypeDefinitionLayer (multiple layers).

    Note: EPD data is stored separately in EPDLibrary and linked via EPDMapping.
    This allows different projects to use different EPDs for the same material.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, help_text="Material name (e.g., 'Concrete B35')")

    # Category aligned with Enova categories
    category = models.CharField(
        max_length=50,
        choices=MATERIAL_CATEGORY_CHOICES,
        help_text="Material category (aligned with Enova classification)"
    )

    # Unit of measurement
    unit = models.CharField(
        max_length=10,
        choices=MATERIAL_UNIT_CHOICES,
        help_text="Unit for LCA calculations"
    )

    # Physical properties
    density_kg_m3 = models.FloatField(
        null=True,
        blank=True,
        help_text="Material density in kg/m\u00b3"
    )
    thermal_conductivity = models.FloatField(
        null=True,
        blank=True,
        help_text="Thermal conductivity W/(m\u00b7K)"
    )

    # Manufacturer info (optional - for specific materials)
    manufacturer = models.CharField(max_length=255, blank=True, null=True)
    product_name = models.CharField(max_length=255, blank=True, null=True)
    manufacturer_product_id = models.CharField(max_length=100, blank=True, null=True)

    # Reused status
    reused_status = models.CharField(
        max_length=20,
        choices=REUSED_STATUS_CHOICES,
        default='new'
    )

    # Metadata
    description = models.TextField(blank=True, null=True)
    source = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Data source: 'enova', 'magna-reduzer', 'manual', 'ifc'"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'entities'
        db_table = 'material_library'
        ordering = ['category', 'name']
        verbose_name = 'Material Library Entry'
        verbose_name_plural = 'Material Library'

    def __str__(self):
        return f"{self.name} ({self.get_category_display()})"


class ProductLibrary(models.Model):
    """
    Cross-project product database for discrete components (pcs/stk).

    Products can be:
    - Homogeneous: Single material category (is_composite=False)
    - Composite: Multiple materials via ProductComposition (is_composite=True)

    Note: EPD data is stored separately in EPDLibrary and linked via EPDMapping.
    This allows different projects to use different EPDs for the same product.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    category = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Product category (window, door, fixture, etc.)"
    )
    manufacturer = models.CharField(max_length=255, blank=True, null=True)
    product_code = models.CharField(max_length=100, blank=True, null=True)
    description = models.TextField(blank=True, null=True)

    # Base material category (for homogeneous products)
    material_category = models.CharField(
        max_length=50,
        choices=MATERIAL_CATEGORY_CHOICES,
        blank=True,
        null=True,
        help_text="Primary material category (for homogeneous products)"
    )

    # Composite flag
    is_composite = models.BooleanField(
        default=False,
        help_text="True if product contains multiple materials (use ProductComposition)"
    )

    # Manufacturer info
    manufacturer_product_id = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Manufacturer's product ID/SKU"
    )

    # Dimensions/specs from datasheet
    dimensions = models.JSONField(
        default=dict,
        blank=True,
        help_text="Dimensions: {width, height, depth, weight, thickness}"
    )
    specifications = models.JSONField(
        default=dict,
        blank=True,
        help_text="Flexible spec storage from datasheet"
    )
    datasheet_url = models.URLField(blank=True, null=True)

    # Reused status
    reused_status = models.CharField(
        max_length=20,
        choices=REUSED_STATUS_CHOICES,
        default='new'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'entities'
        db_table = 'product_library'
        ordering = ['category', 'name']

    def __str__(self):
        return f"{self.name} ({self.manufacturer or 'Unknown'})"


class ProductComposition(models.Model):
    """
    Materials that make up a composite product.

    Links ProductLibrary to MaterialLibrary with quantities.
    Only used when product.is_composite=True.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(
        'ProductLibrary',
        on_delete=models.CASCADE,
        related_name='compositions'
    )
    material = models.ForeignKey(
        'MaterialLibrary',
        on_delete=models.CASCADE,
        related_name='product_uses'
    )

    # Quantity of material per product unit
    quantity = models.FloatField(help_text="Amount per 1 product unit")
    unit = models.CharField(
        max_length=10,
        choices=MATERIAL_UNIT_CHOICES,
        help_text="Unit for this quantity (kg, m\u00b2, m\u00b3)"
    )

    # Position for layered products
    layer_order = models.IntegerField(
        null=True,
        blank=True,
        help_text="Layer position for layered products"
    )

    notes = models.TextField(blank=True, null=True)

    class Meta:
        app_label = 'entities'
        db_table = 'product_compositions'
        ordering = ['product', 'layer_order']
        verbose_name = 'Product Composition'
        verbose_name_plural = 'Product Compositions'

    def __str__(self):
        return f"{self.product.name} -> {self.material.name}"


# =============================================================================
# EPD ARCHITECTURE - First-class EPD entities with flexible mapping
# =============================================================================

EPD_SOURCE_CHOICES = [
    ('reduzer', 'Reduzer'),
    ('oneclick', 'OneClickLCA'),
    ('nepd', 'NEPD'),
    ('epd_norge', 'EPD Norge'),
    ('custom', 'Custom'),
]

EPD_TARGET_TYPE_CHOICES = [
    ('ifc_type', 'IFC Type'),
    ('ifc_material', 'IFC Material'),
    ('material_lib', 'Material Library'),
    ('product_lib', 'Product Library'),
]


class EPDLibrary(models.Model):
    """
    EPD (Environmental Product Declaration) data as first-class entity.

    EPDs are NOT embedded in materials/products. Instead, they exist independently
    and can be mapped flexibly to:
    - IFC Types (most specific)
    - IFC Materials (model-specific)
    - MaterialLibrary entries (generic defaults)
    - ProductLibrary entries (product-specific)

    This enables different projects to use different EPDs for the same material.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Source identification
    source = models.CharField(
        max_length=50,
        choices=EPD_SOURCE_CHOICES,
        help_text="EPD database source"
    )
    source_id = models.CharField(
        max_length=255,
        help_text="ID in source system (e.g., Reduzer product name)"
    )
    name = models.CharField(
        max_length=500,
        help_text="Human-readable EPD name"
    )
    category = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Enova category or similar classification"
    )

    # LCA impact data (Global Warming Potential in kg CO2e)
    gwp_a1_a3 = models.FloatField(
        null=True,
        blank=True,
        help_text="GWP A1-A3: Product stage (kg CO2e per declared unit)"
    )
    gwp_c3_c4 = models.FloatField(
        null=True,
        blank=True,
        help_text="GWP C3-C4: End of life (kg CO2e per declared unit)"
    )
    gwp_d = models.FloatField(
        null=True,
        blank=True,
        help_text="GWP D: Benefits beyond system boundary (kg CO2e per declared unit)"
    )
    gwp_total = models.FloatField(
        null=True,
        blank=True,
        help_text="Total GWP (A1-A3 + C3-C4 + D, or as declared)"
    )

    # Unit information
    unit = models.CharField(
        max_length=20,
        help_text="Base unit: kg, m\u00b2, m\u00b3, pcs"
    )
    declared_unit = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Full declared unit (e.g., '1 m\u00b2', '1000 kg')"
    )

    # Validity
    valid_until = models.DateField(
        null=True,
        blank=True,
        help_text="EPD expiration date"
    )

    # Flexible metadata storage
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional EPD data (manufacturer, program operator, etc.)"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'entities'
        db_table = 'epd_library'
        unique_together = ['source', 'source_id']
        ordering = ['source', 'name']
        verbose_name = 'EPD Library Entry'
        verbose_name_plural = 'EPD Library'
        indexes = [
            models.Index(fields=['source']),
            models.Index(fields=['category']),
        ]

    def __str__(self):
        return f"{self.source}:{self.name}"


class EPDMapping(models.Model):
    """
    Flexible EPD-to-target mapping.

    Allows EPDs to be linked to different levels:
    - ifc_type: Direct to a specific IFCType (most specific)
    - ifc_material: Direct to a per-model Material
    - material_lib: To a MaterialLibrary entry (generic default)
    - product_lib: To a ProductLibrary entry (product-specific)

    Project-specific mappings (project != null) override global defaults.
    Priority field allows multiple mappings with fallback.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='epd_mappings',
        help_text="Project-specific mapping (null = global default)"
    )

    target_type = models.CharField(
        max_length=50,
        choices=EPD_TARGET_TYPE_CHOICES,
        help_text="What this EPD is mapped to"
    )
    target_id = models.UUIDField(
        help_text="UUID of the target (IFCType, Material, MaterialLibrary, or ProductLibrary)"
    )

    epd = models.ForeignKey(
        'EPDLibrary',
        on_delete=models.CASCADE,
        related_name='mappings',
        help_text="The EPD to use for this target"
    )

    priority = models.IntegerField(
        default=0,
        help_text="Higher priority = preferred when multiple mappings exist"
    )

    notes = models.TextField(
        blank=True,
        null=True,
        help_text="Reason for this mapping or additional context"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_epd_mappings'
    )

    class Meta:
        app_label = 'entities'
        db_table = 'epd_mappings'
        ordering = ['-priority', '-created_at']
        indexes = [
            models.Index(fields=['target_type', 'target_id']),
            models.Index(fields=['project']),
        ]
        verbose_name = 'EPD Mapping'
        verbose_name_plural = 'EPD Mappings'

    def __str__(self):
        scope = f"Project:{self.project_id}" if self.project else "Global"
        return f"{self.target_type}:{self.target_id} -> {self.epd.name} ({scope})"


class IFCMaterialNormalization(models.Model):
    """
    Maps raw IFC material names to normalized MaterialLibrary entries.

    This is a normalization rules table that allows:
    - Per-model mappings (when model is set)
    - Global rules (when model is null) - applies to all models

    Example: "B35 Betong" in model X -> MaterialLibrary "Concrete B35"

    Note: This differs from the existing MaterialMapping model which is a
    1:1 extension of the Material model. This model is for normalization rules.
    """
    CONFIDENCE_CHOICES = [
        ('auto', 'Auto-detected'),
        ('manual', 'Manual'),
        ('verified', 'Verified'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Can be model-specific or global
    model = models.ForeignKey(
        'models.Model',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='material_normalizations',
        help_text="Model-specific normalization (null = global rule)"
    )

    ifc_material_name = models.CharField(
        max_length=500,
        help_text="Raw material name from IFC (exact match or pattern)"
    )
    material_library = models.ForeignKey(
        'MaterialLibrary',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='normalizations',
        help_text="Normalized MaterialLibrary entry"
    )
    normalized_name = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Canonical name (can differ from MaterialLibrary.name)"
    )

    confidence = models.CharField(
        max_length=20,
        choices=CONFIDENCE_CHOICES,
        default='auto',
        help_text="How this normalization was created"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'entities'
        db_table = 'ifc_material_normalizations'
        unique_together = ['model', 'ifc_material_name']
        indexes = [
            models.Index(fields=['ifc_material_name']),
            models.Index(fields=['confidence']),
        ]
        verbose_name = 'IFC Material Normalization'
        verbose_name_plural = 'IFC Material Normalizations'

    def __str__(self):
        scope = f"Model:{self.model_id}" if self.model else "Global"
        target = self.material_library.name if self.material_library else self.normalized_name
        return f"'{self.ifc_material_name}' -> {target} ({scope})"
