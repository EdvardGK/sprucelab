"""
IFC Entity and related models for BIM Coordinator Platform.
"""
from django.db import models
from django.contrib.postgres.fields import ArrayField
import uuid

from apps.core.disciplines import (
    ALL_DISCIPLINE_CHOICES,
    OWNERSHIP_LEVEL_CHOICES,
)


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
    # === Ownership Status (Sprint 1: The Gatekeeper) ===
    OWNERSHIP_STATUS_CHOICES = [
        ('primary', 'Primary - My discipline owns this type'),
        ('reference', 'Reference - Other discipline owns, I copy'),
        ('ghost', 'Ghost - Ignore for verification (not my concern)'),
    ]

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

    # === Ownership Status (Sprint 1: The Gatekeeper) ===
    ownership_status = models.CharField(
        max_length=20,
        choices=OWNERSHIP_STATUS_CHOICES,
        default='primary',
        help_text="Discipline ownership: primary (my type), reference (copy from others), ghost (ignore)"
    )

    class Meta:
        db_table = 'ifc_types'
        unique_together = ['model', 'type_guid']
        indexes = [
            models.Index(fields=['ownership_status']),
        ]

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


class NS3451OwnershipMatrix(models.Model):
    """
    Maps NS3451 codes to responsible disciplines (Sprint 1: The Gatekeeper).

    Defines which discipline "owns" which building parts:
    - Primary: Discipline must model this (e.g., RIV owns 32 HVAC)
    - Secondary: Discipline may model this for coordination
    - Reference: Discipline copies from primary owner (e.g., ARK shows RIV elements)

    Used by discipline_filter.py to auto-demote types outside model's responsibility.
    """
    # Discipline choices and ownership levels imported from apps.core.disciplines

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    ns3451_code = models.ForeignKey(
        NS3451Code,
        on_delete=models.CASCADE,
        related_name='ownership_matrix',
        help_text="NS3451 building part code"
    )
    discipline = models.CharField(
        max_length=20,
        choices=ALL_DISCIPLINE_CHOICES,
        help_text="BIM discipline code"
    )
    ownership_level = models.CharField(
        max_length=20,
        choices=OWNERSHIP_LEVEL_CHOICES,
        help_text="Level of ownership for this discipline"
    )
    notes = models.TextField(
        blank=True,
        null=True,
        help_text="Additional guidance for this assignment"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'ns3451_ownership_matrix'
        unique_together = ['ns3451_code', 'discipline']
        ordering = ['ns3451_code', 'discipline']
        verbose_name = 'NS3451 Ownership Matrix'
        verbose_name_plural = 'NS3451 Ownership Matrix'
        indexes = [
            models.Index(fields=['discipline']),
            models.Index(fields=['ownership_level']),
        ]

    def __str__(self):
        return f"{self.ns3451_code.code} → {self.discipline} ({self.ownership_level})"


# =============================================================================
# SEMANTIC TYPE - IFC class normalization based on PA0802/NS3451
# =============================================================================

class SemanticType(models.Model):
    """
    Canonical semantic type definitions based on PA0802/NS3451.

    Normalizes IFC classes to what elements ACTUALLY are, regardless of
    how they were modeled. For example:
    - IfcSlab used for carpet → SemanticType 'EB' (Surface Covering)
    - IfcBeam used for railing rail → SemanticType 'AR' (Railing)
    - IfcBuildingElementProxy → needs manual classification

    Based on PA0802 TFM component codes and aligned with NS3451.
    """
    code = models.CharField(
        max_length=4,
        unique=True,
        help_text="PA0802 code: AB, AD, AV, etc."
    )
    name_no = models.CharField(max_length=100, help_text="Norwegian name")
    name_en = models.CharField(max_length=100, help_text="English name")
    category = models.CharField(
        max_length=50,
        help_text="Category: A-Structural, D-Openings, E-Cladding, etc."
    )

    # IFC mappings
    canonical_ifc_class = models.CharField(
        max_length=50,
        help_text="Primary expected IFC class: IfcBeam, IfcWall, etc."
    )
    alternative_ifc_classes = models.JSONField(
        default=list,
        blank=True,
        help_text="Alternative valid IFC classes: ['IfcBeamStandardCase']"
    )

    # NS3451 mappings
    suggested_ns3451_codes = models.JSONField(
        default=list,
        blank=True,
        help_text="Suggested NS3451 codes: ['223', '2231']"
    )

    # Pattern matching for auto-detection
    name_patterns = models.JSONField(
        default=list,
        blank=True,
        help_text="Glob patterns for name matching: ['*beam*', '*bjelke*']"
    )

    # Metadata
    description = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'semantic_types'
        ordering = ['category', 'code']
        verbose_name = 'Semantic Type'
        verbose_name_plural = 'Semantic Types'

    def __str__(self):
        return f"{self.code} - {self.name_en}"


class SemanticTypeIFCMapping(models.Model):
    """
    Maps IFC classes to semantic types with context.

    Handles both:
    - Primary mappings (IfcBeam → AB Beam, high confidence)
    - Misuse mappings (IfcSlab used for covering → EB, low confidence)
    """
    semantic_type = models.ForeignKey(
        SemanticType,
        on_delete=models.CASCADE,
        related_name='ifc_mappings'
    )
    ifc_class = models.CharField(
        max_length=50,
        help_text="IFC class: IfcWall, IfcBuildingElementProxy, etc."
    )
    predefined_type = models.CharField(
        max_length=50,
        blank=True,
        default='',
        help_text="Optional PredefinedType filter"
    )

    is_primary = models.BooleanField(
        default=False,
        help_text="True if this is the expected/correct IFC class"
    )
    is_common_misuse = models.BooleanField(
        default=False,
        help_text="True if this IFC class is commonly misused for this type"
    )
    confidence_hint = models.FloatField(
        default=0.5,
        help_text="Confidence when auto-detected via this mapping (0.0-1.0)"
    )
    note = models.TextField(
        blank=True,
        null=True,
        help_text="Explanation of this mapping"
    )

    class Meta:
        db_table = 'semantic_type_ifc_mappings'
        unique_together = ['semantic_type', 'ifc_class', 'predefined_type']
        indexes = [
            models.Index(fields=['ifc_class']),
        ]
        verbose_name = 'Semantic Type IFC Mapping'
        verbose_name_plural = 'Semantic Type IFC Mappings'

    def __str__(self):
        primary = " (primary)" if self.is_primary else ""
        misuse = " [misuse]" if self.is_common_misuse else ""
        return f"{self.ifc_class} → {self.semantic_type.code}{primary}{misuse}"


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
        help_text="Material density in kg/m³"
    )
    thermal_conductivity = models.FloatField(
        null=True,
        blank=True,
        help_text="Thermal conductivity W/(m·K)"
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
        help_text="Base unit: kg, m², m³, pcs"
    )
    declared_unit = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Full declared unit (e.g., '1 m²', '1000 kg')"
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
        EPDLibrary,
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
        return f"{self.target_type}:{self.target_id} → {self.epd.name} ({scope})"


