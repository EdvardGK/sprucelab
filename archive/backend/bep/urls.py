"""
URL configuration for BEP (BIM Execution Plan) API.

Core BEP:
- /api/bep/configs/ - BEP configurations CRUD
- /api/bep/configs/templates/ - List available BEP templates
- /api/bep/configs/{id}/activate/ - Activate a BEP
- /api/bep/configs/{id}/mmi-scale/ - Get MMI scale for BEP
- /api/bep/mmi-scale/ - MMI scale definitions CRUD
- /api/bep/technical/ - Technical requirements CRUD
- /api/bep/naming/ - Naming conventions CRUD
- /api/bep/property-sets/ - Required property sets CRUD
- /api/bep/validation/ - Validation rules CRUD
- /api/bep/milestones/ - Submission milestones CRUD
- /api/bep/library/ - BEP template library
- /api/bep/disciplines/ - Project discipline assignments
- /api/bep/coordinates/ - Project coordinate systems
- /api/bep/storeys/ - Project storey structures

EIR / IDS / BEP Response:
- /api/bep/eir/ - Employer's Information Requirements CRUD
- /api/bep/eir/{id}/issue/ - Issue EIR
- /api/bep/eir/{id}/compliance/ - Compliance summary
- /api/bep/eir-requirements/ - EIR requirements CRUD
- /api/bep/ids/ - IDS specifications CRUD
- /api/bep/ids/{id}/validate/ - Trigger IDS validation
- /api/bep/responses/ - BEP responses CRUD
- /api/bep/responses/{id}/submit/ - Submit response
- /api/bep/responses/{id}/auto-populate/ - Auto-create response items
- /api/bep/response-items/ - BEP response items CRUD
- /api/bep/ids-runs/ - IDS validation runs (read-only)
"""
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
    EIRViewSet,
    EIRRequirementViewSet,
    IDSSpecificationViewSet,
    BEPResponseViewSet,
    BEPResponseItemViewSet,
    IDSValidationRunViewSet,
)

router = DefaultRouter()

# Core BEP
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

# EIR / IDS / BEP Response
router.register(r'eir', EIRViewSet, basename='eir')
router.register(r'eir-requirements', EIRRequirementViewSet, basename='eir-requirements')
router.register(r'ids', IDSSpecificationViewSet, basename='ids')
router.register(r'responses', BEPResponseViewSet, basename='bep-responses')
router.register(r'response-items', BEPResponseItemViewSet, basename='response-items')
router.register(r'ids-runs', IDSValidationRunViewSet, basename='ids-runs')

urlpatterns = router.urls
