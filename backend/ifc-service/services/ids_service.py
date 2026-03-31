"""
IDS (Information Delivery Specification) service using ifctester.

Handles:
- Parsing .ids XML into structured specs JSON
- Building ifctester Ids objects from structured specs
- Running validation against IFC files
- Generating IDS XML from structured specs
"""
import json
import logging
import tempfile
import time
from io import StringIO
from typing import Optional

import ifcopenshell
from ifctester import ids, reporter

logger = logging.getLogger(__name__)


class IDSService:
    """Service for IDS operations using ifctester."""

    def parse_ids_xml(self, xml_string: str) -> dict:
        """
        Parse IDS XML into structured specification JSON.

        Returns:
            {
                "structured_specs": [...],
                "specification_count": int,
                "info": {"title": ..., "author": ..., ...}
            }
        """
        ids_obj = ids.open(xml_string) if xml_string.strip().startswith('<?xml') else ids.Ids()

        # Try parsing from string
        try:
            ids_obj = self._load_ids_from_string(xml_string)
        except Exception as e:
            raise ValueError(f"Failed to parse IDS XML: {e}")

        structured_specs = []
        for spec in ids_obj.specifications:
            spec_data = {
                "name": spec.name if hasattr(spec, 'name') else "",
                "description": getattr(spec, 'description', "") or "",
                "instructions": getattr(spec, 'instructions', "") or "",
                "identifier": getattr(spec, 'identifier', "") or "",
                "ifcVersion": getattr(spec, 'ifcVersion', []) or [],
                "applicability": [],
                "requirements": [],
            }

            # Parse applicability facets
            for facet in (spec.applicability or []):
                spec_data["applicability"].append(self._facet_to_dict(facet))

            # Parse requirement facets
            for facet in (spec.requirements or []):
                spec_data["requirements"].append(self._facet_to_dict(facet))

            structured_specs.append(spec_data)

        info = {}
        if hasattr(ids_obj, 'info'):
            info = ids_obj.info if isinstance(ids_obj.info, dict) else {}
        elif hasattr(ids_obj, 'title'):
            info = {
                "title": getattr(ids_obj, 'title', ''),
                "author": getattr(ids_obj, 'author', ''),
                "version": getattr(ids_obj, 'version', ''),
            }

        return {
            "structured_specs": structured_specs,
            "specification_count": len(structured_specs),
            "info": info,
        }

    def build_ids_from_specs(self, structured_specs: list,
                             title: str = "Untitled",
                             author: str = "") -> ids.Ids:
        """Build ifctester Ids object from structured specification JSON."""
        my_ids = ids.Ids(title=title, author=author)

        for spec_data in structured_specs:
            spec = ids.Specification(
                name=spec_data.get("name", "Unnamed"),
                description=spec_data.get("description", ""),
                instructions=spec_data.get("instructions", ""),
                identifier=spec_data.get("identifier", ""),
                ifcVersion=spec_data.get("ifcVersion", ["IFC4"]),
            )

            # Build applicability facets
            for facet_data in spec_data.get("applicability", []):
                facet = self._build_facet(facet_data)
                if facet:
                    spec.applicability.append(facet)

            # Build requirement facets
            for facet_data in spec_data.get("requirements", []):
                facet = self._build_facet(facet_data)
                if facet:
                    spec.requirements.append(facet)

            my_ids.specifications.append(spec)

        return my_ids

    def validate(self, ifc_path: str, ids_xml: str) -> dict:
        """
        Run IDS validation against an IFC file.

        Returns dict with summary stats and full JSON report.
        """
        start = time.time()

        # Load IDS
        ids_obj = self._load_ids_from_string(ids_xml)

        # Load IFC
        ifc_file = ifcopenshell.open(ifc_path)

        # Validate
        ids_obj.validate(ifc_file)

        # Generate JSON report
        json_reporter = reporter.Json(ids_obj)
        json_reporter.report()
        report_str = json_reporter.to_string()
        report_data = json.loads(report_str) if report_str else {}

        # Compute summary
        total_specs = len(ids_obj.specifications)
        passed = 0
        failed = 0
        total_checks = 0
        checks_passed = 0
        checks_failed = 0

        for spec in ids_obj.specifications:
            spec_passed = len(getattr(spec, 'passed_entities', set()))
            spec_failed = len(getattr(spec, 'failed_entities', set()))
            total_checks += spec_passed + spec_failed
            checks_passed += spec_passed
            checks_failed += spec_failed

            if spec_failed == 0:
                passed += 1
            else:
                failed += 1

        duration = time.time() - start

        return {
            "status": "completed",
            "total_specifications": total_specs,
            "specifications_passed": passed,
            "specifications_failed": failed,
            "total_checks": total_checks,
            "checks_passed": checks_passed,
            "checks_failed": checks_failed,
            "overall_pass": failed == 0,
            "duration_seconds": round(duration, 2),
            "results": report_data,
        }

    def generate_xml(self, structured_specs: list,
                     title: str = "Untitled",
                     author: str = "") -> str:
        """Generate IDS XML string from structured specs."""
        ids_obj = self.build_ids_from_specs(structured_specs, title, author)
        return ids_obj.to_string()

    def _load_ids_from_string(self, xml_string: str):
        """Load IDS from XML string, handling different ifctester API versions."""
        # ifctester expects a file path or can parse from string
        # Write to temp file since ids.open() expects a path
        with tempfile.NamedTemporaryFile(
            mode='w', suffix='.ids', delete=False
        ) as f:
            f.write(xml_string)
            f.flush()
            return ids.open(f.name)

    def _build_facet(self, facet_data: dict):
        """Build an ifctester facet from JSON dict."""
        facet_type = facet_data.get("facet", "")
        cardinality = facet_data.get("cardinality", "required")

        try:
            if facet_type == "entity":
                return ids.Entity(
                    name=facet_data.get("name", "IFCBUILDINGELEMENT"),
                    predefinedType=facet_data.get("predefinedType"),
                )
            elif facet_type == "property":
                return ids.Property(
                    propertySet=facet_data.get("propertySet", ""),
                    baseName=facet_data.get("baseName", ""),
                    value=facet_data.get("value"),
                    dataType=facet_data.get("dataType"),
                    uri=facet_data.get("uri"),
                    instructions=facet_data.get("instructions"),
                    cardinality=cardinality,
                )
            elif facet_type == "classification":
                return ids.Classification(
                    value=facet_data.get("value"),
                    system=facet_data.get("system"),
                    uri=facet_data.get("uri"),
                    instructions=facet_data.get("instructions"),
                    cardinality=cardinality,
                )
            elif facet_type == "material":
                return ids.Material(
                    value=facet_data.get("value"),
                    uri=facet_data.get("uri"),
                    instructions=facet_data.get("instructions"),
                    cardinality=cardinality,
                )
            elif facet_type == "attribute":
                return ids.Attribute(
                    name=facet_data.get("name", ""),
                    value=facet_data.get("value"),
                    instructions=facet_data.get("instructions"),
                    cardinality=cardinality,
                )
            elif facet_type == "partOf":
                return ids.PartOf(
                    name=facet_data.get("name"),
                    predefinedType=facet_data.get("predefinedType"),
                    relation=facet_data.get("relation"),
                    instructions=facet_data.get("instructions"),
                    cardinality=cardinality,
                )
            else:
                logger.warning(f"Unknown facet type: {facet_type}")
                return None
        except Exception as e:
            logger.error(f"Failed to build {facet_type} facet: {e}")
            return None

    def _facet_to_dict(self, facet) -> dict:
        """Convert an ifctester facet object to JSON dict."""
        result = {}

        # Determine facet type from class name
        class_name = type(facet).__name__.lower()
        result["facet"] = class_name

        # Extract common attributes
        for attr in ['name', 'value', 'predefinedType', 'propertySet',
                     'baseName', 'dataType', 'system', 'relation',
                     'uri', 'instructions', 'cardinality']:
            val = getattr(facet, attr, None)
            if val is not None:
                result[attr] = val

        return result
