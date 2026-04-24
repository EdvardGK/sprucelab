"""
URL configuration for BIM Coordinator Platform.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework import routers

from .views import current_user, health_check, update_profile

# API Router
router = routers.DefaultRouter()

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),
    path('api/health/', health_check, name='health-check'),
    path('api/me/', current_user, name='current-user'),
    path('api/me/profile/', update_profile, name='update-profile'),
    path('api/auth/me/', current_user, name='current-user-legacy'),
    path('api/projects/', include('apps.projects.urls')),
    path('api/models/', include('apps.models.urls')),
    path('api/types/', include('apps.entities.urls')),
    path('api/graph/', include('apps.graph.urls')),
    # path('api/bep/', include('apps.bep.urls')),  # Archived 2026-04
    path('api/viewers/', include('apps.viewers.urls')),
    path('api/', include('apps.scripting.urls')),
    path('api/automation/', include('apps.automation.urls')),
    path('api/field/', include('apps.field.urls')),
    path('api/admin/', include('apps.accounts.urls')),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
