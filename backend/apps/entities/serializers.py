from rest_framework import serializers
from .models import (
    IFCEntity, SpatialHierarchy, PropertySet,
    System, Material, IFCType, ProcessingReport,
    NS3451Code, TypeMapping, TypeDefinitionLayer, MaterialMapping,
    TypeBankEntry, TypeBankObservation, TypeBankAlias, TypeBankScope
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


class TypeDefinitionLayerSerializer(serializers.ModelSerializer):
    """
    Serializer for type definition layers (material composition/inventory).

    Implements two-level unit system:
    - Parent type has representative_unit (m², m, pcs)
    - Each layer has quantity_per_unit (recipe ratio) and material_unit
    """

    class Meta:
        model = TypeDefinitionLayer
        fields = [
            'id', 'type_mapping', 'layer_order', 'material_name',
            # Material classification (NS3457-8)
            'ns3457_code', 'ns3457_name',
            # Quantity per type unit (recipe ratio)
            'quantity_per_unit', 'material_unit',
            # Visual thickness for sandwich diagram (optional)
            'thickness_mm',
            # EPD/LCA reference
            'epd_id', 'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class TypeMappingSerializer(serializers.ModelSerializer):
    """Serializer for type → NS3451 mappings."""

    ns3451_name = serializers.CharField(source='ns3451.name', read_only=True)
    definition_layers = TypeDefinitionLayerSerializer(many=True, read_only=True)

    class Meta:
        model = TypeMapping
        fields = [
            'id', 'ifc_type', 'ns3451_code', 'ns3451', 'ns3451_name',
            'product', 'representative_unit', 'discipline',
            # Type category (generalization level)
            'type_category',
            'mapping_status', 'confidence', 'notes',
            'mapped_by', 'mapped_at', 'created_at', 'updated_at',
            'definition_layers'
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
        """Get instance count from stored field (populated during parsing)."""
        return obj.instance_count


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


# =============================================================================
# TYPE BANK SERIALIZERS - Global Type Classification System
# =============================================================================

class TypeBankAliasSerializer(serializers.ModelSerializer):
    """Serializer for type aliases (naming variations)."""

    class Meta:
        model = TypeBankAlias
        fields = [
            'id', 'canonical', 'alias_type_name', 'alias_ifc_class',
            'alias_source', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class TypeBankObservationSerializer(serializers.ModelSerializer):
    """Serializer for type observations (where a type was found)."""

    source_model_name = serializers.CharField(source='source_model.name', read_only=True)
    source_model_project = serializers.CharField(source='source_model.project.name', read_only=True)
    source_type_name = serializers.CharField(source='source_type.type_name', read_only=True)

    class Meta:
        model = TypeBankObservation
        fields = [
            'id', 'type_bank_entry', 'source_model', 'source_model_name',
            'source_model_project', 'source_type', 'source_type_name',
            'instance_count', 'pct_is_external', 'pct_load_bearing',
            'pct_fire_rated', 'property_variations', 'observed_at'
        ]
        read_only_fields = ['id', 'observed_at']


class TypeBankEntrySerializer(serializers.ModelSerializer):
    """
    Full serializer for TypeBankEntry with nested relationships.
    Used for detail views and classification workflows.
    """

    ns3451_name = serializers.CharField(source='ns3451.name', read_only=True)
    observations = TypeBankObservationSerializer(many=True, read_only=True)
    aliases = TypeBankAliasSerializer(many=True, read_only=True)
    observation_count = serializers.SerializerMethodField()

    class Meta:
        model = TypeBankEntry
        fields = [
            # Identity tuple
            'id', 'ifc_class', 'type_name', 'predefined_type', 'material',
            # Classification (expert labels)
            'ns3451_code', 'ns3451', 'ns3451_name', 'discipline',
            'canonical_name', 'description', 'representative_unit',
            # Instance context statistics (aggregated)
            'total_instance_count', 'pct_is_external', 'pct_load_bearing', 'pct_fire_rated',
            # Provenance
            'source_model_count', 'mapping_status', 'confidence',
            'created_by', 'notes', 'created_at', 'updated_at',
            # Nested
            'observations', 'aliases', 'observation_count'
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at',
            'total_instance_count', 'pct_is_external', 'pct_load_bearing', 'pct_fire_rated',
            'source_model_count'
        ]

    def get_observation_count(self, obj):
        """Number of models where this type was observed."""
        if hasattr(obj, '_observation_count'):
            return obj._observation_count
        return obj.observations.count()

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


class TypeBankEntryListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for TypeBankEntry list views.
    Excludes nested observations/aliases for performance.
    """

    ns3451_name = serializers.CharField(source='ns3451.name', read_only=True)
    observation_count = serializers.SerializerMethodField()

    class Meta:
        model = TypeBankEntry
        fields = [
            'id', 'ifc_class', 'type_name', 'predefined_type', 'material',
            'ns3451_code', 'ns3451_name', 'discipline', 'canonical_name',
            'representative_unit', 'total_instance_count', 'source_model_count',
            'mapping_status', 'confidence', 'observation_count'
        ]

    def get_observation_count(self, obj):
        if hasattr(obj, '_observation_count'):
            return obj._observation_count
        return obj.observations.count()


class TypeBankEntryUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating TypeBankEntry classification labels.
    Only exposes fields that experts should modify.
    """

    class Meta:
        model = TypeBankEntry
        fields = [
            'ns3451_code', 'discipline', 'canonical_name', 'description',
            'representative_unit', 'mapping_status', 'confidence', 'notes'
        ]

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


# === Type Bank Scope Serializers ===

class TypeBankScopeSerializer(serializers.ModelSerializer):
    """
    Serializer for type scope within a validation context.

    Supports multiple scopes per type (TFM, LCA, QTO, Clash).
    """

    type_name = serializers.CharField(source='type_bank_entry.type_name', read_only=True)
    ifc_class = serializers.CharField(source='type_bank_entry.ifc_class', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True)
    scope_type_display = serializers.CharField(source='get_scope_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    validation_status_display = serializers.CharField(source='get_validation_status_display', read_only=True)

    class Meta:
        model = TypeBankScope
        fields = [
            'id', 'type_bank_entry', 'type_name', 'ifc_class',
            'project', 'project_name',
            'scope_type', 'scope_type_display', 'scope_type_custom',
            'status', 'status_display', 'reason', 'comment',
            'validation_status', 'validation_status_display', 'coverage',
            'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class TypeBankScopeUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating scope status and comment.
    """

    class Meta:
        model = TypeBankScope
        fields = ['status', 'reason', 'comment', 'validation_status', 'coverage']


class TypeBankScopeBulkSerializer(serializers.Serializer):
    """
    Serializer for bulk scope updates.

    Example payload:
    {
        "type_bank_entry_ids": ["uuid1", "uuid2"],
        "scope_type": "tfm",
        "status": "out",
        "reason": "manual",
        "comment": "Not relevant for FDV"
    }
    """
    type_bank_entry_ids = serializers.ListField(
        child=serializers.UUIDField(),
        help_text="List of TypeBankEntry IDs to update"
    )
    scope_type = serializers.ChoiceField(
        choices=TypeBankScope.SCOPE_TYPE_CHOICES,
        help_text="Validation context"
    )
    status = serializers.ChoiceField(
        choices=TypeBankScope.SCOPE_STATUS_CHOICES,
        help_text="New scope status"
    )
    reason = serializers.CharField(
        max_length=100,
        required=False,
        allow_blank=True,
        default='manual'
    )
    comment = serializers.CharField(
        required=False,
        allow_blank=True
    )
