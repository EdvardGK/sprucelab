from rest_framework import serializers
from .models import Project, ProjectConfig
from .services.bep_defaults import BEPDefaults, get_bep_template


class ProjectSerializer(serializers.ModelSerializer):
    model_count = serializers.SerializerMethodField()
    element_count = serializers.SerializerMethodField()
    latest_version = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = ['id', 'name', 'description', 'created_at', 'updated_at',
                  'model_count', 'element_count', 'latest_version']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_model_count(self, obj):
        return obj.get_model_count()

    def get_element_count(self, obj):
        return obj.get_element_count()

    def get_latest_version(self, obj):
        latest = obj.get_latest_model()
        if latest:
            return {
                'id': str(latest.id),
                'version_number': latest.version_number,
                'name': latest.name,
                'status': latest.status
            }
        return None


class ProjectConfigSerializer(serializers.ModelSerializer):
    """
    Full serializer for ProjectConfig with config JSON.
    """

    project_name = serializers.CharField(source='project.name', read_only=True)

    class Meta:
        model = ProjectConfig
        fields = [
            'id', 'project', 'project_name', 'version', 'is_active', 'name',
            'config', 'created_by', 'created_at', 'updated_at', 'notes'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ProjectConfigListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for config list views (excludes full config JSON).
    """

    project_name = serializers.CharField(source='project.name', read_only=True)
    has_eir = serializers.SerializerMethodField()
    has_bep = serializers.SerializerMethodField()
    has_tfm = serializers.SerializerMethodField()
    target_mmi = serializers.SerializerMethodField()
    scope_count = serializers.SerializerMethodField()

    class Meta:
        model = ProjectConfig
        fields = [
            'id', 'project', 'project_name', 'version', 'is_active', 'name',
            'has_eir', 'has_bep', 'has_tfm', 'target_mmi', 'scope_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_has_eir(self, obj):
        """Check if EIR requirements are defined."""
        return bool(obj.config.get('eir', {}).get('requirements'))

    def get_has_bep(self, obj):
        """Check if BEP configuration is defined."""
        bep = obj.config.get('bep', {})
        return bool(bep.get('mmi_scale') or bep.get('validation_rules'))

    def get_has_tfm(self, obj):
        """Check if TFM validation is enabled."""
        return obj.config.get('tfm', {}).get('enabled', False)

    def get_target_mmi(self, obj):
        """Get target MMI level."""
        return obj.config.get('bep', {}).get('target_mmi')

    def get_scope_count(self, obj):
        """Count defined type scopes across all contexts."""
        type_scope = obj.config.get('type_scope', {})
        count = 0
        for context in type_scope.values():
            count += len(context.get('in', []))
            count += len(context.get('out', []))
        return count


class ProjectConfigUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating project config.
    """

    class Meta:
        model = ProjectConfig
        fields = ['name', 'config', 'is_active', 'notes']


class ProjectConfigImportSerializer(serializers.Serializer):
    """
    Serializer for importing config from JSON/YAML.
    """
    config = serializers.JSONField(help_text="Configuration JSON")
    name = serializers.CharField(
        max_length=100,
        required=False,
        help_text="Optional name for this config version"
    )
    activate = serializers.BooleanField(
        default=True,
        help_text="Set this config as active"
    )

    def validate_config(self, value):
        """Validate the imported config structure."""
        errors = validate_config_structure(value)
        if errors:
            raise serializers.ValidationError(errors)
        return value


class ProjectConfigCreateFromTemplateSerializer(serializers.Serializer):
    """
    Serializer for creating a config from BEP template.
    """
    project_code = serializers.CharField(
        max_length=20,
        help_text="Short project code for naming conventions (e.g., 'ST28', 'KNM')"
    )
    name = serializers.CharField(
        max_length=100,
        required=False,
        help_text="Optional name for this config version"
    )
    activate = serializers.BooleanField(
        default=True,
        help_text="Set this config as active"
    )
    customize = serializers.JSONField(
        required=False,
        default=dict,
        help_text="Optional customizations to merge into template"
    )

    def create_config(self, project):
        """Generate config from template with customizations."""
        project_code = self.validated_data['project_code']
        customize = self.validated_data.get('customize', {})

        # Start with template
        config = get_bep_template(project_code)

        # Apply customizations (shallow merge at top level)
        for key, value in customize.items():
            if isinstance(value, dict) and key in config and isinstance(config[key], dict):
                config[key].update(value)
            else:
                config[key] = value

        return config


class ProjectConfigDetailSerializer(serializers.ModelSerializer):
    """
    Detailed serializer with computed EIR/BEP status fields.
    """
    project_name = serializers.CharField(source='project.name', read_only=True)
    has_eir = serializers.SerializerMethodField()
    has_bep = serializers.SerializerMethodField()
    has_tfm = serializers.SerializerMethodField()
    target_mmi = serializers.SerializerMethodField()
    mmi_levels_defined = serializers.SerializerMethodField()
    validation_rule_count = serializers.SerializerMethodField()
    scope_count = serializers.SerializerMethodField()
    classification_systems = serializers.SerializerMethodField()

    class Meta:
        model = ProjectConfig
        fields = [
            'id', 'project', 'project_name', 'version', 'is_active', 'name',
            'config', 'created_by', 'created_at', 'updated_at', 'notes',
            # Computed fields
            'has_eir', 'has_bep', 'has_tfm', 'target_mmi',
            'mmi_levels_defined', 'validation_rule_count',
            'scope_count', 'classification_systems'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_has_eir(self, obj):
        """Check if EIR requirements are defined."""
        eir = obj.config.get('eir', {})
        return bool(eir.get('requirements'))

    def get_has_bep(self, obj):
        """Check if BEP configuration is defined."""
        bep = obj.config.get('bep', {})
        return bool(bep.get('mmi_scale') or bep.get('validation_rules'))

    def get_has_tfm(self, obj):
        """Check if TFM validation is enabled."""
        return obj.config.get('tfm', {}).get('enabled', False)

    def get_target_mmi(self, obj):
        """Get target MMI level."""
        return obj.get_target_mmi()

    def get_mmi_levels_defined(self, obj):
        """Get list of defined MMI levels."""
        mmi_scale = obj.config.get('bep', {}).get('mmi_scale', {})
        return sorted([int(k) for k in mmi_scale.keys() if k.isdigit()])

    def get_validation_rule_count(self, obj):
        """Count defined validation rules."""
        rules = obj.config.get('bep', {}).get('validation_rules', [])
        return len(rules)

    def get_scope_count(self, obj):
        """Count defined type scopes across all contexts."""
        type_scope = obj.config.get('type_scope', {})
        count = 0
        for context in type_scope.values():
            count += len(context.get('in', []))
            count += len(context.get('out', []))
        return count

    def get_classification_systems(self, obj):
        """Get enabled classification systems."""
        classification = obj.config.get('bep', {}).get('classification_system', {})
        enabled = []
        for system, settings in classification.items():
            if isinstance(settings, dict) and settings.get('enabled'):
                enabled.append(system.upper())
        return enabled


# =============================================================================
# Config Validation
# =============================================================================

def validate_config_structure(config: dict) -> list:
    """
    Validate ProjectConfig JSON structure.

    Returns list of validation error messages (empty if valid).
    """
    errors = []

    if not isinstance(config, dict):
        return ["Config must be a JSON object"]

    # Validate BEP section if present
    if 'bep' in config:
        bep = config['bep']
        if not isinstance(bep, dict):
            errors.append("bep must be an object")
        else:
            # Validate mmi_scale
            if 'mmi_scale' in bep:
                mmi = bep['mmi_scale']
                if not isinstance(mmi, dict):
                    errors.append("bep.mmi_scale must be an object")
                else:
                    for level, definition in mmi.items():
                        if not level.isdigit():
                            errors.append(f"MMI level '{level}' must be numeric")
                        if not isinstance(definition, dict):
                            errors.append(f"MMI level {level} definition must be an object")
                        elif 'required_properties' in definition:
                            if not isinstance(definition['required_properties'], list):
                                errors.append(f"MMI {level} required_properties must be a list")

            # Validate validation_rules
            if 'validation_rules' in bep:
                rules = bep['validation_rules']
                if not isinstance(rules, list):
                    errors.append("bep.validation_rules must be a list")
                else:
                    for i, rule in enumerate(rules):
                        if not isinstance(rule, dict):
                            errors.append(f"Validation rule {i} must be an object")
                        elif 'id' not in rule:
                            errors.append(f"Validation rule {i} missing 'id'")

    # Validate EIR section if present
    if 'eir' in config:
        eir = config['eir']
        if not isinstance(eir, dict):
            errors.append("eir must be an object")
        else:
            # Validate requirements
            if 'requirements' in eir and not isinstance(eir['requirements'], list):
                errors.append("eir.requirements must be a list")

            # Validate milestones
            if 'milestones' in eir and not isinstance(eir['milestones'], list):
                errors.append("eir.milestones must be a list")

    # Validate type_scope section if present
    if 'type_scope' in config:
        type_scope = config['type_scope']
        if not isinstance(type_scope, dict):
            errors.append("type_scope must be an object")
        else:
            for context, scopes in type_scope.items():
                if not isinstance(scopes, dict):
                    errors.append(f"type_scope.{context} must be an object")
                else:
                    if 'in' in scopes and not isinstance(scopes['in'], list):
                        errors.append(f"type_scope.{context}.in must be a list")
                    if 'out' in scopes and not isinstance(scopes['out'], list):
                        errors.append(f"type_scope.{context}.out must be a list")

    # Validate tfm section if present
    if 'tfm' in config:
        tfm = config['tfm']
        if not isinstance(tfm, dict):
            errors.append("tfm must be an object")
        else:
            if 'enabled' in tfm and not isinstance(tfm['enabled'], bool):
                errors.append("tfm.enabled must be a boolean")

    return errors


class ConfigValidationSerializer(serializers.Serializer):
    """
    Serializer for validating a config without saving.
    """
    config = serializers.JSONField(help_text="Configuration JSON to validate")

    def validate_config(self, value):
        """Validate the config structure."""
        errors = validate_config_structure(value)
        if errors:
            raise serializers.ValidationError(errors)
        return value

    def get_validation_result(self):
        """Return validation summary."""
        config = self.validated_data['config']
        return {
            'valid': True,
            'has_eir': bool(config.get('eir', {}).get('requirements')),
            'has_bep': bool(config.get('bep', {}).get('mmi_scale')),
            'has_tfm': config.get('tfm', {}).get('enabled', False),
            'mmi_levels': list(config.get('bep', {}).get('mmi_scale', {}).keys()),
            'validation_rules': len(config.get('bep', {}).get('validation_rules', [])),
            'type_scopes': list(config.get('type_scope', {}).keys())
        }
