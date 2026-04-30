"""
Django admin configuration for BEP models.
"""
from django.contrib import admin
from django.utils.html import format_html
from .models import (
    BEPConfiguration,
    TechnicalRequirement,
    MMIScaleDefinition,
    NamingConvention,
    RequiredPropertySet,
    ValidationRule,
    SubmissionMilestone,
)


class TechnicalRequirementInline(admin.StackedInline):
    """Inline admin for TechnicalRequirement (OneToOne)."""
    model = TechnicalRequirement
    can_delete = False
    verbose_name_plural = 'Technical Requirements'
    extra = 0


class MMIScaleDefinitionInline(admin.TabularInline):
    """Inline admin for MMI Scale Definitions."""
    model = MMIScaleDefinition
    extra = 0
    ordering = ['mmi_level']
    fields = ['mmi_level', 'name', 'display_order']


class NamingConventionInline(admin.TabularInline):
    """Inline admin for Naming Conventions."""
    model = NamingConvention
    extra = 0
    fields = ['category', 'name', 'is_required']


class RequiredPropertySetInline(admin.TabularInline):
    """Inline admin for Required Property Sets."""
    model = RequiredPropertySet
    extra = 0
    fields = ['ifc_type', 'mmi_level', 'pset_name', 'severity']


class ValidationRuleInline(admin.TabularInline):
    """Inline admin for Validation Rules."""
    model = ValidationRule
    extra = 0
    fields = ['rule_code', 'name', 'rule_type', 'severity', 'is_active']


class SubmissionMilestoneInline(admin.TabularInline):
    """Inline admin for Submission Milestones."""
    model = SubmissionMilestone
    extra = 0
    ordering = ['milestone_order', 'target_date']
    fields = ['name', 'target_mmi', 'target_date', 'status']


@admin.register(BEPConfiguration)
class BEPConfigurationAdmin(admin.ModelAdmin):
    """Admin for BEP Configuration."""

    list_display = [
        'project',
        'version',
        'status_badge',
        'framework',
        'created_at',
        'activate_button',
    ]
    list_filter = ['status', 'framework', 'created_at']
    search_fields = ['project__name', 'name', 'description']
    readonly_fields = ['created_at', 'updated_at', 'activated_at']

    fieldsets = [
        ('Basic Information', {
            'fields': ['project', 'name', 'description', 'version', 'status']
        }),
        ('Framework', {
            'fields': ['framework', 'eir_document_url', 'bep_document_url']
        }),
        ('CDE Structure', {
            'fields': ['cde_structure'],
            'classes': ['collapse'],
        }),
        ('Audit', {
            'fields': ['created_by', 'created_at', 'updated_at', 'activated_at'],
            'classes': ['collapse'],
        }),
    ]

    inlines = [
        TechnicalRequirementInline,
        MMIScaleDefinitionInline,
        NamingConventionInline,
        RequiredPropertySetInline,
        ValidationRuleInline,
        SubmissionMilestoneInline,
    ]

    def status_badge(self, obj):
        """Display status as colored badge."""
        colors = {
            'draft': 'gray',
            'active': 'green',
            'archived': 'orange',
        }
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 2px 8px; border-radius: 4px;">{}</span>',
            color,
            obj.status.upper()
        )
    status_badge.short_description = 'Status'

    def activate_button(self, obj):
        """Display activate button for draft BEPs."""
        if obj.status == 'draft':
            return format_html(
                '<a class="button" href="/admin/bep/bepconfiguration/{}/activate/">Activate</a>',
                obj.id
            )
        return '-'
    activate_button.short_description = 'Actions'


@admin.register(TechnicalRequirement)
class TechnicalRequirementAdmin(admin.ModelAdmin):
    """Admin for Technical Requirements."""

    list_display = [
        'bep',
        'ifc_schema',
        'coordinate_system_name',
        'length_unit',
        'max_file_size_mb',
    ]
    list_filter = ['ifc_schema', 'length_unit']
    search_fields = ['bep__project__name', 'coordinate_system_name']
    readonly_fields = ['created_at', 'updated_at']

    fieldsets = [
        ('BEP', {
            'fields': ['bep']
        }),
        ('IFC Requirements', {
            'fields': ['ifc_schema', 'model_view_definition', 'max_file_size_mb']
        }),
        ('Coordinate System', {
            'fields': ['coordinate_system_name', 'coordinate_system_description']
        }),
        ('Units', {
            'fields': ['length_unit', 'area_unit', 'volume_unit', 'geometry_tolerance']
        }),
        ('Additional Requirements', {
            'fields': ['requirements_json'],
            'classes': ['collapse'],
        }),
        ('Audit', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse'],
        }),
    ]


