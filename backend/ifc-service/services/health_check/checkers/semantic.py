"""
Semantic Checker - Proxies, PredefinedTypes, Classification.

Checks:
- proxy_usage: IfcBuildingElementProxy percentage (proxy abuse detection)
- predefined_types: PredefinedType attribute usage
- classification: IfcClassificationReference presence
- material_assignment: Material association coverage

Never raises exceptions. Always returns results.

Semantic integrity ensures data is understandable by both humans and machines.
A high proxy percentage indicates loss of semantic intelligence.
"""

import logging
from typing import TYPE_CHECKING, Dict, List, Any, Set
from collections import defaultdict

from models.health_check_schemas import (
    SemanticCluster,
    CheckResult,
    TrafficLight,
    TypeBreakdown,
)

if TYPE_CHECKING:
    import ifcopenshell

logger = logging.getLogger(__name__)


class SemanticChecker:
    """
    Analyzes semantic quality of IFC model.

    Semantic integrity is what makes BIM more than 3D CAD.
    Proper IFC types, predefined types, and classification
    enable automated filtering, estimation, and analysis.
    """

    def __init__(self, ifc_file: "ifcopenshell.file", max_elements: int = 100):
        self.ifc = ifc_file
        self.max_elements = max_elements

    def check(self) -> SemanticCluster:
        """Run all semantic checks. Never raises."""
        result = SemanticCluster()

        # Get type breakdown (used by multiple checks)
        type_breakdown = self._get_type_breakdown()
        result.type_breakdown = type_breakdown

        result.checks["proxy_usage"] = self._check_proxy_usage(type_breakdown)
        result.checks["predefined_types"] = self._check_predefined_types()
        result.checks["classification"] = self._check_classification()
        result.checks["material_assignment"] = self._check_material_assignment()

        # Calculate summary metrics
        proxy_types = [t for t in type_breakdown if "Proxy" in t.ifc_type]
        result.proxy_percentage = sum(t.percentage for t in proxy_types)

        classified_count, total_count = self._get_classification_coverage()
        result.classification_coverage = (classified_count / total_count * 100) if total_count else 0

        result.compute_status()
        return result

    def _get_type_breakdown(self) -> List[TypeBreakdown]:
        """Get breakdown of elements by IFC type."""
        type_counts: Dict[str, int] = defaultdict(int)
        total = 0

        try:
            # Count all IfcProduct instances (physical things)
            for product in self.ifc.by_type("IfcProduct"):
                type_name = product.is_a()
                type_counts[type_name] += 1
                total += 1

        except Exception as e:
            logger.warning(f"Type breakdown encountered issue: {e}")

        # Convert to breakdown list
        breakdown = []
        for type_name, count in sorted(type_counts.items(), key=lambda x: -x[1]):
            percentage = (count / total * 100) if total else 0
            breakdown.append(TypeBreakdown(
                ifc_type=type_name,
                count=count,
                percentage=round(percentage, 2)
            ))

        return breakdown

    def _check_proxy_usage(self, type_breakdown: List[TypeBreakdown]) -> CheckResult:
        """Check IfcBuildingElementProxy usage."""
        try:
            # Find proxy entries
            proxy_types = [t for t in type_breakdown if "Proxy" in t.ifc_type]
            total_elements = sum(t.count for t in type_breakdown)
            proxy_count = sum(t.count for t in proxy_types)

            if proxy_count == 0:
                return CheckResult(
                    status=TrafficLight.GREEN,
                    count=0,
                    message="No proxy elements - full semantic intelligence preserved"
                )

            percentage = (proxy_count / total_elements * 100) if total_elements else 0

            # Proxies indicate lost semantic meaning
            if percentage > 15:
                status = TrafficLight.RED
            elif percentage > 5:
                status = TrafficLight.YELLOW
            else:
                status = TrafficLight.GREEN

            # Get sample proxy GUIDs
            proxy_guids = []
            try:
                for proxy in list(self.ifc.by_type("IfcBuildingElementProxy"))[:self.max_elements]:
                    guid = getattr(proxy, "GlobalId", f"#{proxy.id()}")
                    proxy_guids.append(guid)
            except Exception:
                pass

            return CheckResult(
                status=status,
                count=proxy_count,
                message=f"{proxy_count} proxy elements ({percentage:.1f}%) - consider mapping to specific types",
                elements=proxy_guids,
                details={
                    "proxy_count": proxy_count,
                    "total_elements": total_elements,
                    "percentage": round(percentage, 1),
                    "proxy_types": [{"type": t.ifc_type, "count": t.count} for t in proxy_types]
                }
            )

        except Exception as e:
            logger.warning(f"Proxy usage check encountered issue: {e}")
            return CheckResult(
                status=TrafficLight.YELLOW,
                message=f"Check incomplete: {str(e)[:100]}"
            )

    def _check_predefined_types(self) -> CheckResult:
        """Check PredefinedType attribute usage."""
        try:
            # Types that commonly have PredefinedType
            typed_elements = [
                "IfcWall", "IfcWallStandardCase", "IfcSlab", "IfcColumn", "IfcBeam",
                "IfcDoor", "IfcWindow", "IfcStair", "IfcRamp", "IfcRoof",
                "IfcCovering", "IfcRailing", "IfcMember", "IfcPlate",
                "IfcFooting", "IfcPile", "IfcCurtainWall",
            ]

            missing_type: List[str] = []
            userdefined_count = 0
            notdefined_count = 0
            total_checked = 0

            for ifc_type in typed_elements:
                try:
                    for entity in self.ifc.by_type(ifc_type):
                        total_checked += 1
                        predefined = getattr(entity, "PredefinedType", None)
                        guid = getattr(entity, "GlobalId", f"#{entity.id()}")

                        if predefined is None:
                            missing_type.append(guid)
                        elif str(predefined).upper() == "USERDEFINED":
                            userdefined_count += 1
                        elif str(predefined).upper() == "NOTDEFINED":
                            notdefined_count += 1
                except Exception:
                    continue

            if total_checked == 0:
                return CheckResult(
                    status=TrafficLight.GREEN,
                    count=0,
                    message="No typed elements to check"
                )

            # Calculate quality metrics
            missing_pct = (len(missing_type) / total_checked * 100) if total_checked else 0
            notdefined_pct = (notdefined_count / total_checked * 100) if total_checked else 0

            if missing_pct > 20 or notdefined_pct > 30:
                status = TrafficLight.YELLOW
            else:
                status = TrafficLight.GREEN

            return CheckResult(
                status=status,
                count=len(missing_type) + notdefined_count,
                message=f"{total_checked} elements: {len(missing_type)} missing, {notdefined_count} NOTDEFINED, {userdefined_count} USERDEFINED",
                elements=missing_type[:self.max_elements],
                details={
                    "total_checked": total_checked,
                    "missing_predefined_type": len(missing_type),
                    "notdefined_count": notdefined_count,
                    "userdefined_count": userdefined_count,
                    "missing_percentage": round(missing_pct, 1),
                    "notdefined_percentage": round(notdefined_pct, 1)
                }
            )

        except Exception as e:
            logger.warning(f"PredefinedType check encountered issue: {e}")
            return CheckResult(
                status=TrafficLight.YELLOW,
                message=f"Check incomplete: {str(e)[:100]}"
            )

    def _get_classification_coverage(self) -> tuple[int, int]:
        """Get count of classified vs total physical elements."""
        classified_ids: Set[int] = set()
        total_physical = 0

        try:
            # Get all elements with classification
            for rel in self.ifc.by_type("IfcRelAssociatesClassification"):
                related = getattr(rel, "RelatedObjects", ())
                if related:
                    for obj in related:
                        classified_ids.add(obj.id())

            # Count physical elements
            physical_types = [
                "IfcWall", "IfcSlab", "IfcColumn", "IfcBeam", "IfcDoor",
                "IfcWindow", "IfcStair", "IfcRamp", "IfcRoof", "IfcMember",
                "IfcPlate", "IfcCovering", "IfcRailing", "IfcFooting",
                "IfcBuildingElementProxy", "IfcFurnishingElement",
            ]

            for ifc_type in physical_types:
                try:
                    total_physical += len(list(self.ifc.by_type(ifc_type)))
                except Exception:
                    continue

        except Exception as e:
            logger.warning(f"Classification coverage calc encountered issue: {e}")

        # Count how many physical elements are classified
        classified_physical = 0
        for ifc_type in physical_types:
            try:
                for entity in self.ifc.by_type(ifc_type):
                    if entity.id() in classified_ids:
                        classified_physical += 1
            except Exception:
                continue

        return classified_physical, total_physical

    def _check_classification(self) -> CheckResult:
        """Check IfcClassificationReference usage."""
        try:
            classified_count, total_count = self._get_classification_coverage()

            if total_count == 0:
                return CheckResult(
                    status=TrafficLight.GREEN,
                    count=0,
                    message="No physical elements to check classification"
                )

            percentage = (classified_count / total_count * 100) if total_count else 0
            unclassified = total_count - classified_count

            if percentage < 50:
                status = TrafficLight.RED
            elif percentage < 80:
                status = TrafficLight.YELLOW
            else:
                status = TrafficLight.GREEN

            # Get classification systems in use
            systems: Dict[str, int] = defaultdict(int)
            try:
                for rel in self.ifc.by_type("IfcRelAssociatesClassification"):
                    ref = getattr(rel, "RelatingClassification", None)
                    if ref:
                        # Could be IfcClassificationReference or IfcClassification
                        if hasattr(ref, "ReferencedSource"):
                            source = getattr(ref, "ReferencedSource", None)
                            if source and hasattr(source, "Name"):
                                systems[getattr(source, "Name", "Unknown")] += 1
                        elif hasattr(ref, "Name"):
                            systems[getattr(ref, "Name", "Unknown")] += 1
            except Exception:
                pass

            return CheckResult(
                status=status,
                count=unclassified,
                message=f"{classified_count}/{total_count} elements classified ({percentage:.1f}%)",
                details={
                    "classified_count": classified_count,
                    "total_elements": total_count,
                    "unclassified_count": unclassified,
                    "coverage_percentage": round(percentage, 1),
                    "classification_systems": dict(systems)
                }
            )

        except Exception as e:
            logger.warning(f"Classification check encountered issue: {e}")
            return CheckResult(
                status=TrafficLight.YELLOW,
                message=f"Check incomplete: {str(e)[:100]}"
            )

    def _check_material_assignment(self) -> CheckResult:
        """Check material association coverage."""
        try:
            # Get elements with materials
            materialized_ids: Set[int] = set()

            for rel in self.ifc.by_type("IfcRelAssociatesMaterial"):
                related = getattr(rel, "RelatedObjects", ())
                if related:
                    for obj in related:
                        materialized_ids.add(obj.id())

            # Count physical elements that SHOULD have materials
            material_required_types = [
                "IfcWall", "IfcWallStandardCase", "IfcSlab", "IfcColumn",
                "IfcBeam", "IfcCovering", "IfcMember", "IfcPlate",
                "IfcFooting", "IfcPile", "IfcRoof",
            ]

            total_checked = 0
            missing_material: List[str] = []

            for ifc_type in material_required_types:
                try:
                    for entity in self.ifc.by_type(ifc_type):
                        total_checked += 1
                        if entity.id() not in materialized_ids:
                            guid = getattr(entity, "GlobalId", f"#{entity.id()}")
                            missing_material.append(guid)
                except Exception:
                    continue

            if total_checked == 0:
                return CheckResult(
                    status=TrafficLight.GREEN,
                    count=0,
                    message="No structural elements to check material assignment"
                )

            with_material = total_checked - len(missing_material)
            percentage = (with_material / total_checked * 100) if total_checked else 0

            if percentage < 70:
                status = TrafficLight.YELLOW
            else:
                status = TrafficLight.GREEN

            return CheckResult(
                status=status,
                count=len(missing_material),
                message=f"{with_material}/{total_checked} structural elements have material ({percentage:.1f}%)",
                elements=missing_material[:self.max_elements],
                details={
                    "with_material": with_material,
                    "without_material": len(missing_material),
                    "total_checked": total_checked,
                    "coverage_percentage": round(percentage, 1)
                }
            )

        except Exception as e:
            logger.warning(f"Material assignment check encountered issue: {e}")
            return CheckResult(
                status=TrafficLight.YELLOW,
                message=f"Check incomplete: {str(e)[:100]}"
            )
