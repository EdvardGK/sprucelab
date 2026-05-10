from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    FilterAnnouncementViewSet,
    FilterLibraryViewSet,
    PinnedFilterViewSet,
    SavedFilterViewSet,
)


router = DefaultRouter()
router.register(r'saved', SavedFilterViewSet, basename='saved-filter')
router.register(r'libraries', FilterLibraryViewSet, basename='filter-library')
router.register(r'pinned', PinnedFilterViewSet, basename='pinned-filter')
router.register(r'announcements', FilterAnnouncementViewSet, basename='filter-announcement')


urlpatterns = [
    path('', include(router.urls)),
]
