"""
Claim models (Phase 6, Sprint 6.2): Claim.

A Claim is a normative statement extracted from a document — "walls in fire
compartments shall be REI60", "minimum 7 L/s per person ventilation", etc.

Claims are the kill-dead-docs primitive: until a claim is decided, the source
document is competing with ProjectConfig for ownership of the rule. Once a
claim is *promoted* into ProjectConfig, the document is just a citation; if
it's *rejected*, the claim is deliberately ignored; if *superseded*, a newer
claim took over. This collapses the question "who owns this rule — the dead
PDF or the project config?" into an explicit, audit-able decision.

Promotion does NOT mutate the existing JSON config schema. It appends to a
``config['claim_derived_rules']`` array tagged with ``_claim_id`` so a JSON
consumer can cross-reference. The Claim itself is the authoritative source
of provenance via ``promoted_to_config`` + ``config_section`` + ``config_payload``.
"""
from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


CLAIM_TYPE_CHOICES = [
    ('rule', 'Rule (normative requirement)'),
    ('spec', 'Specification (concrete value)'),
    ('requirement', 'Requirement (general)'),
    ('constraint', 'Constraint (limit / threshold)'),
    ('fact', 'Fact (descriptive, non-normative)'),
]

CLAIM_STATUS_CHOICES = [
    ('unresolved', 'Unresolved (in inbox)'),
    ('promoted', 'Promoted to ProjectConfig'),
    ('rejected', 'Rejected (deliberately ignored)'),
    ('superseded', 'Superseded by a later claim'),
]


class Claim(models.Model):
    """
    A normative statement found in a document, awaiting decision.

    Confidence is a 0..1 score from the extractor. Heuristics produce high
    confidence (~0.85+); LLM-extracted claims (Sprint 6.3) get calibrated
    confidence with explicit uncertainty.

    Status workflow:
        unresolved → promoted     (POST /promote/)
        unresolved → rejected     (POST /reject/  with reason)
        unresolved → superseded   (POST /supersede/  with newer claim id)
        promoted   → (terminal — re-promotion creates a new claim entry)
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Provenance — every claim points back to the file and parsed body it came from.
    source_file = models.ForeignKey(
        'models.SourceFile',
        on_delete=models.CASCADE,
        related_name='claims',
    )
    document = models.ForeignKey(
        'entities.DocumentContent',
        null=True, blank=True,
        on_delete=models.CASCADE,
        related_name='claims',
        help_text='Parsed body the claim was extracted from. Null for IFC-derived claims (future).',
    )
    extraction_run = models.ForeignKey(
        'models.ExtractionRun',
        on_delete=models.CASCADE,
        related_name='claims',
    )
    scope = models.ForeignKey(
        'projects.ProjectScope',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='claims',
    )

    # Where in the source the claim came from.
    source_location = models.JSONField(
        default=dict, blank=True,
        help_text='{page, paragraph, char_start, char_end, bbox?}',
    )

    # The statement itself — verbatim text + normalized structured form.
    statement = models.TextField(
        help_text='Verbatim normative text as it appears in the document',
    )
    normalized = models.JSONField(
        default=dict, blank=True,
        help_text='Parsed structured form: {predicate, subject, value, units, lang}',
    )

    claim_type = models.CharField(
        max_length=20, choices=CLAIM_TYPE_CHOICES, default='rule', db_index=True,
    )
    confidence = models.FloatField(
        default=0.0,
        help_text='0..1 extractor confidence — heuristics ~0.85+, LLM calibrated',
    )

    # Decision state.
    status = models.CharField(
        max_length=20, choices=CLAIM_STATUS_CHOICES, default='unresolved', db_index=True,
    )
    promoted_to_config = models.ForeignKey(
        'projects.ProjectConfig',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='derived_from_claims',
        help_text='Which ProjectConfig the promotion wrote into',
    )
    config_section = models.CharField(
        max_length=100, blank=True,
        help_text="Which top-level config key was written (default 'claim_derived_rules')",
    )
    config_payload = models.JSONField(
        default=dict, blank=True,
        help_text='The exact rule dict written into ProjectConfig.config',
    )
    superseded_by = models.ForeignKey(
        'self',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='supersedes_set',
    )
    rejected_reason = models.TextField(blank=True)

    # Audit timestamps.
    extracted_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='decided_claims',
    )

    class Meta:
        db_table = 'claims'
        ordering = ['-extracted_at']
        indexes = [
            models.Index(fields=['source_file']),
            models.Index(fields=['document']),
            models.Index(fields=['status', 'claim_type']),
            models.Index(fields=['scope']),
        ]

    def __str__(self) -> str:
        snippet = (self.statement or '')[:80]
        return f'[{self.status}] {snippet}'
