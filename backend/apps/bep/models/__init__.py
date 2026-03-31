"""
BEP (BIM Execution Plan) models package.

Split into modules for maintainability:
- bep.py: Core BEP models (BEPConfiguration, templates, disciplines, etc.)
- eir.py: EIR + EIRRequirement + IDSSpecification
- response.py: BEPResponse + BEPResponseItem
- validation.py: IDSValidationRun
"""
from .bep import (
    BEPTemplate,
    BEPConfiguration,
    TechnicalRequirement,
    MMIScaleDefinition,
    NamingConvention,
    RequiredPropertySet,
    ValidationRule,
    SubmissionMilestone,
    ProjectDiscipline,
    ProjectCoordinates,
    ProjectStorey,
)
from .eir import (
    EIR,
    EIRRequirement,
    IDSSpecification,
)

__all__ = [
    # Core BEP
    'BEPTemplate',
    'BEPConfiguration',
    'TechnicalRequirement',
    'MMIScaleDefinition',
    'NamingConvention',
    'RequiredPropertySet',
    'ValidationRule',
    'SubmissionMilestone',
    'ProjectDiscipline',
    'ProjectCoordinates',
    'ProjectStorey',
    # EIR + IDS
    'EIR',
    'EIRRequirement',
    'IDSSpecification',
]
