"""
Check the status of the latest uploaded model in the database.

Usage:
    cd backend
    python ../django-test/check_model_status.py
"""
import os
import sys
import django

# Add the backend directory to Python path
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend')
sys.path.insert(0, backend_dir)

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.models.models import Model

def check_latest_model():
    """Check the status of the latest model."""
    try:
        # Get the latest model
        m = Model.objects.latest('created_at')

        print("=" * 80)
        print("LATEST MODEL STATUS")
        print("=" * 80)
        print(f"ID:                {m.id}")
        print(f"Name:              {m.name}")
        print(f"Status:            {m.status}")
        print(f"IFC Schema:        {m.ifc_schema}")
        print(f"Element Count:     {m.element_count}")
        print(f"Storey Count:      {m.storey_count}")
        print(f"System Count:      {m.system_count}")
        print(f"File URL:          {m.file_url}")
        print(f"File Size:         {m.file_size} bytes")
        print(f"Created:           {m.created_at}")
        print(f"Updated:           {m.updated_at}")
        print(f"Processing Error:  {repr(m.processing_error)}")
        print("=" * 80)

        # Check if there are validation reports
        from apps.entities.models import IFCValidationReport
        validation_reports = IFCValidationReport.objects.filter(model=m)
        print(f"\nValidation Reports: {validation_reports.count()}")
        if validation_reports.exists():
            for report in validation_reports:
                print(f"  - Status: {report.overall_status}")
                print(f"  - Total Elements: {report.total_elements}")
                print(f"  - Elements with Issues: {report.elements_with_issues}")

        # Check if there are entities extracted
        from apps.entities.models import IFCEntity
        entity_count = IFCEntity.objects.filter(model=m).count()
        print(f"\nExtracted Entities: {entity_count}")

        # Check geometry
        from apps.entities.models import Geometry
        geometry_count = Geometry.objects.filter(entity__model=m).count()
        print(f"Extracted Geometries: {geometry_count}")

        print("\n")

    except Model.DoesNotExist:
        print("No models found in database!")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    check_latest_model()
