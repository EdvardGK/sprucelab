"""
IFC Entity and related models for BIM Coordinator Platform.
"""
from django.db import models
from django.contrib.postgres.fields import ArrayField
import uuid


class IFCEntity(models.Model):
    """
    Individual IFC building element (wall, door, window, etc.).

    Stores metadata and quantities only - no geometry data.
    3D visualization handled by ThatOpen viewer loading IFC/Fragments directly.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    model = models.ForeignKey('models.Model', on_delete=models.CASCADE, related_name='entities')

    # === Core IFC Metadata ===
    express_id = models.IntegerField(
        null=True,
        blank=True,
        help_text="IFC STEP file ID (express ID) - used for viewer selection"
    )
    ifc_guid = models.CharField(max_length=22, help_text="IFC GlobalId - unique identifier")
    ifc_type = models.CharField(max_length=100, help_text="IFC class (IfcWall, IfcDoor, etc.)")
    predefined_type = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="IFC PredefinedType (STANDARD, NOTDEFINED, etc.)"
    )
    object_type = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="IFC ObjectType - user-defined type string"
    )
    name = models.TextField(blank=True, null=True)  # No length limit - some IFC names are very long
    description = models.TextField(blank=True, null=True)
    storey_id = models.UUIDField(null=True, blank=True, help_text="Reference to parent storey")

    # === Version tracking ===
    is_removed = models.BooleanField(
        default=False,
        help_text="Soft delete: entity not present in latest model version"
    )

    # === Data quality flags ===
    is_geometry_only = models.BooleanField(
        default=False,
        help_text="Entity has no type, name, or properties - geometry only (typically IfcBuildingElementProxy)"
    )

    # === Quantities (for analysis & BEP validation) ===
    area = models.FloatField(
        null=True,
        blank=True,
        help_text="Net area in square meters (m²) - from Qto_*BaseQuantities"
    )
    volume = models.FloatField(
        null=True,
        blank=True,
        help_text="Net volume in cubic meters (m³) - from Qto_*BaseQuantities"
    )
    length = models.FloatField(
        null=True,
        blank=True,
        help_text="Length in meters (m) - for linear elements"
    )
    height = models.FloatField(
        null=True,
        blank=True,
        help_text="Height in meters (m) - for vertical elements"
    )
    perimeter = models.FloatField(
        null=True,
        blank=True,
        help_text="Perimeter in meters (m) - for boundary calculations"
    )

    class Meta:
        db_table = 'ifc_entities'
        unique_together = ['model', 'ifc_guid']
        indexes = [
            models.Index(fields=['ifc_type']),
            models.Index(fields=['ifc_guid']),
            models.Index(fields=['storey_id']),
            models.Index(fields=['express_id']),
            models.Index(fields=['is_removed']),
            models.Index(fields=['is_geometry_only']),
        ]

    def __str__(self):
        return f"{self.ifc_type}: {self.name or self.ifc_guid}"


class SpatialHierarchy(models.Model):
    """
    Spatial structure (Project/Site/Building/Storey hierarchy).
    """
    HIERARCHY_LEVELS = [
        ('project', 'Project'),
        ('site', 'Site'),
        ('building', 'Building'),
        ('storey', 'Storey'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    model = models.ForeignKey('models.Model', on_delete=models.CASCADE, related_name='spatial_hierarchy')
    entity = models.ForeignKey(IFCEntity, on_delete=models.CASCADE, related_name='spatial_parents')
    parent = models.ForeignKey(IFCEntity, on_delete=models.CASCADE, null=True, blank=True, related_name='spatial_children')
    hierarchy_level = models.CharField(max_length=20, choices=HIERARCHY_LEVELS)
    path = ArrayField(models.CharField(max_length=22), default=list)  # Array of GUIDs from project to this element

    class Meta:
        db_table = 'spatial_hierarchy'
        indexes = [
            models.Index(fields=['hierarchy_level']),
        ]


class PropertySet(models.Model):
    """
    IFC property sets (Psets) and individual properties.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey(IFCEntity, on_delete=models.CASCADE, related_name='property_sets')
    pset_name = models.CharField(max_length=255)
    property_name = models.CharField(max_length=255)
    property_value = models.TextField(blank=True, null=True)
    property_type = models.CharField(max_length=50, blank=True, null=True)  # STRING, INTEGER, BOOLEAN, etc.

    class Meta:
        db_table = 'property_sets'
        indexes = [
            models.Index(fields=['pset_name']),
            models.Index(fields=['property_name']),
        ]

    def __str__(self):
        return f"{self.pset_name}.{self.property_name} = {self.property_value}"


