"""
Georef Checker - Coordinate Reference System, MapConversion, TrueNorth.

Checks:
- crs_defined: IfcProjectedCRS with EPSG code
- map_conversion: IfcMapConversion parameters present
- true_north: TrueNorth vector defined
- site_reference: RefLatitude/RefLongitude on IfcSite

Never raises exceptions. Always returns results.

A model without proper georeferencing is a liability for federation.
This is one of the primary sources of "rotated model" or "model in wrong location" errors.
"""

import logging
import math
from typing import TYPE_CHECKING, Dict, List, Any, Optional, Tuple

from models.health_check_schemas import (
    GeorefCluster,
    CheckResult,
    TrafficLight,
    CRSInfo,
    MapConversionInfo,
)

if TYPE_CHECKING:
    import ifcopenshell

logger = logging.getLogger(__name__)


class GeorefChecker:
    """
    Analyzes georeferencing configuration of IFC model.

    Georeferencing determines where the model sits in the real world.
    Without it, models from different disciplines won't align.
    """

    def __init__(self, ifc_file: "ifcopenshell.file", max_elements: int = 100):
        self.ifc = ifc_file
        self.max_elements = max_elements
        self.schema = self.ifc.schema

    def check(self) -> GeorefCluster:
        """Run all georeferencing checks. Never raises."""
        result = GeorefCluster()

        # Extract CRS and MapConversion info
        result.crs, result.map_conversion = self._extract_georef_info()
        result.true_north = self._extract_true_north()
        result.site_reference = self._extract_site_reference()

        # Run checks
        result.checks["crs_defined"] = self._check_crs_defined(result.crs)
        result.checks["map_conversion"] = self._check_map_conversion(result.map_conversion)
        result.checks["true_north"] = self._check_true_north(result.true_north)
        result.checks["site_reference"] = self._check_site_reference(result.site_reference)

        result.compute_status()
        return result

    def _extract_georef_info(self) -> Tuple[Optional[CRSInfo], Optional[MapConversionInfo]]:
        """Extract CRS and MapConversion from model."""
        crs_info = None
        map_info = None

        try:
            # IFC4 uses IfcMapConversion and IfcProjectedCRS
            # IFC2x3 doesn't have these - uses site coordinates only

            # Try to get IfcProjectedCRS
            crs_entities = list(self.ifc.by_type("IfcProjectedCRS"))
            if crs_entities:
                crs = crs_entities[0]
                crs_info = CRSInfo(
                    name=getattr(crs, "Name", None),
                    geodetic_datum=getattr(crs, "GeodeticDatum", None),
                    map_projection=getattr(crs, "MapProjection", None),
                )
                # EPSG might be in Name like "EPSG:25832"
                name = getattr(crs, "Name", "") or ""
                if "EPSG" in name.upper():
                    try:
                        epsg = int("".join(c for c in name if c.isdigit()))
                        crs_info.epsg_code = epsg
                    except ValueError:
                        pass

            # Try to get IfcMapConversion
            map_entities = list(self.ifc.by_type("IfcMapConversion"))
            if map_entities:
                mc = map_entities[0]
                map_info = MapConversionInfo(
                    eastings=getattr(mc, "Eastings", None),
                    northings=getattr(mc, "Northings", None),
                    orthogonal_height=getattr(mc, "OrthogonalHeight", None),
                    x_axis_abscissa=getattr(mc, "XAxisAbscissa", None),
                    x_axis_ordinate=getattr(mc, "XAxisOrdinate", None),
                    scale=getattr(mc, "Scale", None),
                )

        except Exception as e:
            logger.warning(f"Georef extraction encountered issue: {e}")

        return crs_info, map_info

    def _extract_true_north(self) -> Optional[List[float]]:
        """Extract TrueNorth direction from geometric context."""
        try:
            # TrueNorth is in IfcGeometricRepresentationContext
            contexts = list(self.ifc.by_type("IfcGeometricRepresentationContext"))

            for ctx in contexts:
                # Skip subcontexts
                if ctx.is_a("IfcGeometricRepresentationSubContext"):
                    continue

                true_north = getattr(ctx, "TrueNorth", None)
                if true_north:
                    # It's an IfcDirection
                    direction_ratios = getattr(true_north, "DirectionRatios", None)
                    if direction_ratios:
                        return list(direction_ratios)[:2]  # X, Y components

        except Exception as e:
            logger.warning(f"TrueNorth extraction encountered issue: {e}")

        return None

    def _extract_site_reference(self) -> Optional[Dict[str, float]]:
        """Extract RefLatitude/RefLongitude from IfcSite."""
        try:
            sites = list(self.ifc.by_type("IfcSite"))
            if not sites:
                return None

            site = sites[0]
            result = {}

            # RefLatitude is a tuple like (51, 30, 0, 0) for 51°30'0"
            ref_lat = getattr(site, "RefLatitude", None)
            if ref_lat:
                result["latitude"] = self._dms_to_decimal(ref_lat)

            ref_lon = getattr(site, "RefLongitude", None)
            if ref_lon:
                result["longitude"] = self._dms_to_decimal(ref_lon)

            ref_elev = getattr(site, "RefElevation", None)
            if ref_elev is not None:
                result["elevation"] = float(ref_elev)

            return result if result else None

        except Exception as e:
            logger.warning(f"Site reference extraction encountered issue: {e}")
            return None

    def _dms_to_decimal(self, dms: tuple) -> float:
        """Convert degrees/minutes/seconds to decimal."""
        try:
            degrees = dms[0] if len(dms) > 0 else 0
            minutes = dms[1] if len(dms) > 1 else 0
            seconds = dms[2] if len(dms) > 2 else 0
            micro = dms[3] if len(dms) > 3 else 0

            decimal = abs(degrees) + minutes / 60 + seconds / 3600 + micro / 3600000000

            if degrees < 0:
                decimal = -decimal

            return round(decimal, 6)
        except Exception:
            return 0.0

    def _check_crs_defined(self, crs: Optional[CRSInfo]) -> CheckResult:
        """Check if CRS is defined."""
        try:
            # IFC2x3 doesn't have IfcProjectedCRS
            if "IFC2X3" in self.schema.upper():
                return CheckResult(
                    status=TrafficLight.YELLOW,
                    count=0,
                    message="IFC2X3 schema - no IfcProjectedCRS support (use site coordinates)",
                    details={"schema": self.schema}
                )

            if not crs:
                return CheckResult(
                    status=TrafficLight.RED,
                    count=0,
                    message="No IfcProjectedCRS defined - model cannot be accurately geolocated",
                    details={"recommendation": "Add IfcProjectedCRS with EPSG code for proper federation"}
                )

            # CRS exists but check quality
            issues = []
            if not crs.epsg_code and not crs.name:
                issues.append("No EPSG code or name")
            if not crs.geodetic_datum:
                issues.append("No geodetic datum")

            if issues:
                return CheckResult(
                    status=TrafficLight.YELLOW,
                    count=len(issues),
                    message=f"CRS defined but incomplete: {', '.join(issues)}",
                    details={
                        "crs_name": crs.name,
                        "epsg_code": crs.epsg_code,
                        "issues": issues
                    }
                )

            return CheckResult(
                status=TrafficLight.GREEN,
                count=0,
                message=f"CRS defined: {crs.name or 'EPSG:' + str(crs.epsg_code)}",
                details={
                    "crs_name": crs.name,
                    "epsg_code": crs.epsg_code,
                    "geodetic_datum": crs.geodetic_datum
                }
            )

        except Exception as e:
            logger.warning(f"CRS check encountered issue: {e}")
            return CheckResult(
                status=TrafficLight.YELLOW,
                message=f"Check incomplete: {str(e)[:100]}"
            )

    def _check_map_conversion(self, mc: Optional[MapConversionInfo]) -> CheckResult:
        """Check MapConversion parameters."""
        try:
            if "IFC2X3" in self.schema.upper():
                return CheckResult(
                    status=TrafficLight.YELLOW,
                    count=0,
                    message="IFC2X3 schema - no IfcMapConversion support",
                    details={"schema": self.schema}
                )

            if not mc:
                return CheckResult(
                    status=TrafficLight.RED,
                    count=0,
                    message="No IfcMapConversion - local origin position in world unknown",
                    details={"recommendation": "Add IfcMapConversion with Eastings/Northings"}
                )

            # Check key values
            missing = []
            if mc.eastings is None:
                missing.append("Eastings")
            if mc.northings is None:
                missing.append("Northings")

            if missing:
                return CheckResult(
                    status=TrafficLight.YELLOW,
                    count=len(missing),
                    message=f"MapConversion incomplete: missing {', '.join(missing)}",
                    details={
                        "eastings": mc.eastings,
                        "northings": mc.northings,
                        "orthogonal_height": mc.orthogonal_height,
                        "missing": missing
                    }
                )

            # Check for rotation (XAxisAbscissa/XAxisOrdinate)
            has_rotation = mc.x_axis_abscissa is not None and mc.x_axis_ordinate is not None

            return CheckResult(
                status=TrafficLight.GREEN,
                count=0,
                message=f"MapConversion: E={mc.eastings:.1f}, N={mc.northings:.1f}" +
                        (f", rotated" if has_rotation else ""),
                details={
                    "eastings": mc.eastings,
                    "northings": mc.northings,
                    "orthogonal_height": mc.orthogonal_height,
                    "x_axis_abscissa": mc.x_axis_abscissa,
                    "x_axis_ordinate": mc.x_axis_ordinate,
                    "scale": mc.scale or 1.0
                }
            )

        except Exception as e:
            logger.warning(f"MapConversion check encountered issue: {e}")
            return CheckResult(
                status=TrafficLight.YELLOW,
                message=f"Check incomplete: {str(e)[:100]}"
            )

    def _check_true_north(self, true_north: Optional[List[float]]) -> CheckResult:
        """Check TrueNorth direction."""
        try:
            if not true_north:
                return CheckResult(
                    status=TrafficLight.YELLOW,
                    count=0,
                    message="TrueNorth not specified - assuming Y-axis is north",
                    details={"default": [0.0, 1.0]}
                )

            # Calculate angle from Y-axis
            x, y = true_north[0], true_north[1]
            angle_rad = math.atan2(x, y)
            angle_deg = math.degrees(angle_rad)

            # Normalize to 0-360
            if angle_deg < 0:
                angle_deg += 360

            return CheckResult(
                status=TrafficLight.GREEN,
                count=0,
                message=f"TrueNorth: {angle_deg:.1f}° from Y-axis",
                details={
                    "direction_ratios": true_north,
                    "angle_degrees": round(angle_deg, 2),
                    "note": "0° = Y-axis is true north, 90° = X-axis is true north"
                }
            )

        except Exception as e:
            logger.warning(f"TrueNorth check encountered issue: {e}")
            return CheckResult(
                status=TrafficLight.YELLOW,
                message=f"Check incomplete: {str(e)[:100]}"
            )

    def _check_site_reference(self, site_ref: Optional[Dict[str, float]]) -> CheckResult:
        """Check site reference coordinates."""
        try:
            if not site_ref:
                return CheckResult(
                    status=TrafficLight.YELLOW,
                    count=0,
                    message="No RefLatitude/RefLongitude on IfcSite",
                    details={"note": "Site reference provides approximate location context"}
                )

            has_lat = "latitude" in site_ref
            has_lon = "longitude" in site_ref
            has_elev = "elevation" in site_ref

            if has_lat and has_lon:
                lat = site_ref["latitude"]
                lon = site_ref["longitude"]

                # Sanity check coordinates
                valid = -90 <= lat <= 90 and -180 <= lon <= 180
                if not valid:
                    return CheckResult(
                        status=TrafficLight.YELLOW,
                        count=1,
                        message=f"Site coordinates out of range: {lat:.4f}, {lon:.4f}",
                        details=site_ref
                    )

                return CheckResult(
                    status=TrafficLight.GREEN,
                    count=0,
                    message=f"Site reference: {lat:.4f}°, {lon:.4f}°" +
                            (f", elev {site_ref['elevation']:.1f}m" if has_elev else ""),
                    details=site_ref
                )

            # Partial info
            return CheckResult(
                status=TrafficLight.YELLOW,
                count=0,
                message="Site reference incomplete",
                details=site_ref
            )

        except Exception as e:
            logger.warning(f"Site reference check encountered issue: {e}")
            return CheckResult(
                status=TrafficLight.YELLOW,
                message=f"Check incomplete: {str(e)[:100]}"
            )
