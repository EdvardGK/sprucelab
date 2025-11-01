from rest_framework import serializers
from .models import (
    IFCEntity, SpatialHierarchy, PropertySet,
    System, Material, IFCType, Geometry, ProcessingReport
)


class IFCEntitySerializer(serializers.ModelSerializer):
    """Serializer for IFC entities (without geometry data)."""

    class Meta:
        model = IFCEntity
        fields = [
            'id', 'model', 'ifc_guid', 'ifc_type', 'name', 'description',
            'storey_id', 'has_geometry', 'vertex_count', 'triangle_count',
            'bbox_min_x', 'bbox_min_y', 'bbox_min_z',
            'bbox_max_x', 'bbox_max_y', 'bbox_max_z'
        ]
        read_only_fields = ['id']


class PropertySetSerializer(serializers.ModelSerializer):
    """Serializer for property sets."""

    class Meta:
        model = PropertySet
        fields = ['id', 'entity', 'pset_name', 'property_name', 'property_value', 'property_type']


class SystemSerializer(serializers.ModelSerializer):
    """Serializer for systems."""

    member_count = serializers.SerializerMethodField()

    class Meta:
        model = System
        fields = ['id', 'model', 'system_guid', 'system_name', 'system_type', 'description', 'member_count']

    def get_member_count(self, obj):
        return obj.memberships.count()


class MaterialSerializer(serializers.ModelSerializer):
    """Serializer for materials."""

    class Meta:
        model = Material
        fields = ['id', 'model', 'material_guid', 'name', 'category', 'properties']


class IFCTypeSerializer(serializers.ModelSerializer):
    """Serializer for type objects."""

    class Meta:
        model = IFCType
        fields = ['id', 'model', 'type_guid', 'type_name', 'ifc_type', 'properties']


class SpatialHierarchySerializer(serializers.ModelSerializer):
    """Serializer for spatial hierarchy."""

    entity_name = serializers.CharField(source='entity.name', read_only=True)
    entity_type = serializers.CharField(source='entity.ifc_type', read_only=True)

    class Meta:
        model = SpatialHierarchy
        fields = ['id', 'model', 'entity', 'entity_name', 'entity_type', 'parent', 'hierarchy_level', 'path']


class ProcessingReportSerializer(serializers.ModelSerializer):
    """Serializer for IFC processing reports."""

    model_name = serializers.CharField(source='model.name', read_only=True)
    model_id = serializers.CharField(source='model.id', read_only=True)
    project_id = serializers.CharField(source='model.project.id', read_only=True)
    project_name = serializers.CharField(source='model.project.name', read_only=True)

    class Meta:
        model = ProcessingReport
        fields = [
            'id', 'model', 'model_name', 'model_id', 'project_id', 'project_name',
            'started_at', 'completed_at', 'duration_seconds',
            'overall_status', 'ifc_schema', 'file_size_bytes',
            'stage_results', 'total_entities_processed', 'total_entities_skipped', 'total_entities_failed',
            'errors', 'catastrophic_failure', 'failure_stage', 'failure_exception', 'failure_traceback',
            'summary'
        ]
        read_only_fields = ['id', 'started_at']
