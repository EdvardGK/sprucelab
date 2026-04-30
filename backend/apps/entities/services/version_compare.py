"""
Version comparison service for IFC types.

Compares types between two model versions by signature tuple
(ifc_class, type_name, predefined_type, material). Produces a diff
summary stored in Model.version_diff.

Usage:
    from apps.entities.services.version_compare import compare_model_versions
    diff = compare_model_versions(new_model_id, old_model_id)
"""

import logging
from dataclasses import dataclass, field, asdict

logger = logging.getLogger(__name__)


@dataclass
class TypeChange:
    """A single type-level change between versions."""
    type_name: str
    ifc_class: str
    change_type: str  # 'new' | 'removed' | 'changed'
    new_type_id: str | None = None
    old_type_id: str | None = None
    instance_delta: int = 0  # positive = more instances, negative = fewer
    details: dict = field(default_factory=dict)


@dataclass
class VersionDiff:
    """Summary of changes between two model versions."""
    new_model_id: str
    old_model_id: str
    new_count: int = 0
    removed_count: int = 0
    changed_count: int = 0
    unchanged_count: int = 0
    total_new: int = 0
    total_old: int = 0
    changes: list[TypeChange] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    @property
    def summary(self) -> dict:
        """Compact summary for Model.version_diff JSONField."""
        return {
            'old_model_id': self.old_model_id,
            'new': self.new_count,
            'removed': self.removed_count,
            'changed': self.changed_count,
            'unchanged': self.unchanged_count,
            'total_new': self.total_new,
            'total_old': self.total_old,
        }


def _type_signature(ifc_type) -> str:
    """Build a signature string for matching types across versions."""
    return f"{ifc_type.ifc_type}::{ifc_type.type_name or ''}::{ifc_type.predefined_type or ''}"


def compare_model_versions(
    new_model_id: str,
    old_model_id: str,
) -> VersionDiff:
    """
    Compare types between two model versions.

    Types are matched by signature tuple (ifc_class, type_name, predefined_type).
    Types present only in new = NEW. Only in old = REMOVED.
    In both but with different instance_count = CHANGED.

    Args:
        new_model_id: UUID of the newer model version
        old_model_id: UUID of the older model version

    Returns:
        VersionDiff with all changes
    """
    from apps.entities.models import IFCType

    new_types = list(IFCType.objects.filter(model_id=new_model_id))
    old_types = list(IFCType.objects.filter(model_id=old_model_id))

    # Build lookup by signature
    new_by_sig = {}
    for t in new_types:
        sig = _type_signature(t)
        new_by_sig[sig] = t

    old_by_sig = {}
    for t in old_types:
        sig = _type_signature(t)
        old_by_sig[sig] = t

    changes = []
    new_count = 0
    removed_count = 0
    changed_count = 0
    unchanged_count = 0

    # Find NEW and CHANGED types
    for sig, new_t in new_by_sig.items():
        if sig not in old_by_sig:
            new_count += 1
            changes.append(TypeChange(
                type_name=new_t.type_name or '',
                ifc_class=new_t.ifc_type,
                change_type='new',
                new_type_id=str(new_t.id),
                instance_delta=new_t.instance_count or 0,
            ))
        else:
            old_t = old_by_sig[sig]
            new_inst = new_t.instance_count or 0
            old_inst = old_t.instance_count or 0
            if new_inst != old_inst:
                changed_count += 1
                changes.append(TypeChange(
                    type_name=new_t.type_name or '',
                    ifc_class=new_t.ifc_type,
                    change_type='changed',
                    new_type_id=str(new_t.id),
                    old_type_id=str(old_t.id),
                    instance_delta=new_inst - old_inst,
                    details={'old_count': old_inst, 'new_count': new_inst},
                ))
            else:
                unchanged_count += 1

    # Find REMOVED types
    for sig, old_t in old_by_sig.items():
        if sig not in new_by_sig:
            removed_count += 1
            changes.append(TypeChange(
                type_name=old_t.type_name or '',
                ifc_class=old_t.ifc_type,
                change_type='removed',
                old_type_id=str(old_t.id),
                instance_delta=-(old_t.instance_count or 0),
            ))

    # Sort: new first, then changed, then removed
    order = {'new': 0, 'changed': 1, 'removed': 2}
    changes.sort(key=lambda c: (order.get(c.change_type, 9), c.ifc_class, c.type_name))

    diff = VersionDiff(
        new_model_id=str(new_model_id),
        old_model_id=str(old_model_id),
        new_count=new_count,
        removed_count=removed_count,
        changed_count=changed_count,
        unchanged_count=unchanged_count,
        total_new=len(new_types),
        total_old=len(old_types),
        changes=changes,
    )

    logger.info(
        'Version diff %s vs %s: +%d -%d ~%d =%d',
        new_model_id, old_model_id,
        new_count, removed_count, changed_count, unchanged_count,
    )

    return diff
