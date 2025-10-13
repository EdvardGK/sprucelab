"""
REST API serializers for 3D Viewer module.

Serializes viewer groups and model assignments.
"""
from rest_framework import serializers
from .models import ViewerGroup, ViewerModel


class ViewerModelSerializer(serializers.ModelSerializer):
    """
    Serialize model assignments in a viewer group.
    Includes coordination data (offset, rotation, visibility).
    """
    # Model details (read-only)
    model_name = serializers.CharField(source='model.name', read_only=True)
    model_version = serializers.IntegerField(source='model.version_number', read_only=True)
    model_status = serializers.CharField(source='model.status', read_only=True)
    model_element_count = serializers.IntegerField(source='model.element_count', read_only=True)
    model_file_size = serializers.IntegerField(source='model.file_size', read_only=True)

    class Meta:
        model = ViewerModel
        fields = [
            'id', 'group', 'model',
            'model_name', 'model_version', 'model_status',
            'model_element_count', 'model_file_size',
            'offset_x', 'offset_y', 'offset_z', 'rotation',
            'is_visible', 'opacity', 'color_override', 'display_order',
            'created_at'
        ]
        read_only_fields = [
            'id', 'created_at',
            'model_name', 'model_version', 'model_status',
            'model_element_count', 'model_file_size'
        ]


class ViewerGroupSerializer(serializers.ModelSerializer):
    """
    Serialize viewer groups with nested models.
    """
    # Nested models
    models = ViewerModelSerializer(many=True, read_only=True)

    # Stats
    model_count = serializers.SerializerMethodField()

    # Project name
    project_name = serializers.CharField(source='project.name', read_only=True)

    class Meta:
        model = ViewerGroup
        fields = [
            'id', 'project', 'project_name', 'name', 'description',
            'group_type', 'parent', 'display_order', 'is_expanded',
            'models', 'model_count',
            'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'project_name']

    def get_model_count(self, obj):
        """Count of models directly in this group."""
        return obj.models.count()


class ViewerGroupListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for listing groups (without nested data).
    """
    project_name = serializers.CharField(source='project.name', read_only=True)
    parent_name = serializers.CharField(source='parent.name', read_only=True)
    model_count = serializers.SerializerMethodField()

    class Meta:
        model = ViewerGroup
        fields = [
            'id', 'project', 'project_name', 'name', 'description',
            'group_type', 'parent', 'parent_name', 'display_order',
            'model_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'project_name', 'parent_name']

    def get_model_count(self, obj):
        """Count of models directly in this group."""
        return obj.models.count()
