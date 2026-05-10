from django.contrib import admin

from .models import (
    FilterAnnouncement,
    FilterAnnouncementAcknowledgement,
    FilterLibrary,
    FilterLibraryEntry,
    FilterLibrarySubscription,
    PinnedFilter,
    SavedFilter,
)


@admin.register(SavedFilter)
class SavedFilterAdmin(admin.ModelAdmin):
    list_display = ('name', 'scope', 'owner_user', 'owner_company', 'owner_project',
                    'is_auto_derived', 'updated_at')
    list_filter = ('scope', 'is_auto_derived')
    search_fields = ('name', 'description', 'owner_company')
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(FilterLibrary)
class FilterLibraryAdmin(admin.ModelAdmin):
    list_display = ('name', 'scope', 'version', 'owner_user', 'owner_company',
                    'owner_project', 'updated_at')
    list_filter = ('scope',)
    search_fields = ('name', 'description', 'owner_company')
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(FilterLibraryEntry)
class FilterLibraryEntryAdmin(admin.ModelAdmin):
    list_display = ('library', 'saved_filter', 'position', 'added_at')
    list_filter = ('library',)
    readonly_fields = ('id', 'added_at')


@admin.register(FilterLibrarySubscription)
class FilterLibrarySubscriptionAdmin(admin.ModelAdmin):
    list_display = ('library', 'subscriber_user', 'subscriber_project',
                    'last_seen_version', 'updated_at')
    list_filter = ('library',)
    readonly_fields = ('id', 'subscribed_at', 'updated_at')


@admin.register(PinnedFilter)
class PinnedFilterAdmin(admin.ModelAdmin):
    list_display = ('user', 'saved_filter', 'position', 'pinned_at')
    list_filter = ('user',)
    readonly_fields = ('id', 'pinned_at')


@admin.register(FilterAnnouncement)
class FilterAnnouncementAdmin(admin.ModelAdmin):
    list_display = ('title', 'saved_filter', 'library', 'created_by',
                    'created_at', 'expires_at')
    search_fields = ('title', 'body')
    readonly_fields = ('id', 'created_at')


@admin.register(FilterAnnouncementAcknowledgement)
class FilterAnnouncementAcknowledgementAdmin(admin.ModelAdmin):
    list_display = ('announcement', 'user', 'acknowledged_at')
    list_filter = ('announcement',)
    readonly_fields = ('id', 'acknowledged_at')