class IFCMaterialNormalization(models.Model):
    """
    Maps raw IFC material names to normalized MaterialLibrary entries.

    This is a normalization rules table that allows:
    - Per-model mappings (when model is set)
    - Global rules (when model is null) - applies to all models

    Example: "B35 Betong" in model X → MaterialLibrary "Concrete B35"

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
        return f"'{self.ifc_material_name}' → {target} ({scope})"


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

    # === Human Verification Status ===
    # Three-tier system: pending → auto → verified/flagged
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
        db_table = 'type_mappings'
        indexes = [
            models.Index(fields=['mapping_status']),
            models.Index(fields=['ns3451_code']),
            models.Index(fields=['verification_status']),
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
    # Three-tier system: pending → auto → verified/flagged
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
        TypeBankEntry,
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
        IFCType,
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


# =============================================================================
# SPATIAL STITCHING - Cross-model room assignment (Sprint 3: The Mapper)
# =============================================================================

class RoomAssignment(models.Model):
    """
    Links discrete MEP entities to containing rooms (Sprint 3: The Mapper).

    Uses point-in-volume to determine which room (IfcSpace) contains
    the basepoint of discrete elements like vents, valves, and fixtures.
    Enables cross-model spatial queries: "What dampers are in Room 101?"

    Discrete entity types (point-based, not linear):
    - IfcAirTerminal (Vents)
    - IfcValve (Valves)
    - IfcSanitaryTerminal (Toilets, sinks)
    - IfcFurniture (Furniture)
    - IfcLightFixture (Light fixtures)
    - IfcOutlet (Electrical outlets)
    - IfcSensor (Sensors)
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # The discrete entity (vent, valve, toilet, etc.)
    entity = models.ForeignKey(
        IFCEntity,
        on_delete=models.CASCADE,
        related_name='room_assignments',
        help_text="The discrete entity being assigned to a room"
    )

    # The room (IfcSpace) that contains this entity
    room = models.ForeignKey(
        IFCEntity,
        on_delete=models.CASCADE,
        related_name='contained_entities',
        help_text="The IfcSpace (room) containing this entity"
    )

    # Cross-model linking (entity from MEP, room from ARK)
    entity_model = models.ForeignKey(
        'models.Model',
        on_delete=models.CASCADE,
        related_name='outgoing_room_assignments',
        help_text="Model containing the entity (typically MEP)"
    )
    room_model = models.ForeignKey(
        'models.Model',
        on_delete=models.CASCADE,
        related_name='incoming_room_assignments',
        help_text="Model containing the room (typically ARK)"
    )

    # Entity basepoint (centroid for recalculation on re-upload)
    basepoint_x = models.FloatField(help_text="Entity centroid X coordinate")
    basepoint_y = models.FloatField(help_text="Entity centroid Y coordinate")
    basepoint_z = models.FloatField(help_text="Entity centroid Z coordinate")

    # Confidence scoring
    confidence = models.FloatField(
        default=1.0,
        help_text="Confidence: 1.0 = point clearly inside, <1.0 = near boundary/estimated"
    )

    calculated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'room_assignments'
        unique_together = ['entity', 'room']
        indexes = [
            models.Index(fields=['entity_model']),
            models.Index(fields=['room_model']),
            models.Index(fields=['confidence']),
        ]
        verbose_name = 'Room Assignment'
        verbose_name_plural = 'Room Assignments'

    def __str__(self):
        entity_name = self.entity.name or self.entity.ifc_guid if self.entity else 'Unknown'
        room_name = self.room.name or 'Room' if self.room else 'Unknown'
        return f"{entity_name} → {room_name}"


