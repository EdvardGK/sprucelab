"""
URL configuration for Field & Compliance API.

- /api/field/templates/          - Checklist templates CRUD
- /api/field/template-items/     - Template items CRUD
- /api/field/checklists/         - Checklist instances CRUD
- /api/field/checklists/instantiate/ - Create from template
- /api/field/items/              - Check items CRUD
- /api/field/items/{id}/record/  - Record worker input
- /api/field/items/{id}/deviate/ - Record deviation
- /api/field/items/{id}/resolve/ - Resolve deviation
"""
from rest_framework.routers import DefaultRouter
from .views import (
    ChecklistTemplateViewSet,
    ChecklistTemplateItemViewSet,
    ChecklistViewSet,
    CheckItemViewSet,
)

router = DefaultRouter()
router.register(r'templates', ChecklistTemplateViewSet, basename='field-templates')
router.register(r'template-items', ChecklistTemplateItemViewSet, basename='field-template-items')
router.register(r'checklists', ChecklistViewSet, basename='field-checklists')
router.register(r'items', CheckItemViewSet, basename='field-items')

urlpatterns = router.urls
