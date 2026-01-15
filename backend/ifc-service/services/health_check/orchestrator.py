"""
Health Check Orchestrator - Runs all checkers, never fails.

This is the main entry point for universal IFC model analysis.
It coordinates all checkers and produces a single dashboard-ready response.

Key design principles:
1. NEVER raises exceptions to caller (only internal bugs/loops)
2. Each checker runs independently - one failure doesn't block others
3. All results are structured for immediate dashboard consumption
4. Performance is tracked for monitoring
"""

import logging
import time
import tempfile
import os
from typing import Optional
from pathlib import Path

import httpx
import ifcopenshell

from models.health_check_schemas import (
    HealthCheckRequest,
    HealthCheckResponse,
    TrafficLight,
    ModelMetadata,
    IdentityCluster,
    SpatialCluster,
    GeorefCluster,
    SemanticCluster,
    QTODataset,
)
from .checkers import (
    IdentityChecker,
    SpatialChecker,
    GeorefChecker,
    SemanticChecker,
    QTOExtractor,
)

logger = logging.getLogger(__name__)


class HealthCheckOrchestrator:
    """
    Orchestrates universal health check across all clusters.

    Usage:
        orchestrator = HealthCheckOrchestrator()
        result = await orchestrator.analyze(request)
        # result is always valid - never raises
    """

    def __init__(self, max_elements_per_check: int = 100):
        self.max_elements = max_elements_per_check

    async def analyze(self, request: HealthCheckRequest) -> HealthCheckResponse:
        """
        Analyze IFC model and return health check results.

        This method NEVER raises exceptions. Any issues are captured
        in the response as notes or partial results.
        """
        start_time = time.time()

        response = HealthCheckResponse(
            model_id=request.model_id,
        )

        try:
            # Load IFC file
            ifc_file, file_path, file_size = await self._load_ifc(request)

            if ifc_file is None:
                response.notes.append("Failed to load IFC file - partial results only")
                response.overall_status = TrafficLight.RED
                response.duration_seconds = time.time() - start_time
                return response

            # Extract metadata
            response.metadata = self._extract_metadata(ifc_file, file_path, file_size)

            # Run all checkers
            response.identity = self._run_identity_check(ifc_file)
            response.spatial = self._run_spatial_check(ifc_file)
            response.georef = self._run_georef_check(ifc_file)
            response.semantic = self._run_semantic_check(ifc_file)

            # Extract QTO (unless skipped)
            if not request.skip_qto:
                response.qto = self._run_qto_extraction(ifc_file)

            # Compute overall status
            response.compute_overall_status()

        except Exception as e:
            # This should rarely happen - only for truly unexpected issues
            logger.error(f"Unexpected error in health check: {e}", exc_info=True)
            response.notes.append(f"Analysis incomplete due to unexpected error: {str(e)[:200]}")
            response.overall_status = TrafficLight.RED

        finally:
            response.duration_seconds = round(time.time() - start_time, 2)

        return response

    async def _load_ifc(self, request: HealthCheckRequest) -> tuple:
        """Load IFC file from path or URL. Returns (ifc_file, file_path, file_size)."""
        try:
            # Local file path
            if request.file_path:
                path = Path(request.file_path)
                if path.exists():
                    ifc = ifcopenshell.open(str(path))
                    return ifc, str(path), path.stat().st_size
                else:
                    logger.warning(f"File not found: {request.file_path}")
                    return None, None, None

            # Remote URL
            if request.file_url:
                return await self._download_and_open(request.file_url)

            logger.warning("No file_path or file_url provided")
            return None, None, None

        except Exception as e:
            logger.error(f"Failed to load IFC: {e}")
            return None, None, None

    async def _download_and_open(self, url: str) -> tuple:
        """Download IFC from URL and open it."""
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.get(url)
                response.raise_for_status()

            # Write to temp file
            with tempfile.NamedTemporaryFile(suffix=".ifc", delete=False) as tmp:
                tmp.write(response.content)
                tmp_path = tmp.name

            file_size = len(response.content)
            ifc = ifcopenshell.open(tmp_path)

            # Clean up temp file
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

            return ifc, url, file_size

        except Exception as e:
            logger.error(f"Failed to download IFC from {url}: {e}")
            return None, None, None

    def _extract_metadata(self, ifc: ifcopenshell.file, file_path: str, file_size: int) -> ModelMetadata:
        """Extract basic model metadata."""
        metadata = ModelMetadata(
            file_size_bytes=file_size,
            ifc_schema=ifc.schema,
        )

        try:
            # File name from path or URL
            if file_path:
                metadata.file_name = Path(file_path).name if "/" in file_path or "\\" in file_path else file_path.split("/")[-1]

            # Header info
            header = ifc.header
            if header:
                if hasattr(header, "file_name"):
                    fn = header.file_name
                    if hasattr(fn, "organization") and fn.organization:
                        org = fn.organization
                        metadata.organization = org[0] if isinstance(org, (list, tuple)) else str(org)
                    if hasattr(fn, "author") and fn.author:
                        auth = fn.author
                        metadata.author = auth[0] if isinstance(auth, (list, tuple)) else str(auth)
                    if hasattr(fn, "time_stamp"):
                        metadata.timestamp = str(fn.time_stamp)

                if hasattr(header, "file_description"):
                    fd = header.file_description
                    if hasattr(fd, "implementation_level"):
                        metadata.mvd = str(fd.implementation_level)

            # Authoring application from IfcApplication
            apps = list(ifc.by_type("IfcApplication"))
            if apps:
                app = apps[0]
                app_name = getattr(app, "ApplicationFullName", None)
                app_version = getattr(app, "Version", None)
                if app_name:
                    metadata.authoring_application = f"{app_name}"
                    if app_version:
                        metadata.authoring_application += f" {app_version}"

        except Exception as e:
            logger.warning(f"Metadata extraction issue: {e}")

        return metadata

    def _run_identity_check(self, ifc: ifcopenshell.file) -> IdentityCluster:
        """Run identity cluster checks."""
        try:
            checker = IdentityChecker(ifc, self.max_elements)
            return checker.check()
        except Exception as e:
            logger.error(f"Identity check failed: {e}", exc_info=True)
            result = IdentityCluster()
            result.status = TrafficLight.YELLOW
            return result

    def _run_spatial_check(self, ifc: ifcopenshell.file) -> SpatialCluster:
        """Run spatial cluster checks."""
        try:
            checker = SpatialChecker(ifc, self.max_elements)
            return checker.check()
        except Exception as e:
            logger.error(f"Spatial check failed: {e}", exc_info=True)
            result = SpatialCluster()
            result.status = TrafficLight.YELLOW
            return result

    def _run_georef_check(self, ifc: ifcopenshell.file) -> GeorefCluster:
        """Run georeferencing cluster checks."""
        try:
            checker = GeorefChecker(ifc, self.max_elements)
            return checker.check()
        except Exception as e:
            logger.error(f"Georef check failed: {e}", exc_info=True)
            result = GeorefCluster()
            result.status = TrafficLight.YELLOW
            return result

    def _run_semantic_check(self, ifc: ifcopenshell.file) -> SemanticCluster:
        """Run semantic cluster checks."""
        try:
            checker = SemanticChecker(ifc, self.max_elements)
            return checker.check()
        except Exception as e:
            logger.error(f"Semantic check failed: {e}", exc_info=True)
            result = SemanticCluster()
            result.status = TrafficLight.YELLOW
            return result

    def _run_qto_extraction(self, ifc: ifcopenshell.file) -> QTODataset:
        """Run QTO extraction."""
        try:
            extractor = QTOExtractor(ifc)
            return extractor.extract()
        except Exception as e:
            logger.error(f"QTO extraction failed: {e}", exc_info=True)
            return QTODataset()


# Singleton instance for convenience
health_check_orchestrator = HealthCheckOrchestrator()
