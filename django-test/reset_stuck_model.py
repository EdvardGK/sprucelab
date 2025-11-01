"""
Reset a stuck model back to error state so it can be re-uploaded.
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

from apps.models.models import Model
from django.utils import timezone

model_name = sys.argv[1] if len(sys.argv) > 1 else 'G55_RIE'

model = Model.objects.filter(name=model_name, status='processing').order_by('-created_at').first()

if model:
    # Calculate how long it's been stuck
    time_stuck = timezone.now() - model.updated_at
    print(f"Model: {model.name} (v{model.version_number})")
    print(f"Status: {model.status}")
    print(f"Stuck for: {time_stuck}")
    print()
    
    # Reset to error state
    model.status = 'error'
    model.processing_error = f'Processing timed out or crashed. Stuck in processing state for {time_stuck}.'
    model.save()
    
    print(f"✅ Model status reset to 'error'")
    print(f"You can now re-upload the file or investigate further.")
else:
    print(f"No stuck model found with name '{model_name}'")
