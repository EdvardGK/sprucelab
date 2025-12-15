# Research Plan: Performance Benchmarking

**Plan ID**: RP-001
**Date**: 2025-10-25
**Duration**: 2-4 weeks
**Priority**: **CRITICAL** (blocks architectural decisions)
**Owner**: TBD
**Status**: Not Started

---

## Objective

Measure real-world performance of IfcOpenShell, PostgreSQL, and viewer stack to make evidence-based architectural decisions.

**Success Criteria**:
- Hard numbers for all performance metrics
- Comparison to competitors (Solibri, Dalux, IFC.js)
- Identification of actual bottlenecks (not assumed bottlenecks)
- Data-driven optimization priorities

---

## Background

All three consultants make performance assumptions without providing benchmark data:
- "Custom Rust parser is faster" - no evidence
- "IfcOpenShell is slow" - no measurements
- "Neo4j is needed for complex queries" - no baseline PostgreSQL data
- "2-5x faster than Solibri" - no competitor benchmarks

**This research plan provides the missing evidence.**

---

## Research Questions

1. How fast is IfcOpenShell for parsing 100MB, 500MB, 1GB IFC files?
2. Where does processing time go? (I/O, parsing, geometry, database insert)
3. How does IfcOpenShell compare to competitors?
4. Is PostgreSQL fast enough for BIM coordinator queries?
5. Can we achieve 60 FPS in viewer with 100k+ triangles?
6. What are the actual bottlenecks?

---

## Methodology

### 1. Test Environment Setup

**Hardware** (identical for all tests):
```
CPU: AMD Ryzen 9 5900X (12 cores, 24 threads) or equivalent
RAM: 32 GB DDR4
SSD: NVMe M.2 (read: 3500 MB/s, write: 3000 MB/s)
GPU: NVIDIA RTX 3060 (12GB VRAM) or equivalent
OS: Ubuntu 22.04 LTS or Windows 11
```

**Software**:
```
Python: 3.11
IfcOpenShell: 0.7.0, 0.8.0-dev
PostgreSQL: 15.5
Redis: 7.2 (optional)
Node.js: 20 LTS
Three.js: Latest stable
```

**Why Identical Hardware Matters**:
- Ensures fair comparison
- Eliminates hardware as variable
- Makes benchmarks reproducible

### 2. Test Data Collection

**IFC File Corpus** (diverse, real-world files):

| Size | Description | Source | Element Count |
|------|-------------|--------|---------------|
| 10 MB | Small office building | buildingSMART samples | ~5k elements |
| 50 MB | Medium apartment complex | Open-source models | ~25k elements |
| 100 MB | Large commercial building | Real project (anonymized) | ~50k elements |
| 500 MB | Hospital with MEP | Real project (anonymized) | ~200k elements |
| 1 GB | Infrastructure + building | Federated model | ~500k elements |

**Schema Coverage**:
- At least 2 files per IFC version: IFC2x3, IFC4, IFC4.3
- Mix of disciplines: Architecture, Structure, MEP
- Geographic variety: Norwegian, EU, US standards

**How to Obtain**:
- buildingSMART open samples: https://www.buildingsmart.org/sample-test-files/
- IFC.js open models: https://github.com/IFCjs/test-ifc-files
- OpenBIM community: Request anonymized real-world files
- Create synthetic large files (script to duplicate elements)

### 3. Benchmark Categories

#### A. Parser Performance (IfcOpenShell)

**Test Cases**:
1. Metadata-only parsing (no geometry)
2. Full parsing (with geometry)
3. Serial vs. parallel geometry extraction
4. Streaming vs. full-file-load

**Metrics**:
- Parse time (seconds)
- Memory usage (MB peak)
- CPU utilization (% per core)
- Time breakdown (I/O, parsing, geometry, etc.)

