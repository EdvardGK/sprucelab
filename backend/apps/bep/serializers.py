"""
REST API serializers for BEP (BIM Execution Plan) module.

Serializes BEP configuration and all related components for API endpoints.
"""
from rest_framework import serializers
from .models import (
    BEPTemplate,
    BEPConfiguration,
    TechnicalRequirement,
    MMIScaleDefinition,
    NamingConvention,
    RequiredPropertySet,
    ValidationRule,
    SubmissionMilestone,
    ProjectDiscipline,
    ProjectCoordinates,
    ProjectStorey,
    EIR,
    EIRRequirement,
    IDSSpecification,
    BEPResponse,
    BEPResponseItem,
    IDSValidationRun,
)


class BEPTemplateModelSerializer(serializers.ModelSerializer):
    """Serialize BEP templates (database model)."""

    class Meta:
        model = BEPTemplate
        fields = [
            'id', 'name', 'framework', 'description', 'is_system',
            'default_disciplines', 'default_coordinate_system',
            'default_naming_conventions', 'default_responsibility_matrix',
            'default_mmi_requirements', 'default_storeys',
            'created_at', 'updated_at', 'created_by'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'is_system']


class BEPTemplateListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing BEP templates."""

    class Meta:
        model = BEPTemplate
        fields = [
            'id', 'name', 'framework', 'description', 'is_system',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'is_system']


class ProjectDisciplineSerializer(serializers.ModelSerializer):
    """Serialize project discipline assignments."""

    class Meta:
        model = ProjectDiscipline
        fields = [
            'id', 'project', 'discipline_code', 'discipline_name',
            'company_name', 'contact_name', 'contact_email',
            'software', 'source_code_mapping', 'is_active',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ProjectCoordinatesSerializer(serializers.ModelSerializer):
    """Serialize project coordinate system configuration."""

    class Meta:
        model = ProjectCoordinates
        fields = [
            'id', 'project',
            'horizontal_crs_epsg', 'horizontal_crs_name', 'vertical_crs',
            'local_origin_x', 'local_origin_y', 'local_origin_z',
            'eastings', 'northings', 'orthometric_height',
            'true_north_rotation',
            'position_tolerance_m', 'rotation_tolerance_deg',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ProjectStoreySerializer(serializers.ModelSerializer):
    """Serialize project storey definitions."""

    class Meta:
        model = ProjectStorey
        fields = [
            'id', 'project', 'storey_name', 'storey_code',
            'elevation_m', 'tolerance_m', 'order',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class TechnicalRequirementSerializer(serializers.ModelSerializer):
    """Serialize technical requirements for IFC models."""

    class Meta:
        model = TechnicalRequirement
        fields = [
            'id', 'bep', 'ifc_schema', 'model_view_definition',
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
            'id', 'bep', 'mmi_level', 'name', 'name_en', 'description',
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
    # Template (optional)
    template_detail = BEPTemplateListSerializer(source='template', read_only=True)

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
            'id', 'project', 'project_name', 'template', 'template_detail',
            'version', 'status', 'name', 'description',
            'eir_document_url', 'bep_document_url',
            'framework', 'classification_system', 'cde_structure',
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
    template_name = serializers.CharField(source='template.name', read_only=True, default=None)
    mmi_scale_count = serializers.SerializerMethodField()
    validation_rules_count = serializers.SerializerMethodField()
    milestones_count = serializers.SerializerMethodField()

    class Meta:
        model = BEPConfiguration
        fields = [
            'id', 'project', 'project_name', 'template', 'template_name',
            'version', 'status', 'name', 'description', 'framework', 'classification_system',
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


# --- EIR / IDS / BEP Response serializers ---


class IDSSpecificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = IDSSpecification
        fields = [
            'id', 'eir', 'title', 'description', 'author', 'version',
            'ids_xml', 'structured_specs', 'source', 'original_filename',
            'ifc_versions', 'specification_count', 'is_library',
            'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class IDSSpecificationListSerializer(serializers.ModelSerializer):
    class Meta:
        model = IDSSpecification
        fields = [
            'id', 'eir', 'title', 'description', 'source',
            'ifc_versions', 'specification_count', 'is_library',
            'created_at',
        ]


class EIRRequirementSerializer(serializers.ModelSerializer):
    ids_specification_detail = IDSSpecificationListSerializer(
        source='ids_specification', read_only=True
    )

    class Meta:
        model = EIRRequirement
        fields = [
            'id', 'eir', 'code', 'title', 'description', 'instructions',
            'category', 'severity',
            'applies_to_disciplines', 'applies_to_ifc_types', 'applies_from_mmi_level',
            'ids_specification', 'ids_specification_detail',
            'order', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class EIRSerializer(serializers.ModelSerializer):
    requirements = EIRRequirementSerializer(many=True, read_only=True)
    ids_specifications = IDSSpecificationListSerializer(many=True, read_only=True)
    requirement_count = serializers.SerializerMethodField()
    ids_count = serializers.SerializerMethodField()
    project_name = serializers.CharField(source='project.name', read_only=True)

    class Meta:
        model = EIR
        fields = [
            'id', 'project', 'project_name',
            'title', 'description', 'version', 'status',
            'issuer_name', 'issuer_organization', 'issued_at',
            'framework', 'ifc_version', 'classification_system',
            'requirements', 'ids_specifications',
            'requirement_count', 'ids_count',
            'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'project_name']

    def get_requirement_count(self, obj):
        return obj.requirements.count()

    def get_ids_count(self, obj):
        return obj.ids_specifications.count()


class EIRListSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)
    requirement_count = serializers.SerializerMethodField()
    ids_count = serializers.SerializerMethodField()

    class Meta:
        model = EIR
        fields = [
            'id', 'project', 'project_name',
            'title', 'version', 'status', 'framework',
            'requirement_count', 'ids_count',
            'issued_at', 'created_at',
        ]

    def get_requirement_count(self, obj):
        return obj.requirements.count()

    def get_ids_count(self, obj):
        return obj.ids_specifications.count()


class BEPResponseItemSerializer(serializers.ModelSerializer):
    requirement_code = serializers.CharField(source='requirement.code', read_only=True)
    requirement_title = serializers.CharField(source='requirement.title', read_only=True)
    requirement_category = serializers.CharField(source='requirement.category', read_only=True)
    requirement_severity = serializers.CharField(source='requirement.severity', read_only=True)

    class Meta:
        model = BEPResponseItem
        fields = [
            'id', 'response', 'requirement',
            'requirement_code', 'requirement_title',
            'requirement_category', 'requirement_severity',
            'compliance_status', 'method_description',
            'issues', 'wishes',
            'responsible_discipline', 'tool_notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class BEPResponseSerializer(serializers.ModelSerializer):
    items = BEPResponseItemSerializer(many=True, read_only=True)
    item_count = serializers.SerializerMethodField()
    compliance_summary = serializers.SerializerMethodField()

    class Meta:
        model = BEPResponse
        fields = [
            'id', 'eir', 'bep_configuration',
            'version', 'status',
            'respondent_name', 'respondent_organization', 'submitted_at',
            'general_notes',
            'items', 'item_count', 'compliance_summary',
            'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_item_count(self, obj):
        return obj.items.count()

    def get_compliance_summary(self, obj):
        items = obj.items.all()
        total = items.count()
        if total == 0:
            return {'total': 0}
        return {
            'total': total,
            'will_comply': items.filter(compliance_status='will_comply').count(),
            'partially': items.filter(compliance_status='partially').count(),
            'cannot_comply': items.filter(compliance_status='cannot_comply').count(),
            'not_applicable': items.filter(compliance_status='not_applicable').count(),
            'pending': items.filter(compliance_status='pending').count(),
        }


class BEPResponseListSerializer(serializers.ModelSerializer):
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = BEPResponse
        fields = [
            'id', 'eir', 'bep_configuration',
            'version', 'status',
            'respondent_name', 'respondent_organization', 'submitted_at',
            'item_count', 'created_at',
        ]

    def get_item_count(self, obj):
        return obj.items.count()


class IDSValidationRunSerializer(serializers.ModelSerializer):
    model_name = serializers.CharField(source='model.name', read_only=True)
    ids_title = serializers.CharField(source='ids_specification.title', read_only=True)

    class Meta:
        model = IDSValidationRun
        fields = [
            'id', 'model', 'model_name',
            'ids_specification', 'ids_title', 'eir',
            'status', 'overall_pass',
            'total_specifications', 'specifications_passed', 'specifications_failed',
            'total_checks', 'checks_passed', 'checks_failed',
            'results_json',
            'started_at', 'completed_at', 'duration_seconds',
            'error_message', 'triggered_by', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class IDSValidationRunListSerializer(serializers.ModelSerializer):
    model_name = serializers.CharField(source='model.name', read_only=True)
    ids_title = serializers.CharField(source='ids_specification.title', read_only=True)

    class Meta:
        model = IDSValidationRun
        fields = [
            'id', 'model', 'model_name',
            'ids_specification', 'ids_title', 'eir',
            'status', 'overall_pass',
            'total_specifications', 'specifications_passed', 'specifications_failed',
            'started_at', 'completed_at', 'created_at',
        ]
