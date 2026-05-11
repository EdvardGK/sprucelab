"""
ViewSets for the filters app.

Permission policy (locked from coordinator plan):
  - personal: only owner_user may CRUD; auth required.
  - company:  any user with company-admin role may CRUD; read for all members.
              The company-admin role / company-membership models are Phase 7
              (the org-model). Until then, we gate company-scope writes on
              `is_staff`. Reads of company filters are visible to any
              authenticated user (we have no per-company membership model
              yet — this is the most conservative default that doesn't
              invent a new role model).
  - project:  scope-lead OR is_staff may CRUD; read for all project members.
              Same caveat as company — there's no ProjectMember model yet,
              so reads fall back to "any authenticated user" and writes
              gate on `is_staff`.

TODO(Phase 7 / org-model): replace the is_staff gates below with the
company-admin role check and the project scope-lead check, and replace
the read-side fall-through with explicit per-company / per-project
membership filtering.
"""
from __future__ import annotations

import logging

from django.db import IntegrityError
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.entities.views.claims import _bool_param

from .models import (
    FilterAnnouncement,
    FilterAnnouncementAcknowledgement,
    FilterLibrary,
    FilterLibrarySubscription,
    PinnedFilter,
    SavedFilter,
    SCOPE_COMPANY,
    SCOPE_PERSONAL,
    SCOPE_PROJECT,
)
from .serializers import (
    FilterAnnouncementAcknowledgementSerializer,
    FilterAnnouncementSerializer,
    FilterLibrarySerializer,
    FilterLibrarySubscriptionSerializer,
    PinnedFilterSerializer,
    SavedFilterListSerializer,
    SavedFilterSerializer,
)


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Permission helpers
# ---------------------------------------------------------------------------

def _is_company_admin(user) -> bool:
    """
    True iff `user` may write company-scope filters.

    TODO(Phase 7): replace with explicit company-admin role check once the
    org-model lands. Today, gate on is_staff (deny by default).
    """
    return bool(user and user.is_authenticated and user.is_staff)


def _is_scope_lead(user, project) -> bool:
    """
    True iff `user` may write project-scope filters for `project`.

    TODO(Phase 7): replace with project scope-lead role check once project
    membership / role models land. Today, gate on is_staff (deny by default).
    The `project` arg is accepted now so the call sites already pass it.
    """
    _ = project  # reserved for future per-project role checks
    return bool(user and user.is_authenticated and user.is_staff)


def _can_write_saved_filter(user, instance: SavedFilter) -> bool:
    """Scope-aware write gate for an existing SavedFilter."""
    if not (user and user.is_authenticated):
        return False
    if instance.scope == SCOPE_PERSONAL:
        return instance.owner_user_id == user.id
    if instance.scope == SCOPE_COMPANY:
        return _is_company_admin(user)
    if instance.scope == SCOPE_PROJECT:
        return _is_scope_lead(user, instance.owner_project)
    return False


def _can_write_filter_library(user, instance: FilterLibrary) -> bool:
    if not (user and user.is_authenticated):
        return False
    if instance.scope == SCOPE_PERSONAL:
        return instance.owner_user_id == user.id
    if instance.scope == SCOPE_COMPANY:
        return _is_company_admin(user)
    if instance.scope == SCOPE_PROJECT:
        return _is_scope_lead(user, instance.owner_project)
    return False


def _visible_savedfilter_q(user):
    """
    Q expression for SavedFilters `user` may see:
      personal -> only their own
      company / project -> any authenticated user (until membership models
                           land; see module docstring)
    """
    from django.db.models import Q
    return (
        (Q(scope=SCOPE_PERSONAL) & Q(owner_user=user))
        | Q(scope=SCOPE_COMPANY)
        | Q(scope=SCOPE_PROJECT)
    )


def _filter_visible_savedfilters(qs, user):
    """Restrict a SavedFilter queryset to rows `user` may see."""
    if not (user and user.is_authenticated):
        return qs.none()
    return qs.filter(_visible_savedfilter_q(user))


# ---------------------------------------------------------------------------
# Authenticated-only base permission
# ---------------------------------------------------------------------------

