"""
Spatial Checker - Containment hierarchy, orphans, spaces.

Checks:
- containment_chain: Project > Site > Building > Storey hierarchy present
- orphaned_elements: Physical elements without spatial parent
- storey_consistency: Storey elevations unique and ordered
- space_presence: IfcSpace entities exist (needed for many analyses)

Never raises exceptions. Always returns results.
"""

import logging
from typing import TYPE_CHECKING, Set, Dict, List, Any, Optional
from collections import defaultdict

from models.health_check_schemas import (
    SpatialCluster,
    CheckResult,
    TrafficLight,
    StoreyInfo,
)

if TYPE_CHECKING:
    import ifcopenshell

logger = logging.getLogger(__name__)


class SpatialChecker:
    """
    Analyzes spatial structure of IFC model.

    The containment hierarchy is what transforms a 3D drawing
    into a structured building model. Elements without spatial
    parents can't be located in schedules or FM systems.
    """

    def __init__(self, ifc_file: "ifcopenshell.file", max_elements: int = 100):
        self.ifc = ifc_file
        self.max_elements = max_elements
        self._contained_elements: Optional[Set[int]] = None

    def check(self) -> SpatialCluster:
        """Run all spatial checks. Never raises."""
        result = SpatialCluster()

        # Build hierarchy first (used by multiple checks)
        hierarchy, storeys = self._extract_hierarchy()
        result.hierarchy = hierarchy
        result.storeys = storeys

        result.checks["containment_chain"] = self._check_containment_chain(hierarchy)
        result.checks["orphaned_elements"] = self._check_orphaned_elements()
        result.checks["storey_consistency"] = self._check_storey_consistency(storeys)
        result.checks["space_presence"] = self._check_space_presence()

        result.compute_status()
        return result

    def _extract_hierarchy(self) -> tuple[Dict[str, Any], List[StoreyInfo]]:
        """Extract spatial hierarchy tree."""
        hierarchy: Dict[str, Any] = {}
        storeys: List[StoreyInfo] = []

        try:
            # Get project
            projects = self.ifc.by_type("IfcProject")
            if not projects:
                return hierarchy, storeys

            project = projects[0]
            hierarchy = {
                "project": {
                    "guid": getattr(project, "GlobalId", None),
                    "name": getattr(project, "Name", "Unnamed"),
                    "sites": []
                }
            }

            # Get sites
            for site in self.ifc.by_type("IfcSite"):
                site_info = {
                    "guid": getattr(site, "GlobalId", None),
                    "name": getattr(site, "Name", "Unnamed"),
                    "buildings": []
                }

                # Get buildings in site
                for building in self.ifc.by_type("IfcBuilding"):
                    building_info = {
                        "guid": getattr(building, "GlobalId", None),
                        "name": getattr(building, "Name", "Unnamed"),
                        "storeys": []
                    }

                    # Get storeys in building
                    for storey in self.ifc.by_type("IfcBuildingStorey"):
                        storey_guid = getattr(storey, "GlobalId", None)
                        storey_name = getattr(storey, "Name", "Unnamed")
                        elevation = getattr(storey, "Elevation", None)

                        # Count elements in storey
                        element_count = self._count_elements_in_storey(storey)

                        storey_info = StoreyInfo(
                            guid=storey_guid or "",
                            name=storey_name or "Unnamed",
                            elevation=elevation,
                            element_count=element_count
                        )
                        storeys.append(storey_info)

                        building_info["storeys"].append({
                            "guid": storey_guid,
                            "name": storey_name,
                            "elevation": elevation,
                            "element_count": element_count
                        })

                    site_info["buildings"].append(building_info)

                hierarchy["project"]["sites"].append(site_info)

        except Exception as e:
            logger.warning(f"Hierarchy extraction encountered issue: {e}")

        return hierarchy, storeys

    def _count_elements_in_storey(self, storey) -> int:
        """Count elements contained in a storey."""
        count = 0
        try:
            # IfcRelContainedInSpatialStructure
            for rel in self.ifc.by_type("IfcRelContainedInSpatialStructure"):
                if getattr(rel, "RelatingStructure", None) == storey:
                    related = getattr(rel, "RelatedElements", ())
                    count += len(related) if related else 0
        except Exception:
            pass
        return count

    def _check_containment_chain(self, hierarchy: Dict[str, Any]) -> CheckResult:
        """Check Project > Site > Building > Storey chain."""
        try:
            issues = []

            # Check project exists
            projects = list(self.ifc.by_type("IfcProject"))
            if not projects:
                issues.append("No IfcProject found")
            elif len(projects) > 1:
                issues.append(f"Multiple IfcProject entities ({len(projects)})")

            # Check site exists
            sites = list(self.ifc.by_type("IfcSite"))
            if not sites:
                issues.append("No IfcSite found")

            # Check building exists
            buildings = list(self.ifc.by_type("IfcBuilding"))
            if not buildings:
                issues.append("No IfcBuilding found")

            # Check storeys exist
            storeys = list(self.ifc.by_type("IfcBuildingStorey"))
            if not storeys:
                issues.append("No IfcBuildingStorey found")

            if not issues:
                return CheckResult(
                    status=TrafficLight.GREEN,
                    count=0,
                    message=f"Valid hierarchy: {len(sites)} site(s), {len(buildings)} building(s), {len(storeys)} storey(s)",
                    details={
                        "sites": len(sites),
                        "buildings": len(buildings),
                        "storeys": len(storeys)
                    }
                )

            # Missing hierarchy elements is significant
            status = TrafficLight.RED if "IfcProject" in str(issues) or "IfcBuildingStorey" in str(issues) else TrafficLight.YELLOW

            return CheckResult(
                status=status,
                count=len(issues),
                message="; ".join(issues),
                details={
                    "issues": issues,
                    "sites": len(sites),
                    "buildings": len(buildings),
                    "storeys": len(storeys)
                }
            )

        except Exception as e:
            logger.warning(f"Containment chain check encountered issue: {e}")
            return CheckResult(
                status=TrafficLight.YELLOW,
                message=f"Check incomplete: {str(e)[:100]}"
            )

    def _get_contained_elements(self) -> Set[int]:
        """Get all element IDs that are spatially contained."""
        if self._contained_elements is not None:
            return self._contained_elements

        self._contained_elements = set()
        try:
            for rel in self.ifc.by_type("IfcRelContainedInSpatialStructure"):
                related = getattr(rel, "RelatedElements", ())
                if related:
                    for elem in related:
                        self._contained_elements.add(elem.id())
        except Exception:
            pass

        return self._contained_elements

    def _check_orphaned_elements(self) -> CheckResult:
        """Check for physical elements without spatial parent."""
        try:
            contained = self._get_contained_elements()

            # Physical element types that SHOULD be contained
            physical_types = [
                "IfcWall", "IfcWallStandardCase", "IfcSlab", "IfcColumn",
                "IfcBeam", "IfcDoor", "IfcWindow", "IfcStair", "IfcRamp",
                "IfcRoof", "IfcCurtainWall", "IfcRailing", "IfcMember",
                "IfcPlate", "IfcFooting", "IfcPile", "IfcCovering",
                "IfcFurnishingElement", "IfcBuildingElementProxy",
                "IfcFlowTerminal", "IfcFlowSegment", "IfcFlowFitting",
                "IfcDistributionElement",
            ]

            orphans: List[str] = []
            total_physical = 0

            for ifc_type in physical_types:
                try:
                    for entity in self.ifc.by_type(ifc_type):
                        total_physical += 1
                        if entity.id() not in contained:
                            guid = getattr(entity, "GlobalId", f"#{entity.id()}")
                            orphans.append(guid)
                except Exception:
                    continue

            if not orphans:
                return CheckResult(
                    status=TrafficLight.GREEN,
                    count=0,
                    message=f"All {total_physical} physical elements have spatial containment"
                )

            percentage = (len(orphans) / total_physical * 100) if total_physical else 0

            # Orphaned elements are significant
            if percentage > 10:
                status = TrafficLight.RED
            elif percentage > 2:
                status = TrafficLight.YELLOW
            else:
                status = TrafficLight.GREEN

            return CheckResult(
                status=status,
                count=len(orphans),
                message=f"{len(orphans)} orphaned elements ({percentage:.1f}%) without spatial containment",
                elements=orphans[:self.max_elements],
                details={
                    "total_physical": total_physical,
                    "orphan_count": len(orphans),
                    "percentage": round(percentage, 1)
                }
            )

        except Exception as e:
            logger.warning(f"Orphaned elements check encountered issue: {e}")
            return CheckResult(
                status=TrafficLight.YELLOW,
                message=f"Check incomplete: {str(e)[:100]}"
            )

    def _check_storey_consistency(self, storeys: List[StoreyInfo]) -> CheckResult:
        """Check storey elevations are unique and sensible."""
        try:
            if not storeys:
                return CheckResult(
                    status=TrafficLight.YELLOW,
                    count=0,
                    message="No storeys to validate"
                )

            issues = []

            # Check for null elevations
            null_elevations = [s for s in storeys if s.elevation is None]
            if null_elevations:
                issues.append(f"{len(null_elevations)} storey(s) missing elevation")

            # Check for duplicate elevations
            elevations = [s.elevation for s in storeys if s.elevation is not None]
            if len(elevations) != len(set(elevations)):
                # Find duplicates
                seen = set()
                dupes = []
                for e in elevations:
                    if e in seen:
                        dupes.append(e)
                    seen.add(e)
                issues.append(f"Duplicate elevations: {list(set(dupes))}")

            # Check elevations are ordered (sorted storeys should have ascending elevations)
            sorted_storeys = sorted(
                [s for s in storeys if s.elevation is not None],
                key=lambda x: x.elevation
            )

            if not issues:
                return CheckResult(
                    status=TrafficLight.GREEN,
                    count=0,
                    message=f"{len(storeys)} storeys with valid elevations",
                    details={
                        "storey_count": len(storeys),
                        "elevation_range": f"{min(elevations):.2f}m to {max(elevations):.2f}m" if elevations else "N/A"
                    }
                )

            return CheckResult(
                status=TrafficLight.YELLOW,
                count=len(issues),
                message="; ".join(issues),
                details={
                    "issues": issues,
                    "storey_count": len(storeys),
                    "storeys_without_elevation": len(null_elevations)
                }
            )

        except Exception as e:
            logger.warning(f"Storey consistency check encountered issue: {e}")
            return CheckResult(
                status=TrafficLight.YELLOW,
                message=f"Check incomplete: {str(e)[:100]}"
            )

    def _check_space_presence(self) -> CheckResult:
        """Check for IfcSpace entities (needed for area calcs, egress, etc.)."""
        try:
            spaces = list(self.ifc.by_type("IfcSpace"))
            space_count = len(spaces)

            if space_count == 0:
                return CheckResult(
                    status=TrafficLight.YELLOW,
                    count=0,
                    message="No IfcSpace entities - space-based analyses not possible",
                    details={"note": "IfcSpace needed for area calculations, egress analysis, energy modeling"}
                )

            # Check spaces have names
            unnamed_spaces = [
                getattr(s, "GlobalId", f"#{s.id()}")
                for s in spaces
                if not getattr(s, "Name", None) or str(getattr(s, "Name", "")).strip() == ""
            ]

            if unnamed_spaces:
                return CheckResult(
                    status=TrafficLight.GREEN,  # Spaces exist, that's good
                    count=space_count,
                    message=f"{space_count} spaces found, {len(unnamed_spaces)} unnamed",
                    elements=unnamed_spaces[:self.max_elements],
                    details={
                        "space_count": space_count,
                        "unnamed_count": len(unnamed_spaces)
                    }
                )

            return CheckResult(
                status=TrafficLight.GREEN,
                count=space_count,
                message=f"{space_count} spaces found, all named",
                details={"space_count": space_count}
            )

        except Exception as e:
            logger.warning(f"Space presence check encountered issue: {e}")
            return CheckResult(
                status=TrafficLight.YELLOW,
                message=f"Check incomplete: {str(e)[:100]}"
            )
