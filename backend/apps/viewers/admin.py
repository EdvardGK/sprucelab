"""
Django admin configuration for 3D Viewer models.
"""
from django.contrib import admin
from .models import ViewerGroup, ViewerModel


@admin.register(ViewerGroup)
class ViewerGroupAdmin(admin.ModelAdmin):
    """Admin interface for viewer groups."""
    list_display = ['name', 'project', 'group_type', 'parent', 'display_order', 'is_expanded', 'created_at']
    list_filter = ['group_type', 'project', 'is_expanded', 'created_at']
    search_fields = ['name', 'description', 'project__name']
    readonly_fields = ['id', 'created_at', 'updated_at']
    ordering = ['project', 'display_order', 'name']
    date_hierarchy = 'created_at'


@admin.register(ViewerModel)
class ViewerModelAdmin(admin.ModelAdmin):
    """Admin interface for viewer model assignments."""
    list_display = ['model', 'group', 'is_visible', 'opacity', 'display_order', 'created_at']
    list_filter = ['is_visible', 'group__project']
    search_fields = ['model__name', 'group__name', 'group__project__name']
    readonly_fields = ['id', 'created_at']
    ordering = ['group', 'display_order']

    fieldsets = (
        ('Assignment', {
            'fields': ('id', 'group', 'model', 'display_order', 'created_at')
        }),
        ('Coordination', {
            'fields': ('offset_x', 'offset_y', 'offset_z', 'rotation')
        }),
        ('Display', {
            'fields': ('is_visible', 'opacity', 'color_override')
        }),
    )
