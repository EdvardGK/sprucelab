"""
Fragment Service - Triggers fragment generation via FastAPI.

Fragments are ThatOpen binary format files that load 10-100x faster than raw IFC.

Architecture:
1. Django triggers FastAPI POST /api/v1/fragments/generate
2. FastAPI downloads IFC, converts to fragments, uploads to Supabase
3. FastAPI calls back to Django to update model record
"""

from typing import Dict, Any
import httpx
from django.conf import settings
from apps.models.models import Model


class FragmentServiceClient:
    """
    Client for triggering fragment generation via FastAPI.
    """

    def __init__(
        self,
        base_url: str = None,
        api_key: str = None,
        timeout: float = 30.0,
    ):
        self.base_url = base_url or getattr(settings, 'IFC_SERVICE_URL', 'http://localhost:8001')
        self.api_key = api_key or getattr(settings, 'IFC_SERVICE_API_KEY', 'sprucelab-ifc-service-dev-key-change-in-production')
        self.timeout = timeout

    def trigger_generation(self, model_id: str, ifc_url: str) -> Dict[str, Any]:
        """
        Trigger fragment generation for a model.

        This is async - returns immediately while generation runs in background.
        FastAPI will callback to Django when complete.

        Args:
            model_id: UUID of the Model
            ifc_url: URL to the IFC file in Supabase Storage

        Returns:
            Dict with status: {'status': 'generating', 'model_id': '...'}
        """
        url = f"{self.base_url}/api/v1/fragments/generate"

        # Build callback URL
        django_url = getattr(settings, 'DJANGO_URL', 'http://localhost:8000')
        callback_url = f"{django_url}/api/models/{model_id}/fragments-complete/"

        with httpx.Client(timeout=self.timeout) as client:
            response = client.post(
                url,
                json={
                    "model_id": str(model_id),
                    "ifc_url": ifc_url,
                    "django_callback_url": callback_url,
                },
                headers={
                    "X-API-Key": self.api_key,
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
            return response.json()

    def generate_sync(self, model_id: str, ifc_url: str) -> Dict[str, Any]:
        """
        Generate fragments synchronously (waits for completion).

        Use for testing or when you need immediate result.

        Args:
            model_id: UUID of the Model
            ifc_url: URL to the IFC file

        Returns:
            Dict with result: {'model_id': '...', 'fragments_url': '...', 'size_mb': ...}
        """
        url = f"{self.base_url}/api/v1/fragments/generate-sync"

        with httpx.Client(timeout=600.0) as client:  # 10 min timeout for sync
            response = client.post(
                url,
                json={
                    "model_id": str(model_id),
                    "ifc_url": ifc_url,
                },
                headers={
                    "X-API-Key": self.api_key,
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
            return response.json()

    def is_available(self) -> bool:
        """Check if FastAPI service is available."""
        try:
            url = f"{self.base_url}/api/v1/health"
            with httpx.Client(timeout=5.0) as client:
                response = client.get(url)
                return response.status_code == 200
        except Exception:
            return False


# Singleton instance
fragment_client = FragmentServiceClient()


def trigger_fragment_generation(model_id: str) -> Dict[str, Any]:
    """
    Trigger fragment generation for a model via FastAPI.

    Updates model.fragments_status to 'generating' and calls FastAPI.
    FastAPI will callback when complete to update fragments_url.

    Args:
        model_id: UUID of the Model

    Returns:
        Dict with trigger result

    Raises:
        ValueError: If model not found or has no IFC file
        httpx.HTTPError: If FastAPI call fails
    """
    try:
        model = Model.objects.get(id=model_id)
    except Model.DoesNotExist:
        raise ValueError(f"Model {model_id} not found")

    if not model.file_url:
        raise ValueError(f"Model {model_id} has no IFC file URL")

    # Update status to generating
    model.fragments_status = 'generating'
    model.fragments_error = None
    model.save(update_fields=['fragments_status', 'fragments_error'])

    print(f"Triggering fragment generation for model {model.name} ({model_id})")

    # Check if FastAPI is available
    if not fragment_client.is_available():
        model.fragments_status = 'failed'
        model.fragments_error = 'FastAPI service not available'
        model.save(update_fields=['fragments_status', 'fragments_error'])
        raise Exception("FastAPI fragment service not available")

    # Trigger generation
    result = fragment_client.trigger_generation(str(model_id), model.file_url)

    print(f"Fragment generation triggered: {result}")
    return result


def generate_fragments_sync(model_id: str) -> Dict[str, Any]:
    """
    Generate fragments synchronously (waits for completion).

    Use for testing or manual regeneration.

    Args:
        model_id: UUID of the Model

    Returns:
        Dict with generation result including fragments_url
    """
    from django.utils import timezone

    try:
        model = Model.objects.get(id=model_id)
    except Model.DoesNotExist:
        raise ValueError(f"Model {model_id} not found")

    if not model.file_url:
        raise ValueError(f"Model {model_id} has no IFC file URL")

    # Update status
    model.fragments_status = 'generating'
    model.fragments_error = None
    model.save(update_fields=['fragments_status', 'fragments_error'])

    try:
        result = fragment_client.generate_sync(str(model_id), model.file_url)

        if result.get('error'):
            model.fragments_status = 'failed'
            model.fragments_error = result['error']
            model.save(update_fields=['fragments_status', 'fragments_error'])
            return result

        # Update model with result
        model.fragments_status = 'completed'
        model.fragments_url = result.get('fragments_url')
        model.fragments_size_mb = result.get('size_mb')
        model.fragments_generated_at = timezone.now()
        model.save(update_fields=[
            'fragments_status', 'fragments_url',
            'fragments_size_mb', 'fragments_generated_at'
        ])

        return result

    except Exception as e:
        model.fragments_status = 'failed'
        model.fragments_error = str(e)
        model.save(update_fields=['fragments_status', 'fragments_error'])
        raise


def delete_fragments_for_model(model_id: str) -> bool:
    """
    Clear fragment data from a model record.

    Note: Does not delete the file from Supabase Storage.

    Args:
        model_id: UUID of the Model

    Returns:
        bool: True if fragments were cleared
    """
    try:
        model = Model.objects.get(id=model_id)
    except Model.DoesNotExist:
        raise ValueError(f"Model {model_id} not found")

    if not model.fragments_url:
        return False

    model.fragments_url = None
    model.fragments_size_mb = None
    model.fragments_generated_at = None
    model.fragments_status = 'pending'
    model.fragments_error = None
    model.save(update_fields=[
        'fragments_url', 'fragments_size_mb', 'fragments_generated_at',
        'fragments_status', 'fragments_error'
    ])

    print(f"Cleared fragments for model: {model.name}")
    return True
