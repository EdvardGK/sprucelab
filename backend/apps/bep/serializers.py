"""
REST API serializers for BEP (BIM Execution Plan) module.

Serializes BEP configuration and all related components for API endpoints.
"""
from rest_framework import serializers
from .models import (
    BEPConfiguration,
    TechnicalRequirement,
    MMIScaleDefinition,
    NamingConvention,
    RequiredPropertySet,
    ValidationRule,
    SubmissionMilestone,
)


class TechnicalRequirementSerializer(serializers.ModelSerializer):
    """Serialize technical requirements for IFC models."""

    class Meta:
        model = TechnicalRequirement
        fields = [
            'id', 'ifc_schema', 'model_view_definition',
            'coordinate_system_name', 'coordinate_system_description',
            'length_unit', 'area_unit', 'volume_unit',
            'geometry_tolerance', 'max_file_size_mb',
            'requirements_json', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class MMIScaleDefinitionSerializer(serializers.ModelSerializer):
    """Serialize MMI scale definitions (Norwegian MMI-veileder 2.0)."""

    class Meta:
        model = MMIScaleDefinition
        fields = [
            'id', 'mmi_level', 'name', 'name_en', 'description',
            'color_hex', 'color_rgb',
            'geometry_requirements', 'information_requirements',
            'discipline_specific_rules', 'applies_to_disciplines',
            'display_order', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class NamingConventionSerializer(serializers.ModelSerializer):
    """Serialize naming convention rules."""

    class Meta:
        model = NamingConvention
        fields = [
            'id', 'category', 'name', 'description',
            'pattern', 'pattern_type', 'examples',
            'applies_to_disciplines', 'is_required', 'error_message',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class RequiredPropertySetSerializer(serializers.ModelSerializer):
    """Serialize required property set definitions."""

    class Meta:
        model = RequiredPropertySet
        fields = [
            'id', 'ifc_type', 'mmi_level', 'pset_name',
            'required_properties', 'optional_properties',
            'applies_to_disciplines', 'is_required', 'severity',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ValidationRuleSerializer(serializers.ModelSerializer):
    """Serialize validation rules for quality control."""

    class Meta:
        model = ValidationRule
        fields = [
            'id', 'rule_code', 'name', 'description',
            'rule_type', 'severity', 'rule_definition',
            'applies_to_ifc_types', 'applies_to_disciplines', 'min_mmi_level',
            'error_message_template', 'is_active',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class SubmissionMilestoneSerializer(serializers.ModelSerializer):
    """Serialize project delivery milestones."""

    class Meta:
        model = SubmissionMilestone
        fields = [
            'id', 'name', 'description', 'target_mmi',
            'required_disciplines', 'target_date', 'submission_deadline',
            'review_checklist', 'status', 'milestone_order',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class BEPConfigurationSerializer(serializers.ModelSerializer):
    """
    Serialize BEP Configuration with all nested components.

    Includes technical requirements, MMI scale, naming conventions,
    property sets, validation rules, and milestones.
    """
    # Nested serializers for related components
    technical_requirements = TechnicalRequirementSerializer(read_only=True)
    mmi_scale = MMIScaleDefinitionSerializer(many=True, read_only=True)
    naming_conventions = NamingConventionSerializer(many=True, read_only=True)
    required_property_sets = RequiredPropertySetSerializer(many=True, read_only=True)
    validation_rules = ValidationRuleSerializer(many=True, read_only=True)
    milestones = SubmissionMilestoneSerializer(many=True, read_only=True)

    # Project details (read-only)
    project_name = serializers.CharField(source='project.name', read_only=True)

    class Meta:
        model = BEPConfiguration
        fields = [
            'id', 'project', 'project_name', 'version', 'status',
            'name', 'description', 'eir_document_url', 'bep_document_url',
            'framework', 'cde_structure',
            'technical_requirements', 'mmi_scale', 'naming_conventions',
            'required_property_sets', 'validation_rules', 'milestones',
            'created_by', 'created_at', 'updated_at', 'activated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'activated_at', 'project_name']


class BEPConfigurationListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for listing BEPs (without nested data).

    Used for list endpoints to reduce payload size.
    """
    project_name = serializers.CharField(source='project.name', read_only=True)
    mmi_scale_count = serializers.SerializerMethodField()
    validation_rules_count = serializers.SerializerMethodField()
    milestones_count = serializers.SerializerMethodField()

    class Meta:
        model = BEPConfiguration
        fields = [
            'id', 'project', 'project_name', 'version', 'status',
            'name', 'description', 'framework',
            'mmi_scale_count', 'validation_rules_count', 'milestones_count',
            'created_at', 'updated_at', 'activated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'activated_at', 'project_name']

    def get_mmi_scale_count(self, obj):
        """Count of MMI levels defined."""
        return obj.mmi_scale.count()

    def get_validation_rules_count(self, obj):
        """Count of validation rules."""
        return obj.validation_rules.count()

    def get_milestones_count(self, obj):
        """Count of milestones."""
        return obj.milestones.count()


class BEPTemplateSerializer(serializers.Serializer):
    """
    Serializer for BEP template metadata (non-database).

    Used to list available templates before creation.
    """
    id = serializers.CharField(help_text="Template identifier (e.g., 'mmi-full', 'mmi-simple')")
    name = serializers.CharField(help_text="Template display name")
    description = serializers.CharField(help_text="Template description")
    framework = serializers.CharField(help_text="Framework (e.g., 'pofin', 'iso19650')")
    mmi_scale_count = serializers.IntegerField(help_text="Number of MMI levels")
    features = serializers.ListField(
        child=serializers.CharField(),
        help_text="List of features (e.g., ['Full 19-level scale', 'Official colors'])"
    )
    recommended_for = serializers.CharField(help_text="Recommended use case")
