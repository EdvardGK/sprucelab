"""
Extract IfcProfileDef data from IFC elements.

Profiles define the 2D cross-section shape of extruded elements (beams, columns, etc.).
Common types: IfcRectangleProfileDef, IfcCircleProfileDef, IfcIShapeProfileDef, etc.

Usage:
    extractor = ProfileExtractor()
    profile = extractor.extract_profile(ifc_file, element_guid)
    # Returns ProfileResult with parametric data + 2D outline points
"""

import math
from dataclasses import dataclass, field
from typing import List, Optional, Tuple, Dict, Any


@dataclass
class ProfileResult:
    """Result of profile extraction."""
    profile_type: str  # e.g., "IfcRectangleProfileDef"
    profile_name: Optional[str] = None
    params: Dict[str, float] = field(default_factory=dict)
    outline: List[Tuple[float, float]] = field(default_factory=list)  # Closed polyline [(x,y), ...]
    has_voids: bool = False
    inner_outlines: List[List[Tuple[float, float]]] = field(default_factory=list)


class ProfileExtractor:
    """Extract 2D profile outlines from IFC elements."""

    def extract_from_element(self, ifc_file, guid: str) -> Optional[ProfileResult]:
        """
        Extract profile from an element (instance or type) by GUID.

        Tries:
        1. Element's type object (IfcTypeObject) representations
        2. Element's own representation
        3. Direct profile if element IS a type object
        """
        try:
            element = ifc_file.by_guid(guid)
        except RuntimeError:
            return None

        # If element IS a type object, check its RepresentationMaps directly
        if element.is_a('IfcTypeObject'):
            return self._extract_from_type_object(element)

        # Try via the element's defining type first (most reliable)
        type_object = self._get_type_object(element)
        if type_object:
            result = self._extract_from_type_object(type_object)
            if result:
                return result

        # Fall back to the element's own representation
        return self._extract_from_representation(element)

    def _get_type_object(self, element) -> Optional[Any]:
        """Get the IfcTypeObject for an element via IsDefinedBy."""
        if not hasattr(element, 'IsDefinedBy'):
            return None

        for rel in element.IsDefinedBy:
            if rel.is_a('IfcRelDefinesByType'):
                return rel.RelatingType
        return None

    def _extract_from_type_object(self, type_object) -> Optional[ProfileResult]:
        """Extract profile from IfcTypeObject's RepresentationMaps."""
        if not hasattr(type_object, 'RepresentationMaps') or not type_object.RepresentationMaps:
            return None

        for rep_map in type_object.RepresentationMaps:
            mapped_rep = rep_map.MappedRepresentation
            if not mapped_rep:
                continue

            result = self._find_profile_in_items(mapped_rep.Items)
            if result:
                return result

        return None

    def _extract_from_representation(self, element) -> Optional[ProfileResult]:
        """Extract profile from element's own IfcProductDefinitionShape."""
        if not hasattr(element, 'Representation') or not element.Representation:
            return None

        for rep in element.Representation.Representations:
            result = self._find_profile_in_items(rep.Items)
            if result:
                return result

        return None

    def _find_profile_in_items(self, items) -> Optional[ProfileResult]:
        """Search representation items for profile-defining geometry."""
        if not items:
            return None

        for item in items:
            # Direct extrusion
            if item.is_a('IfcExtrudedAreaSolid'):
                return self._extract_profile_def(item.SweptArea)

            # Revolved solid (e.g., circular pipes)
            if item.is_a('IfcRevolvedAreaSolid'):
                return self._extract_profile_def(item.SweptArea)

            # Boolean result — check first operand
            if item.is_a('IfcBooleanResult') or item.is_a('IfcBooleanClippingResult'):
                result = self._extract_from_boolean(item)
                if result:
                    return result

            # Mapped item — recurse into mapped representation
            if item.is_a('IfcMappedItem'):
                source = item.MappingSource
                if source and source.MappedRepresentation:
                    result = self._find_profile_in_items(
                        source.MappedRepresentation.Items
                    )
                    if result:
                        return result

        return None

    def _extract_from_boolean(self, boolean_result, depth: int = 0) -> Optional[ProfileResult]:
        """Extract profile from boolean operations (CSG tree)."""
        if depth > 5:  # Prevent infinite recursion
            return None

        first_operand = boolean_result.FirstOperand

        if first_operand.is_a('IfcExtrudedAreaSolid'):
            return self._extract_profile_def(first_operand.SweptArea)

        if first_operand.is_a('IfcBooleanResult') or first_operand.is_a('IfcBooleanClippingResult'):
            return self._extract_from_boolean(first_operand, depth + 1)

        return None

    def _extract_profile_def(self, profile_def) -> Optional[ProfileResult]:
        """Extract data from an IfcProfileDef and compute outline."""
        if not profile_def:
            return None

        profile_type = profile_def.is_a()
        profile_name = getattr(profile_def, 'ProfileName', None)

        # Rectangle
        if profile_type == 'IfcRectangleProfileDef':
            return self._rectangle_profile(profile_def, profile_name)

        # Rectangle with rounded corners
        if profile_type == 'IfcRoundedRectangleProfileDef':
            return self._rectangle_profile(profile_def, profile_name)

        # Hollow rectangle (RHS/SHS steel tube)
        if profile_type == 'IfcRectangleHollowProfileDef':
            return self._rectangle_hollow_profile(profile_def, profile_name)

        # Circle
        if profile_type == 'IfcCircleProfileDef':
            return self._circle_profile(profile_def, profile_name)

        # Hollow circle (pipe)
        if profile_type == 'IfcCircleHollowProfileDef':
            return self._circle_hollow_profile(profile_def, profile_name)

        # I-shape (standard steel beam/column)
        if profile_type in ('IfcIShapeProfileDef', 'IfcAsymmetricIShapeProfileDef'):
            return self._ishape_profile(profile_def, profile_name)

        # L-shape (angle)
        if profile_type == 'IfcLShapeProfileDef':
            return self._lshape_profile(profile_def, profile_name)

        # T-shape
        if profile_type == 'IfcTShapeProfileDef':
            return self._tshape_profile(profile_def, profile_name)

        # C-shape (channel)
        if profile_type in ('IfcCShapeProfileDef', 'IfcUShapeProfileDef'):
            return self._cshape_profile(profile_def, profile_name)

        # Arbitrary closed profile — polyline
        if profile_type == 'IfcArbitraryClosedProfileDef':
            return self._arbitrary_closed_profile(profile_def, profile_name)

        # Arbitrary with voids
        if profile_type == 'IfcArbitraryProfileDefWithVoids':
            return self._arbitrary_with_voids_profile(profile_def, profile_name)

        # Ellipse
        if profile_type == 'IfcEllipseProfileDef':
            return self._ellipse_profile(profile_def, profile_name)

        # Unknown profile type — return params only, no outline
        params = {}
        for attr in dir(profile_def):
            if attr.startswith('_') or attr in ('Position', 'ProfileType', 'ProfileName'):
                continue
            val = getattr(profile_def, attr, None)
            if isinstance(val, (int, float)):
                params[attr] = float(val)

        return ProfileResult(
            profile_type=profile_type,
            profile_name=profile_name,
            params=params,
        )

    # =========================================================================
    # Profile outline generators
    # =========================================================================

    def _rectangle_profile(self, p, name: Optional[str]) -> ProfileResult:
        w = float(p.XDim) / 2
        h = float(p.YDim) / 2
        return ProfileResult(
            profile_type=p.is_a(),
            profile_name=name,
            params={'XDim': p.XDim, 'YDim': p.YDim},
            outline=[(-w, -h), (w, -h), (w, h), (-w, h), (-w, -h)],
        )

    def _circle_profile(self, p, name: Optional[str]) -> ProfileResult:
        r = float(p.Radius)
        n = 48
        outline = [
            (r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n))
            for i in range(n + 1)
        ]
        return ProfileResult(
            profile_type='IfcCircleProfileDef',
            profile_name=name,
            params={'Radius': r},
            outline=outline,
        )

    def _circle_hollow_profile(self, p, name: Optional[str]) -> ProfileResult:
        r = float(p.Radius)
        t = float(p.WallThickness)
        r_inner = r - t
        n = 48

        outer = [
            (r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n))
            for i in range(n + 1)
        ]
        inner = [
            (r_inner * math.cos(2 * math.pi * i / n), r_inner * math.sin(2 * math.pi * i / n))
            for i in range(n + 1)
        ]

        return ProfileResult(
            profile_type='IfcCircleHollowProfileDef',
            profile_name=name,
            params={'Radius': r, 'WallThickness': t},
            outline=outer,
            has_voids=True,
            inner_outlines=[inner],
        )

    def _ishape_profile(self, p, name: Optional[str]) -> ProfileResult:
        """I-beam / H-beam profile."""
        w = float(p.OverallWidth) / 2
        d = float(p.OverallDepth) / 2
        tw = float(p.WebThickness) / 2
        tf = float(p.FlangeThickness)

        # Optional fillet radius
        fr = float(getattr(p, 'FilletRadius', 0) or 0)

        params = {
            'OverallWidth': p.OverallWidth,
            'OverallDepth': p.OverallDepth,
            'WebThickness': p.WebThickness,
            'FlangeThickness': tf,
        }
        if fr:
            params['FilletRadius'] = fr

        # I-shape outline (clockwise from bottom-left of bottom flange)
        # Without fillet radius for simplicity
        outline = [
            (-w, -d),           # bottom-left
            (w, -d),            # bottom-right
            (w, -d + tf),       # bottom flange top-right
            (tw, -d + tf),      # web right, bottom
            (tw, d - tf),       # web right, top
            (w, d - tf),        # top flange bottom-right
            (w, d),             # top-right
            (-w, d),            # top-left
            (-w, d - tf),       # top flange bottom-left
            (-tw, d - tf),      # web left, top
            (-tw, -d + tf),     # web left, bottom
            (-w, -d + tf),      # bottom flange top-left
            (-w, -d),           # close
        ]

        return ProfileResult(
            profile_type=p.is_a(),
            profile_name=name,
            params=params,
            outline=outline,
        )

    def _lshape_profile(self, p, name: Optional[str]) -> ProfileResult:
        """L-angle profile."""
        d = float(p.Depth)
        w = float(p.Width)
        t = float(p.Thickness)

        outline = [
            (0, 0),
            (w, 0),
            (w, t),
            (t, t),
            (t, d),
            (0, d),
            (0, 0),
        ]

        # Center the profile
        cx, cy = w / 2, d / 2
        outline = [(x - cx, y - cy) for x, y in outline]

        return ProfileResult(
            profile_type='IfcLShapeProfileDef',
            profile_name=name,
            params={'Depth': d, 'Width': w, 'Thickness': t},
            outline=outline,
        )

    def _tshape_profile(self, p, name: Optional[str]) -> ProfileResult:
        """T-shape profile."""
        d = float(p.Depth)
        fw = float(p.FlangeWidth) / 2
        tw = float(p.WebThickness) / 2
        tf = float(p.FlangeThickness)

        outline = [
            (-fw, d),           # top-left
            (fw, d),            # top-right
            (fw, d - tf),       # flange bottom-right
            (tw, d - tf),       # web top-right
            (tw, 0),            # web bottom-right
            (-tw, 0),           # web bottom-left
            (-tw, d - tf),      # web top-left
            (-fw, d - tf),      # flange bottom-left
            (-fw, d),           # close
        ]

        # Center vertically
        cy = d / 2
        outline = [(x, y - cy) for x, y in outline]

        return ProfileResult(
            profile_type='IfcTShapeProfileDef',
            profile_name=name,
            params={
                'Depth': d, 'FlangeWidth': fw * 2,
                'WebThickness': tw * 2, 'FlangeThickness': tf,
            },
            outline=outline,
        )

    def _cshape_profile(self, p, name: Optional[str]) -> ProfileResult:
        """C-channel / U-shape profile."""
        d = float(p.Depth) / 2
        w = float(p.Width)
        t = float(p.WallThickness)
        girth = float(getattr(p, 'Girth', t) or t)

        outline = [
            (0, -d),
            (w, -d),
            (w, -d + girth),
            (t, -d + girth),
            (t, d - girth),
            (w, d - girth),
            (w, d),
            (0, d),
            (0, -d),
        ]

        # Center horizontally
        cx = w / 2
        outline = [(x - cx, y) for x, y in outline]

        return ProfileResult(
            profile_type=p.is_a(),
            profile_name=name,
            params={'Depth': d * 2, 'Width': w, 'WallThickness': t},
            outline=outline,
        )

    def _ellipse_profile(self, p, name: Optional[str]) -> ProfileResult:
        a = float(p.SemiAxis1)
        b = float(p.SemiAxis2)
        n = 48
        outline = [
            (a * math.cos(2 * math.pi * i / n), b * math.sin(2 * math.pi * i / n))
            for i in range(n + 1)
        ]
        return ProfileResult(
            profile_type='IfcEllipseProfileDef',
            profile_name=name,
            params={'SemiAxis1': a, 'SemiAxis2': b},
            outline=outline,
        )

    def _arbitrary_closed_profile(self, p, name: Optional[str]) -> ProfileResult:
        """Extract outline from IfcArbitraryClosedProfileDef."""
        outline = self._curve_to_points(p.OuterCurve)
        return ProfileResult(
            profile_type='IfcArbitraryClosedProfileDef',
            profile_name=name,
            outline=outline,
        )

    def _arbitrary_with_voids_profile(self, p, name: Optional[str]) -> ProfileResult:
        """Extract outline + inner voids."""
        outline = self._curve_to_points(p.OuterCurve)
        inner = [self._curve_to_points(curve) for curve in (p.InnerCurves or [])]
        return ProfileResult(
            profile_type='IfcArbitraryProfileDefWithVoids',
            profile_name=name,
            outline=outline,
            has_voids=True,
            inner_outlines=inner,
        )

    def _curve_to_points(self, curve) -> List[Tuple[float, float]]:
        """Convert an IfcCurve to a list of 2D points."""
        if not curve:
            return []

        # IfcPolyline — direct point extraction
        if curve.is_a('IfcPolyline'):
            return [
                (float(pt.Coordinates[0]), float(pt.Coordinates[1]))
                for pt in curve.Points
            ]

        # IfcIndexedPolyCurve (IFC4)
        if curve.is_a('IfcIndexedPolyCurve'):
            coord_list = curve.Points
            if coord_list and hasattr(coord_list, 'CoordList'):
                return [
                    (float(pt[0]), float(pt[1]))
                    for pt in coord_list.CoordList
                ]

        # IfcCompositeCurve — concatenate segments
        if curve.is_a('IfcCompositeCurve'):
            points = []
            for segment in (curve.Segments or []):
                parent_curve = segment.ParentCurve
                seg_points = self._curve_to_points(parent_curve)
                if segment.SameSense is False:
                    seg_points = list(reversed(seg_points))
                # Avoid duplicate junction points
                if points and seg_points and points[-1] == seg_points[0]:
                    seg_points = seg_points[1:]
                points.extend(seg_points)
            return points

        # IfcTrimmedCurve — approximate with line for now
        if curve.is_a('IfcTrimmedCurve'):
            # For trimmed circles/ellipses, would need proper tessellation
            # For trimmed lines, just get endpoints
            basis = curve.BasisCurve
            if basis and basis.is_a('IfcLine'):
                # Approximate: just return trim points if they're cartesian
                points = []
                for trim in [curve.Trim1, curve.Trim2]:
                    for t in trim:
                        if hasattr(t, 'Coordinates'):
                            points.append(
                                (float(t.Coordinates[0]), float(t.Coordinates[1]))
                            )
                            break
                return points

        return []
