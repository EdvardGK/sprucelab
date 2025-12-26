from django.contrib import admin
from .models import (
    Pipeline,
    PipelineStep,
    CDEConnection,
    ProjectPipelineConfig,
    PipelineRun,
    PipelineStepRun,
    AgentRegistration,
)


class PipelineStepInline(admin.TabularInline):
    model = PipelineStep
    extra = 0
    fields = ('order', 'name', 'step_type', 'timeout_seconds', 'continue_on_failure')
    ordering = ['order']


@admin.register(Pipeline)
class PipelineAdmin(admin.ModelAdmin):
    list_display = ('name', 'scope', 'is_active', 'is_template', 'author_name', 'created_at')
    list_filter = ('scope', 'is_active', 'is_template')
    search_fields = ('name', 'description', 'author_name')
    readonly_fields = ('id', 'created_at', 'updated_at')
    inlines = [PipelineStepInline]
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'description', 'scope', 'is_active', 'is_template', 'author_name')
        }),
        ('Parameters', {
            'fields': ('parameters_schema',),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(PipelineStep)
class PipelineStepAdmin(admin.ModelAdmin):
    list_display = ('name', 'pipeline', 'step_type', 'order', 'timeout_seconds', 'continue_on_failure')
    list_filter = ('step_type', 'pipeline')
    search_fields = ('name', 'pipeline__name')
    readonly_fields = ('id',)
    ordering = ['pipeline', 'order']
    fieldsets = (
        ('Basic Information', {
            'fields': ('pipeline', 'name', 'step_type', 'order')
        }),
        ('Configuration', {
            'fields': ('config',)
        }),
        ('Execution Settings', {
            'fields': ('timeout_seconds', 'max_retries', 'retry_delay_seconds', 'continue_on_failure')
        }),
        ('Metadata', {
            'fields': ('id',),
            'classes': ('collapse',)
        }),
    )


@admin.register(CDEConnection)
class CDEConnectionAdmin(admin.ModelAdmin):
    list_display = ('name', 'cde_type', 'project', 'is_active', 'last_sync_status', 'last_sync_at')
    list_filter = ('cde_type', 'is_active', 'project')
    search_fields = ('name', 'project__name')
    readonly_fields = ('id', 'created_at', 'updated_at', 'last_sync_at', 'last_sync_status')
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'cde_type', 'project', 'is_active')
        }),
        ('Configuration', {
            'fields': ('config',),
            'description': 'Non-sensitive configuration (project IDs, folder paths)'
        }),
        ('Vault Reference', {
            'fields': ('vault_secret_id',),
            'description': 'Reference to credentials in Supabase Vault'
        }),
        ('Sync Status', {
            'fields': ('last_sync_at', 'last_sync_status'),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(ProjectPipelineConfig)
class ProjectPipelineConfigAdmin(admin.ModelAdmin):
    list_display = ('pipeline', 'project', 'is_enabled', 'cde_connection', 'created_at')
    list_filter = ('is_enabled', 'pipeline', 'project')
    search_fields = ('pipeline__name', 'project__name')
    readonly_fields = ('id', 'created_at', 'updated_at')
    fieldsets = (
        ('Configuration', {
            'fields': ('project', 'pipeline', 'is_enabled', 'cde_connection')
        }),
        ('Parameter Overrides', {
            'fields': ('parameters_override',),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


class PipelineStepRunInline(admin.TabularInline):
    model = PipelineStepRun
    extra = 0
    fields = ('step', 'status', 'attempt_number', 'duration_ms', 'error_message')
    readonly_fields = ('step', 'status', 'attempt_number', 'duration_ms', 'error_message')
    ordering = ['step__order']
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(PipelineRun)
class PipelineRunAdmin(admin.ModelAdmin):
    list_display = (
        'pipeline', 'project', 'status', 'trigger_type',
        'steps_completed', 'steps_total', 'duration_ms', 'created_at'
    )
    list_filter = ('status', 'trigger_type', 'pipeline', 'project')
    search_fields = ('pipeline__name', 'project__name', 'triggered_by', 'agent_hostname')
    readonly_fields = (
        'id', 'created_at', 'started_at', 'completed_at', 'duration_ms',
        'steps_total', 'steps_completed', 'steps_failed'
    )
    inlines = [PipelineStepRunInline]
    fieldsets = (
        ('Execution Info', {
            'fields': ('pipeline', 'project', 'status', 'trigger_type', 'triggered_by')
        }),
        ('Parameters', {
            'fields': ('parameters',),
            'classes': ('collapse',)
        }),
        ('Progress', {
            'fields': ('steps_total', 'steps_completed', 'steps_failed')
        }),
        ('Timing', {
            'fields': ('started_at', 'completed_at', 'duration_ms')
        }),
        ('Agent', {
            'fields': ('agent_id', 'agent_hostname'),
            'classes': ('collapse',)
        }),
        ('Error', {
            'fields': ('error_message',),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('id', 'created_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(PipelineStepRun)
class PipelineStepRunAdmin(admin.ModelAdmin):
    list_display = ('step', 'pipeline_run', 'status', 'attempt_number', 'duration_ms')
    list_filter = ('status', 'step__step_type')
    search_fields = ('step__name', 'pipeline_run__pipeline__name')
    readonly_fields = ('id', 'started_at', 'completed_at', 'duration_ms')
    fieldsets = (
        ('Execution Info', {
            'fields': ('pipeline_run', 'step', 'status', 'attempt_number')
        }),
        ('Timing', {
            'fields': ('started_at', 'completed_at', 'duration_ms')
        }),
        ('Results', {
            'fields': ('result_data', 'output_files'),
            'classes': ('collapse',)
        }),
        ('Output', {
            'fields': ('output_log', 'error_message'),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('id',),
            'classes': ('collapse',)
        }),
    )


@admin.register(AgentRegistration)
class AgentRegistrationAdmin(admin.ModelAdmin):
    list_display = ('name', 'hostname', 'is_active', 'last_seen_at', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('name', 'hostname')
    readonly_fields = ('id', 'api_key_hash', 'created_at', 'updated_at', 'last_seen_at')
    filter_horizontal = ('projects',)
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'hostname', 'is_active')
        }),
        ('Authentication', {
            'fields': ('api_key_hash',),
            'description': 'API key hash (key shown once on creation)'
        }),
        ('Capabilities', {
            'fields': ('capabilities',),
            'classes': ('collapse',)
        }),
        ('Project Access', {
            'fields': ('projects',),
            'description': 'Projects this agent can serve (empty = all)'
        }),
        ('Status', {
            'fields': ('last_seen_at',)
        }),
        ('Metadata', {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
