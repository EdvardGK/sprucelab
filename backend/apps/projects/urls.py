from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProjectViewSet, ProjectConfigViewSet

router = DefaultRouter()
router.register(r'', ProjectViewSet, basename='project')

config_router = DefaultRouter()
config_router.register(r'', ProjectConfigViewSet, basename='project-config')

urlpatterns = [
    path('', include(router.urls)),
    path('configs/', include(config_router.urls)),
]
