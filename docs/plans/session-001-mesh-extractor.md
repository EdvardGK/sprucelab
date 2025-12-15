# Session 001: IFC Mesh Extractor Implementation Plan

**Date**: 2025-10-11
**Goal**: Create a tool to extract 3D mesh geometry from IFC models in simple, universal formats

## Background

The existing `ifc_to_pointcloud_from_ito.py` script uses an external Excel file (ITO data) to identify elements and extract geometry. The new tool will iterate directly through the IFC file, extracting all physical elements with 3D geometry.

## Problem Statement

IFC models contain complex geometry with:
- Local coordinate systems and rotation matrices
- Transform hierarchies
- Redundant internal geometry (CAD artifacts from SolidWorks, etc.)
- Large triangle counts (valves with millions of triangles)

**Goal**: Extract clean geometry in world coordinates (vertices + faces) that can be:
- Loaded into Three.js for web visualization
- Analyzed with NumPy/NetworkX/matplotlib/Plotly
- Converted to any 3D format (GLTF, OBJ, STL, point clouds)
- Used for collision detection, LOD management, model simplification

## Key Design Decisions

### 1. Element Filtering Strategy

**Decision**: Use `IfcElement` as base type + `Representation` check

**Rationale**:
- `IfcElement` is the IFC schema class for all physical building elements
- Includes: walls, slabs, roofs, stairs, columns, beams (architectural)
- Includes: ducts, pipes, cables, equipment (MEP)
- Includes: terrain features (IfcGeographicElement)
- Excludes: spatial containers (IfcBuilding, IfcBuildingStorey, IfcSpace, IfcSite)
- `Representation` attribute check ensures element has 3D geometry

**Implementation**:
```python
elements = ifc_file.by_type('IfcElement')
for element in elements:
    if element.Representation:
        # Process this element
```

### 2. Coordinate System

**Decision**: Extract all geometry in world coordinates

**Rationale**:
- Proven approach from point cloud script
- No rotation matrix calculations needed
- No transform hierarchy traversal
- Simple XYZ coordinates ready for any output format
- Same approach works for analysis (NumPy) and visualization (Three.js)

**Implementation**:
```python
settings = ifcopenshell.geom.settings()
settings.set(settings.USE_WORLD_COORDS, True)
shape = ifcopenshell.geom.create_shape(settings, element)
```

### 3. Minimal Data Output

**Decision**: Store only GUID, type, vertices, and faces

**Rationale**:
- Everything else is derivative (normals, bbox, centroid, etc.)
- Keeps output files small and fast to load
- Easy to process in any language/framework
- Conversion to other formats happens on-demand, not by default

**Output Structure**:
```json
{
  "source": "model.ifc",
  "elements": [
    {
      "guid": "2O2Fr$t4X7Zf8NOew3FLOH",
      "type": "IfcWall",
      "vertices": [[x,y,z], [x,y,z], ...],
      "faces": [[i,j,k], [i,j,k], ...]
    }
  ]
}
```

### 4. Export Formats

**Decision**: Default to JSON and NumPy .npz, other formats on-demand

**Default outputs**:
- `model_geometry.json` - Human-readable, web-friendly
- `model_geometry.npz` - Efficient for Python analysis
- `extraction_stats.json` - Processing statistics

**On-demand outputs** (via future conversion scripts):
- GLTF/GLB files
- Point clouds (LAZ/PLY)
- Individual element files (OBJ, PLY)

**Rationale**:
- Minimal file I/O by default
- No thousands of individual files cluttering directories
- User chooses what they need when they need it

### 5. Memory Efficiency

**Decision**: Process elements one at a time, combine at export

**Rationale**:
- Large IFC models can have 100,000+ elements
- Loading all meshes into memory at once may cause issues
- Process incrementally, serialize to output formats

**Implementation**:
```python
elements_data = []
for element in ifc_elements:
    vertices, faces = extract_geometry(element)
    elements_data.append({
        'guid': element.GlobalId,
        'type': element.is_a(),
        'vertices': vertices.tolist(),
        'faces': faces.tolist()
    })
# Export combined data
export_json(elements_data, output_path)
export_numpy(elements_data, npz_path)
```

## Implementation Plan

### Phase 1: Core Extraction (This Session)