class System(models.Model):
    """
    IFC systems (HVAC, Electrical, Plumbing, etc.).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    model = models.ForeignKey('models.Model', on_delete=models.CASCADE, related_name='systems')
    system_guid = models.CharField(max_length=22)
    system_name = models.CharField(max_length=255, blank=True, null=True)
    system_type = models.CharField(max_length=100, blank=True, null=True)  # IfcSystem subclass
    description = models.TextField(blank=True, null=True)

    class Meta:
        db_table = 'systems'
        unique_together = ['model', 'system_guid']

    def __str__(self):
        return self.system_name or self.system_guid


class SystemMembership(models.Model):
    """
    Relationship between systems and elements.
    """
    system = models.ForeignKey(System, on_delete=models.CASCADE, related_name='memberships')
    entity = models.ForeignKey(IFCEntity, on_delete=models.CASCADE, related_name='system_memberships')

    class Meta:
        db_table = 'system_memberships'
        unique_together = ['system', 'entity']


class Material(models.Model):
    """
    Per-model IFC materials extracted from IfcMaterial.

    Note: IfcMaterial does NOT have GlobalId (doesn't inherit from IfcRoot).
    We store the IFC step ID in material_guid for unique identification within a file.

    Links to global libraries:
    - material_library: Normalized material category (for LCA, density, EPD)
    - product_library: Specific product (for specs, dimensions, manufacturer)
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    model = models.ForeignKey('models.Model', on_delete=models.CASCADE, related_name='materials')
    material_guid = models.CharField(max_length=50)  # IFC step ID (e.g., "123")
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=100, blank=True, null=True)
    properties = models.JSONField(default=dict, blank=True)

    # Link to global Material Library (normalized category) - ALWAYS set when possible
    material_library = models.ForeignKey(
        'MaterialLibrary',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ifc_materials',
        help_text="Normalized material category (for LCA, density, EPD)"
    )

    # Link to global Product Library (specific product) - OPTIONAL
    product_library = models.ForeignKey(
        'ProductLibrary',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ifc_materials',
        help_text="Specific product (for specs, dimensions, manufacturer)"
    )

    # Reused status (can override library default)
    reused_status = models.CharField(
        max_length=20,
        choices=[
            ('new', 'New'),
            ('existing_kept', 'Existing Kept'),
            ('reused', 'Reused'),
            ('existing_waste', 'Existing Waste'),
        ],
        default='new'
    )

    class Meta:
        db_table = 'materials'
        unique_together = ['model', 'material_guid']

    def __str__(self):
        return self.name


class MaterialAssignment(models.Model):
    """
    Relationship between materials and elements.
    """
    entity = models.ForeignKey(IFCEntity, on_delete=models.CASCADE, related_name='material_assignments')
    material = models.ForeignKey(Material, on_delete=models.CASCADE, related_name='assignments')
    layer_thickness = models.FloatField(null=True, blank=True)
    layer_order = models.IntegerField(default=1)

    class Meta:
        db_table = 'material_assignments'
        unique_together = ['entity', 'material', 'layer_order']


