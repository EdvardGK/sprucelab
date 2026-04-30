"""
Document models (Phase 6): DocumentContent.

DocumentContent is one parsed body extracted from a document file: PDF/DOCX/
PPTX go to ``markdown_content``; XLSX/CSV go to ``structured_data`` as typed
JSON. PDFs that mix drawing pages and document pages route drawing pages to
the Phase 5 ``DrawingSheet`` table — only document pages land here.

This is Layer 2 (extracted data) for non-IFC documents. Phase 6 sprint 6.2
adds the ``Claim`` table on top so normative statements found in the markdown
can be promoted into ``ProjectConfig`` rules — that is where the strategic
"kill dead docs" payoff lands. Sprint 6.1 ships only this substrate.
"""
from __future__ import annotations

import uuid

from django.db import models


EXTRACTION_METHOD_CHOICES = [
    ('text_layer', 'PDF text layer'),
    ('ocr', 'OCR'),
    ('structured', 'Structured (DOCX/XLSX/PPTX)'),
    ('failed', 'Failed'),
]


class DocumentContent(models.Model):
    """
    One extracted document body. PDF / DOCX / PPTX produce markdown; XLSX /
    CSV produce typed JSON. Mixed-page PDFs produce one row per document page.

    A single DocumentContent always belongs to one SourceFile + one
    ExtractionRun. ``page_index`` is 0 for whole-file formats (DOCX, XLSX,
    PPTX) and the page number for per-page PDF extraction.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source_file = models.ForeignKey(
        'models.SourceFile',
        on_delete=models.CASCADE,
        related_name='document_contents',
    )
    extraction_run = models.ForeignKey(
        'models.ExtractionRun',
        on_delete=models.CASCADE,
        related_name='document_contents',
    )
    scope = models.ForeignKey(
        'projects.ProjectScope',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='document_contents',
    )

    page_index = models.IntegerField(
        default=0,
        help_text='0-based page index for per-page PDF extraction; 0 for whole-file formats',
    )

    markdown_content = models.TextField(
        blank=True,
        help_text='Unified markdown body for PDF/DOCX/PPTX',
    )
    structured_data = models.JSONField(
        default=dict, blank=True,
        help_text='Typed JSON for XLSX/CSV: {"sheets": [{"name", "columns", "rows", "types"}]}',
    )

    page_count = models.IntegerField(
        default=1,
        help_text='Total page/slide/sheet count in the source document',
    )
    structure = models.JSONField(
        default=dict, blank=True,
        help_text='Sections, headings, tables: {"headings": [...], "tables": [...]}',
    )
    extracted_images = models.JSONField(
        default=list, blank=True,
        help_text='List of {url?, page, description?} entries',
    )

    search_text = models.TextField(
        blank=True,
        help_text='Normalized text for full-text search (lowercased, whitespace-collapsed)',
    )

    extraction_method = models.CharField(
        max_length=20,
        choices=EXTRACTION_METHOD_CHOICES,
        default='structured',
        db_index=True,
    )

    class Meta:
        db_table = 'document_contents'
        ordering = ['source_file_id', 'page_index']
        constraints = [
            models.UniqueConstraint(
                fields=['source_file', 'extraction_run', 'page_index'],
                name='uniq_document_content_per_run_page',
            ),
        ]
        indexes = [
            models.Index(fields=['source_file', 'page_index']),
            models.Index(fields=['scope']),
            models.Index(fields=['extraction_method']),
        ]

    def __str__(self) -> str:
        return f'{self.source_file.original_filename} :: doc page {self.page_index}'
