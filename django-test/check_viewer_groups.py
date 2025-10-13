"""
Check ViewerGroups in database.

Usage:
    python django-test/check_viewer_groups.py
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

from apps.viewers.models import ViewerGroup
from apps.projects.models import Project

def main():
    print("\n" + "="*60)
    print("Viewer Groups Database Check")
    print("="*60 + "\n")

    # Get all projects
    projects = Project.objects.all()
    print(f"📁 Found {projects.count()} projects:")
    for project in projects:
        print(f"   - {project.name} ({project.id})")
    print()

    # Get all viewer groups
    groups = ViewerGroup.objects.all()
    print(f"📂 Found {groups.count()} viewer groups:")
    for group in groups:
        project_name = group.project.name if group.project else "No project"
        model_count = group.models.count()
        print(f"   - {group.name}")
        print(f"     Project: {project_name}")
        print(f"     ID: {group.id}")
        print(f"     Models: {model_count}")
        print(f"     Created: {group.created_at}")
        print()

    print("="*60)
    print("✅ Check Complete")
    print("="*60 + "\n")


if __name__ == '__main__':
    main()