class IFCType(models.Model):
    """
    IFC type definitions derived from element ObjectType attributes.

    Types are enumerated from unique ObjectType values (primary source).
    When an IfcTypeObject exists with matching name, metadata is enriched from it.

    - has_ifc_type_object=True: Backed by real IfcTypeObject, type_guid is GlobalId
    - has_ifc_type_object=False: Synthetic from ObjectType, type_guid is generated hash
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    model = models.ForeignKey('models.Model', on_delete=models.CASCADE, related_name='types')
    type_guid = models.CharField(
        max_length=50,  # Increased to accommodate synthetic GUIDs
        help_text="IFC GlobalId or synthetic hash for types without IfcTypeObject"
    )
    type_name = models.CharField(max_length=255, blank=True, null=True)
    ifc_type = models.CharField(max_length=100)  # IfcWallType, etc.
    predefined_type = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text="IFC PredefinedType (STANDARD, USERDEFINED, NOTDEFINED)"
    )
    properties = models.JSONField(default=dict, blank=True)

    # Instance count - stored directly instead of computed from TypeAssignment joins
    instance_count = models.IntegerField(
        default=0,
        help_text="Number of instances of this type in the model"
    )

    # Track whether this type is backed by an IfcTypeObject
    has_ifc_type_object = models.BooleanField(
        default=True,
        help_text="True if backed by IfcTypeObject, False if synthetic from ObjectType"
    )

    class Meta:
        db_table = 'ifc_types'
        unique_together = ['model', 'type_guid']

    def __str__(self):
        return self.type_name or self.type_guid


class TypeAssignment(models.Model):
    """
    Relationship between types and elements.
    """
    entity = models.ForeignKey(IFCEntity, on_delete=models.CASCADE, related_name='type_assignments')
    type = models.ForeignKey(IFCType, on_delete=models.CASCADE, related_name='assignments')

    class Meta:
        db_table = 'type_assignments'
        unique_together = ['entity', 'type']


# =============================================================================
# REFERENCE DATA - Standard classifications
# =============================================================================

class NS3451Code(models.Model):
    """
    NS-3451 building part classification codes (Norwegian standard).

    Reference table loaded from NS-3451:2022 standard.
    Used for dropdown selection when mapping IFC types.
    """
    code = models.CharField(
        max_length=20,
        primary_key=True,
        help_text="NS-3451 code (e.g., '222' for columns, '231' for external walls)"
    )
    name = models.CharField(max_length=255, help_text="Norwegian name")
    name_en = models.CharField(max_length=255, blank=True, null=True, help_text="English name")
    guidance = models.TextField(blank=True, null=True, help_text="Usage guidance from standard")
    level = models.IntegerField(
        help_text="Hierarchy level (1=main category, 2=subcategory, 3=detail)"
    )
    parent_code = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="Parent code for hierarchy"
    )

    class Meta:
        db_table = 'ns3451_codes'
        ordering = ['code']
        verbose_name = 'NS-3451 Code'
        verbose_name_plural = 'NS-3451 Codes'

    def __str__(self):
        return f"{self.code} - {self.name}"


# =============================================================================
# WAREHOUSE MODELS - User mappings and annotations
# =============================================================================

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
    ('m3', 'm³'),
    ('m2', 'm²'),
    ('m', 'm'),
    ('kg', 'kg'),
]


class MaterialLibrary(models.Model):
    """
    Global material library with EPD and Reduzer integration.

    Each entry represents a HOMOGENEOUS material category (one Enova EPD).
    Composite materials are handled via TypeDefinitionLayer (multiple layers).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, help_text="Material name (e.g., 'Concrete B35')")

    # Category aligned with Enova EPD categories
    category = models.CharField(
        max_length=50,
        choices=MATERIAL_CATEGORY_CHOICES,
        help_text="Material category (aligned with Enova EPD)"
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
        help_text="Material density in kg/m³"
    )
    thermal_conductivity = models.FloatField(
        null=True,
        blank=True,
        help_text="Thermal conductivity W/(m·K)"
    )

    # EPD data
    normalized_epd_id = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Generic/Reduzer EPD reference"
    )
    specific_epd_id = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Product-specific EPD reference (optional)"
    )
    gwp_a1_a3 = models.FloatField(
        null=True,
        blank=True,
        help_text="Global Warming Potential A1-A3 (kgCO2e per unit)"
    )

    # Reduzer integration
    reduzer_product_id = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Reduzer ProductID (e.g., 'Reduzer Enova Gipsplate normal - typisk verdi')"
    )
    reduzer_product_id_type = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="ProductID type: EPDno, NOBB, NEPD, GTINFPAK"
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
    epd_data = models.JSONField(default=dict, blank=True, help_text="EPD/LCA data")

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

    # Reduzer integration
    reduzer_product_id = models.CharField(max_length=255, blank=True, null=True)
    reduzer_product_id_type = models.CharField(max_length=20, blank=True, null=True)

    # Reused status
    reused_status = models.CharField(
        max_length=20,
        choices=REUSED_STATUS_CHOICES,
        default='new'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
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
        ProductLibrary,
        on_delete=models.CASCADE,
        related_name='compositions'
    )
    material = models.ForeignKey(
        MaterialLibrary,
        on_delete=models.CASCADE,
        related_name='product_uses'
    )

    # Quantity of material per product unit
    quantity = models.FloatField(help_text="Amount per 1 product unit")
    unit = models.CharField(
        max_length=10,
        choices=MATERIAL_UNIT_CHOICES,
        help_text="Unit for this quantity (kg, m², m³)"
    )

    # Position for layered products
    layer_order = models.IntegerField(
        null=True,
        blank=True,
        help_text="Layer position for layered products"
    )

    notes = models.TextField(blank=True, null=True)

    class Meta:
        db_table = 'product_compositions'
        ordering = ['product', 'layer_order']
        verbose_name = 'Product Composition'
        verbose_name_plural = 'Product Compositions'

    def __str__(self):
        return f"{self.product.name} → {self.material.name}"


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
    ifc_type = models.OneToOneField(IFCType, on_delete=models.CASCADE, related_name='mapping')

    # Standard classifications
    ns3451_code = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="NS-3451 building part code (e.g., '222')"
    )
    ns3451 = models.ForeignKey(
        NS3451Code,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='type_mappings',
        help_text="Reference to NS-3451 code lookup"
    )
    product = models.ForeignKey(
        ProductLibrary,
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

    class Meta:
        db_table = 'type_mappings'
        indexes = [
            models.Index(fields=['mapping_status']),
            models.Index(fields=['ns3451_code']),
        ]

    def __str__(self):
        return f"{self.ifc_type.type_name} → {self.ns3451_code or 'unmapped'}"


class TypeDefinitionLayer(models.Model):
    """
    Material layer/inventory for type definitions in the library/warehouse.

    Implements a two-level unit system:
    - Component (parent type): measured in representative_unit (m², m, pcs)
    - Inventory (this layer): material quantity per 1 type unit ("recipe ratio")

    Example: Wall type measured in m² contains per m²:
    - 0.25 m³ concrete (quantity_per_unit=0.25, material_unit=m3)
    - 20 kg rebar (quantity_per_unit=20, material_unit=kg)
    - 2.0 m² gypsum (quantity_per_unit=2.0, material_unit=m2) - 4 layers

    Thickness_mm is optional for sandwich view visualization.
    """
    MATERIAL_UNIT_CHOICES = [
        ('m2', 'm²'),
        ('m', 'm'),
        ('m3', 'm³'),
        ('kg', 'kg'),
        ('pcs', 'pcs'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    type_mapping = models.ForeignKey(
        TypeMapping,
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
        MaterialLibrary,
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
    material = models.OneToOneField(Material, on_delete=models.CASCADE, related_name='mapping')

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
        help_text="Material density in kg/m³"
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
        help_text="W/(m·K)"
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
        db_table = 'material_mappings'
        indexes = [
            models.Index(fields=['mapping_status']),
            models.Index(fields=['standard_name']),
        ]

    def __str__(self):
        return f"{self.material.name} → {self.standard_name or 'unmapped'}"


# TypeLayer removed - superseded by TypeDefinitionLayer in warehouse system
# Geometry model removed - no longer storing 3D mesh data in database
# IFC is the source of truth - stream geometry on demand


class GraphEdge(models.Model):
    """
    Graph relationships for visualization.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    model = models.ForeignKey('models.Model', on_delete=models.CASCADE, related_name='graph_edges')
    source_entity = models.ForeignKey(IFCEntity, on_delete=models.CASCADE, related_name='outgoing_edges')
    target_entity = models.ForeignKey(IFCEntity, on_delete=models.CASCADE, related_name='incoming_edges')
    relationship_type = models.CharField(max_length=100)  # IfcRelContainedInSpatialStructure, etc.
    properties = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'graph_edges'
        indexes = [
            models.Index(fields=['source_entity']),
            models.Index(fields=['target_entity']),
            models.Index(fields=['relationship_type']),
        ]


# ChangeLog removed - not currently used
# StorageMetrics removed - not currently used


class IFCValidationReport(models.Model):
    """
    IFC quality validation results (schema, GUID, LOD, etc.).
    """
    STATUS_CHOICES = [
        ('pass', 'Pass'),
        ('warning', 'Warning'),
        ('fail', 'Fail'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    model = models.ForeignKey('models.Model', on_delete=models.CASCADE, related_name='validation_reports')
    validated_at = models.DateTimeField(auto_now_add=True)

    # Overall status
    overall_status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pass')
    schema_valid = models.BooleanField(default=True)

    # Issue counts
    total_elements = models.IntegerField(default=0)
    elements_with_issues = models.IntegerField(default=0)

    # Detailed issues (JSON arrays)
    schema_errors = models.JSONField(default=list, blank=True)
    schema_warnings = models.JSONField(default=list, blank=True)
    guid_issues = models.JSONField(default=list, blank=True)
    geometry_issues = models.JSONField(default=list, blank=True)
    property_issues = models.JSONField(default=list, blank=True)
    lod_issues = models.JSONField(default=list, blank=True)

    # Summary text
    summary = models.TextField(blank=True, null=True)

    class Meta:
        db_table = 'ifc_validation_reports'
        ordering = ['-validated_at']
        indexes = [
            models.Index(fields=['overall_status']),
            models.Index(fields=['validated_at']),
        ]

    def __str__(self):
        return f"Validation {self.overall_status.upper()} - {self.model.name}"


class ProcessingReport(models.Model):
    """
    Detailed processing report for IFC file extraction.

    CRITICAL: This report MUST be created even if processing fails catastrophically.
    Each stage tracks: processed count, skipped count, failed count, errors.
    """
    STATUS_CHOICES = [
        ('success', 'Success'),
        ('partial', 'Partial Success'),
        ('failed', 'Failed'),
    ]

    STAGE_CHOICES = [
        ('file_open', 'File Open'),
        ('validation', 'Validation'),
        ('spatial_hierarchy', 'Spatial Hierarchy'),
        ('materials', 'Materials'),
        ('types', 'Types'),
        ('systems', 'Systems'),
        ('elements', 'Elements'),
        ('properties', 'Property Sets'),
        ('graph_edges', 'Graph Edges'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    model = models.ForeignKey('models.Model', on_delete=models.CASCADE, related_name='processing_reports')

    # Timestamps
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.FloatField(null=True, blank=True)

    # Overall status
    overall_status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='failed')

    # File info
    ifc_schema = models.CharField(max_length=50, blank=True, null=True)
    file_size_bytes = models.BigIntegerField(default=0)

    # Per-stage results (JSON array of stage objects)
    # Each stage: {stage, status, processed, skipped, failed, errors[], duration_ms}
    stage_results = models.JSONField(default=list, blank=True)

    # Overall counts
    total_entities_processed = models.IntegerField(default=0)
    total_entities_skipped = models.IntegerField(default=0)
    total_entities_failed = models.IntegerField(default=0)

    # Errors (JSON array of error objects)
    # Each error: {stage, severity, message, element_guid, element_type, timestamp}
    errors = models.JSONField(default=list, blank=True)

    # Catastrophic failure details
    catastrophic_failure = models.BooleanField(default=False)
    failure_stage = models.CharField(max_length=50, blank=True, null=True, choices=STAGE_CHOICES)
    failure_exception = models.TextField(blank=True, null=True)
    failure_traceback = models.TextField(blank=True, null=True)

    # Summary text
    summary = models.TextField(blank=True, null=True)

    # Verification metadata (for audit trail)
    # Structure: {types_total, types_with_instances, types_without_instances,
    #             entities_total, entities_with_type, entities_geometry_only,
    #             verified_at, verification_method}
    verification_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="Verification stats from ifcopenshell parsing"
    )

    class Meta:
        db_table = 'processing_reports'
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['overall_status']),
            models.Index(fields=['started_at']),
        ]

    def __str__(self):
        return f"Processing {self.overall_status.upper()} - {self.model.name} ({self.started_at})"


# =============================================================================
# TYPE BANK - Collaborative Type Labeling System
# =============================================================================

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
        NS3451Code,
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

    class Meta:
        db_table = 'type_bank_entries'
        unique_together = ['ifc_class', 'type_name', 'predefined_type', 'material']
        indexes = [
            models.Index(fields=['ifc_class']),
            models.Index(fields=['mapping_status']),
            models.Index(fields=['ns3451_code']),
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
        TypeBankEntry,
        on_delete=models.CASCADE,
        related_name='observations',
        help_text="The canonical type this observation links to"
    )
    source_model = models.ForeignKey(
        'models.Model',
        on_delete=models.CASCADE,
        related_name='type_bank_observations',
        help_text="The model where this type was observed"
    )
    source_type = models.ForeignKey(
        IFCType,
        on_delete=models.CASCADE,
        related_name='type_bank_observation',
        help_text="The original IFCType record from this model"
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
        db_table = 'type_bank_observations'
        unique_together = ['type_bank_entry', 'source_type']
        indexes = [
            models.Index(fields=['source_model']),
            models.Index(fields=['observed_at']),
        ]

    def __str__(self):
        return f"{self.type_bank_entry} in {self.source_model.name}"


class TypeBankAlias(models.Model):
    """
    Alternative names for the same canonical type.

    Experts manually link naming variations (e.g., "GU13" ↔ "Gyproc GU 13mm").
    No auto-merging - all aliases are explicit.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    canonical = models.ForeignKey(
        TypeBankEntry,
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
        db_table = 'type_bank_aliases'
        indexes = [
            models.Index(fields=['alias_type_name']),
        ]

    def __str__(self):
        return f"'{self.alias_type_name}' → {self.canonical}"


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
        TypeBankEntry,
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
