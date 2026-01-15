"""
Identity Checker - GUID, OwnerHistory, Name validation.

Checks:
- guid_uniqueness: Duplicate GUIDs within the file
- guid_format: Valid 22-character IFC GUID format
- owner_history: IfcOwnerHistory presence on rooted entities
- name_present: Name attribute not null/empty

Never raises exceptions. Always returns results.
"""

import re
import logging
from typing import TYPE_CHECKING, Set, Dict, List
from collections import defaultdict

from models.health_check_schemas import (
    IdentityCluster,
    CheckResult,
    TrafficLight,
)

if TYPE_CHECKING:
    import ifcopenshell

logger = logging.getLogger(__name__)

# Valid IFC GUID: 22 characters from base64 alphabet (no +/)
IFC_GUID_PATTERN = re.compile(r'^[0-9A-Za-z_$]{22}$')


class IdentityChecker:
    """
    Analyzes identity and metadata aspects of IFC model.

    Philosophy: Surface issues, don't judge. A model with GUID
    issues still has value - we're just showing what's there.
    """

    def __init__(self, ifc_file: "ifcopenshell.file", max_elements: int = 100):
        self.ifc = ifc_file
        self.max_elements = max_elements

    def check(self) -> IdentityCluster:
        """Run all identity checks. Never raises."""
        result = IdentityCluster()

        result.checks["guid_uniqueness"] = self._check_guid_uniqueness()
        result.checks["guid_format"] = self._check_guid_format()
        result.checks["owner_history"] = self._check_owner_history()
        result.checks["name_present"] = self._check_name_present()

        result.compute_status()
        return result

    def _check_guid_uniqueness(self) -> CheckResult:
        """Check for duplicate GUIDs."""
        try:
            guid_map: Dict[str, List[int]] = defaultdict(list)

            for entity in self.ifc.by_type("IfcRoot"):
                guid = getattr(entity, "GlobalId", None)
                if guid:
                    guid_map[guid].append(entity.id())

            # Find duplicates
            duplicates = {
                guid: ids for guid, ids in guid_map.items() if len(ids) > 1
            }

            if not duplicates:
                return CheckResult(
                    status=TrafficLight.GREEN,
                    count=0,
                    message="All GUIDs unique"
                )

            # Collect affected GUIDs (limited)
            affected_guids = list(duplicates.keys())[:self.max_elements]
            total_affected = sum(len(ids) for ids in duplicates.values())

            return CheckResult(
                status=TrafficLight.RED,
                count=len(duplicates),
                message=f"{len(duplicates)} duplicate GUIDs affecting {total_affected} elements",
                elements=affected_guids,
                details={
                    "duplicate_count": len(duplicates),
                    "affected_elements": total_affected,
                    "sample": {
                        guid: ids[:5] for guid, ids in list(duplicates.items())[:10]
                    }
                }
            )

        except Exception as e:
            logger.warning(f"GUID uniqueness check encountered issue: {e}")
            return CheckResult(
                status=TrafficLight.YELLOW,
                message=f"Check incomplete: {str(e)[:100]}"
            )

    def _check_guid_format(self) -> CheckResult:
        """Check GUID format validity."""
        try:
            invalid_guids: List[str] = []
            total_checked = 0

            for entity in self.ifc.by_type("IfcRoot"):
                guid = getattr(entity, "GlobalId", None)
                total_checked += 1

                if guid is None:
                    invalid_guids.append(f"#{entity.id()}_NULL")
                elif not IFC_GUID_PATTERN.match(guid):
                    invalid_guids.append(guid)

            if not invalid_guids:
                return CheckResult(
                    status=TrafficLight.GREEN,
                    count=0,
                    message=f"All {total_checked} GUIDs valid format"
                )

            return CheckResult(
                status=TrafficLight.YELLOW,
                count=len(invalid_guids),
                message=f"{len(invalid_guids)} GUIDs with invalid format",
                elements=invalid_guids[:self.max_elements],
                details={"total_checked": total_checked}
            )

        except Exception as e:
            logger.warning(f"GUID format check encountered issue: {e}")
            return CheckResult(
                status=TrafficLight.YELLOW,
                message=f"Check incomplete: {str(e)[:100]}"
            )

    def _check_owner_history(self) -> CheckResult:
        """Check IfcOwnerHistory presence."""
        try:
            missing_history: List[str] = []
            total_checked = 0

            for entity in self.ifc.by_type("IfcRoot"):
                total_checked += 1
                owner_history = getattr(entity, "OwnerHistory", None)

                if owner_history is None:
                    guid = getattr(entity, "GlobalId", f"#{entity.id()}")
                    missing_history.append(guid)

            if not missing_history:
                return CheckResult(
                    status=TrafficLight.GREEN,
                    count=0,
                    message=f"All {total_checked} entities have OwnerHistory"
                )

            # IFC4 made OwnerHistory optional, so this is informational
            percentage = (len(missing_history) / total_checked * 100) if total_checked else 0

            # Yellow if some missing, not red (it's optional in IFC4)
            status = TrafficLight.YELLOW if percentage < 50 else TrafficLight.YELLOW

            return CheckResult(
                status=status,
                count=len(missing_history),
                message=f"{len(missing_history)} entities ({percentage:.1f}%) missing OwnerHistory",
                elements=missing_history[:self.max_elements],
                details={
                    "total_checked": total_checked,
                    "percentage_missing": round(percentage, 1)
                }
            )

        except Exception as e:
            logger.warning(f"OwnerHistory check encountered issue: {e}")
            return CheckResult(
                status=TrafficLight.YELLOW,
                message=f"Check incomplete: {str(e)[:100]}"
            )

    def _check_name_present(self) -> CheckResult:
        """Check Name attribute presence on key entities."""
        try:
            # Focus on entities where Name matters most
            key_types = [
                "IfcProject", "IfcSite", "IfcBuilding", "IfcBuildingStorey",
                "IfcSpace", "IfcZone",
                "IfcWall", "IfcSlab", "IfcColumn", "IfcBeam", "IfcDoor", "IfcWindow",
                "IfcMember", "IfcPlate", "IfcStair", "IfcRamp", "IfcRoof",
            ]

            missing_names: List[str] = []
            empty_names: List[str] = []
            total_checked = 0

            for ifc_type in key_types:
                try:
                    for entity in self.ifc.by_type(ifc_type):
                        total_checked += 1
                        name = getattr(entity, "Name", None)
                        guid = getattr(entity, "GlobalId", f"#{entity.id()}")

                        if name is None:
                            missing_names.append(guid)
                        elif str(name).strip() == "":
                            empty_names.append(guid)
                except Exception:
                    continue  # Type might not exist in model

            total_issues = len(missing_names) + len(empty_names)

            if total_issues == 0:
                return CheckResult(
                    status=TrafficLight.GREEN,
                    count=0,
                    message=f"All {total_checked} key elements have names"
                )

            # Determine severity
            percentage = (total_issues / total_checked * 100) if total_checked else 0

            if percentage > 20:
                status = TrafficLight.RED
            elif percentage > 5:
                status = TrafficLight.YELLOW
            else:
                status = TrafficLight.GREEN

            return CheckResult(
                status=status,
                count=total_issues,
                message=f"{len(missing_names)} null + {len(empty_names)} empty names ({percentage:.1f}%)",
                elements=(missing_names + empty_names)[:self.max_elements],
                details={
                    "null_names": len(missing_names),
                    "empty_names": len(empty_names),
                    "total_checked": total_checked,
                    "percentage": round(percentage, 1)
                }
            )

        except Exception as e:
            logger.warning(f"Name presence check encountered issue: {e}")
            return CheckResult(
                status=TrafficLight.YELLOW,
                message=f"Check incomplete: {str(e)[:100]}"
            )
