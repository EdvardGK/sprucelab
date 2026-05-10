"""
SavedFilter primitive — platform-wide saved/curated/pinned filter contexts.

Three scopes:
  - personal: owned by a single user
  - company:  owned by a company / org (org model is Phase 7; for now we
              persist a free-text owner_company string and gate by is_staff
              with a TODO to swap in the real FK + role check)
  - project:  owned by a project; gated by is_staff today, scope-lead later

Payload is the serialized FilterContext shape produced by the frontend
`?d=` URL hook. We do not validate the schema here — frontend owns it.

See `~/.claude/plans/i-think-we-have-quizzical-wilkinson.md` lines 220-239
for the PR 1.4 scope spec.
"""
from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


SCOPE_PERSONAL = 'personal'
SCOPE_COMPANY = 'company'
SCOPE_PROJECT = 'project'

SCOPE_CHOICES = [
    (SCOPE_PERSONAL, 'Personal'),
    (SCOPE_COMPANY, 'Company'),
    (SCOPE_PROJECT, 'Project'),
]


def _scope_owner_constraint(model_label: str) -> models.CheckConstraint:
    """
    DB-level guarantee that exactly one of owner_user / owner_company /
    owner_project is set, AND that the chosen owner matches `scope`.

    Encoded as a single CheckConstraint per host model. The three branches
    are mutually exclusive and exhaustive over the legal scope values.
    """
    return models.CheckConstraint(
        name=f'{model_label}_scope_matches_owner',
        check=(
            (
                models.Q(scope=SCOPE_PERSONAL)
                & models.Q(owner_user__isnull=False)
                & models.Q(owner_company__exact='')
                & models.Q(owner_project__isnull=True)
            )
            | (
                models.Q(scope=SCOPE_COMPANY)
                & models.Q(owner_user__isnull=True)
                & ~models.Q(owner_company__exact='')
                & models.Q(owner_project__isnull=True)
            )
            | (
                models.Q(scope=SCOPE_PROJECT)
                & models.Q(owner_user__isnull=True)
                & models.Q(owner_company__exact='')
                & models.Q(owner_project__isnull=False)
            )
        ),
    )


class SavedFilter(models.Model):
    """
    A serialized FilterContext the user named and saved. The payload is the
    exact `?d=` URL state from the frontend; we persist it opaquely so the
    frontend can evolve the schema without backend migrations.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    scope = models.CharField(max_length=16, choices=SCOPE_CHOICES, db_index=True)

    owner_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='owned_saved_filters',
        help_text='Set when scope=personal.',
    )
    # TODO: replace with FK to accounts.Company once the org-model lands (Phase 7).
    owner_company = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text='Company identifier (free-text placeholder until org-model lands). Set when scope=company.',
    )
    owner_project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='saved_filters',
        help_text='Set when scope=project.',
    )

    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, default='')
    payload = models.JSONField(
        help_text='Serialized FilterContext (frontend ?d= URL state). Schema not validated here.',
    )
    is_auto_derived = models.BooleanField(
        default=False,
        help_text='True for system-derived filters (e.g. EIR/BEP auto-gen). No logic this PR.',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_saved_filters',
    )

    class Meta:
        db_table = 'filters_savedfilter'
        ordering = ['-updated_at']
        constraints = [_scope_owner_constraint('savedfilter')]
        indexes = [
            models.Index(fields=['scope', 'owner_user']),
            models.Index(fields=['scope', 'owner_project']),
        ]

    def __str__(self) -> str:
        return f'{self.name} ({self.scope})'


class FilterLibrary(models.Model):
    """
    A curated bundle of SavedFilters, versioned. Same three-scope model as
    SavedFilter. Members travel through `FilterLibraryEntry` so we can
    persist explicit ordering.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    scope = models.CharField(max_length=16, choices=SCOPE_CHOICES, db_index=True)

    owner_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='owned_filter_libraries',
    )
    # TODO: replace with FK to accounts.Company once the org-model lands (Phase 7).
    owner_company = models.CharField(
        max_length=255,
        blank=True,
        default='',
    )
    owner_project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='filter_libraries',
    )

    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, default='')
    version = models.PositiveIntegerField(default=1)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_filter_libraries',
    )

    entries = models.ManyToManyField(
        SavedFilter,
        through='FilterLibraryEntry',
        related_name='libraries',
        blank=True,
    )

    class Meta:
        db_table = 'filters_filterlibrary'
        ordering = ['-updated_at']
        constraints = [_scope_owner_constraint('filterlibrary')]

    def __str__(self) -> str:
        return f'{self.name} v{self.version} ({self.scope})'


