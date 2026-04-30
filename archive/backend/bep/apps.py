"""
BEP app configuration.
"""
from django.apps import AppConfig


class BepConfig(AppConfig):
    """Configuration for BEP app."""
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.bep'
    verbose_name = 'BIM Execution Plans'