1. **Create script structure**
   - Class: `IFCMeshExtractor`
   - Methods: `load_ifc()`, `extract_element_geometry()`, `process()`, `export_json()`, `export_numpy()`

2. **Element iteration**
   - Get all `IfcElement` instances
   - Filter by `Representation` attribute
   - Track counts by element type for statistics

3. **Geometry extraction**
   - Use `ifcopenshell.geom.create_shape()` with world coords
   - Extract vertices as Nx3 array
   - Extract faces as Mx3 array (triangle indices)
   - Handle extraction failures gracefully

4. **Export**
   - JSON format with pretty printing
   - NumPy .npz with separate arrays per element
   - Statistics file with counts, timing, failures

5. **Progress reporting**
   - Use tqdm for progress bar
   - Report elements processed vs skipped
   - Report total vertices/triangles extracted

### Phase 2: Optional Features (Future)

1. **Mesh simplification**
   - Add `--simplify` flag
   - Use Open3D's quadric decimation
   - Configurable target triangle count

2. **Conversion utilities**
   - `convert_to_gltf.py` - Create GLTF from JSON
   - `convert_to_pointcloud.py` - Sample point cloud from mesh
   - `export_element.py` - Extract single element by GUID

3. **Filtering options**
   - Filter by element type
   - Filter by bounding box region
   - Filter by property values

## Technical Specifications

### Dependencies

```
ifcopenshell>=0.7.0
numpy>=1.24.0
tqdm>=4.65.0
```

Optional (for future features):
```
open3d>=0.18.0        # Mesh simplification
laspy>=2.0.0          # Point cloud export
trimesh>=3.20.0       # Mesh utilities
pygltflib>=1.16.0     # GLTF export
```

### Command Line Interface

```bash
# Basic usage
python ifc_mesh_extractor.py model.ifc

# Custom output directory
python ifc_mesh_extractor.py model.ifc --output-dir output/

# Future: with simplification
python ifc_mesh_extractor.py model.ifc --simplify --target-triangles 5000

# Future: export individual elements
python ifc_mesh_extractor.py model.ifc --export-individual
```

### Output Files

```
output/
├── model_geometry.json      # All elements with vertices/faces
├── model_geometry.npz        # NumPy arrays (efficient)
└── extraction_stats.json     # Processing statistics
```

### Error Handling

- **Missing geometry**: Skip element, log warning, continue processing
- **Corrupt IFC**: Catch exception, report which element failed
- **Memory issues**: Process in batches if needed (future optimization)
- **Invalid coordinates**: Validate vertex arrays, skip if NaN/Inf detected

## Testing Strategy

### Test Files
- Small IFC model (< 100 elements) for initial testing
- Medium IFC model (1,000-10,000 elements) for performance
- Large IFC model (100,000+ elements) for stress testing

### Validation
1. Verify element count matches `IfcElement` count in IFC
2. Validate all vertices are valid coordinates (no NaN/Inf)
3. Validate all face indices are within vertex array bounds
4. Verify world coordinates (check against known positions)
5. Test JSON can be loaded and parsed
6. Test NumPy arrays can be loaded and used

### Performance Targets
- Small model (< 100 elements): < 10 seconds
- Medium model (1,000 elements): < 2 minutes
- Large model (10,000 elements): < 20 minutes

## Success Criteria

✅ Script extracts geometry from all `IfcElement` instances with `Representation`
✅ Outputs valid JSON and NumPy .npz files
✅ Geometry is in world coordinates (verified against IFC model)
✅ Statistics report shows element counts, success/failure rates
✅ Can load JSON data into Three.js for visualization
✅ Can load NumPy data for analysis with matplotlib/Plotly

## Next Steps (Future Sessions)

1. Implement mesh simplification with Open3D
2. Create GLTF conversion utility
3. Create point cloud sampling utility
4. Add filtering options (by type, region, properties)
5. Optimize for very large models (streaming, batching)
6. Add unit tests for geometry extraction
7. Create example notebooks for analysis workflows

## References

- buildingSMART IFC Documentation: https://standards.buildingsmart.org/
- IfcOpenShell Documentation: https://ifcopenshell.org/
- IFC Schema (IfcElement hierarchy): https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/