# =============================================================================
# ANALYSIS - Type-first analysis data (from ifc-toolkit type_analysis())
# =============================================================================

class ModelAnalysis(models.Model):
    """
    Analysis snapshot for an IFC model. Regenerated on each deep analysis.

    Separate from the fast 2s parse (IFCType extraction). This is an optional
    deeper analysis step (10-30s) that produces per-type quality, geometry,
    and storey distribution data for the dashboard.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    model = models.OneToOneField(
        'models.Model', on_delete=models.CASCADE, related_name='analysis'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    # File metadata
    ifc_schema = models.CharField(max_length=20)
    file_size_mb = models.FloatField(null=True, blank=True)
    application = models.CharField(max_length=255, blank=True)

    # Global counts
    total_types = models.IntegerField(default=0)
    total_products = models.IntegerField(default=0)
    total_storeys = models.IntegerField(default=0)
    total_spaces = models.IntegerField(default=0)
    duplicate_guid_count = models.IntegerField(default=0)

    # Model-level data (not per-type, not filterable)
    units = models.JSONField(default=dict)
    coordinates = models.JSONField(default=dict)
    project_name = models.CharField(max_length=255, blank=True)
    site_name = models.CharField(max_length=255, blank=True)
    building_name = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = 'model_analysis'

    def __str__(self):
        return f"Analysis: {self.model} ({self.ifc_schema})"


class AnalysisStorey(models.Model):
    """Storey with elevation and aggregate element count."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    analysis = models.ForeignKey(
        ModelAnalysis, on_delete=models.CASCADE, related_name='storeys'
    )
    name = models.CharField(max_length=255)
    elevation = models.FloatField(null=True, blank=True)
    height = models.FloatField(null=True, blank=True)
    element_count = models.IntegerField(default=0)

    class Meta:
        db_table = 'analysis_storeys'
        unique_together = ['analysis', 'name']

    def __str__(self):
        return f"{self.name} ({self.elevation}m)"