class IsAuthenticated(permissions.BasePermission):
    """All filter endpoints require an authenticated user."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)


# ---------------------------------------------------------------------------
# SavedFilter
# ---------------------------------------------------------------------------

class SavedFilterViewSet(viewsets.ModelViewSet):
    """
    /api/filters/saved/

    List is scope-filtered to what `request.user` may see. Create / update /
    delete are gated by scope (see _can_write_saved_filter).
    """
    queryset = SavedFilter.objects.all()
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'list':
            return SavedFilterListSerializer
        return SavedFilterSerializer

    def get_queryset(self):
        return _filter_visible_savedfilters(SavedFilter.objects.all(), self.request.user)

    def _gate_create(self, serializer):
        """
        Run scope-based permission gating + normalize validated_data.

        Shared between the persist path (``perform_create``) and the dry-run
        path so a preview that *would* be rejected at write time also gets
        rejected before reporting "would_create" — agents shouldn't see a
        green preview followed by a 403 on the real call.
        """
        scope = serializer.validated_data.get('scope')
        user = self.request.user
        owner_user = serializer.validated_data.get('owner_user')
        owner_project = serializer.validated_data.get('owner_project')

        if scope == SCOPE_PERSONAL:
            # Force owner_user to the requester — clients can't impersonate.
            if owner_user is not None and owner_user != user:
                raise PermissionDenied('owner_user must match the requesting user for personal scope.')
            serializer.validated_data['owner_user'] = user
        elif scope == SCOPE_COMPANY:
            if not _is_company_admin(user):
                raise PermissionDenied('Only company admins may create company-scope filters.')
        elif scope == SCOPE_PROJECT:
            if not _is_scope_lead(user, owner_project):
                raise PermissionDenied('Only scope leads or staff may create project-scope filters.')
        else:
            raise ValidationError({'scope': 'Unknown scope.'})

    def perform_create(self, serializer):
        self._gate_create(serializer)
        try:
            serializer.save(created_by=self.request.user)
        except IntegrityError as e:
            raise ValidationError({'detail': str(e)})

    def create(self, request, *args, **kwargs):
        """
        Create a SavedFilter. Supports ``?dry_run=true`` so agents can
        plan-then-execute filter registration.

        Dry-run validates the payload through the standard serializer
        (returning 400 with the same field-error shape on bad input), runs
        scope-based permission gating (so a preview that would be rejected
        at write time is rejected here too), then returns the would-be
        representation without persisting.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        dry_run = _bool_param(request.query_params.get('dry_run'))
        if dry_run:
            # Gate first — agents shouldn't see a green preview followed by
            # a real 403. _gate_create also normalizes owner_user for
            # personal scope so the preview matches what would actually
            # be saved.
            self._gate_create(serializer)
            preview = {}
            for field_name, value in serializer.validated_data.items():
                preview[field_name] = str(value.pk) if hasattr(value, 'pk') else value
            logger.info(
                'saved_filter.create dry_run',
                extra={
                    'scope': preview.get('scope'),
                    'filter_name': preview.get('name'),
                    'owner_project': preview.get('owner_project'),
                },
            )
            return Response(
                {
                    'dry_run': True,
                    'would_create': preview,
                },
                status=status.HTTP_200_OK,
            )
        self.perform_create(serializer)
        logger.info(
            'saved_filter.create persisted',
            extra={
                'saved_filter_id': str(serializer.instance.id),
                'scope': serializer.instance.scope,
            },
        )
        headers = self.get_success_headers(serializer.data)
        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED,
            headers=headers,
        )

    def perform_update(self, serializer):
        if not _can_write_saved_filter(self.request.user, serializer.instance):
            raise PermissionDenied('You may not modify this filter.')
        try:
            serializer.save()
        except IntegrityError as e:
            raise ValidationError({'detail': str(e)})

    def _dry_run_update(self, request, partial: bool):
        """
        Shared plan-then-execute path for PUT/PATCH on a SavedFilter.

        Validates the incoming payload through the standard serializer (so
        invalid input still returns 400 with the usual field-error shape),
        runs the same scope-based write gate as the persist path, then
        either persists or returns a preview with ``dry_run: true``.
        """
        instance = self.get_object()
        # Write-gate parity with perform_update — a preview that would be
        # rejected at write time gets rejected here too.
        if not _can_write_saved_filter(self.request.user, instance):
            raise PermissionDenied('You may not modify this filter.')
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        dry_run = _bool_param(request.query_params.get('dry_run'))
        if dry_run:
            preview = dict(serializer.validated_data)
            for field_name, value in list(preview.items()):
                if hasattr(value, 'pk'):
                    preview[field_name] = str(value.pk)
            logger.info(
                'saved_filter.partial_update dry_run',
                extra={'saved_filter_id': str(instance.id), 'fields': sorted(preview.keys())},
            )
            return Response({
                'dry_run': True,
                'id': str(instance.id),
                'would_update': preview,
            })
        self.perform_update(serializer)
        logger.info(
            'saved_filter.partial_update persisted',
            extra={'saved_filter_id': str(instance.id), 'fields': sorted(serializer.validated_data.keys())},
        )
        return Response(serializer.data)

    def update(self, request, *args, **kwargs):
        """PUT on /api/filters/saved/{id}/. Supports ?dry_run=true."""
        return self._dry_run_update(request, partial=False)

    def partial_update(self, request, *args, **kwargs):
        """PATCH on /api/filters/saved/{id}/. Supports ?dry_run=true.

        Agents can preview name / description / payload edits before
        committing. Invalid input returns 400 with the standard
        field-error shape.
        """
        return self._dry_run_update(request, partial=True)

    def perform_destroy(self, instance):
        if not _can_write_saved_filter(self.request.user, instance):
            raise PermissionDenied('You may not delete this filter.')
        instance.delete()


