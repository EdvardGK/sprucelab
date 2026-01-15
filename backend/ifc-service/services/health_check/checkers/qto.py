"""
QTO Extractor - Quantity Take-Off extraction for dashboards.

Extracts:
- Quantities by IFC type (count, area, volume)
- Quantities by storey (element breakdown per floor)
- Quantities by material (volume per material)
- Summary totals (GFA, element counts, etc.)

Never raises exceptions. Always returns results.

This data feeds directly into dashboard frameworks - it should
be structured for immediate consumption, not buried in files.
"""

import logging
from typing import TYPE_CHECKING, Dict, List, Set, Optional, Any
from collections import defaultdict

from models.health_check_schemas import (
    QTODataset,
    QTOByType,
    QTOByStorey,
    QTOByMaterial,
    QTOTotals,
)

if TYPE_CHECKING:
    import ifcopenshell

logger = logging.getLogger(__name__)


class QTOExtractor:
    """
    Extracts quantity take-off data from IFC model.

    The output is dashboard-ready JSON that can be piped
    directly into visualization frameworks.
    """

    def __init__(self, ifc_file: "ifcopenshell.file"):
        self.ifc = ifc_file
        self._element_quantities: Dict[int, Dict[str, float]] = {}
        self._element_storeys: Dict[int, str] = {}  # element_id -> storey_guid
        self._element_materials: Dict[int, str] = {}  # element_id -> material_name

    def extract(self) -> QTODataset:
        """Extract all QTO data. Never raises."""
        result = QTODataset()

        # Pre-process relationships
        self._build_storey_mapping()
        self._build_material_mapping()
        self._build_quantity_mapping()

        # Extract aggregated data
        result.by_type = self._extract_by_type()
        result.by_storey = self._extract_by_storey()
        result.by_material = self._extract_by_material()
        result.totals = self._extract_totals()

        return result

    def _build_storey_mapping(self):
        """Build element -> storey mapping from containment relations."""
        try:
            for rel in self.ifc.by_type("IfcRelContainedInSpatialStructure"):
                structure = getattr(rel, "RelatingStructure", None)
                if not structure:
                    continue

                # Check if it's a storey
                if structure.is_a("IfcBuildingStorey"):
                    storey_guid = getattr(structure, "GlobalId", "")
                    related = getattr(rel, "RelatedElements", ())
                    if related:
                        for elem in related:
                            self._element_storeys[elem.id()] = storey_guid

        except Exception as e:
            logger.warning(f"Storey mapping build encountered issue: {e}")

    def _build_material_mapping(self):
        """Build element -> material mapping from material associations."""
        try:
            for rel in self.ifc.by_type("IfcRelAssociatesMaterial"):
                material_select = getattr(rel, "RelatingMaterial", None)
                if not material_select:
                    continue

                # Get material name (handles different material types)
                material_name = self._get_material_name(material_select)
                if not material_name:
                    continue

                related = getattr(rel, "RelatedObjects", ())
                if related:
                    for elem in related:
                        self._element_materials[elem.id()] = material_name

        except Exception as e:
            logger.warning(f"Material mapping build encountered issue: {e}")

    def _get_material_name(self, material_select) -> Optional[str]:
        """Extract material name from various IfcMaterialSelect types."""
        try:
            # IfcMaterial
            if hasattr(material_select, "Name") and material_select.is_a("IfcMaterial"):
                return getattr(material_select, "Name", None)

            # IfcMaterialLayerSet
            if material_select.is_a("IfcMaterialLayerSet"):
                layer_set_name = getattr(material_select, "LayerSetName", None)
                if layer_set_name:
                    return layer_set_name
                # Try first layer
                layers = getattr(material_select, "MaterialLayers", ())
                if layers:
                    mat = getattr(layers[0], "Material", None)
                    if mat:
                        return getattr(mat, "Name", None)

            # IfcMaterialLayerSetUsage
            if material_select.is_a("IfcMaterialLayerSetUsage"):
                layer_set = getattr(material_select, "ForLayerSet", None)
                if layer_set:
                    return self._get_material_name(layer_set)

            # IfcMaterialList
            if material_select.is_a("IfcMaterialList"):
                materials = getattr(material_select, "Materials", ())
                if materials:
                    return getattr(materials[0], "Name", None)

            # IfcMaterialConstituentSet (IFC4)
            if hasattr(material_select, "is_a") and material_select.is_a("IfcMaterialConstituentSet"):
                name = getattr(material_select, "Name", None)
                if name:
                    return name
                constituents = getattr(material_select, "MaterialConstituents", ())
                if constituents:
                    mat = getattr(constituents[0], "Material", None)
                    if mat:
                        return getattr(mat, "Name", None)

        except Exception:
            pass

        return None

    def _build_quantity_mapping(self):
        """Build element -> quantities mapping from IfcElementQuantity."""
        try:
            for rel in self.ifc.by_type("IfcRelDefinesByProperties"):
                prop_def = getattr(rel, "RelatingPropertyDefinition", None)
                if not prop_def:
                    continue

                # Check if it's an element quantity
                if not prop_def.is_a("IfcElementQuantity"):
                    continue

                quantities = getattr(prop_def, "Quantities", ())
                if not quantities:
                    continue

                # Parse quantities
                qty_data: Dict[str, float] = {}
                for qty in quantities:
                    name = getattr(qty, "Name", "").lower()
                    value = None

                    # Different quantity types
                    if qty.is_a("IfcQuantityArea"):
                        value = getattr(qty, "AreaValue", None)
                        if "area" not in name:
                            name = f"{name}_area"
                    elif qty.is_a("IfcQuantityVolume"):
                        value = getattr(qty, "VolumeValue", None)
                        if "volume" not in name:
                            name = f"{name}_volume"
                    elif qty.is_a("IfcQuantityLength"):
                        value = getattr(qty, "LengthValue", None)
                        if "length" not in name:
                            name = f"{name}_length"
                    elif qty.is_a("IfcQuantityCount"):
                        value = getattr(qty, "CountValue", None)

                    if value is not None:
                        qty_data[name] = float(value)

                # Associate with elements
                related = getattr(rel, "RelatedObjects", ())
                if related and qty_data:
                    for elem in related:
                        if elem.id() not in self._element_quantities:
                            self._element_quantities[elem.id()] = {}
                        self._element_quantities[elem.id()].update(qty_data)

        except Exception as e:
            logger.warning(f"Quantity mapping build encountered issue: {e}")

    def _extract_by_type(self) -> List[QTOByType]:
        """Extract quantities aggregated by IFC type."""
        try:
            type_data: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
                "count": 0,
                "total_area": 0.0,
                "total_volume": 0.0,
                "total_length": 0.0,
            })

            # Physical element types to track
            physical_types = [
                "IfcWall", "IfcWallStandardCase", "IfcSlab", "IfcColumn",
                "IfcBeam", "IfcDoor", "IfcWindow", "IfcStair", "IfcRamp",
                "IfcRoof", "IfcCurtainWall", "IfcRailing", "IfcMember",
                "IfcPlate", "IfcFooting", "IfcPile", "IfcCovering",
                "IfcBuildingElementProxy", "IfcFurnishingElement",
                "IfcSpace", "IfcFlowTerminal", "IfcFlowSegment",
            ]

            for ifc_type in physical_types:
                try:
                    for entity in self.ifc.by_type(ifc_type):
                        type_data[ifc_type]["count"] += 1

                        # Add quantities if available
                        qtys = self._element_quantities.get(entity.id(), {})
                        for key, value in qtys.items():
                            if "area" in key.lower():
                                type_data[ifc_type]["total_area"] += value
                            elif "volume" in key.lower():
                                type_data[ifc_type]["total_volume"] += value
                            elif "length" in key.lower():
                                type_data[ifc_type]["total_length"] += value
                except Exception:
                    continue

            # Convert to list
            result = []
            for type_name, data in sorted(type_data.items(), key=lambda x: -x[1]["count"]):
                if data["count"] > 0:
                    result.append(QTOByType(
                        ifc_type=type_name,
                        count=data["count"],
                        total_area=round(data["total_area"], 2) if data["total_area"] > 0 else None,
                        total_volume=round(data["total_volume"], 3) if data["total_volume"] > 0 else None,
                        total_length=round(data["total_length"], 2) if data["total_length"] > 0 else None,
                    ))

            return result

        except Exception as e:
            logger.warning(f"By-type extraction encountered issue: {e}")
            return []

    def _extract_by_storey(self) -> List[QTOByStorey]:
        """Extract quantities aggregated by storey."""
        try:
            storey_data: Dict[str, Dict[str, Any]] = {}

            # Initialize storeys
            for storey in self.ifc.by_type("IfcBuildingStorey"):
                guid = getattr(storey, "GlobalId", "")
                name = getattr(storey, "Name", "Unnamed")
                storey_data[guid] = {
                    "name": name,
                    "element_count": 0,
                    "gross_area": 0.0,
                    "types": defaultdict(int),
                }

            # Process elements
            for elem_id, storey_guid in self._element_storeys.items():
                if storey_guid not in storey_data:
                    continue

                storey_data[storey_guid]["element_count"] += 1

                # Get element type
                try:
                    elem = self.ifc.by_id(elem_id)
                    type_name = elem.is_a()
                    storey_data[storey_guid]["types"][type_name] += 1
                except Exception:
                    pass

            # Get space areas per storey
            for space in self.ifc.by_type("IfcSpace"):
                try:
                    # Find containing storey
                    for rel in self.ifc.by_type("IfcRelAggregates"):
                        if space in (getattr(rel, "RelatedObjects", ()) or ()):
                            relating = getattr(rel, "RelatingObject", None)
                            if relating and relating.is_a("IfcBuildingStorey"):
                                storey_guid = getattr(relating, "GlobalId", "")
                                if storey_guid in storey_data:
                                    # Get space area
                                    qtys = self._element_quantities.get(space.id(), {})
                                    for key, value in qtys.items():
                                        if "area" in key.lower():
                                            storey_data[storey_guid]["gross_area"] += value
                                            break
                                break
                except Exception:
                    continue

            # Convert to list
            result = []
            for guid, data in storey_data.items():
                result.append(QTOByStorey(
                    storey_name=data["name"],
                    storey_guid=guid,
                    element_count=data["element_count"],
                    gross_area=round(data["gross_area"], 2) if data["gross_area"] > 0 else None,
                    types=dict(data["types"]),
                ))

            # Sort by name (attempt to order floors logically)
            result.sort(key=lambda x: x.storey_name)

            return result

        except Exception as e:
            logger.warning(f"By-storey extraction encountered issue: {e}")
            return []

    def _extract_by_material(self) -> List[QTOByMaterial]:
        """Extract quantities aggregated by material."""
        try:
            material_data: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
                "element_count": 0,
                "total_volume": 0.0,
                "ifc_types": set(),
            })

            for elem_id, material_name in self._element_materials.items():
                material_data[material_name]["element_count"] += 1

                # Get element type
                try:
                    elem = self.ifc.by_id(elem_id)
                    material_data[material_name]["ifc_types"].add(elem.is_a())
                except Exception:
                    pass

                # Get volume
                qtys = self._element_quantities.get(elem_id, {})
                for key, value in qtys.items():
                    if "volume" in key.lower():
                        material_data[material_name]["total_volume"] += value
                        break

            # Convert to list
            result = []
            for name, data in sorted(material_data.items(), key=lambda x: -x[1]["element_count"]):
                result.append(QTOByMaterial(
                    material_name=name,
                    element_count=data["element_count"],
                    total_volume=round(data["total_volume"], 3) if data["total_volume"] > 0 else None,
                    ifc_types=sorted(list(data["ifc_types"])),
                ))

            return result

        except Exception as e:
            logger.warning(f"By-material extraction encountered issue: {e}")
            return []

    def _extract_totals(self) -> QTOTotals:
        """Extract summary totals."""
        totals = QTOTotals()

        try:
            # Element count
            totals.element_count = len(list(self.ifc.by_type("IfcProduct")))

            # Space count
            totals.space_count = len(list(self.ifc.by_type("IfcSpace")))

            # Storey count
            totals.storey_count = len(list(self.ifc.by_type("IfcBuildingStorey")))

            # Material count
            totals.material_count = len(self._element_materials)

            # Type count (distinct types)
            type_set: Set[str] = set()
            for product in self.ifc.by_type("IfcProduct"):
                type_set.add(product.is_a())
            totals.type_count = len(type_set)

            # GFA from spaces
            gfa = 0.0
            nfa = 0.0
            for space in self.ifc.by_type("IfcSpace"):
                qtys = self._element_quantities.get(space.id(), {})
                for key, value in qtys.items():
                    if "grossfloorarea" in key.lower().replace("_", "").replace(" ", ""):
                        gfa += value
                    elif "netfloorarea" in key.lower().replace("_", "").replace(" ", ""):
                        nfa += value
                    elif "area" in key.lower() and gfa == 0:
                        gfa += value  # Fallback

            totals.gross_floor_area = round(gfa, 2) if gfa > 0 else None
            totals.net_floor_area = round(nfa, 2) if nfa > 0 else None

            # Total volume
            total_vol = sum(
                sum(v for k, v in qtys.items() if "volume" in k.lower())
                for qtys in self._element_quantities.values()
            )
            totals.total_volume = round(total_vol, 3) if total_vol > 0 else None

        except Exception as e:
            logger.warning(f"Totals extraction encountered issue: {e}")

        return totals
