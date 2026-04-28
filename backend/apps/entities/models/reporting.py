"""
Reporting and analysis models: validation, graph edges, room assignments,
model analysis.

Layer-1 extraction runs live in apps.models.models.ExtractionRun (which
replaced the legacy ProcessingReport in Phase 2).
"""
from django.db import models
import uuid


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
        app_label = 'entities'
        db_table = 'ifc_validation_reports'
        ordering = ['-validated_at']
        indexes = [
            models.Index(fields=['overall_status']),
            models.Index(fields=['validated_at']),
        ]

    def __str__(self):
        return f"Validation {self.overall_status.upper()} - {self.model.name}"


class GraphEdge(models.Model):
    """
    Graph relationships for visualization.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    model = models.ForeignKey('models.Model', on_delete=models.CASCADE, related_name='graph_edges')
    source_entity = models.ForeignKey('IFCEntity', on_delete=models.CASCADE, related_name='outgoing_edges')
    target_entity = models.ForeignKey('IFCEntity', on_delete=models.CASCADE, related_name='incoming_edges')
    relationship_type = models.CharField(max_length=100)  # IfcRelContainedInSpatialStructure, etc.
    properties = models.JSONField(default=dict, blank=True)

    class Meta:
        app_label = 'entities'
        db_table = 'graph_edges'
        indexes = [
            models.Index(fields=['source_entity']),
            models.Index(fields=['target_entity']),
            models.Index(fields=['relationship_type']),
        ]


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
        'IFCEntity',
        on_delete=models.CASCADE,
        related_name='room_assignments',
        help_text="The discrete entity being assigned to a room"
    )

    # The room (IfcSpace) that contains this entity
    room = models.ForeignKey(
        'IFCEntity',
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
        app_label = 'entities'
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
        return f"{entity_name} -> {room_name}"


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
    spatial_data = models.JSONField(default=dict, blank=True)
    project_name = models.CharField(max_length=255, blank=True)
    site_name = models.CharField(max_length=255, blank=True)
    building_name = models.CharField(max_length=255, blank=True)

    class Meta:
        app_label = 'entities'
        db_table = 'model_analysis'

    def __str__(self):
        return f"Analysis: {self.model} ({self.ifc_schema})"


class AnalysisStorey(models.Model):
    """Storey with elevation and aggregate element count."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    analysis = models.ForeignKey(
        'ModelAnalysis', on_delete=models.CASCADE, related_name='storeys'
    )
    name = models.CharField(max_length=255)
    elevation = models.FloatField(null=True, blank=True)
    height = models.FloatField(null=True, blank=True)
    element_count = models.IntegerField(default=0)

    class Meta:
        app_label = 'entities'
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
        'ModelAnalysis', on_delete=models.CASCADE, related_name='types'
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

    # Extensible (materials, custom properties -- future)
    properties = models.JSONField(default=dict, blank=True)

    class Meta:
        app_label = 'entities'
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
        'ModelAnalysis', on_delete=models.CASCADE, related_name='type_storeys'
    )
    type = models.ForeignKey(
        'AnalysisType', on_delete=models.CASCADE, related_name='storey_distribution'
    )
    storey = models.ForeignKey(
        'AnalysisStorey', on_delete=models.CASCADE, related_name='type_distribution'
    )
    instance_count = models.IntegerField(default=0)

    class Meta:
        app_label = 'entities'
        db_table = 'analysis_type_storeys'
        unique_together = ['type', 'storey']

    def __str__(self):
        return f"{self.type} @ {self.storey}: {self.instance_count}"
