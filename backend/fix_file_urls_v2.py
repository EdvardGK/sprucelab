#!/usr/bin/env python
"""
Fix IFCModel file_url to point to correct Supabase Storage paths.
"""

import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.models.models import Model as IFCModel

# Known correct Supabase URLs (from user)
CORRECT_URLS = {
    "S8A_ARK_MMI900": "https://rtrgoqpsdmhhcmgietle.supabase.co/storage/v1/object/public/ifc-files/ifc_files/2332d095-43c4-4ade-8dd0-ad23131327f1/S8A_ARK_MMI900.ifc",
    "S8A_ARK_MMI300": "https://rtrgoqpsdmhhcmgietle.supabase.co/storage/v1/object/public/ifc-files/ifc_files/2332d095-43c4-4ade-8dd0-ad23131327f1/S8A_ARK_MMI300.ifc",
}

def fix_urls():
    """Update IFCModel file_url based on known correct paths."""

    all_models = IFCModel.objects.exclude(file_url__isnull=True).exclude(file_url='')
    print(f"\nAll models ({all_models.count()} total):")

    for model in all_models:
        print(f"\n- {model.name}")
        print(f"  Current: {model.file_url}")

        if model.name in CORRECT_URLS:
            new_url = CORRECT_URLS[model.name]
            print(f"  New:     {new_url}")
            model.file_url = new_url
            model.save(update_fields=['file_url'])
            print(f"  ✓ Updated")
        else:
            print(f"  ⚠ No mapping found - please add to CORRECT_URLS")

if __name__ == "__main__":
    fix_urls()
