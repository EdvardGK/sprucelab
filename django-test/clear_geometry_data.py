"""
Clear all geometry data from the database.

This script deletes all records from the Geometry table and updates
IFCEntity records to reflect that geometry is no longer stored.

Run from project root:
    python django-test/clear_geometry_data.py
"""
import os
import sys
import django
from pathlib import Path

# Add backend directory to path
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend')
sys.path.insert(0, backend_dir)

# Load environment variables BEFORE Django setup
from dotenv import load_dotenv
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.entities.models import IFCEntity, Geometry
from apps.models.models import Model


def clear_geometry_data():
    """Delete all geometry data from database."""

    print("\n" + "="*80)
    print("CLEARING GEOMETRY DATA FROM DATABASE")
    print("="*80)

    # Get counts before deletion
    geometry_count = Geometry.objects.count()
    entities_with_geometry = IFCEntity.objects.filter(has_geometry=True).count()

    print(f"\nCurrent state:")
    print(f"  Geometry records: {geometry_count:,}")
    print(f"  Entities marked as has_geometry=True: {entities_with_geometry:,}")

    if geometry_count == 0:
        print("\n✅ No geometry data to delete!")
        return

    # Confirm deletion
    print(f"\n⚠️  This will delete:")
    print(f"  - {geometry_count:,} geometry records")
    print(f"  - Update {entities_with_geometry:,} entity records")

    response = input("\nProceed? (yes/no): ").strip().lower()

    if response != 'yes':
        print("\n❌ Cancelled")
        return

    # Delete geometry data
    print("\n🗑️  Deleting geometry records...")
    deleted_count, details = Geometry.objects.all().delete()
    print(f"✅ Deleted {deleted_count:,} geometry records")
    print(f"   Details: {details}")

    # Update entity records
    print("\n🔄 Updating entity records...")
    updated_entities = IFCEntity.objects.filter(has_geometry=True).update(
        has_geometry=False,
        geometry_status='pending'
    )
    print(f"✅ Updated {updated_entities:,} entity records")

    # Update model geometry_status
    print("\n🔄 Updating model statuses...")
    updated_models = Model.objects.filter(geometry_status='completed').update(
        geometry_status='pending'
    )
    updated_models += Model.objects.filter(geometry_status='partial').update(
        geometry_status='pending'
    )
    print(f"✅ Updated {updated_models:,} model records")

    # Show final state
    print("\n" + "="*80)
    print("CLEANUP COMPLETE")
    print("="*80)
    print(f"\nFinal state:")
    print(f"  Geometry records: {Geometry.objects.count():,}")
    print(f"  Entities marked as has_geometry=True: {IFCEntity.objects.filter(has_geometry=True).count():,}")
    print(f"\n💡 Geometry will now be rendered client-side using IFC.js")
    print(f"   Frontend downloads IFC files directly from Supabase Storage")
    print(f"   Rendering time: 1-2 seconds (vs 2-5 minutes with backend processing)")
    print()


if __name__ == '__main__':
    clear_geometry_data()
