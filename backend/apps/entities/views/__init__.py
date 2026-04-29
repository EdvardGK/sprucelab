"""
Views package for the entities app.

Re-exports all ViewSets so that urls.py can continue to use:
    from .views import IFCEntityViewSet, ...
"""
from .legacy import IFCEntityViewSet
from .classification import NS3451CodeViewSet, SemanticTypeViewSet
from .types import IFCTypeViewSet, TypeMappingViewSet, TypeDefinitionLayerViewSet
from .materials import MaterialViewSet, MaterialMappingViewSet
from .typebank import TypeBankEntryViewSet, TypeBankObservationViewSet, TypeBankAliasViewSet
from .library import (
    MaterialLibraryViewSet, ProductLibraryViewSet, ProductCompositionViewSet,
    GlobalTypeLibraryViewSet,
)
from .analysis import ModelAnalysisViewSet
from .drawings import DrawingSheetViewSet, TitleBlockTemplateViewSet

__all__ = [
    'IFCEntityViewSet',
    'NS3451CodeViewSet',
    'SemanticTypeViewSet',
    'IFCTypeViewSet',
    'TypeMappingViewSet',
    'TypeDefinitionLayerViewSet',
    'MaterialViewSet',
    'MaterialMappingViewSet',
    'TypeBankEntryViewSet',
    'TypeBankObservationViewSet',
    'TypeBankAliasViewSet',
    'MaterialLibraryViewSet',
    'ProductLibraryViewSet',
    'ProductCompositionViewSet',
    'GlobalTypeLibraryViewSet',
    'ModelAnalysisViewSet',
]
