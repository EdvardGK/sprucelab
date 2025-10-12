from rest_framework import serializers
from .models import Project


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
