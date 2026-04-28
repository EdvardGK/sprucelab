from rest_framework import serializers
from .models import Model, SourceFile, ExtractionRun
from apps.entities.models import IFCValidationReport


class ModelSerializer(serializers.ModelSerializer):
    """Serializer for IFC Model instances (with layered status tracking)."""

    project_name = serializers.CharField(source='project.name', read_only=True)
    # Explicitly format dates to ensure ISO 8601 format
    created_at = serializers.DateTimeField(format='%Y-%m-%dT%H:%M:%S.%fZ', read_only=True)
    updated_at = serializers.DateTimeField(format='%Y-%m-%dT%H:%M:%S.%fZ', read_only=True)
    forked_at = serializers.DateTimeField(format='%Y-%m-%dT%H:%M:%S.%fZ', read_only=True)
    fragments_generated_at = serializers.DateTimeField(format='%Y-%m-%dT%H:%M:%S.%fZ', read_only=True)
    is_fork = serializers.BooleanField(read_only=True)
    fork_count = serializers.SerializerMethodField()
    mapped_type_count = serializers.SerializerMethodField()
    first_version_created_at = serializers.SerializerMethodField()

    class Meta:
        model = Model
        fields = [
            'id', 'project', 'project_name', 'scope', 'name', 'original_filename',
            'ifc_schema', 'file_url', 'file_size',
            # Legacy status (deprecated, use layer-specific statuses below)
            'status',
            # Layered status tracking (NEW)
            'parsing_status', 'geometry_status', 'validation_status',
            # Fragments (ThatOpen optimized binary format)
            'fragments_url', 'fragments_size_mb', 'fragments_generated_at',
            'fragments_status', 'fragments_error',
            # Version tracking
            'version_number', 'parent_model', 'is_published',
            'ifc_timestamp', 'version_diff',
            # Fork tracking
            'forked_from', 'fork_name', 'fork_type', 'fork_description',
            'forked_at', 'is_fork', 'fork_count',
            # Aggregate stats (element details queried via FastAPI)
            'element_count', 'storey_count', 'system_count',
            'type_count', 'mapped_type_count', 'material_count', 'type_summary',
            'processing_error', 'created_at', 'updated_at', 'first_version_created_at'
        ]
        read_only_fields = [
            'id', 'ifc_schema', 'file_url', 'file_size',
            'status', 'parsing_status', 'geometry_status', 'validation_status',
            'fragments_url', 'fragments_size_mb', 'fragments_generated_at',
            'fragments_status', 'fragments_error',
            'is_published', 'ifc_timestamp', 'version_diff',
            'forked_at', 'is_fork', 'fork_count',
            'element_count', 'storey_count', 'system_count',
            'type_count', 'mapped_type_count', 'material_count', 'type_summary',
            'processing_error', 'created_at', 'updated_at', 'first_version_created_at'
        ]

    def get_first_version_created_at(self, obj):
        """When this model first hit the platform (v1's created_at)."""
        return obj.get_first_version_created_at()

    def get_fork_count(self, obj):
        """Get count of forks for this model."""
        return obj.forks.count()

    def get_mapped_type_count(self, obj):
        """Get count of types that have NS-3451 mappings."""
        from apps.entities.models import IFCType
        return IFCType.objects.filter(
            model=obj,
            mapping__ns3451_code__isnull=False
        ).exclude(mapping__ns3451_code='').count()


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
    # Note: version_number is NOT allowed in upload - it's always auto-calculated by the backend

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
                'status': prev.status,  # Legacy
                'parsing_status': prev.parsing_status,
                'geometry_status': prev.geometry_status,
                'is_published': prev.is_published
            }
        return None

    def get_next_version(self, obj):
        next_ver = obj.get_next_version()
        if next_ver:
            return {
                'id': str(next_ver.id),
                'version_number': next_ver.version_number,
                'name': next_ver.name,
                'status': next_ver.status,  # Legacy
                'parsing_status': next_ver.parsing_status,
                'geometry_status': next_ver.geometry_status,
                'is_published': next_ver.is_published
            }
        return None


class ExtractionRunListSerializer(serializers.ModelSerializer):
    """Lightweight ExtractionRun for list responses (no log_entries / quality_report)."""

    class Meta:
        model = ExtractionRun
        fields = [
            'id', 'source_file', 'status',
            'started_at', 'completed_at', 'duration_seconds',
            'discovered_crs', 'extractor_version', 'error_message',
        ]
        read_only_fields = fields


class ExtractionRunSerializer(serializers.ModelSerializer):
    """Full ExtractionRun with log + quality report for detail views."""

    class Meta:
        model = ExtractionRun
        fields = [
            'id', 'source_file', 'status',
            'started_at', 'completed_at', 'duration_seconds',
            'discovered_crs', 'crs_source', 'crs_confidence', 'discovered_units',
            'discovered_grid', 'quality_report', 'log_entries',
            'error_message', 'extractor_version', 'task_id',
        ]
        read_only_fields = fields


class SourceFileListSerializer(serializers.ModelSerializer):
    """Lightweight SourceFile for list responses (no extraction runs)."""

    project_name = serializers.CharField(source='project.name', read_only=True)
    latest_extraction_status = serializers.SerializerMethodField()

    class Meta:
        model = SourceFile
        fields = [
            'id', 'project', 'project_name', 'scope', 'original_filename', 'format',
            'file_size', 'checksum_sha256', 'mime_type',
            'version_number', 'parent_file', 'is_current',
            'uploaded_by', 'uploaded_at', 'latest_extraction_status',
        ]
        read_only_fields = fields

    def get_latest_extraction_status(self, obj):
        latest = obj.extraction_runs.order_by('-started_at').first()
        return latest.status if latest else None


class SourceFileSerializer(serializers.ModelSerializer):
    """Full SourceFile with embedded extraction-run summary."""

    project_name = serializers.CharField(source='project.name', read_only=True)
    extraction_runs = ExtractionRunListSerializer(many=True, read_only=True)

    class Meta:
        model = SourceFile
        fields = [
            'id', 'project', 'project_name', 'scope', 'original_filename', 'file_url',
            'file_size', 'checksum_sha256', 'format', 'mime_type',
            'version_number', 'parent_file', 'is_current',
            'uploaded_by', 'uploaded_at', 'extraction_runs',
        ]
        read_only_fields = [
            'id', 'file_url', 'file_size', 'checksum_sha256', 'mime_type',
            'version_number', 'parent_file', 'is_current',
            'uploaded_by', 'uploaded_at', 'extraction_runs',
        ]


class SourceFileUploadSerializer(serializers.Serializer):
    """Universal file upload for /api/files/."""

    file = serializers.FileField(required=True)
    project_id = serializers.UUIDField(required=True)
    name = serializers.CharField(required=False, max_length=255)


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
