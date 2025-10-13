"""
Verify MMI-veileder 2.0 templates are loaded correctly.

Run with:
    python django-test/verify_mmi_templates.py

Or from backend directory:
    python ../django-test/verify_mmi_templates.py
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
from apps.bep.models import BEPConfiguration, MMIScaleDefinition

print("\n" + "="*70)
print("MMI-VEILEDER 2.0 TEMPLATE VERIFICATION")
print("="*70)

# Check for Full template
print("\n1. MMI-veileder 2.0 - Full Scale Template")
print("-" * 70)

full_template = BEPConfiguration.objects.filter(
    name__contains='MMI-veileder 2.0 - Full'
).first()

if full_template:
    print(f"✅ Found: {full_template.name}")
    print(f"   BEP ID: {full_template.id}")
    print(f"   Version: {full_template.version}")
    print(f"   Framework: {full_template.framework}")
    print(f"   Status: {full_template.status}")

    mmi_levels = full_template.mmi_scale.all().order_by('mmi_level')
    print(f"\n   MMI Levels: {mmi_levels.count()}")

    if mmi_levels.count() == 19:
        print("   ✅ Correct count (19 levels)")
    else:
        print(f"   ❌ Wrong count (expected 19, got {mmi_levels.count()})")

    print("\n   All Levels:")
    for mmi in mmi_levels:
        color_status = "✅" if mmi.color_hex else "❌ NO COLOR"
        english_status = "✅" if mmi.name_en else "⚠️  NO ENGLISH"
        print(f"     MMI {mmi.mmi_level:>3}: {mmi.name:<35} {mmi.color_hex:<8} {color_status} {english_status}")
else:
    print("❌ Full template not found!")

# Check for Simplified template
print("\n2. MMI-veileder 2.0 - Simplified Template")
print("-" * 70)

simple_template = BEPConfiguration.objects.filter(
    name__contains='MMI-veileder 2.0 - Simplified'
).first()

if simple_template:
    print(f"✅ Found: {simple_template.name}")
    print(f"   BEP ID: {simple_template.id}")
    print(f"   Version: {simple_template.version}")
    print(f"   Framework: {simple_template.framework}")
    print(f"   Status: {simple_template.status}")

    mmi_levels = simple_template.mmi_scale.all().order_by('mmi_level')
    print(f"\n   MMI Levels: {mmi_levels.count()}")

    if mmi_levels.count() == 6:
        print("   ✅ Correct count (6 levels)")
    else:
        print(f"   ❌ Wrong count (expected 6, got {mmi_levels.count()})")

    print("\n   All Levels:")
    for mmi in mmi_levels:
        color_status = "✅" if mmi.color_hex else "❌ NO COLOR"
        english_status = "✅" if mmi.name_en else "⚠️  NO ENGLISH"
        print(f"     MMI {mmi.mmi_level:>3}: {mmi.name:<35} {mmi.color_hex:<8} {color_status} {english_status}")
else:
    print("❌ Simplified template not found!")

# Check database schema
print("\n3. Database Schema Check")
print("-" * 70)

if full_template:
    sample_mmi = full_template.mmi_scale.first()
    print(f"Sample MMI Level: {sample_mmi.mmi_level}")
    print(f"  name:        {sample_mmi.name}")
    print(f"  name_en:     {sample_mmi.name_en}")
    print(f"  description: {sample_mmi.description[:50]}...")
    print(f"  color_hex:   {sample_mmi.color_hex}")
    print(f"  color_rgb:   {sample_mmi.color_rgb}")
    print(f"  display_order: {sample_mmi.display_order}")

    # Check if all required fields are present
    required_fields = ['name', 'name_en', 'description', 'color_hex', 'color_rgb']
    all_present = all([hasattr(sample_mmi, field) for field in required_fields])

    if all_present:
        print("\n  ✅ All new fields present in database")
    else:
        print("\n  ❌ Some fields missing - migration may not have run")

# Color code verification
print("\n4. Official Color Code Verification")
print("-" * 70)

expected_colors = {
    100: '#BE2823',
    200: '#ED9D3D',
    300: '#FCE74E',
    350: '#B0D34E',
    400: '#5DB94B',
    500: '#004C41',
}

if full_template:
    print("Checking official colors match MMI-veileder 2.0 Table 1:")
    for level, expected_hex in expected_colors.items():
        mmi = full_template.mmi_scale.filter(mmi_level=level).first()
        if mmi:
            if mmi.color_hex == expected_hex:
                print(f"  ✅ MMI {level}: {mmi.color_hex} (correct)")
            else:
                print(f"  ❌ MMI {level}: {mmi.color_hex} (expected {expected_hex})")
        else:
            print(f"  ❌ MMI {level}: Not found")

print("\n" + "="*70)
print("VERIFICATION COMPLETE")
print("="*70 + "\n")
