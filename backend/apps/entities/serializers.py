from rest_framework import serializers
from .models import (
    IFCEntity, SpatialHierarchy, PropertySet,
    System, Material, IFCType, ProcessingReport,
    NS3451Code, TypeMapping, MaterialMapping
)


class IFCEntitySerializer(serializers.ModelSerializer):
    """Serializer for IFC entities with metadata and quantities."""

    class Meta:
        model = IFCEntity
        fields = [
            'id', 'model', 'express_id', 'ifc_guid', 'ifc_type',
            'predefined_type', 'object_type', 'name', 'description',
            'storey_id', 'area', 'volume', 'length', 'height', 'perimeter'
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


# =============================================================================
# WAREHOUSE SERIALIZERS - NS3451, Type Mapping, Material Mapping
# =============================================================================

class NS3451CodeSerializer(serializers.ModelSerializer):
    """Serializer for NS-3451 classification codes (reference data)."""

    class Meta:
        model = NS3451Code
        fields = ['code', 'name', 'name_en', 'guidance', 'level', 'parent_code']


class TypeMappingSerializer(serializers.ModelSerializer):
    """Serializer for type → NS3451 mappings."""

    ns3451_name = serializers.CharField(source='ns3451.name', read_only=True)

    class Meta:
        model = TypeMapping
        fields = [
            'id', 'ifc_type', 'ns3451_code', 'ns3451', 'ns3451_name',
            'product', 'representative_unit', 'discipline',
            'mapping_status', 'confidence', 'notes',
            'mapped_by', 'mapped_at', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def create(self, validated_data):
        # Auto-link ns3451 FK when ns3451_code is provided
        ns3451_code = validated_data.get('ns3451_code')
        if ns3451_code and not validated_data.get('ns3451'):
            try:
                validated_data['ns3451'] = NS3451Code.objects.get(code=ns3451_code)
            except NS3451Code.DoesNotExist:
                pass
        return super().create(validated_data)

    def update(self, instance, validated_data):
        # Auto-link ns3451 FK when ns3451_code is provided
        ns3451_code = validated_data.get('ns3451_code')
        if ns3451_code:
            try:
                validated_data['ns3451'] = NS3451Code.objects.get(code=ns3451_code)
            except NS3451Code.DoesNotExist:
                validated_data['ns3451'] = None
        elif 'ns3451_code' in validated_data and ns3451_code is None:
            validated_data['ns3451'] = None
        return super().update(instance, validated_data)


class IFCTypeWithMappingSerializer(serializers.ModelSerializer):
    """Serializer for IFC types with their mapping status."""

    mapping = TypeMappingSerializer(read_only=True)
    instance_count = serializers.SerializerMethodField()

    class Meta:
        model = IFCType
        fields = [
            'id', 'model', 'type_guid', 'type_name', 'ifc_type',
            'properties', 'mapping', 'instance_count'
        ]

    def get_instance_count(self, obj):
        """Count how many entities use this type."""
        return obj.assignments.count()


class MaterialMappingSerializer(serializers.ModelSerializer):
    """Serializer for material mappings."""

    class Meta:
        model = MaterialMapping
        fields = [
            'id', 'material', 'standard_name', 'density_kg_m3',
            'epd_reference', 'thermal_conductivity', 'mapping_status',
            'notes', 'mapped_by', 'mapped_at', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class MaterialWithMappingSerializer(serializers.ModelSerializer):
    """Serializer for materials with their mapping status."""

    mapping = MaterialMappingSerializer(read_only=True)
    usage_count = serializers.SerializerMethodField()

    class Meta:
        model = Material
        fields = [
            'id', 'model', 'material_guid', 'name', 'category',
            'properties', 'mapping', 'usage_count'
        ]

    def get_usage_count(self, obj):
        """Count how many entities use this material."""
        return obj.assignments.count()
