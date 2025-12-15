"""
FastAPI IFC Service Client.

Client for calling the FastAPI IFC processing service from Django.
Used to replace Celery for IFC file processing.

Two-phase processing:
1. process_ifc() - Returns quick stats immediately, processing continues in background
2. get_processing_status() - Poll for full processing completion
"""

import httpx
from django.conf import settings
from typing import Optional, Dict, Any
import time


class IFCServiceClient:
    """
    Client for calling FastAPI IFC service.

    Usage (two-phase):
        client = IFCServiceClient()

        # Phase 1: Get quick stats immediately
        quick_stats = client.process_ifc(model_id, file_path)
        # Display to user: quick_stats['storey_count'], quick_stats['top_entity_types'], etc.

        # Phase 2: Poll for full completion
        while True:
            status = client.get_processing_status(model_id)
            if status['status'] == 'completed':
                full_result = status['result']
                break
            time.sleep(2)

    Usage (synchronous):
        client = IFCServiceClient()
        result = client.process_ifc_sync(model_id, file_path)  # Waits for full completion
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout: float = 300.0,  # 5 minutes default
    ):
        self.base_url = base_url or getattr(settings, 'IFC_SERVICE_URL', 'http://localhost:8001')
        self.api_key = api_key or getattr(settings, 'IFC_SERVICE_API_KEY', 'sprucelab-ifc-service-dev-key-change-in-production')
        self.timeout = timeout

    def process_ifc(
        self,
        model_id: str,
        file_path: str,
        skip_geometry: bool = True,
    ) -> Dict[str, Any]:
        """
        Start IFC processing - returns quick stats immediately.

        This returns fast stats (storeys, element counts, top types) while
        full processing continues in the background.

        Args:
            model_id: UUID of the Model in Django database
            file_path: Full path to the IFC file
            skip_geometry: Whether to skip geometry extraction

        Returns:
            Dict with quick stats:
            {
                'success': True,
                'ifc_schema': 'IFC2X3',
                'file_size_bytes': 284612718,
                'total_elements': 25573,
                'storey_count': 14,
                'type_count': 5269,
                'material_count': 216,
                'top_entity_types': [
                    {'type': 'IfcWallStandardCase', 'count': 7310},
                    {'type': 'IfcOpeningElement', 'count': 4681},
                    ...
                ],
                'storey_names': ['Plan U3', 'Plan U2', ...],
                'duration_ms': 13413,
            }

        Raises:
            httpx.HTTPError: If the request fails
        """
        url = f"{self.base_url}/api/v1/ifc/process"

        with httpx.Client(timeout=self.timeout) as client:
            response = client.post(
                url,
                json={
                    "model_id": str(model_id),
                    "file_path": file_path,
                    "skip_geometry": skip_geometry,
                },
                headers={
                    "X-API-Key": self.api_key,
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
            return response.json()

    def get_processing_status(self, model_id: str) -> Dict[str, Any]:
        """
        Get the status of background processing.

        Args:
            model_id: UUID of the Model

        Returns:
            Dict with status:
            {
                'status': 'processing' | 'completed' | 'error',
                'result': {...} if completed,
                'error': '...' if error,
            }
        """
        url = f"{self.base_url}/api/v1/ifc/process/status/{model_id}"

        with httpx.Client(timeout=30.0) as client:
            response = client.get(
                url,
                headers={"X-API-Key": self.api_key},
            )
            response.raise_for_status()
            return response.json()

    def wait_for_completion(
        self,
        model_id: str,
        poll_interval: float = 2.0,
        max_wait: float = 300.0,
    ) -> Dict[str, Any]:
        """
        Wait for background processing to complete.

        Args:
            model_id: UUID of the Model
            poll_interval: Seconds between status checks
            max_wait: Maximum seconds to wait

        Returns:
            Full processing result

        Raises:
            TimeoutError: If processing doesn't complete in time
            Exception: If processing fails
        """
        start_time = time.time()

        while time.time() - start_time < max_wait:
            status = self.get_processing_status(model_id)

            if status['status'] == 'completed':
                return status.get('result', {})

            if status['status'] == 'error':
                raise Exception(f"Processing failed: {status.get('error')}")

            time.sleep(poll_interval)

        raise TimeoutError(f"Processing did not complete within {max_wait} seconds")

    def process_ifc_sync(
        self,
        model_id: str,
        file_path: str,
        skip_geometry: bool = True,
    ) -> Dict[str, Any]:
        """
        Process IFC file synchronously (waits for full completion).

        Use this for smaller files or when you need the full result immediately.
        For larger files, use process_ifc() + wait_for_completion() or polling.

        Args:
            model_id: UUID of the Model in Django database
            file_path: Full path to the IFC file
            skip_geometry: Whether to skip geometry extraction

        Returns:
            Dict with full processing results

        Raises:
            httpx.HTTPError: If the request fails
        """
        url = f"{self.base_url}/api/v1/ifc/process-sync"

        with httpx.Client(timeout=self.timeout) as client:
            response = client.post(
                url,
                json={
                    "model_id": str(model_id),
                    "file_path": file_path,
                    "skip_geometry": skip_geometry,
                },
                headers={
                    "X-API-Key": self.api_key,
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
            return response.json()

    def reprocess_ifc(
        self,
        model_id: str,
        file_path: str,
        skip_geometry: bool = True,
    ) -> Dict[str, Any]:
        """
        Reprocess IFC file (deletes existing data first).

        This runs synchronously to ensure clean state.

        Args:
            model_id: UUID of the Model in Django database
            file_path: Full path to the IFC file
            skip_geometry: Whether to skip geometry extraction

        Returns:
            Dict with full processing results
        """
        url = f"{self.base_url}/api/v1/ifc/reprocess"

        with httpx.Client(timeout=self.timeout) as client:
            response = client.post(
                url,
                json={
                    "model_id": str(model_id),
                    "file_path": file_path,
                    "skip_geometry": skip_geometry,
                },
                headers={
                    "X-API-Key": self.api_key,
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
            return response.json()

    def health_check(self) -> Dict[str, Any]:
        """Check if FastAPI service is healthy."""
        url = f"{self.base_url}/api/v1/health"

        try:
            with httpx.Client(timeout=5.0) as client:
                response = client.get(url)
                response.raise_for_status()
                return response.json()
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}

    def is_available(self) -> bool:
        """Check if FastAPI service is available."""
        health = self.health_check()
        return health.get("status") == "healthy"


# Singleton instance
ifc_service_client = IFCServiceClient()