**Test Script** (Python):
```python
import ifcopenshell
import time
import psutil
import os

def benchmark_parse(file_path, parallel=False):
    start_time = time.time()
    start_mem = psutil.Process().memory_info().rss / 1024 / 1024  # MB

    # Open IFC file
    ifc_file = ifcopenshell.open(file_path)
    parse_time = time.time() - start_time

    # Extract geometry
    geom_start = time.time()
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)

    if parallel:
        # Use multiprocessing
        from multiprocessing import Pool
        with Pool(8) as pool:
            results = pool.map(extract_geometry, ifc_file.by_type('IfcElement'))
    else:
        # Serial
        results = [extract_geometry(elem) for elem in ifc_file.by_type('IfcElement')]

    geom_time = time.time() - geom_start
    total_time = time.time() - start_time
    peak_mem = psutil.Process().memory_info().rss / 1024 / 1024

    return {
        'file': os.path.basename(file_path),
        'file_size_mb': os.path.getsize(file_path) / 1024 / 1024,
        'parse_time_s': parse_time,
        'geometry_time_s': geom_time,
        'total_time_s': total_time,
        'peak_memory_mb': peak_mem,
        'elements': len(ifc_file.by_type('IfcElement')),
    }

def extract_geometry(element):
    try:
        shape = ifcopenshell.geom.create_shape(settings, element)
        return shape
    except:
        return None

# Run benchmarks
for file in test_files:
    result = benchmark_parse(file, parallel=True)
    print(result)
```

**Expected Output**:
```
File: office_10mb.ifc
  File Size: 10.2 MB
  Parse Time: 1.2s
  Geometry Time: 3.8s
  Total Time: 5.0s
  Peak Memory: 450 MB
  Elements: 5,234
```

#### B. Database Performance (PostgreSQL)

**Test Cases**:
1. Insert 100k entities (bulk vs. one-by-one)
2. Query by type (e.g., all IfcWall)
3. Query by property (JSONB search)
4. Spatial query (bounding box overlap)
5. Relationship traversal (JOINs)

**Metrics**:
- Query time (milliseconds)
- Insert time (seconds for 100k entities)
- Index effectiveness (EXPLAIN ANALYZE output)
- Memory usage

**Test Script** (SQL + Python):
```sql
-- Test 1: Bulk insert performance
BEGIN;
COPY ifc_entities FROM '/tmp/entities.csv' WITH CSV;
COMMIT;
-- Measure time

-- Test 2: Indexed query (should be < 10ms)
EXPLAIN ANALYZE
SELECT * FROM ifc_entities
WHERE model_id = 'uuid-here'
  AND ifc_type = 'IfcWall';

-- Test 3: JSONB property query (should be < 100ms)
EXPLAIN ANALYZE
SELECT * FROM ifc_entities
WHERE properties @> '{"IsExternal": true}';

-- Test 4: Spatial query (should be < 200ms)
EXPLAIN ANALYZE
SELECT * FROM ifc_entities
WHERE box(point(bbox_min_x, bbox_min_y), point(bbox_max_x, bbox_max_y))
  && box(point(0, 0), point(100, 100));

-- Test 5: Relationship query (measure JOIN performance)
EXPLAIN ANALYZE
SELECT e.*, s.name as storey_name
FROM ifc_entities e
JOIN spatial_hierarchy sh ON sh.entity_id = e.id
JOIN ifc_entities s ON s.id = sh.parent_id
WHERE e.model_id = 'uuid-here';
```

**Expected Output**:
```
Query Type: Simple Filter (IfcWall)
  Time: 8ms
  Rows: 2,543
  Index Used: idx_ifc_type

Query Type: JSONB Property
  Time: 45ms
  Rows: 1,234
  Index Used: idx_properties (GIN)

Query Type: Spatial (bbox)
  Time: 120ms
  Rows: 567
  Index Used: idx_bbox (GiST)
```

#### C. Viewer Performance (Three.js + WebGPU)

**Test Cases**:
1. Load 10k triangles (should be instant)
2. Load 100k triangles (target < 3s)
3. Load 500k triangles (with LOD)
4. Rendering FPS (60 FPS target)
5. Memory usage (GPU + CPU)

**Metrics**:
- Load time (seconds)
- FPS (frames per second)
- GPU memory usage (MB)
- CPU memory usage (MB)
- Draw calls (lower is better)

