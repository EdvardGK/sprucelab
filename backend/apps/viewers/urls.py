"""
URL configuration for 3D Viewer API.

Available endpoints:
- /api/viewer-groups/ - Viewer groups CRUD (organize models)
- /api/viewer-models/ - Model assignments CRUD (add models to groups)
- /api/viewer-models/{id}/coordinate/ - Update coordination data
- /api/viewer-models/batch-update/ - Batch update model assignments
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ViewerGroupViewSet,
    ViewerModelViewSet,
)

# Router for all viewer-related endpoints
router = DefaultRouter()
router.register(r'groups', ViewerGroupViewSet, basename='viewer-groups')
router.register(r'models', ViewerModelViewSet, basename='viewer-models')

urlpatterns = router.urls
