# Quality Control: IFC Element Extraction

**Document Version**: 1.0
**Date**: 2025-10-11
**Purpose**: Technical validation and quality assurance for IFC mesh extraction

## Element Type Hierarchy

### IfcElement Class Hierarchy

Based on IFC4 schema specification:

```
IfcProduct (abstract)
├── IfcElement (abstract) ← WE USE THIS
│   ├── IfcBuildingElement (architectural/structural)
│   │   ├── IfcWall
│   │   ├── IfcWallStandardCase
│   │   ├── IfcSlab
│   │   ├── IfcRoof
│   │   ├── IfcBeam
│   │   ├── IfcColumn
│   │   ├── IfcStair
│   │   ├── IfcRailing
│   │   ├── IfcDoor
│   │   ├── IfcWindow
│   │   ├── IfcCurtainWall
│   │   ├── IfcMember
│   │   ├── IfcPlate
│   │   ├── IfcFooting
│   │   └── IfcPile
│   ├── IfcDistributionElement (MEP)
│   │   ├── IfcDistributionFlowElement
│   │   │   ├── IfcDuctSegment
│   │   │   ├── IfcDuctFitting
│   │   │   ├── IfcPipeSegment
│   │   │   ├── IfcPipeFitting
│   │   │   ├── IfcCableSegment
│   │   │   ├── IfcCableFitting
│   │   │   ├── IfcCableCarrierSegment
│   │   │   ├── IfcCableCarrierFitting
│   │   │   └── IfcFlowTerminal
│   │   └── IfcDistributionControlElement
│   ├── IfcElementComponent
│   │   ├── IfcFastener
│   │   ├── IfcMechanicalFastener
│   │   └── IfcReinforcingElement
│   ├── IfcFurnishingElement
│   │   └── IfcFurniture
│   ├── IfcGeographicElement (terrain/site)
│   ├── IfcTransportElement (elevators, etc.)
│   ├── IfcVirtualElement
│   └── IfcBuildingElementProxy (catch-all)
├── IfcSpatialElement (NOT INCLUDED)
│   ├── IfcBuilding
│   ├── IfcBuildingStorey
│   ├── IfcSite
│   └── IfcSpace
├── IfcGrid (NOT INCLUDED)
└── IfcPort (NOT INCLUDED)
```

### Why IfcElement?

**Includes** (what we want):
- All physical building components
- All MEP components
- Terrain and site features
- Furniture and equipment