**Test Script** (JavaScript):
```javascript
// Benchmark viewer load time
const startTime = performance.now();

// Load geometry
const geometry = await loadGeometry(modelId);
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// Render first frame
renderer.render(scene, camera);
const loadTime = performance.now() - startTime;

// Measure FPS
let frames = 0;
let fpsStartTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);

  frames++;
  if (performance.now() - fpsStartTime >= 1000) {
    const fps = frames;
    console.log(`FPS: ${fps}`);
    frames = 0;
    fpsStartTime = performance.now();
  }
}
animate();

// Measure memory
console.log(`CPU Memory: ${performance.memory.usedJSHeapSize / 1024 / 1024} MB`);
console.log(`GPU Memory: ${renderer.info.memory.geometries} geometries`);
console.log(`Draw Calls: ${renderer.info.render.calls}`);
```

**Expected Output**:
```
Triangles: 100,000
Load Time: 2.3s
FPS: 60
CPU Memory: 320 MB
GPU Memory: 85 MB
Draw Calls: 45
```

#### D. Competitor Benchmarking

**Tools to Test**:
1. Solibri Office (commercial)
2. Dalux Field (commercial)
3. IFC.js (open-source)
4. FZK Viewer (open-source)

**Metrics** (same test files):
- Load time
- Viewer responsiveness
- Feature completeness
- Crash rate / stability

**Test Protocol**:
```
For each competitor:
1. Load same 100MB IFC file
2. Measure time to first render
3. Test navigation (pan, orbit, zoom)
4. Test property inspection
5. Test clash detection (if available)
6. Note any crashes or errors

Record:
- Load time: X seconds
- FPS: X frames/second
- Crashes: Yes/No
- Features: List
```

---

## Test Execution Plan

### Week 1: Environment Setup + Baseline Tests

**Days 1-2**: Environment Setup
- ✅ Provision benchmark hardware (cloud or local)
- ✅ Install all software (IfcOpenShell, PostgreSQL, Node.js)
- ✅ Collect test IFC files (10MB, 50MB, 100MB, 500MB, 1GB)
- ✅ Write benchmark scripts (Python, SQL, JS)

**Days 3-5**: Baseline IfcOpenShell Tests
- ✅ Run parser benchmarks (serial vs. parallel)
- ✅ Measure memory usage
- ✅ Profile with `cProfile` to find bottlenecks
- ✅ Document results

**Deliverable**: `Week1_IfcOpenShell_Baseline_Results.md`

### Week 2: Database + Viewer Tests

**Days 1-2**: PostgreSQL Benchmarks
- ✅ Load 100k entities from real IFC file
- ✅ Run query benchmarks (filters, JSONB, spatial, JOINs)
- ✅ Test index effectiveness
- ✅ Document results

**Days 3-5**: Viewer Benchmarks
- ✅ Build simple Three.js viewer
- ✅ Load test geometries (10k, 100k, 500k triangles)
- ✅ Measure FPS, memory, load time
- ✅ Test WebGPU vs. WebGL
- ✅ Document results

**Deliverable**: `Week2_Database_Viewer_Results.md`

### Week 3: Competitor Benchmarking

**Days 1-3**: Install + Test Competitors
- ✅ Install Solibri (trial license)
- ✅ Install Dalux (trial license)
- ✅ Install IFC.js (open-source)
- ✅ Run same test files through each
- ✅ Measure load time, FPS, features

**Days 4-5**: Analysis + Documentation
- ✅ Compare results to IfcOpenShell stack
- ✅ Identify gaps (where competitors are faster/better)
- ✅ Identify opportunities (where we can be faster)
- ✅ Document findings

**Deliverable**: `Week3_Competitor_Comparison.md`

### Week 4: Optimization Tests + Final Report

**Days 1-3**: Optimization Experiments
- ✅ Test Redis caching (vs. direct PostgreSQL)
- ✅ Test parallel workers (2, 4, 8, 16 cores)
- ✅ Test LOD generation strategies
- ✅ Test mesh instancing effectiveness

**Days 4-5**: Final Report
- ✅ Aggregate all results
- ✅ Create charts and tables
- ✅ Write recommendations
- ✅ Present to team

**Deliverable**: `Performance_Benchmark_Report.md` (final)