# ---------------------------------------------------------------------------
# FilterLibrary
# ---------------------------------------------------------------------------

class FilterLibraryViewSet(viewsets.ModelViewSet):
    """
    /api/filters/libraries/

    Custom action `mark_seen` bumps the requesting user's subscription's
    `last_seen_version` to match the library's current version.
    """
    queryset = FilterLibrary.objects.all()
    serializer_class = FilterLibrarySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        from django.db.models import Q
        user = self.request.user
        if not (user and user.is_authenticated):
            return FilterLibrary.objects.none()
        return FilterLibrary.objects.filter(
            (Q(scope=SCOPE_PERSONAL) & Q(owner_user=user))
            | Q(scope=SCOPE_COMPANY)
            | Q(scope=SCOPE_PROJECT)
        )

    def perform_create(self, serializer):
        scope = serializer.validated_data.get('scope')
        user = self.request.user
        owner_user = serializer.validated_data.get('owner_user')
        owner_project = serializer.validated_data.get('owner_project')

        if scope == SCOPE_PERSONAL:
            if owner_user is not None and owner_user != user:
                raise PermissionDenied('owner_user must match the requesting user for personal scope.')
            serializer.validated_data['owner_user'] = user
        elif scope == SCOPE_COMPANY:
            if not _is_company_admin(user):
                raise PermissionDenied('Only company admins may create company-scope libraries.')
        elif scope == SCOPE_PROJECT:
            if not _is_scope_lead(user, owner_project):
                raise PermissionDenied('Only scope leads or staff may create project-scope libraries.')
        else:
            raise ValidationError({'scope': 'Unknown scope.'})

        try:
            serializer.save(created_by=user)
        except IntegrityError as e:
            raise ValidationError({'detail': str(e)})

    def perform_update(self, serializer):
        if not _can_write_filter_library(self.request.user, serializer.instance):
            raise PermissionDenied('You may not modify this library.')
        try:
            serializer.save()
        except IntegrityError as e:
            raise ValidationError({'detail': str(e)})

    def perform_destroy(self, instance):
        if not _can_write_filter_library(self.request.user, instance):
            raise PermissionDenied('You may not delete this library.')
        instance.delete()

    @action(detail=True, methods=['post'], url_path='mark-seen')
    def mark_seen(self, request, pk=None):
        """
        Bump the requesting user's subscription `last_seen_version` to the
        library's current version. Creates the subscription on first call.
        """
        library = self.get_object()
        user = request.user
        sub, _created = FilterLibrarySubscription.objects.update_or_create(
            library=library,
            subscriber_user=user,
            defaults={'last_seen_version': library.version},
        )
        return Response(FilterLibrarySubscriptionSerializer(sub).data)


