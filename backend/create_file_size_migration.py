"""
Create migration for adding file_size field to Model.
Run with: python create_file_size_migration.py
"""
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.core.management import call_command

print("\n" + "="*60)
print("CREATING MIGRATION FOR file_size FIELD")
print("="*60)

# Create migration
call_command('makemigrations', 'models', name='add_file_size_to_model')

print("\n" + "="*60)
print("Migration created successfully!")
print("Now run: python manage.py migrate")
print("="*60 + "\n")
