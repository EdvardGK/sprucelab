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
]