class FilterLibraryEntry(models.Model):
    """Through-model for FilterLibrary <-> SavedFilter, carrying ordering."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    library = models.ForeignKey(
        FilterLibrary,
        on_delete=models.CASCADE,
        related_name='library_entries',
    )
    saved_filter = models.ForeignKey(
        SavedFilter,
        on_delete=models.CASCADE,
        related_name='library_memberships',
    )
    position = models.PositiveIntegerField(default=0)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'filters_filterlibraryentry'
        ordering = ['library', 'position']
        unique_together = [('library', 'saved_filter')]

    def __str__(self) -> str:
        return f'{self.library_id}#{self.position} -> {self.saved_filter_id}'


class FilterLibrarySubscription(models.Model):
    """
    A user's or project's subscription to a library. Tracks the last library
    version the subscriber has seen so we can flag "library updated" badges.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    library = models.ForeignKey(
        FilterLibrary,
        on_delete=models.CASCADE,
        related_name='subscriptions',
    )

    subscriber_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='filter_library_subscriptions',
    )
    subscriber_project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='filter_library_subscriptions',
    )

    last_seen_version = models.PositiveIntegerField(default=0)
    subscribed_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'filters_filterlibrarysubscription'
        ordering = ['-updated_at']
        constraints = [
            models.CheckConstraint(
                name='filterlibrarysubscription_one_subscriber',
                check=(
                    (
                        models.Q(subscriber_user__isnull=False)
                        & models.Q(subscriber_project__isnull=True)
                    )
                    | (
                        models.Q(subscriber_user__isnull=True)
                        & models.Q(subscriber_project__isnull=False)
                    )
                ),
            ),
            models.UniqueConstraint(
                fields=['library', 'subscriber_user'],
                condition=models.Q(subscriber_user__isnull=False),
                name='filterlibrarysubscription_unique_user',
            ),
            models.UniqueConstraint(
                fields=['library', 'subscriber_project'],
                condition=models.Q(subscriber_project__isnull=False),
                name='filterlibrarysubscription_unique_project',
            ),
        ]

    def __str__(self) -> str:
        target = self.subscriber_user_id or self.subscriber_project_id
        return f'sub {self.library_id} -> {target} (last_seen={self.last_seen_version})'


class PinnedFilter(models.Model):
    """A SavedFilter the user has pinned to their toolbar."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='pinned_filters',
    )
    saved_filter = models.ForeignKey(
        SavedFilter,
        on_delete=models.CASCADE,
        related_name='pins',
    )
    position = models.PositiveIntegerField(default=0)
    pinned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'filters_pinnedfilter'
        ordering = ['user', 'position']
        unique_together = [('user', 'saved_filter')]

    def __str__(self) -> str:
        return f'{self.user_id} pin#{self.position} -> {self.saved_filter_id}'


class FilterAnnouncement(models.Model):
    """
    A one-off announcement attached to a SavedFilter or a FilterLibrary.
    Exactly one of `saved_filter` / `library` must be set.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    saved_filter = models.ForeignKey(
        SavedFilter,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='announcements',
    )
    library = models.ForeignKey(
        FilterLibrary,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='announcements',
    )

    title = models.CharField(max_length=200)
    body = models.TextField(blank=True, default='')

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_filter_announcements',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'filters_filterannouncement'
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(
                name='filterannouncement_one_target',
                check=(
                    (
                        models.Q(saved_filter__isnull=False)
                        & models.Q(library__isnull=True)
                    )
                    | (
                        models.Q(saved_filter__isnull=True)
                        & models.Q(library__isnull=False)
                    )
                ),
            ),
        ]

    def __str__(self) -> str:
        return f'announce: {self.title}'


class FilterAnnouncementAcknowledgement(models.Model):
    """A user has dismissed (acknowledged) a FilterAnnouncement."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    announcement = models.ForeignKey(
        FilterAnnouncement,
        on_delete=models.CASCADE,
        related_name='acknowledgements',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='filter_announcement_acks',
    )
    acknowledged_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'filters_filterannouncementack'
        ordering = ['-acknowledged_at']
        unique_together = [('announcement', 'user')]

    def __str__(self) -> str:
        return f'ack {self.announcement_id} by {self.user_id}'
