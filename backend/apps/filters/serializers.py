"""Serializers for the filters app."""
from __future__ import annotations

from rest_framework import serializers

from .models import (
    FilterAnnouncement,
    FilterAnnouncementAcknowledgement,
    FilterLibrary,
    FilterLibraryEntry,
    FilterLibrarySubscription,
    PinnedFilter,
    SavedFilter,
)


class SavedFilterSerializer(serializers.ModelSerializer):
    """Full SavedFilter serializer (CRUD shape)."""

    class Meta:
        model = SavedFilter
        fields = [
            'id',
            'scope',
            'owner_user',
            'owner_company',
            'owner_project',
            'name',
            'description',
            'payload',
            'is_auto_derived',
            'created_at',
            'updated_at',
            'created_by',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']


class SavedFilterListSerializer(serializers.ModelSerializer):
    """Lightweight SavedFilter for list views — omits payload + description."""

    class Meta:
        model = SavedFilter
        fields = [
            'id',
            'scope',
            'owner_user',
            'owner_company',
            'owner_project',
            'name',
            'is_auto_derived',
            'updated_at',
        ]
        read_only_fields = fields


class FilterLibraryEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = FilterLibraryEntry
        fields = ['id', 'library', 'saved_filter', 'position', 'added_at']
        read_only_fields = ['id', 'added_at']


class FilterLibrarySerializer(serializers.ModelSerializer):
    entry_count = serializers.SerializerMethodField()

    class Meta:
        model = FilterLibrary
        fields = [
            'id',
            'scope',
            'owner_user',
            'owner_company',
            'owner_project',
            'name',
            'description',
            'version',
            'entry_count',
            'created_at',
            'updated_at',
            'created_by',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by', 'entry_count']

    def get_entry_count(self, obj: FilterLibrary) -> int:
        return obj.library_entries.count()


class FilterLibrarySubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = FilterLibrarySubscription
        fields = [
            'id',
            'library',
            'subscriber_user',
            'subscriber_project',
            'last_seen_version',
            'subscribed_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'subscribed_at', 'updated_at']


class PinnedFilterSerializer(serializers.ModelSerializer):
    class Meta:
        model = PinnedFilter
        fields = ['id', 'user', 'saved_filter', 'position', 'pinned_at']
        # `user` is set automatically from request.user in perform_create —
        # clients may not pin on someone else's behalf.
        read_only_fields = ['id', 'user', 'pinned_at']


class FilterAnnouncementSerializer(serializers.ModelSerializer):
    class Meta:
        model = FilterAnnouncement
        fields = [
            'id',
            'saved_filter',
            'library',
            'title',
            'body',
            'created_by',
            'created_at',
            'expires_at',
        ]
        read_only_fields = ['id', 'created_at', 'created_by']

    def validate(self, attrs):
        saved_filter = attrs.get('saved_filter') or getattr(self.instance, 'saved_filter', None)
        library = attrs.get('library') or getattr(self.instance, 'library', None)
        if bool(saved_filter) == bool(library):
            raise serializers.ValidationError(
                'Exactly one of saved_filter or library must be set.'
            )
        return attrs


class FilterAnnouncementAcknowledgementSerializer(serializers.ModelSerializer):
    class Meta:
        model = FilterAnnouncementAcknowledgement
        fields = ['id', 'announcement', 'user', 'acknowledged_at']
        read_only_fields = ['id', 'acknowledged_at']
