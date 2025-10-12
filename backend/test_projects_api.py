"""
Test script to check what the Projects API is returning.
Run with: python test_projects_api.py
"""
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.projects.models import Project
from apps.projects.serializers import ProjectSerializer
import json

print("\n" + "="*60)
print("PROJECTS DATABASE CHECK")
print("="*60)

# Get all projects
projects = Project.objects.all()
print(f'\nProjects in Database: {projects.count()}')

for p in projects:
    print(f'\n  Project ID: {p.id}')
    print(f'  Name: {p.name}')
    print(f'  Description: {p.description}')
    print(f'  Created: {p.created_at}')
    print(f'  Model Count: {p.get_model_count()}')

print("\n" + "="*60)
print("SERIALIZED API RESPONSE (what frontend receives)")
print("="*60)

# Serialize them (what the API returns)
serializer = ProjectSerializer(projects, many=True)
data = serializer.data

print('\n' + json.dumps(data, indent=2, default=str))

print("\n" + "="*60)
print(f"Total projects returned: {len(data)}")
print("="*60 + "\n")
