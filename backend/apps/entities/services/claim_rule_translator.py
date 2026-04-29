"""
Claim → verification-engine rule translator (Phase 6, Sprint 6.3 prep).

Promoted Claims sit in `ProjectConfig.config['claim_derived_rules']`. The
verification engine only knows how to consume rules with a `check` key. This
module bridges the two: it converts a Claim's `normalized` form into an
engine-shape rule dict that `VerificationEngine._load_rules` can merge with
defaults.

The translator is pure (no Django imports). It runs at promotion time so the
expensive shape decision happens once, not on every /verify/ call. The output
is stored alongside the existing `_normalized` / `_statement` audit fields
inside the same `claim_derived_rules` entry.

Supported predicates
--------------------
- ``fire_resistance_class`` (REI60, EI30, R120…)
- ``acoustic_db``           (50 dB, 35 dB(A))
- ``u_value``               (0.18 W/m²K)
- ``dimension``             (mm/cm/m)

Deferred predicates (return ``None`` for now)
---------------------------------------------
- ``flow_rate``  — usually project-scoped; needs one-emit-per-model plumbing
- ``pressure``   — same shape concern as flow_rate

When the subject is empty or the placeholder ``"(unspecified)"`` the
translator returns ``None``. Without a subject there is nothing to match a
type's ``type_name`` against, so an info issue would surface against every
type in the model — pure noise.

Returning ``None`` also keeps Sprint 6.3 (LLM-extracted claims) forward-
compatible: when the LLM emits a predicate this table doesn't know about, the
promotion still succeeds — the entry is written without a ``check`` key, the
engine skips it silently, and the Claim record remains the source of truth
until someone extends this dispatch.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Optional


_UNSPECIFIED = "(unspecified)"

_PREDICATE_LABELS = {
    "fire_resistance_class": "Fire resistance",
    "acoustic_db": "Acoustic rating",
    "u_value": "U-value",
    "dimension": "Dimension",
}

_DEFERRED_PREDICATES = frozenset({"flow_rate", "pressure"})


def translate_claim_to_rule(
    claim_id: str, normalized: Dict[str, Any], statement: str,
) -> Optional[Dict[str, Any]]:
    """Return an engine-shape rule dict, or ``None`` if not translatable.

    See module docstring for the supported/deferred predicate list.
    """
    if not normalized:
        return None

    predicate = normalized.get("predicate")
    subject = (normalized.get("subject") or "").strip()
    value = normalized.get("value")
    units = normalized.get("units") or ""

    if not predicate or predicate in _DEFERRED_PREDICATES:
        return None
    if predicate not in _PREDICATE_LABELS:
        return None
    if not subject or subject == _UNSPECIFIED:
        return None
    if value is None or value == "":
        return None

    label = _PREDICATE_LABELS[predicate]
    value_str = str(value)
    name = f"{label}: {value_str}{units}".strip()

    subject_pattern = rf"\b{re.escape(subject)}\b"

    return {
        "id": f"claim:{claim_id}",
        "name": name,
        "severity": "info",
        "check": "claim_subject_match",
        "target": "type",
        "subject_field": "type_name",
        "subject_pattern": subject_pattern,
        "claim_value": value_str,
        "claim_units": units,
        "claim_statement": statement or "",
    }
