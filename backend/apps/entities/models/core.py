"""
Core IFC entity models: elements, spatial hierarchy, properties, systems, materials, types.
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
        help_text="Net volume in cubic meters (m3) - from Qto_*BaseQuantities"
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
        app_label = 'entities'
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
    entity = models.ForeignKey('IFCEntity', on_delete=models.CASCADE, related_name='spatial_parents')
    parent = models.ForeignKey('IFCEntity', on_delete=models.CASCADE, null=True, blank=True, related_name='spatial_children')
    hierarchy_level = models.CharField(max_length=20, choices=HIERARCHY_LEVELS)
    path = ArrayField(models.CharField(max_length=22), default=list)  # Array of GUIDs from project to this element

    class Meta:
        app_label = 'entities'
        db_table = 'spatial_hierarchy'
        indexes = [
            models.Index(fields=['hierarchy_level']),
        ]


class PropertySet(models.Model):
    """
    IFC property sets (Psets) and individual properties.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey('IFCEntity', on_delete=models.CASCADE, related_name='property_sets')
    pset_name = models.CharField(max_length=255)
    property_name = models.CharField(max_length=255)
    property_value = models.TextField(blank=True, null=True)
    property_type = models.CharField(max_length=50, blank=True, null=True)  # STRING, INTEGER, BOOLEAN, etc.

    class Meta:
        app_label = 'entities'
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
        app_label = 'entities'
        db_table = 'systems'
        unique_together = ['model', 'system_guid']

    def __str__(self):
        return self.system_name or self.system_guid


class SystemMembership(models.Model):
    """
    Relationship between systems and elements.
    """
    system = models.ForeignKey('System', on_delete=models.CASCADE, related_name='memberships')
    entity = models.ForeignKey('IFCEntity', on_delete=models.CASCADE, related_name='system_memberships')

    class Meta:
        app_label = 'entities'
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
        app_label = 'entities'
        db_table = 'materials'
        unique_together = ['model', 'material_guid']

    def __str__(self):
        return self.name


class MaterialAssignment(models.Model):
    """
    Relationship between materials and elements.
    """
    entity = models.ForeignKey('IFCEntity', on_delete=models.CASCADE, related_name='material_assignments')
    material = models.ForeignKey('Material', on_delete=models.CASCADE, related_name='assignments')
    layer_thickness = models.FloatField(null=True, blank=True)
    layer_order = models.IntegerField(default=1)

    class Meta:
        app_label = 'entities'
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
        app_label = 'entities'
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
    entity = models.ForeignKey('IFCEntity', on_delete=models.CASCADE, related_name='type_assignments')
    type = models.ForeignKey('IFCType', on_delete=models.CASCADE, related_name='assignments')

    class Meta:
        app_label = 'entities'
        db_table = 'type_assignments'
        unique_together = ['entity', 'type']
