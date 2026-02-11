# Services exports

# Sprint 2: The Vault - Phase gates and audit trail
from .ingestion_gate import (
    check_ingestion_gate,
    mark_observations_historical,
    get_project_type_health,
    IngestionGateResult,
)

# Sprint 1: The Gatekeeper - Discipline filtering
from .discipline_filter import (
    apply_discipline_firewall,
    determine_ownership_status,
    get_primary_types_for_discipline,
    get_reference_types_for_model,
    get_discipline_ownership_summary,
    infer_discipline_from_types,
    FilterResult,
)
