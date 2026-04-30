from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .files_views import ExtractionRunViewSet, SourceFileViewSet

router = DefaultRouter()
router.register(r'extractions', ExtractionRunViewSet, basename='extraction-run')
router.register(r'', SourceFileViewSet, basename='source-file')

urlpatterns = [
    path('', include(router.urls)),
]
