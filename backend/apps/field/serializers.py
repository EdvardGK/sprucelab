"""
REST API serializers for Field & Compliance module.
"""
from rest_framework import serializers
from .models import ChecklistTemplate, ChecklistTemplateItem, Checklist, CheckItem


class ChecklistTemplateItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChecklistTemplateItem
        fields = [
            'id', 'template', 'sort_order', 'title', 'description',
            'reference_type', 'reference_code', 'reference_description',
            'reference_document_url', 'reference_page',
            'acceptance_criteria', 'measurement_unit',
            'tolerance_min', 'tolerance_max',
            'requires_photo', 'requires_measurement', 'is_critical',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class ChecklistTemplateListSerializer(serializers.ModelSerializer):
    item_count = serializers.IntegerField(source='items.count', read_only=True)

    class Meta:
        model = ChecklistTemplate
        fields = [
            'id', 'project', 'name', 'description', 'category',
            'regulation_ref', 'is_system_template', 'version',
            'item_count', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ChecklistTemplateDetailSerializer(serializers.ModelSerializer):
    items = ChecklistTemplateItemSerializer(many=True, read_only=True)

    class Meta:
        model = ChecklistTemplate
        fields = [
            'id', 'project', 'name', 'description', 'category',
            'regulation_ref', 'is_system_template', 'version',
            'items', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class CheckItemSerializer(serializers.ModelSerializer):
    is_out_of_tolerance = serializers.BooleanField(read_only=True)

    class Meta:
        model = CheckItem
        fields = [
            'id', 'checklist', 'template_item', 'sort_order', 'title',
            'reference_type', 'reference_code', 'reference_description',
            'reference_document_url', 'reference_page',
            'acceptance_criteria', 'measurement_unit',
            'tolerance_min', 'tolerance_max',
            'requires_photo', 'is_critical',
            # Worker input
            'status', 'measured_value', 'notes',
            'checked_by', 'checked_at',
            # Deviation
            'deviation_description', 'deviation_responsible', 'deviation_action',
            'deviation_resolved', 'deviation_resolved_by', 'deviation_resolved_at',
            # Computed
            'is_out_of_tolerance',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'is_out_of_tolerance', 'created_at', 'updated_at']


class ChecklistListSerializer(serializers.ModelSerializer):
    progress = serializers.DictField(read_only=True)
    template_name = serializers.CharField(source='template.name', read_only=True, default=None)

    class Meta:
        model = Checklist
        fields = [
            'id', 'project', 'template', 'template_name',
            'name', 'location', 'status',
            'assigned_to', 'started_at', 'completed_at',
            'signed_by', 'signed_at', 'created_by',
            'progress', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'progress', 'created_at', 'updated_at']


class ChecklistDetailSerializer(serializers.ModelSerializer):
    items = CheckItemSerializer(many=True, read_only=True)
    progress = serializers.DictField(read_only=True)
    template_name = serializers.CharField(source='template.name', read_only=True, default=None)

    class Meta:
        model = Checklist
        fields = [
            'id', 'project', 'template', 'template_name',
            'name', 'location', 'status',
            'assigned_to', 'started_at', 'completed_at',
            'signed_by', 'signed_at', 'created_by',
            'items', 'progress', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'progress', 'created_at', 'updated_at']
