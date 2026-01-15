#!/usr/bin/env python
"""Check fragments_url for all models."""

import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.models.models import Model

for m in Model.objects.all():
    print(f"\n{m.name}:")
    print(f"  file_url: {m.file_url[:60] if m.file_url else 'None'}...")
    print(f"  fragments_url: {m.fragments_url[:60] if m.fragments_url else 'None'}")
