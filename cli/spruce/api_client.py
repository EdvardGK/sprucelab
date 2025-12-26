"""HTTP client for Sprucelab API communication."""
from typing import Optional, Dict, Any, List
import httpx

from .config import get_api_url, get_api_key, get_agent_id, get_hostname


class SprucelabClient:
    """Client for Sprucelab automation API."""

    def __init__(self, api_url: Optional[str] = None, api_key: Optional[str] = None):
        self.api_url = api_url or get_api_url()
        self.api_key = api_key or get_api_key()
        self.agent_id = get_agent_id()
        self.hostname = get_hostname()

    def _headers(self) -> Dict[str, str]:
        """Get request headers with authentication."""
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _url(self, path: str) -> str:
        """Build full URL for API path."""
        return f"{self.api_url}/api/automation{path}"

    # Pipeline endpoints

    def list_pipelines(self) -> List[Dict[str, Any]]:
        """List all available pipelines."""
        with httpx.Client() as client:
            response = client.get(
                self._url("/pipelines/"),
                headers=self._headers()
            )
            response.raise_for_status()
            return response.json()

    def get_pipeline(self, pipeline_id: str) -> Dict[str, Any]:
        """Get pipeline details."""
        with httpx.Client() as client:
            response = client.get(
                self._url(f"/pipelines/{pipeline_id}/"),
                headers=self._headers()
            )
            response.raise_for_status()
            return response.json()

    def trigger_run(
        self,
        pipeline_id: str,
        project_id: Optional[str] = None,
        parameters: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Trigger a pipeline run."""
        data = {
            "triggered_by": f"cli:{self.hostname}"
        }
        if project_id:
            data["project_id"] = project_id
        if parameters:
            data["parameters"] = parameters

        with httpx.Client() as client:
            response = client.post(
                self._url(f"/pipelines/{pipeline_id}/run/"),
                headers=self._headers(),
                json=data
            )
            response.raise_for_status()
            return response.json()

    # Run endpoints

    def list_runs(
        self,
        pipeline_id: Optional[str] = None,
        project_id: Optional[str] = None,
        status: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """List pipeline runs."""
        params = {}
        if pipeline_id:
            params["pipeline"] = pipeline_id
        if project_id:
            params["project"] = project_id
        if status:
            params["status"] = status

        with httpx.Client() as client:
            response = client.get(
                self._url("/runs/"),
                headers=self._headers(),
                params=params
            )
            response.raise_for_status()
            return response.json()

    def get_run(self, run_id: str) -> Dict[str, Any]:
        """Get run details."""
        with httpx.Client() as client:
            response = client.get(
                self._url(f"/runs/{run_id}/"),
                headers=self._headers()
            )
            response.raise_for_status()
            return response.json()

    def get_run_logs(self, run_id: str) -> Dict[str, Any]:
        """Get run logs."""
        with httpx.Client() as client:
            response = client.get(
                self._url(f"/runs/{run_id}/logs/"),
                headers=self._headers()
            )
            response.raise_for_status()
            return response.json()

    # Agent endpoints

    def register_agent(self, name: str) -> Dict[str, Any]:
        """Register this machine as an agent."""
        with httpx.Client() as client:
            response = client.post(
                self._url("/agent/register/"),
                headers=self._headers(),
                json={
                    "name": name,
                    "hostname": self.hostname,
                    "capabilities": ["ifcopenshell", "python"]
                }
            )
            response.raise_for_status()
            return response.json()

    def heartbeat(self) -> bool:
        """Send agent heartbeat."""
        if not self.agent_id:
            return False

        with httpx.Client() as client:
            try:
                response = client.post(
                    self._url("/agent/heartbeat/"),
                    headers=self._headers(),
                    json={
                        "agent_id": self.agent_id,
                        "hostname": self.hostname
                    }
                )
                return response.status_code == 200
            except Exception:
                return False

    def poll_jobs(self) -> List[Dict[str, Any]]:
        """Poll for pending jobs."""
        if not self.agent_id:
            return []

        with httpx.Client() as client:
            response = client.get(
                self._url("/agent/jobs/"),
                headers=self._headers(),
                params={"agent_id": self.agent_id}
            )
            response.raise_for_status()
            return response.json().get("jobs", [])

    def claim_job(self, run_id: str) -> bool:
        """Claim a job for execution."""
        with httpx.Client() as client:
            response = client.post(
                self._url(f"/agent/jobs/{run_id}/claim/"),
                headers=self._headers(),
                json={
                    "agent_id": self.agent_id,
                    "agent_hostname": self.hostname
                }
            )
            return response.status_code == 200

    def step_start(self, run_id: str, step_id: str) -> bool:
        """Mark a step as started."""
        with httpx.Client() as client:
            response = client.post(
                self._url(f"/agent/jobs/{run_id}/step/{step_id}/start/"),
                headers=self._headers()
            )
            return response.status_code == 200

    def step_complete(
        self,
        run_id: str,
        step_id: str,
        status: str,
        output_log: str = "",
        result_data: Optional[Dict] = None,
        error_message: str = "",
        output_files: Optional[List[str]] = None
    ) -> bool:
        """Mark a step as completed."""
        with httpx.Client() as client:
            response = client.post(
                self._url(f"/agent/jobs/{run_id}/step/{step_id}/complete/"),
                headers=self._headers(),
                json={
                    "status": status,
                    "output_log": output_log,
                    "result_data": result_data or {},
                    "error_message": error_message,
                    "output_files": output_files or []
                }
            )
            return response.status_code == 200

    def run_complete(self, run_id: str, error_message: str = "") -> Dict[str, Any]:
        """Mark a run as completed."""
        with httpx.Client() as client:
            response = client.post(
                self._url(f"/agent/jobs/{run_id}/complete/"),
                headers=self._headers(),
                json={"error_message": error_message}
            )
            response.raise_for_status()
            return response.json()