**Excludes** (what we don't want):
- Spatial containers (buildings, stories, spaces)
- Construction grids
- Ports and connectors
- Abstract groupings

## Validation Criteria

### 1. Element Selection Validation

**Query**:
```python
elements = ifc_file.by_type('IfcElement')
```

**Validation checks**:
- [ ] Count matches expected element count from IFC viewer
- [ ] No `IfcBuilding` or `IfcBuildingStorey` in results
- [ ] No `IfcSpace` objects in results
- [ ] All elements have `is_a()` that inherits from `IfcElement`

**Test queries**:
```python
# Verify no spatial elements
spatial_count = len([e for e in elements if e.is_a('IfcSpatialElement')])
assert spatial_count == 0, "Should not include spatial elements"

# Verify all are IfcElement
for element in elements:
    assert element.is_a('IfcElement'), f"{element.GlobalId} is not IfcElement"
```

### 2. Geometry Representation Validation

**Filter**:
```python
if element.Representation:
    # Element has 3D geometry
```

**Validation checks**:
- [ ] `Representation` is not None
- [ ] Geometry can be created via `ifcopenshell.geom.create_shape()`
- [ ] Resulting shape has vertices and faces
- [ ] No elements without representation are processed

**Edge cases**:
- Elements with `Representation=None` → Skip, log count
- Elements where `create_shape()` fails → Skip, log GUID and error
- Empty geometry (0 vertices) → Skip, log warning

### 3. Coordinate System Validation

**Settings**:
```python
settings = ifcopenshell.geom.settings()
settings.set(settings.USE_WORLD_COORDS, True)
```

**Validation checks**:
- [ ] All coordinates are in world space (not local)
- [ ] No rotation matrices applied to output
- [ ] Coordinates match visual inspection in IFC viewer
- [ ] Origin (0,0,0) matches IFC file origin

**Test approach**:
1. Select known element with visible position in IFC viewer
2. Extract geometry
3. Calculate bounding box center
4. Compare to position shown in IFC viewer
5. Verify coordinates match (within tolerance)

**Tolerance**: ±1mm (0.001 units in typical IFC files)

### 4. Geometry Data Validation

**Vertices array**:
- [ ] Shape: (N, 3) where N > 0
- [ ] Data type: float
- [ ] No NaN values
- [ ] No Inf values
- [ ] Reasonable coordinate ranges (e.g., |x|, |y|, |z| < 1,000,000)

**Faces array**:
- [ ] Shape: (M, 3) where M > 0 (triangulated)
- [ ] Data type: integer
- [ ] All indices >= 0
- [ ] All indices < len(vertices)
- [ ] No negative indices

**Validation code**:
```python
import numpy as np

def validate_geometry(vertices, faces, element_guid):
    """Validate geometry arrays."""
    errors = []

    # Vertices
    if vertices.shape[1] != 3:
        errors.append(f"Vertices not Nx3: {vertices.shape}")
    if np.any(np.isnan(vertices)):
        errors.append("Vertices contain NaN")
    if np.any(np.isinf(vertices)):
        errors.append("Vertices contain Inf")
    if np.any(np.abs(vertices) > 1e6):
        errors.append("Vertices have extreme values")

    # Faces
    if faces.shape[1] != 3:
        errors.append(f"Faces not Mx3: {faces.shape}")
    if np.any(faces < 0):
        errors.append("Faces contain negative indices")
    if np.any(faces >= len(vertices)):
        errors.append("Faces reference invalid vertex indices")

    if errors:
        print(f"⚠ Validation failed for {element_guid}:")
        for error in errors:
            print(f"  - {error}")
        return False
    return True
```

## Data Claims and Assumptions

### Claim 1: World Coordinates Eliminate Transform Complexity
**Status**: VALIDATED (from point cloud script experience)

**Evidence**:
- Point cloud script successfully extracts geometry with `USE_WORLD_COORDS=True`
- No rotation matrix calculations needed
- Output coordinates match IFC viewer positions

**Assumption**: ifcopenshell correctly transforms all local coordinates to world space

**Verification**: Manual spot-checks on known elements

### Claim 2: IfcElement Covers All Physical Objects
**Status**: VALIDATED (IFC schema specification)

**Evidence**:
- IFC4 schema documentation confirms hierarchy
- `IfcElement` is the abstract supertype for all physical building elements
- Spatial containers inherit from `IfcSpatialElement`, not `IfcElement`

**Reference**: https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/

### Claim 3: Minimal Data (Vertices + Faces) Is Sufficient
**Status**: LOGICAL DERIVATION

**Rationale**:
- Normals = computed from face orientations
- Bounding box = min/max of vertices
- Centroid = mean of vertices
- Volume = computed from mesh
- Any file format = serialization of vertices + faces

**Verification**: Test reconstruction in Three.js and matplotlib

### Claim 4: Memory-Efficient Processing
**Status**: TO BE VALIDATED

**Assumption**: Processing one element at a time prevents memory issues

**Test cases**:
- Small model: 100 elements
- Medium model: 10,000 elements
- Large model: 100,000 elements

**Metrics**:
- Peak memory usage
- Processing time per element
- Total processing time

## Known Edge Cases

### 1. Elements Without Geometry
**Example**: `IfcBuildingElementProxy` with no geometric representation
**Behavior**: Skip (Representation=None)
**Logging**: Count skipped elements, report at end

### 2. Geometry Extraction Failures
**Example**: Complex curved surfaces that fail tessellation
**Behavior**: Catch exception, log GUID, continue processing
**Logging**: Record failed GUIDs for manual inspection

### 3. Invalid Coordinate Values
**Example**: Corrupt IFC file with NaN coordinates
**Behavior**: Validate arrays, skip element if invalid
**Logging**: Log GUID and validation failure reason

### 4. Extremely Large Meshes
**Example**: Terrain element with 10 million triangles
**Behavior**: Process as-is (simplification is optional future feature)
**Logging**: Report triangle count in statistics

### 5. Duplicate Elements
**Example**: Same GUID appears multiple times
**Behavior**: Process each instance (should not happen in valid IFC)
**Logging**: Warn if duplicate GUIDs detected

## Quality Control Checklist

Before releasing extraction results:

- [ ] Total element count matches IFC file
- [ ] Skipped element count is reasonable (< 5%)
- [ ] No validation errors in output
- [ ] Spot-check 10 random elements:
  - [ ] Coordinates match IFC viewer
  - [ ] Geometry looks correct visually
  - [ ] Triangle count is reasonable
- [ ] JSON file is valid and parseable
- [ ] NumPy file loads correctly
- [ ] Statistics file shows:
  - [ ] Element type breakdown
  - [ ] Success/failure counts
  - [ ] Total vertices/triangles
  - [ ] Processing time

## Performance Baselines

Target performance (to be validated):

| Model Size | Element Count | Time Budget | Memory Budget |
|-----------|---------------|-------------|---------------|
| Small     | < 100         | < 10s       | < 500MB       |
| Medium    | 1,000         | < 2min      | < 2GB         |
| Large     | 10,000        | < 20min     | < 8GB         |
| XLarge    | 100,000       | < 3hr       | < 16GB        |

Actual performance to be measured and documented during testing.

## References

1. **IFC4 Schema Documentation**
   - URL: https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/
   - Section: IfcElement hierarchy

2. **IfcOpenShell Documentation**
   - URL: https://ifcopenshell.org/
   - Geometry settings: https://blenderbim.org/docs-python/ifcopenshell-python/geometry_settings.html

3. **Point Cloud Script** (validation reference)
   - File: `versions/ifc_to_pointcloud_from_ito_[timestamp].py`
   - Proven approach for world coordinate extraction

## Changelog

**v1.0** (2025-10-11):
- Initial quality control document
- Documented IfcElement hierarchy
- Defined validation criteria
- Listed edge cases and handling