# ---------------------------------------------------------------------------
# PinnedFilter
# ---------------------------------------------------------------------------

class PinnedFilterViewSet(viewsets.ModelViewSet):
    """
    /api/filters/pinned/

    A pin is always owned by request.user — list returns only their pins,
    create / update / delete enforce that.
    """
    queryset = PinnedFilter.objects.all()
    serializer_class = PinnedFilterSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not (user and user.is_authenticated):
            return PinnedFilter.objects.none()
        return PinnedFilter.objects.filter(user=user)

    def perform_create(self, serializer):
        user = self.request.user
        sf = serializer.validated_data.get('saved_filter')
        # Can only pin a filter the user can see.
        visible = _filter_visible_savedfilters(SavedFilter.objects.all(), user)
        if sf is not None and not visible.filter(pk=sf.pk).exists():
            raise PermissionDenied('You may not pin a filter you cannot see.')
        try:
            serializer.save(user=user)
        except IntegrityError as e:
            raise ValidationError({'detail': str(e)})

    def perform_update(self, serializer):
        if serializer.instance.user_id != self.request.user.id:
            raise PermissionDenied('You may not modify another user\'s pin.')
        try:
            serializer.save()
        except IntegrityError as e:
            raise ValidationError({'detail': str(e)})

    def perform_destroy(self, instance):
        if instance.user_id != self.request.user.id:
            raise PermissionDenied('You may not delete another user\'s pin.')
        instance.delete()


# ---------------------------------------------------------------------------
# FilterAnnouncement
# ---------------------------------------------------------------------------

class FilterAnnouncementViewSet(viewsets.ModelViewSet):
    """
    /api/filters/announcements/

    Read: any authenticated user can see announcements for filters/libraries
    they can see. Write: gated by the underlying filter / library's scope
    write gate.

    Custom action `acknowledge` (POST detail=True) records that
    request.user has dismissed the announcement.
    """
    queryset = FilterAnnouncement.objects.all()
    serializer_class = FilterAnnouncementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        from django.db.models import Q
        user = self.request.user
        if not (user and user.is_authenticated):
            return FilterAnnouncement.objects.none()
        # Visible if attached to a SavedFilter or FilterLibrary the user can see.
        visible_sf = _filter_visible_savedfilters(SavedFilter.objects.all(), user).values('pk')
        return FilterAnnouncement.objects.filter(
            Q(saved_filter__in=visible_sf) | Q(library__isnull=False)
        )

    def _can_write(self, instance: FilterAnnouncement) -> bool:
        user = self.request.user
        if instance.saved_filter_id:
            return _can_write_saved_filter(user, instance.saved_filter)
        if instance.library_id:
            return _can_write_filter_library(user, instance.library)
        return False

    def perform_create(self, serializer):
        user = self.request.user
        sf = serializer.validated_data.get('saved_filter')
        lib = serializer.validated_data.get('library')
        if sf is not None and not _can_write_saved_filter(user, sf):
            raise PermissionDenied('You may not announce on this filter.')
        if lib is not None and not _can_write_filter_library(user, lib):
            raise PermissionDenied('You may not announce on this library.')
        try:
            serializer.save(created_by=user)
        except IntegrityError as e:
            raise ValidationError({'detail': str(e)})

    def perform_update(self, serializer):
        if not self._can_write(serializer.instance):
            raise PermissionDenied('You may not modify this announcement.')
        try:
            serializer.save()
        except IntegrityError as e:
            raise ValidationError({'detail': str(e)})

    def perform_destroy(self, instance):
        if not self._can_write(instance):
            raise PermissionDenied('You may not delete this announcement.')
        instance.delete()

    @action(detail=True, methods=['post'], url_path='acknowledge')
    def acknowledge(self, request, pk=None):
        """
        Idempotent: a second POST returns the existing acknowledgement
        with HTTP 200 (no 409 — match the update_or_create pattern used
        for FilterLibrary.mark_seen above).
        """
        announcement = self.get_object()
        ack, created = FilterAnnouncementAcknowledgement.objects.get_or_create(
            announcement=announcement,
            user=request.user,
        )
        serializer = FilterAnnouncementAcknowledgementSerializer(ack)
        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
