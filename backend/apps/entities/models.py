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
    IFC materials.

    Note: IfcMaterial does NOT have GlobalId (doesn't inherit from IfcRoot).
    We store the IFC step ID in material_guid for unique identification within a file.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    model = models.ForeignKey('models.Model', on_delete=models.CASCADE, related_name='materials')
    material_guid = models.CharField(max_length=50)  # IFC step ID (e.g., "123")
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=100, blank=True, null=True)
    properties = models.JSONField(default=dict, blank=True)

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
    IFC type objects (WallType, DoorType, etc.).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    model = models.ForeignKey('models.Model', on_delete=models.CASCADE, related_name='types')
    type_guid = models.CharField(max_length=22)
    type_name = models.CharField(max_length=255, blank=True, null=True)
    ifc_type = models.CharField(max_length=100)  # IfcWallType, etc.
    properties = models.JSONField(default=dict, blank=True)

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

class ProductLibrary(models.Model):
    """
    Cross-project product database for mapping IFC types to real products.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=100, blank=True, null=True)
    manufacturer = models.CharField(max_length=255, blank=True, null=True)
    product_code = models.CharField(max_length=100, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    epd_data = models.JSONField(default=dict, blank=True, help_text="EPD/LCA data")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'product_library'
        ordering = ['category', 'name']

    def __str__(self):
        return f"{self.name} ({self.manufacturer or 'Unknown'})"


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
    Material layer for type definitions in the library/warehouse.

    Unlike TypeLayer (which is tied to parsed IFC types), this model
    is for user-defined type compositions in the warehouse library.

    Enables defining "Wall Type A has 3 layers: plasterboard, insulation, brick"
    with thickness and optional EPD references.
    """
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
        help_text="Material name (e.g., 'Gypsum board', 'Mineral wool')"
    )
    thickness_mm = models.FloatField(
        help_text="Layer thickness in millimeters"
    )
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


class TypeLayer(models.Model):
    """
    Layer composition for composite types (walls, floors, roofs).
    Enables 'sandwich' view of composite elements.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ifc_type = models.ForeignKey(IFCType, on_delete=models.CASCADE, related_name='layers')

    layer_order = models.IntegerField(help_text="Layer position (1 = exterior/bottom)")
    material = models.ForeignKey(
        Material,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='type_layers'
    )
    material_name = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Material name (if material not in DB)"
    )
    thickness_mm = models.FloatField(help_text="Layer thickness in millimeters")

    # Optional properties
    is_structural = models.BooleanField(default=False)
    is_ventilated = models.BooleanField(default=False)
    notes = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'type_layers'
        ordering = ['ifc_type', 'layer_order']
        unique_together = ['ifc_type', 'layer_order']

    def __str__(self):
        mat_name = self.material.name if self.material else self.material_name or 'Unknown'
        return f"Layer {self.layer_order}: {mat_name} ({self.thickness_mm}mm)"


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


class ChangeLog(models.Model):
    """
    Change tracking between model versions.
    """
    CHANGE_TYPES = [
        ('added', 'Added'),
        ('removed', 'Removed'),
        ('modified', 'Modified'),
        ('geometry_changed', 'Geometry Changed'),
        ('property_changed', 'Property Changed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    model = models.ForeignKey('models.Model', on_delete=models.CASCADE, related_name='changes')
    previous_model = models.ForeignKey('models.Model', on_delete=models.CASCADE, related_name='next_changes', null=True)
    ifc_guid = models.CharField(max_length=22)
    change_type = models.CharField(max_length=20, choices=CHANGE_TYPES)
    change_details = models.JSONField(default=dict, blank=True)
    detected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'change_log'
        indexes = [
            models.Index(fields=['change_type']),
            models.Index(fields=['ifc_guid']),
        ]


class StorageMetrics(models.Model):
    """
    File size breakdown for analysis.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    model = models.ForeignKey('models.Model', on_delete=models.CASCADE, related_name='storage_metrics')
    measured_at = models.DateTimeField(auto_now_add=True)

    # Size breakdown in bytes
    spatial_structure_bytes = models.BigIntegerField(default=0)
    elements_metadata_bytes = models.BigIntegerField(default=0)
    properties_bytes = models.BigIntegerField(default=0)
    systems_bytes = models.BigIntegerField(default=0)
    materials_bytes = models.BigIntegerField(default=0)
    relationships_bytes = models.BigIntegerField(default=0)
    geometry_original_bytes = models.BigIntegerField(default=0)
    geometry_simplified_bytes = models.BigIntegerField(default=0)
    total_bytes = models.BigIntegerField(default=0)

    class Meta:
        db_table = 'storage_metrics'


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

    class Meta:
        db_table = 'processing_reports'
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['overall_status']),
            models.Index(fields=['started_at']),
        ]

    def __str__(self):
        return f"Processing {self.overall_status.upper()} - {self.model.name} ({self.started_at})"
