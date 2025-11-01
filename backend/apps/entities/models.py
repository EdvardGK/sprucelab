"""
IFC Entity and related models for BIM Coordinator Platform.
"""
from django.db import models
from django.contrib.postgres.fields import ArrayField
import uuid


class IFCEntity(models.Model):
    """
    Individual IFC building element (wall, door, window, etc.).

    Layer 1 (Core IFC Data): Always populated during parsing
    Layer 2 (Geometry): Populated during geometry extraction (optional)
    """
    GEOMETRY_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('no_representation', 'No Representation'),  # Element has no geometry in IFC
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    model = models.ForeignKey('models.Model', on_delete=models.CASCADE, related_name='entities')

    # === Layer 1: Core IFC Metadata (always populated) ===
    ifc_guid = models.CharField(max_length=22)  # IFC GlobalId
    ifc_type = models.CharField(max_length=100)  # IfcWall, IfcDoor, etc.
    name = models.CharField(max_length=255, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    storey_id = models.UUIDField(null=True, blank=True)  # Reference to parent storey

    # === Layer 2: Geometry Extraction Status ===
    geometry_status = models.CharField(
        max_length=20,
        choices=GEOMETRY_STATUS_CHOICES,
        default='pending',
        help_text="Status of geometry extraction for this element"
    )

    # DEPRECATED: Use Geometry model instead (kept for backward compatibility)
    # TODO: Remove in future version after data migration
    has_geometry = models.BooleanField(default=False)
    vertex_count = models.IntegerField(default=0)
    triangle_count = models.IntegerField(default=0)
    bbox_min_x = models.FloatField(null=True, blank=True)
    bbox_min_y = models.FloatField(null=True, blank=True)
    bbox_min_z = models.FloatField(null=True, blank=True)
    bbox_max_x = models.FloatField(null=True, blank=True)
    bbox_max_y = models.FloatField(null=True, blank=True)
    bbox_max_z = models.FloatField(null=True, blank=True)

    class Meta:
        db_table = 'ifc_entities'
        unique_together = ['model', 'ifc_guid']
        indexes = [
            models.Index(fields=['ifc_type']),
            models.Index(fields=['ifc_guid']),
            models.Index(fields=['storey_id']),
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


class Geometry(models.Model):
    """
    Simplified mesh geometry for elements.

    Layer 2 data: Populated during geometry extraction phase.
    """
    entity = models.OneToOneField(IFCEntity, on_delete=models.CASCADE, primary_key=True, related_name='geometry')

    # === Geometry Metrics (NEW - moved from IFCEntity) ===
    vertex_count = models.IntegerField(default=0, help_text="Number of vertices in original mesh")
    triangle_count = models.IntegerField(default=0, help_text="Number of triangles in original mesh")

    # Bounding box for spatial queries (NEW - moved from IFCEntity)
    bbox_min_x = models.FloatField(null=True, blank=True)
    bbox_min_y = models.FloatField(null=True, blank=True)
    bbox_min_z = models.FloatField(null=True, blank=True)
    bbox_max_x = models.FloatField(null=True, blank=True)
    bbox_max_y = models.FloatField(null=True, blank=True)
    bbox_max_z = models.FloatField(null=True, blank=True)

    # === Geometry Data (existing) ===
    # Geometry data (compressed numpy arrays stored as binary)
    vertices_original = models.BinaryField(null=True, blank=True)
    faces_original = models.BinaryField(null=True, blank=True)
    vertices_simplified = models.BinaryField(null=True, blank=True)
    faces_simplified = models.BinaryField(null=True, blank=True)

    simplification_ratio = models.FloatField(null=True, blank=True)
    geometry_file_path = models.URLField(max_length=500, blank=True, null=True)  # Path to full geometry in storage

    # === Timestamps ===
    extracted_at = models.DateTimeField(auto_now_add=True, help_text="When geometry was extracted")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'geometry'


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
