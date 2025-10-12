from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import GraphViewSet

router = DefaultRouter()
router.register(r'', GraphViewSet, basename='graph')

urlpatterns = [
    path('', include(router.urls)),
]