class AnalysisType(models.Model):
    """
    Per-type analysis data. The primary entity for cross-filtering.

    Includes typed elements, untyped groups (type_name=NULL),
    and empty type definitions (instance_count=0).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    analysis = models.ForeignKey(
        ModelAnalysis, on_delete=models.CASCADE, related_name='types'
    )
    ifc_type = models.ForeignKey(
        'IFCType', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='analysis_data'
    )

    # Type identity
    type_class = models.CharField(max_length=100)
    type_name = models.CharField(max_length=500, blank=True, null=True)
    element_class = models.CharField(max_length=100, blank=True)
    predefined_type = models.CharField(max_length=50, blank=True, null=True)
    instance_count = models.IntegerField(default=0)

    # Flags
    is_empty = models.BooleanField(default=False)
    is_proxy = models.BooleanField(default=False)
    is_untyped = models.BooleanField(default=False)

    # Quality: property value distributions (per-type aggregates)
    loadbearing_true = models.IntegerField(default=0)
    loadbearing_false = models.IntegerField(default=0)
    loadbearing_unset = models.IntegerField(default=0)
    is_external_true = models.IntegerField(default=0)
    is_external_false = models.IntegerField(default=0)
    is_external_unset = models.IntegerField(default=0)
    fire_rating_set = models.IntegerField(default=0)
    fire_rating_unset = models.IntegerField(default=0)

    # Geometry
    primary_representation = models.CharField(max_length=100, blank=True)
    mapped_item_count = models.IntegerField(default=0)
    mapped_source_count = models.IntegerField(default=0)
    reuse_ratio = models.FloatField(null=True, blank=True)

    # Extensible (materials, custom properties — future)
    properties = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'analysis_types'
        indexes = [
            models.Index(fields=['type_class']),
            models.Index(fields=['element_class']),
            models.Index(fields=['is_untyped']),
            models.Index(fields=['is_proxy']),
        ]

    def __str__(self):
        name = self.type_name or self.element_class
        return f"{self.type_class}:{name} x{self.instance_count}"


class AnalysisTypeStorey(models.Model):
    """
    Type x Storey instance count. Enables spatial cross-filtering.
    Answers: "How many IfcWallType:STD-200 on storey 02?"
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    analysis = models.ForeignKey(
        ModelAnalysis, on_delete=models.CASCADE, related_name='type_storeys'
    )
    type = models.ForeignKey(
        AnalysisType, on_delete=models.CASCADE, related_name='storey_distribution'
    )
    storey = models.ForeignKey(
        AnalysisStorey, on_delete=models.CASCADE, related_name='type_distribution'
    )
    instance_count = models.IntegerField(default=0)

    class Meta:
        db_table = 'analysis_type_storeys'
        unique_together = ['type', 'storey']

    def __str__(self):
        return f"{self.type} @ {self.storey}: {self.instance_count}"
