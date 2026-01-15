#!/usr/bin/env python
"""
Fix IFCModel file_url to point to Supabase Storage instead of Django media.

Run from backend directory:
    python fix_file_urls.py
"""

import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.models.models import Model as IFCModel

# URL patterns - file_url stores relative paths like /media/ifc_files/uuid/file.ifc
OLD_PREFIX = "/media/ifc_files/"
NEW_PREFIX = "https://rtrgoqpsdmhhcmgietle.supabase.co/storage/v1/object/public/ifc-files/"

def fix_urls():
    """Update all IFCModel file_url from Django media to Supabase Storage."""

    # First show all file_urls to debug
    all_models = IFCModel.objects.exclude(file_url__isnull=True).exclude(file_url='')
    print(f"\nAll models with file_url ({all_models.count()} total):")
    for m in all_models[:5]:
        print(f"  - {m.name}: {m.file_url[:80]}...")

    # Find models with old URLs
    models_to_fix = IFCModel.objects.filter(file_url__startswith=OLD_PREFIX)

    print(f"Found {models_to_fix.count()} models with old URLs")

    for model in models_to_fix:
        old_url = model.file_url

        # Extract the path after /media/ifc_files/
        # Old: /media/ifc_files/uuid/file.ifc
        # New: https://...supabase.co/storage/v1/object/public/ifc-files/uuid/file.ifc

        path = old_url.replace(OLD_PREFIX, "")
        new_url = NEW_PREFIX + path

        print(f"\nModel: {model.name} (ID: {model.id})")
        print(f"  Old: {old_url}")
        print(f"  New: {new_url}")

        model.file_url = new_url
        model.save(update_fields=['file_url'])
        print(f"  ✓ Updated")

    print(f"\nDone! Fixed {models_to_fix.count()} models")

if __name__ == "__main__":
    fix_urls()
