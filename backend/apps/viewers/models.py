"""
3D Viewer Models

Simplified architecture for organizing models into groups for federated viewing.
Users can create groups to organize models (buildings, phases, disciplines, etc.).
"""
import uuid
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class ViewerGroup(models.Model):
    """
    Model group for organizing federated viewing.
    Belongs directly to a project (no intermediate viewer configuration).
    Can represent buildings, phases, disciplines, or any custom organization.
    Supports nested hierarchy (parent/child).
    """
    GROUP_TYPE_CHOICES = [
        ('building', 'Building'),
        ('phase', 'Construction Phase'),
        ('discipline', 'Discipline'),
        ('zone', 'Spatial Zone'),
        ('custom', 'Custom Group'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='viewer_groups', null=True, blank=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, help_text="Optional description of this group")
    group_type = models.CharField(max_length=50, choices=GROUP_TYPE_CHOICES, default='custom')
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.CASCADE, related_name='children')
    display_order = models.IntegerField(default=0)
    is_expanded = models.BooleanField(default=True, help_text="Whether group is expanded in tree view")
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='created_viewer_groups')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'viewer_groups'
        ordering = ['display_order', 'name']
        verbose_name = 'Viewer Group'
        verbose_name_plural = 'Viewer Groups'

    def __str__(self):
        return f"{self.name} ({self.project.name})"


class ViewerModel(models.Model):
    """
    Assignment of an IFC model to a viewer group.
    Includes coordination data (position, rotation, visibility).
    One model can appear in multiple viewers/groups.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(ViewerGroup, on_delete=models.CASCADE, related_name='models')
    model = models.ForeignKey('models.Model', on_delete=models.CASCADE, related_name='viewer_assignments')

    # Coordination (for models that don't align)
    offset_x = models.FloatField(default=0.0, help_text="X offset in meters")
    offset_y = models.FloatField(default=0.0, help_text="Y offset in meters")
    offset_z = models.FloatField(default=0.0, help_text="Z offset in meters")
    rotation = models.FloatField(default=0.0, help_text="Rotation in degrees (Z-axis)")

    # Display properties
    is_visible = models.BooleanField(default=True)
    opacity = models.FloatField(default=1.0, help_text="0.0 (transparent) to 1.0 (opaque)")
    color_override = models.CharField(
        max_length=7,
        null=True,
        blank=True,
        help_text="Hex color (e.g., #FF5733)"
    )
    display_order = models.IntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'viewer_models'
        unique_together = ['group', 'model']  # Same model can't be in same group twice
        ordering = ['display_order']
        verbose_name = 'Viewer Model'
        verbose_name_plural = 'Viewer Models'

    def __str__(self):
        return f"{self.model.name} in {self.group.name}"
