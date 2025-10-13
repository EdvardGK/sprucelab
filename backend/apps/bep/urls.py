"""
URL configuration for BEP (BIM Execution Plan) API.

Available endpoints:
- /api/bep/ - BEP configurations (list, create, retrieve, update, delete)
- /api/bep/templates/ - List available BEP templates
- /api/bep/{id}/activate/ - Activate a BEP
- /api/bep/{id}/mmi-scale/ - Get MMI scale for BEP
- /api/bep/mmi-scale/ - MMI scale definitions CRUD
- /api/bep/technical/ - Technical requirements CRUD
- /api/bep/naming/ - Naming conventions CRUD
- /api/bep/property-sets/ - Required property sets CRUD
- /api/bep/validation/ - Validation rules CRUD
- /api/bep/milestones/ - Submission milestones CRUD
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    BEPConfigurationViewSet,
    MMIScaleDefinitionViewSet,
    TechnicalRequirementViewSet,
    NamingConventionViewSet,
    RequiredPropertySetViewSet,
    ValidationRuleViewSet,
    SubmissionMilestoneViewSet,
)

# Router for all BEP-related endpoints
router = DefaultRouter()
router.register(r'', BEPConfigurationViewSet, basename='bep')
router.register(r'mmi-scale', MMIScaleDefinitionViewSet, basename='mmi-scale')
router.register(r'technical', TechnicalRequirementViewSet, basename='technical')
router.register(r'naming', NamingConventionViewSet, basename='naming')
router.register(r'property-sets', RequiredPropertySetViewSet, basename='property-sets')
router.register(r'validation', ValidationRuleViewSet, basename='validation')
router.register(r'milestones', SubmissionMilestoneViewSet, basename='milestones')

urlpatterns = router.urls