---

## Expected Results

### Hypothesis 1: IfcOpenShell is Fast Enough

**Test**: Parse 100MB IFC file

**Expected**:
- Parse time: 5-10 seconds
- Geometry time: 20-40 seconds (parallel)
- Total: 25-50 seconds

**Decision**:
- ✅ If < 60s → IfcOpenShell is fast enough for MVP
- ⚠️ If 60-120s → Optimize (more workers, streaming)
- ❌ If > 120s → Consider custom parser (unlikely)

### Hypothesis 2: PostgreSQL is Fast Enough

**Test**: Query 100k entities by type

**Expected**:
- Simple filter: < 10ms
- JSONB property: < 100ms
- Spatial query: < 200ms
- JOIN query: < 500ms

**Decision**:
- ✅ If all < targets → PostgreSQL sufficient
- ⚠️ If some slow → Add Redis caching
- ❌ If JOINs > 2s → Consider Neo4j (unlikely)

### Hypothesis 3: WebGPU Viewer Beats WebGL

**Test**: Render 100k triangles

**Expected**:
- WebGL: 30-45 FPS
- WebGPU: 55-60 FPS
- Load time: 2-4 seconds

**Decision**:
- ✅ If WebGPU > 50 FPS → Use WebGPU-first
- ⚠️ If WebGL > 50 FPS → Either is fine
- ❌ If both < 30 FPS → Need optimization (LOD, culling)

---

## Data Collection Template

**File**: `benchmark_results.csv`

```csv
test_type,file_name,file_size_mb,metric,value,unit,notes
parser,office_10mb.ifc,10.2,parse_time,1.2,seconds,Serial
parser,office_10mb.ifc,10.2,geometry_time,3.8,seconds,Serial
parser,office_10mb.ifc,10.2,parse_time,1.1,seconds,Parallel 8 workers
parser,office_10mb.ifc,10.2,geometry_time,1.2,seconds,Parallel 8 workers
database,n/a,n/a,simple_filter,8,milliseconds,IfcWall query
database,n/a,n/a,jsonb_query,45,milliseconds,IsExternal=true
viewer,test_model,n/a,load_time,2.3,seconds,100k triangles
viewer,test_model,n/a,fps,60,frames/second,100k triangles
```

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Can't get large test files** | High | Create synthetic files (script to duplicate elements) |
| **Competitor tools crash** | Medium | Document crash, test with smaller files |
| **Hardware differences** | Medium | Use cloud VM with fixed specs |
| **Time overrun** | Medium | Prioritize critical tests (parser, database) |

---

## Deliverables

1. ✅ **Week 1**: IfcOpenShell baseline results
2. ✅ **Week 2**: Database + viewer results
3. ✅ **Week 3**: Competitor comparison
4. ✅ **Final**: Comprehensive performance report with recommendations

**Final Report Contents**:
- Executive summary (1 page)
- Methodology (how tests were run)
- Results (tables, charts)
- Competitor comparison
- Bottleneck analysis
- Recommendations (which stack to use)

---

## Success Criteria

✅ **Success if**:
- All benchmarks completed
- Hard numbers for all metrics
- Comparison to competitors
- Clear recommendation (IfcOpenShell vs. custom parser)
- Team has confidence in decision

❌ **Failure if**:
- Benchmarks incomplete
- No competitor data
- Unclear recommendations
- Team still uncertain

---

## Next Steps After Benchmark

**If IfcOpenShell is fast enough**:
- ✅ Proceed with Phase 1 MVP using IfcOpenShell
- ✅ Focus development on features, not parser
- ✅ Optimize IfcOpenShell usage (parallel workers, streaming)

**If IfcOpenShell is too slow**:
- ⚠️ Investigate bottlenecks (profiling)
- ⚠️ Try optimization (more workers, faster I/O)
- ⚠️ Evaluate Rust wrapper for specific bottlenecks
- ⚠️ Consider custom parser (only if proven necessary)

---

**Status**: Ready to execute
**Next Action**: Assign owner, provision hardware, start Week 1
**Estimated Cost**: 1 developer @ 2-4 weeks = 80-160 hours
