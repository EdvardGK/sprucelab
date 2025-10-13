"""
Delete old POFIN templates with incorrect MMI scale (5 levels only).

Run with:
    python django-test/delete_old_pofin_templates.py

Or from backend directory:
    python ../django-test/delete_old_pofin_templates.py
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

# Now import Django models
from apps.bep.models import BEPConfiguration

print("\n" + "="*70)
print("DELETE OLD POFIN TEMPLATES")
print("="*70)

# Find old templates with wrong scale
old_templates = BEPConfiguration.objects.filter(
    framework='pofin',
    name__in=['POFIN Standard Building', 'POFIN Infrastructure/Roads']
)

print(f"\nFound {old_templates.count()} old templates to delete:")

if old_templates.count() == 0:
    print("  ✅ No old templates found (already cleaned up)")
else:
    for template in old_templates:
        print(f"\n  Template: {template.name}")
        print(f"    - BEP ID: {template.id}")
        print(f"    - Version: {template.version}")
        print(f"    - Status: {template.status}")
        print(f"    - MMI Levels: {template.mmi_scale.count()}")

        # Show MMI levels
        for mmi in template.mmi_scale.all():
            print(f"      • MMI {mmi.mmi_level}: {mmi.name}")

    # Confirm deletion
    print(f"\n⚠️  About to delete {old_templates.count()} template(s)...")
    confirm = input("Type 'yes' to confirm: ")

    if confirm.lower() == 'yes':
        for template in old_templates:
            print(f"  Deleting: {template.name}")
            template.delete()
        print("\n✅ Old templates deleted successfully")
    else:
        print("\n❌ Deletion cancelled")

print("\n" + "="*70)
print("REMAINING BEP CONFIGURATIONS:")
print("="*70)

remaining = BEPConfiguration.objects.all()
print(f"\nTotal BEPs: {remaining.count()}\n")

for bep in remaining:
    print(f"  • {bep.name}")
    print(f"    Framework: {bep.framework}")
    print(f"    MMI Levels: {bep.mmi_scale.count()}")
    print()

print("Done!\n")
