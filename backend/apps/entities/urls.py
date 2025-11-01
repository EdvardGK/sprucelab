from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProcessingReportViewSet

router = DefaultRouter()
router.register(r'processing-reports', ProcessingReportViewSet, basename='processing-report')

urlpatterns = [
    path('', include(router.urls)),
]
