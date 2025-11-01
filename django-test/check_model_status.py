"""
Check current status of a model.
"""
import os
import sys
import django

# Add backend directory to path
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend')
sys.path.insert(0, backend_dir)

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.models.models import Model
from apps.entities.models import IFCEntity

model_name = sys.argv[1] if len(sys.argv) > 1 else 'G55_RIE'

model = Model.objects.filter(name=model_name).order_by('-created_at').first()

if model:
    print(f"Model: {model.name} (v{model.version_number})")
    print(f"Status: {model.status}")
    print(f"Processing Error: {model.processing_error or 'None'}")
    print(f"Element Count: {model.element_count}")
    print(f"Created: {model.created_at}")
    print(f"Updated: {model.updated_at}")
    print()

    # Check how many entities were actually extracted
    entity_count = IFCEntity.objects.filter(model=model).count()
    print(f"Entities in database: {entity_count}")

    if entity_count > 0:
        print("\nSample entities:")
        for entity in IFCEntity.objects.filter(model=model)[:5]:
            print(f"  - {entity.ifc_type}: {entity.name or entity.ifc_guid}")
else:
    print(f"Model '{model_name}' not found")
