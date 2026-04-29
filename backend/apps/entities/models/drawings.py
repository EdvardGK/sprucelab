"""
Drawing models (Phase 5): DrawingSheet, TitleBlockTemplate, DrawingRegistration.

A DrawingSheet is one extracted page from a DWG/DXF (one sheet per file) or
PDF (one sheet per page). TitleBlockTemplate defines per-project regions to
parse for sheet metadata. DrawingRegistration ties two paper points to grid
labels (e.g. "A/3") so paper coordinates can be transformed to model space
via the U/V axes captured in ExtractionRun.discovered_grid (Phase 4).
"""
from django.db import models
import uuid


class DrawingSheet(models.Model):
    """One sheet extracted from a drawing file. PDF -> one row per page; DXF/DWG -> one per file."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source_file = models.ForeignKey(
        'models.SourceFile',
        on_delete=models.CASCADE,
        related_name='drawing_sheets',
    )
    extraction_run = models.ForeignKey(
        'models.ExtractionRun',
        on_delete=models.CASCADE,
        related_name='drawing_sheets',
    )
    scope = models.ForeignKey(
        'projects.ProjectScope',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='drawing_sheets',
    )

    page_index = models.IntegerField(
        default=0,
        help_text="0-based page index within the source file (always 0 for DXF/DWG)",
    )
    sheet_number = models.CharField(max_length=50, blank=True, db_index=True)
    sheet_name = models.CharField(max_length=255, blank=True)

    width_mm = models.FloatField(null=True, blank=True)
    height_mm = models.FloatField(null=True, blank=True)
    scale = models.CharField(
        max_length=50, blank=True,
        help_text="Drawing scale as text (e.g. '1:50'). Free-form because exporters disagree.",
    )

    title_block_data = models.JSONField(
        default=dict, blank=True,
        help_text='Parsed against TitleBlockTemplate.fields. {field_name: value}',
    )
    raw_metadata = models.JSONField(
        default=dict, blank=True,
        help_text='Format-specific metadata (DXF layers, PDF outline, etc.)',
    )

    class Meta:
        db_table = 'drawing_sheets'
        ordering = ['source_file_id', 'page_index']
        constraints = [
            models.UniqueConstraint(
                fields=['source_file', 'page_index'],
                name='uniq_drawing_sheet_per_page',
            ),
        ]
        indexes = [
            models.Index(fields=['source_file', 'page_index']),
            models.Index(fields=['scope']),
        ]

    def __str__(self) -> str:
        label = self.sheet_number or self.sheet_name or f'page {self.page_index}'
        return f'{self.source_file.original_filename} :: {label}'


class TitleBlockTemplate(models.Model):
    """
    Per-project template describing where to find title-block metadata on a sheet.

    `fields` shape (list of dicts):
      [
        {"name": "sheet_number", "label": "Sheet No.", "region": {"x": 700, "y": 20, "w": 80, "h": 30},
         "type": "text"},
        {"name": "discipline",   "label": "Discipline","region": {...},
         "type": "lookup", "maps_to": "discipline"},
        ...
      ]

    Region coordinates are in mm relative to the sheet's bottom-left corner.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        related_name='title_block_templates',
    )
    name = models.CharField(max_length=255)
    fields = models.JSONField(
        default=list, blank=True,
        help_text='List of {name, label, region: {x,y,w,h}, type, maps_to?} entries',
    )
    is_default = models.BooleanField(
        default=False,
        help_text='Auto-applied to new drawings in this project when set',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'title_block_templates'
        ordering = ['project_id', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['project', 'name'],
                name='uniq_titleblock_per_project_name',
            ),
        ]

    def __str__(self) -> str:
        return f'{self.project_id} :: {self.name}'


class DrawingRegistration(models.Model):
    """
    Two-point registration of paper coordinates to model coordinates.

    Each ref point ties a paper-mm coordinate to a grid intersection (e.g. "A/3").
    The transform matrix is computed server-side from those two pairs and the
    U/V axes from ExtractionRun.discovered_grid on a paired IFC, and persisted
    so frontend overlays can convert paper coords without re-deriving it.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    drawing_sheet = models.OneToOneField(
        DrawingSheet,
        on_delete=models.CASCADE,
        related_name='registration',
    )

    ref1_paper_x = models.FloatField(help_text='mm from sheet origin')
    ref1_paper_y = models.FloatField(help_text='mm from sheet origin')
    ref1_grid_u = models.CharField(max_length=10, help_text='U-axis tag (e.g. "A")')
    ref1_grid_v = models.CharField(max_length=10, help_text='V-axis tag (e.g. "3")')

    ref2_paper_x = models.FloatField()
    ref2_paper_y = models.FloatField()
    ref2_grid_u = models.CharField(max_length=10)
    ref2_grid_v = models.CharField(max_length=10)

    transform_matrix = models.JSONField(
        default=list, blank=True,
        help_text='3x3 affine transform (paper-mm -> model-meters), row-major',
    )
    grid_source_run = models.ForeignKey(
        'models.ExtractionRun',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='registrations_using',
        help_text='ExtractionRun whose discovered_grid was used to resolve grid labels',
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'drawing_registrations'

    def __str__(self) -> str:
        return f'registration({self.drawing_sheet_id})'
