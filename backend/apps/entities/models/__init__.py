"""
Entities models package.

Re-exports all models so existing imports like
`from apps.entities.models import IFCType` continue to work.
"""

# Core models
from .core import (
    IFCEntity,
    SpatialHierarchy,
    PropertySet,
    System,
    SystemMembership,
    Material,
    MaterialAssignment,
    IFCType,
    TypeAssignment,
)

# Classification models
from .classification import (
    NS3451Code,
    NS3451OwnershipMatrix,
    SemanticType,
    SemanticTypeIFCMapping,
)

# Library models
from .library import (
    REUSED_STATUS_CHOICES,
    MATERIAL_CATEGORY_CHOICES,
    MATERIAL_UNIT_CHOICES,
    EPD_SOURCE_CHOICES,
    EPD_TARGET_TYPE_CHOICES,
    MaterialLibrary,
    ProductLibrary,
    ProductComposition,
    EPDLibrary,
    EPDMapping,
    IFCMaterialNormalization,
)

# Type mapping models
from .typemapping import (
    TypeMapping,
    TypeDefinitionLayer,
    MaterialMapping,
)

# TypeBank models
from .typebank import (
    TypeBankEntry,
    TypeBankObservation,
    TypeBankAlias,
    TypeBankScope,
)

# Reporting and analysis models
from .reporting import (
    IFCValidationReport,
    GraphEdge,
    RoomAssignment,
    ModelAnalysis,
    AnalysisStorey,
    AnalysisType,
    AnalysisTypeStorey,
)

# Drawing models (Phase 5)
from .drawings import (
    DrawingSheet,
    TitleBlockTemplate,
    DrawingRegistration,
)

# Document models (Phase 6)
from .documents import (
    DocumentContent,
    EXTRACTION_METHOD_CHOICES,
)

# Claim models (Phase 6, Sprint 6.2)
from .claims import (
    Claim,
    CLAIM_TYPE_CHOICES,
    CLAIM_STATUS_CHOICES,
)

__all__ = [
    # Core
    'IFCEntity',
    'SpatialHierarchy',
    'PropertySet',
    'System',
    'SystemMembership',
    'Material',
    'MaterialAssignment',
    'IFCType',
    'TypeAssignment',
    # Classification
    'NS3451Code',
    'NS3451OwnershipMatrix',
    'SemanticType',
    'SemanticTypeIFCMapping',
    # Library
    'REUSED_STATUS_CHOICES',
    'MATERIAL_CATEGORY_CHOICES',
    'MATERIAL_UNIT_CHOICES',
    'EPD_SOURCE_CHOICES',
    'EPD_TARGET_TYPE_CHOICES',
    'MaterialLibrary',
    'ProductLibrary',
    'ProductComposition',
    'EPDLibrary',
    'EPDMapping',
    'IFCMaterialNormalization',
    # Type mapping
    'TypeMapping',
    'TypeDefinitionLayer',
    'MaterialMapping',
    # TypeBank
    'TypeBankEntry',
    'TypeBankObservation',
    'TypeBankAlias',
    'TypeBankScope',
    # Reporting
    'IFCValidationReport',
    'GraphEdge',
    'RoomAssignment',
    'ModelAnalysis',
    'AnalysisStorey',
    'AnalysisType',
    'AnalysisTypeStorey',
    # Drawings
    'DrawingSheet',
    'TitleBlockTemplate',
    'DrawingRegistration',
    # Documents
    'DocumentContent',
    'EXTRACTION_METHOD_CHOICES',
    # Claims
    'Claim',
    'CLAIM_TYPE_CHOICES',
    'CLAIM_STATUS_CHOICES',
]
