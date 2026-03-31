"""
URL configuration for BEP (BIM Execution Plan) API.

Available endpoints:
- /api/bep/configs/ - BEP configurations (list, create, retrieve, update, delete)
- /api/bep/configs/templates/ - List available BEP templates (action)
- /api/bep/configs/{id}/activate/ - Activate a BEP
- /api/bep/configs/{id}/mmi-scale/ - Get MMI scale for BEP
- /api/bep/mmi-scale/ - MMI scale definitions CRUD
- /api/bep/technical/ - Technical requirements CRUD
- /api/bep/naming/ - Naming conventions CRUD
- /api/bep/property-sets/ - Required property sets CRUD
- /api/bep/validation/ - Validation rules CRUD
- /api/bep/milestones/ - Submission milestones CRUD

NEW:
- /api/bep/library/ - BEP template library (global templates)
- /api/bep/disciplines/ - Project discipline assignments
- /api/bep/coordinates/ - Project coordinate systems
- /api/bep/storeys/ - Project storey structures
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    BEPTemplateViewSet,
    BEPConfigurationViewSet,
    MMIScaleDefinitionViewSet,
    TechnicalRequirementViewSet,
    NamingConventionViewSet,
    RequiredPropertySetViewSet,
    ValidationRuleViewSet,
    SubmissionMilestoneViewSet,
    ProjectDisciplineViewSet,
    ProjectCoordinatesViewSet,
    ProjectStoreyViewSet,
)

# Router for all BEP-related endpoints
router = DefaultRouter()
router.register(r'library', BEPTemplateViewSet, basename='bep-template')
router.register(r'configs', BEPConfigurationViewSet, basename='bep')
router.register(r'mmi-scale', MMIScaleDefinitionViewSet, basename='mmi-scale')
router.register(r'technical', TechnicalRequirementViewSet, basename='technical')
router.register(r'naming', NamingConventionViewSet, basename='naming')
router.register(r'property-sets', RequiredPropertySetViewSet, basename='property-sets')
router.register(r'validation', ValidationRuleViewSet, basename='validation')
router.register(r'milestones', SubmissionMilestoneViewSet, basename='milestones')
router.register(r'disciplines', ProjectDisciplineViewSet, basename='disciplines')
router.register(r'coordinates', ProjectCoordinatesViewSet, basename='coordinates')
router.register(r'storeys', ProjectStoreyViewSet, basename='storeys')

urlpatterns = router.urls
