from rest_framework import serializers
from .models import Model
from apps.entities.models import IFCValidationReport


class ModelSerializer(serializers.ModelSerializer):
    """Serializer for IFC Model instances."""

    project_name = serializers.CharField(source='project.name', read_only=True)

    class Meta:
        model = Model
        fields = [
            'id', 'project', 'project_name', 'name', 'original_filename',
            'ifc_schema', 'file_url', 'file_size', 'status', 'version_number',
            'parent_model', 'element_count', 'storey_count', 'system_count',
            'processing_error', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'ifc_schema', 'file_url', 'file_size', 'status', 'element_count',
            'storey_count', 'system_count', 'processing_error',
            'created_at', 'updated_at'
        ]


class ModelUploadSerializer(serializers.Serializer):
    """Serializer for IFC file upload."""

    file = serializers.FileField(
        required=True,
        help_text="IFC file to upload (.ifc extension)"
    )
    project_id = serializers.UUIDField(
        required=True,
        help_text="UUID of the project to upload to"
    )
    name = serializers.CharField(
        required=False,
        max_length=255,
        help_text="Optional model name (defaults to filename)"
    )
    version_number = serializers.IntegerField(
        required=False,
        min_value=1,
        help_text="Version number (defaults to auto-increment)"
    )

    def validate_file(self, value):
        """Validate that the uploaded file is an IFC file."""
        if not value.name.lower().endswith('.ifc'):
            raise serializers.ValidationError(
                "Only IFC files are supported (.ifc extension)"
            )

        # Check file size (max 1GB)
        max_size = 1024 * 1024 * 1024  # 1GB
        if value.size > max_size:
            raise serializers.ValidationError(
                f"File too large. Maximum size is 1GB, got {value.size / (1024*1024):.1f}MB"
            )

        return value

    def validate_project_id(self, value):
        """Validate that the project exists."""
        from apps.projects.models import Project

        try:
            Project.objects.get(id=value)
        except Project.DoesNotExist:
            raise serializers.ValidationError(
                f"Project with ID {value} does not exist"
            )

        return value


class ModelDetailSerializer(ModelSerializer):
    """Extended serializer with additional statistics."""

    previous_version = serializers.SerializerMethodField()
    next_version = serializers.SerializerMethodField()

    class Meta(ModelSerializer.Meta):
        fields = ModelSerializer.Meta.fields + ['previous_version', 'next_version']

    def get_previous_version(self, obj):
        prev = obj.get_previous_version()
        if prev:
            return {
                'id': str(prev.id),
                'version_number': prev.version_number,
                'name': prev.name,
                'status': prev.status
            }
        return None

    def get_next_version(self, obj):
        next_ver = obj.get_next_version()
        if next_ver:
            return {
                'id': str(next_ver.id),
                'version_number': next_ver.version_number,
                'name': next_ver.name,
                'status': next_ver.status
            }
        return None


class IFCValidationReportSerializer(serializers.ModelSerializer):
    """Serializer for IFC validation reports."""

    class Meta:
        model = IFCValidationReport
        fields = [
            'id', 'model', 'validated_at', 'overall_status', 'schema_valid',
            'total_elements', 'elements_with_issues',
            'schema_errors', 'schema_warnings', 'guid_issues',
            'geometry_issues', 'property_issues', 'lod_issues', 'summary'
        ]
        read_only_fields = fields  # All fields are read-only
