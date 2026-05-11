"""
ObservationLog — Layer 1 substrate (raw extracted facts).

An Observation is one queryable, drillable fact derived from an extraction
run. It's the raw stream: every text block in a PDF page, every layer name
in a DXF, every metadata key, every annotation. Observations are append-only
and require no decision to be useful — the log is searchable as evidence by
construction.

Relation to Claim (Layer 2):
  - An Observation MAY become a Claim if the extractor decided the content
    looks normative/decision-worthy. The Claim then carries its own
    promote/reject/supersede lifecycle.
  - Observations without a Claim still exist in the log and can be searched,
    filtered, and analyzed.
  - This is the inverse of trying to bake "observation" into Claim itself:
    we keep Claim focused on the decision queue and let the log carry the
    full firehose.
"""
from __future__ import annotations

import uuid

from django.db import models


OBSERVATION_CATEGORY_CHOICES = [
    ('text_block', 'Text block (drawing or document body)'),
    ('layer', 'Layer (DWG/DXF/PDF OCG)'),
    ('annotation', 'Annotation (PDF/DWG markup)'),
    ('title_block_field', 'Title-block field (parsed)'),
    ('sheet_metadata', 'Sheet metadata (size, scale, rotation)'),
    ('file_metadata', 'File-level metadata (author, dates, units)'),
    ('extraction_event', 'Extraction event (warning, classification)'),
    ('other', 'Other'),
]


class Observation(models.Model):
    """
    One Layer-1 fact derived from an ExtractionRun.

    Provenance is required (source_file + extraction_run). Sheet/page are
    optional — file-level observations (PDF author, creation date) don't
    pin to a sheet.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Provenance — every observation points back to where it came from.
    source_file = models.ForeignKey(
        'models.SourceFile',
        on_delete=models.CASCADE,
        related_name='observations',
    )
    extraction_run = models.ForeignKey(
        'models.ExtractionRun',
        on_delete=models.CASCADE,
        related_name='observations',
    )
    sheet = models.ForeignKey(
        'entities.DrawingSheet',
        null=True, blank=True,
        on_delete=models.CASCADE,
        related_name='observations',
        help_text='The drawing sheet this observation belongs to. Null for '
                  'file-level observations and for document-derived facts.',
    )
    scope = models.ForeignKey(
        'projects.ProjectScope',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='observations',
    )

    # Classification + content.
    category = models.CharField(
        max_length=32, choices=OBSERVATION_CATEGORY_CHOICES, db_index=True,
    )
    key = models.CharField(
        max_length=128, blank=True, db_index=True,
        help_text='Optional dimension within the category — e.g. layer name, '
                  'title-block field name ("scale", "drawn_by"), metadata key '
                  '("author"). Free-form; consumers filter on it.',
    )
    content = models.TextField(
        blank=True,
        help_text='Primary textual payload. Empty for purely structural '
                  'observations (e.g. "layer X exists") where the key is the '
                  'point.',
    )

    # Spatial location (where it lives in the source).
    page_index = models.IntegerField(
        null=True, blank=True,
        help_text='0-based page index when applicable.',
    )
    bbox = models.JSONField(
        default=dict, blank=True,
        help_text='{x_mm, y_mm, w_mm, h_mm} relative to sheet bottom-left, '
                  'when applicable.',
    )

    # Format-specific raw payload (full text block, layer attrs, annotation
    # dict, etc.). Consumers that want more than `content` read from here.
    raw_data = models.JSONField(default=dict, blank=True)

    extracted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'observations'
        ordering = ['source_file_id', 'sheet_id', 'page_index', 'category', 'key']
        indexes = [
            models.Index(fields=['source_file', 'category']),
            models.Index(fields=['source_file', 'sheet', 'category']),
            models.Index(fields=['extraction_run']),
        ]

    def __str__(self) -> str:
        label = self.key or (self.content[:40] if self.content else self.category)
        return f'{self.category}: {label}'
