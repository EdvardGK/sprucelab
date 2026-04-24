"""
BEP defaults - ARCHIVED (2026-04).

BEP system was deprioritized. This stub keeps imports working.
Full implementation: archive/backend/bep_defaults.py
"""
from typing import Dict, Any


class BEPDefaults:
    """Stub - BEP system archived."""

    @staticmethod
    def get_mmi_scale():
        return {"archived": True, "message": "BEP system archived"}

    @staticmethod
    def get_validation_rules():
        return {"archived": True, "message": "BEP system archived"}

    @staticmethod
    def get_naming_conventions():
        return {"archived": True, "message": "BEP system archived"}

    @staticmethod
    def get_full_template(project_code: str = "PRJ") -> Dict[str, Any]:
        return {"archived": True, "message": "BEP system archived"}


def get_bep_template(project_code: str = "PRJ") -> Dict[str, Any]:
    return BEPDefaults.get_full_template(project_code)