@admin.register(MMIScaleDefinition)
class MMIScaleDefinitionAdmin(admin.ModelAdmin):
    """Admin for MMI Scale Definitions."""

    list_display = [
        'bep',
        'mmi_level',
        'name',
        'display_order',
        'applies_to_disciplines_list',
    ]
    list_filter = ['mmi_level', 'bep__project']
    search_fields = ['name', 'description']
    ordering = ['bep', 'mmi_level']
    readonly_fields = ['created_at', 'updated_at']

    fieldsets = [
        ('BEP & MMI Level', {
            'fields': ['bep', 'mmi_level', 'name', 'description', 'display_order']
        }),
        ('Geometry Requirements', {
            'fields': ['geometry_requirements'],
            'description': 'JSON definition of geometry requirements for this MMI level',
        }),
        ('Information Requirements', {
            'fields': ['information_requirements'],
            'description': 'JSON definition of information requirements for this MMI level',
        }),
        ('Discipline-Specific', {
            'fields': ['applies_to_disciplines', 'discipline_specific_rules'],
            'classes': ['collapse'],
        }),
        ('Audit', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse'],
        }),
    ]

    def applies_to_disciplines_list(self, obj):
        """Display disciplines as comma-separated list."""
        if not obj.applies_to_disciplines:
            return 'All'
        return ', '.join(obj.applies_to_disciplines)
    applies_to_disciplines_list.short_description = 'Disciplines'


@admin.register(NamingConvention)
class NamingConventionAdmin(admin.ModelAdmin):
    """Admin for Naming Conventions."""

    list_display = [
        'bep',
        'category',
        'name',
        'pattern_type',
        'is_required',
    ]
    list_filter = ['category', 'pattern_type', 'is_required']
    search_fields = ['name', 'description', 'pattern']
    readonly_fields = ['created_at', 'updated_at']

    fieldsets = [
        ('BEP & Category', {
            'fields': ['bep', 'category', 'name', 'description']
        }),
        ('Pattern', {
            'fields': ['pattern', 'pattern_type', 'examples']
        }),
        ('Validation', {
            'fields': ['is_required', 'error_message']
        }),
        ('Scope', {
            'fields': ['applies_to_disciplines'],
            'classes': ['collapse'],
        }),
        ('Audit', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse'],
        }),
    ]


@admin.register(RequiredPropertySet)
class RequiredPropertySetAdmin(admin.ModelAdmin):
    """Admin for Required Property Sets."""

    list_display = [
        'bep',
        'ifc_type',
        'pset_name',
        'mmi_level',
        'severity',
        'is_required',
    ]
    list_filter = ['mmi_level', 'severity', 'is_required', 'ifc_type']
    search_fields = ['ifc_type', 'pset_name', 'bep__project__name']
    ordering = ['bep', 'ifc_type', 'mmi_level']
    readonly_fields = ['created_at', 'updated_at']

    fieldsets = [
        ('BEP & Scope', {
            'fields': ['bep', 'ifc_type', 'mmi_level']
        }),
        ('Property Set', {
            'fields': ['pset_name', 'required_properties', 'optional_properties']
        }),
        ('Validation', {
            'fields': ['is_required', 'severity']
        }),
        ('Discipline-Specific', {
            'fields': ['applies_to_disciplines'],
            'classes': ['collapse'],
        }),
        ('Audit', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse'],
        }),
    ]


@admin.register(ValidationRule)
class ValidationRuleAdmin(admin.ModelAdmin):
    """Admin for Validation Rules."""

    list_display = [
        'rule_code',
        'name',
        'bep',
        'rule_type',
        'severity',
        'is_active',
        'min_mmi_level',
    ]
    list_filter = ['rule_type', 'severity', 'is_active', 'min_mmi_level']
    search_fields = ['rule_code', 'name', 'description', 'bep__project__name']
    ordering = ['bep', 'severity', 'rule_code']
    readonly_fields = ['created_at', 'updated_at']

    fieldsets = [
        ('BEP & Rule', {
            'fields': ['bep', 'rule_code', 'name', 'description', 'rule_type']
        }),
        ('Validation', {
            'fields': ['severity', 'is_active', 'min_mmi_level']
        }),
        ('Rule Definition', {
            'fields': ['rule_definition', 'error_message_template'],
            'description': 'JSON definition of rule logic',
        }),
        ('Scope', {
            'fields': ['applies_to_ifc_types', 'applies_to_disciplines'],
            'classes': ['collapse'],
        }),
        ('Audit', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse'],
        }),
    ]


@admin.register(SubmissionMilestone)
class SubmissionMilestoneAdmin(admin.ModelAdmin):
    """Admin for Submission Milestones."""

    list_display = [
        'name',
        'bep',
        'target_mmi',
        'target_date',
        'status',
        'milestone_order',
    ]
    list_filter = ['status', 'target_mmi', 'target_date']
    search_fields = ['name', 'description', 'bep__project__name']
    ordering = ['bep', 'milestone_order', 'target_date']
    readonly_fields = ['created_at', 'updated_at']

    fieldsets = [
        ('BEP & Milestone', {
            'fields': ['bep', 'name', 'description', 'milestone_order']
        }),
        ('Requirements', {
            'fields': ['target_mmi', 'required_disciplines']
        }),
        ('Schedule', {
            'fields': ['target_date', 'submission_deadline', 'status']
        }),
        ('Review Checklist', {
            'fields': ['review_checklist'],
            'classes': ['collapse'],
        }),
        ('Audit', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse'],
        }),
    ]
