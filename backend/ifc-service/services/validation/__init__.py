"""
Validation engine for IFC models.

BEP-driven rules were archived during the codebase simplification; the loader
import is removed but the orchestrator stays.
"""

from .orchestrator import ValidationOrchestrator, validation_orchestrator

__all__ = ['ValidationOrchestrator', 'validation_orchestrator']
