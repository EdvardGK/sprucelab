from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProjectViewSet, ProjectConfigViewSet, ProjectScopeViewSet

router = DefaultRouter()
router.register(r'', ProjectViewSet, basename='project')

config_router = DefaultRouter()
config_router.register(r'', ProjectConfigViewSet, basename='project-config')

scope_router = DefaultRouter()
scope_router.register(r'', ProjectScopeViewSet, basename='project-scope')

urlpatterns = [
    # More-specific paths must come first — the empty-prefix DRF router
    # matches single-segment URLs as ProjectViewSet detail (pk=...) and
    # would otherwise swallow /api/projects/scopes/ etc.
    path('configs/', include(config_router.urls)),
    path('scopes/', include(scope_router.urls)),
    path('', include(router.urls)),
]
