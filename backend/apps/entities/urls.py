from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProcessingReportViewSet, IFCEntityViewSet,
    NS3451CodeViewSet, IFCTypeViewSet, TypeMappingViewSet,
    TypeDefinitionLayerViewSet, MaterialViewSet, MaterialMappingViewSet
)

router = DefaultRouter()
router.register(r'processing-reports', ProcessingReportViewSet, basename='processing-report')
router.register(r'entities', IFCEntityViewSet, basename='entity')

# Warehouse routes
router.register(r'ns3451-codes', NS3451CodeViewSet, basename='ns3451-code')
router.register(r'types', IFCTypeViewSet, basename='ifc-type')
router.register(r'type-mappings', TypeMappingViewSet, basename='type-mapping')
router.register(r'type-definition-layers', TypeDefinitionLayerViewSet, basename='type-definition-layer')
router.register(r'materials', MaterialViewSet, basename='material')
router.register(r'material-mappings', MaterialMappingViewSet, basename='material-mapping')

urlpatterns = [
    path('', include(router.urls)),
]
