from django.contrib import admin
from .models import Script, ScriptExecution, AutomationWorkflow, WorkflowExecution


@admin.register(Script)
class ScriptAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'script_type', 'is_public', 'author_name', 'created_at')
    list_filter = ('category', 'script_type', 'is_public')
    search_fields = ('name', 'description', 'author_name')
    readonly_fields = ('id', 'created_at', 'updated_at')
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'description', 'category', 'script_type', 'is_public', 'author_name')
        }),
        ('Code', {
            'fields': ('code',)
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


@admin.register(ScriptExecution)
class ScriptExecutionAdmin(admin.ModelAdmin):
    list_display = ('script', 'model', 'status', 'started_at', 'duration_ms', 'executed_by_name')
    list_filter = ('status', 'started_at')
    search_fields = ('script__name', 'model__name', 'executed_by_name')
    readonly_fields = ('id', 'created_at', 'started_at', 'completed_at', 'duration_ms')
    fieldsets = (
        ('Execution Info', {
            'fields': ('script', 'model', 'status', 'executed_by_name')
        }),
        ('Parameters', {
            'fields': ('parameters',)
        }),
        ('Timing', {
            'fields': ('started_at', 'completed_at', 'duration_ms')
        }),
        ('Results', {
            'fields': ('result_data', 'result_files'),
            'classes': ('collapse',)
        }),
        ('Output', {
            'fields': ('output_log', 'error_message'),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('id', 'created_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(AutomationWorkflow)
class AutomationWorkflowAdmin(admin.ModelAdmin):
    list_display = ('name', 'trigger_type', 'script', 'is_active', 'project', 'last_run_at')
    list_filter = ('trigger_type', 'is_active', 'project')
    search_fields = ('name', 'description', 'script__name')
    readonly_fields = ('id', 'created_at', 'updated_at', 'last_run_at')
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'description', 'is_active', 'project')
        }),
        ('Trigger Configuration', {
            'fields': ('trigger_type', 'trigger_config')
        }),
        ('Script Configuration', {
            'fields': ('script', 'default_parameters')
        }),
        ('Scheduling', {
            'fields': ('last_run_at', 'next_run_at'),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(WorkflowExecution)
class WorkflowExecutionAdmin(admin.ModelAdmin):
    list_display = ('workflow', 'model', 'status', 'triggered_by', 'executed_at')
    list_filter = ('status', 'triggered_by', 'executed_at')
    search_fields = ('workflow__name', 'model__name', 'triggered_by_user_name')
    readonly_fields = ('id', 'executed_at')
    fieldsets = (
        ('Execution Info', {
            'fields': ('workflow', 'model', 'script_execution', 'status')
        }),
        ('Trigger Info', {
            'fields': ('triggered_by', 'triggered_by_user_name')
        }),
        ('Error', {
            'fields': ('error_message',),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('id', 'executed_at'),
            'classes': ('collapse',)
        }),
    )
