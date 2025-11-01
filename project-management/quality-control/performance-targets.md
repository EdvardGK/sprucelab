# Performance Targets & Benchmarks

**Date**: 2025-10-25
**Source**: Consultant 4 analysis + efficiency research
**Purpose**: Define production-ready performance baselines for BIM coordination platform
**Status**: Targets defined, ready for implementation & measurement

---

## Executive Summary

This document defines **measurable performance targets** for the IFC platform based on Consultant 4's production research, competitive analysis, and industry benchmarks. These targets represent **production-ready baselines** that distinguish professional BIM platforms from prototypes.

### Critical Insight

**Geometry generation is the bottleneck** (10-60x longer than parsing). Optimization priorities:
1. **First**: Parallel geometry extraction (4-8 workers)
2. **Second**: LOD mesh generation + instancing
3. **Third**: Compression (40% + 70%)
4. **Last**: Parser speed (already fast enough)

---

## Parser Performance

### IfcOpenShell (Server-Side)

| File Size | Parse Time (Metadata Only) | Geometry Extraction | Total Time |
|-----------|---------------------------|---------------------|------------|
| **10MB** | <1 second | 5-30 seconds | **<30 seconds** |
| **100MB** | 2-3 seconds | 30-180 seconds | **<3 minutes** |
| **500MB** | 10-15 seconds | 150-900 seconds | **<15 minutes** |
| **1GB** | 20-25 seconds | 300-1800 seconds | **<30 minutes** |

**Throughput**: ~45 MB/s (measured by Consultant 4)

**Critical Bottleneck**: Geometry extraction takes **10-60x longer** than metadata parsing.

**Real-World Example** (Consultant 4):
- 334MB file: Parses in **15 seconds**
- Same file: Geometry extraction takes **hours** without optimization

### web-ifc (Client-Side, Phase 2)

| File Size | Parse Time (WASM) | Geometry Extraction | Best For |
|-----------|-------------------|---------------------|----------|
| **10MB** | <0.5 seconds | 3-15 seconds | Web apps, real-time |
| **100MB** | 1-2 seconds | 15-90 seconds | Progressive web apps |

**Throughput**: ~80-100 MB/s (measured by Consultant 4)

**Use Case**: Client-side progressive loading, web viewers, Node.js processing

---

## Viewer Performance

### Targets (Production Baseline)

| Metric | Target | Measurement Method |
|--------|--------|--------------------|
| **Initial Display** | **<3 seconds** | Time to first visible frame (external components) |
| **Time to Interactive** | **<1 second** | Time from initial display to user can interact |
| **Frame Rate (Desktop)** | **60+ FPS** | Sustained FPS with 100K+ objects |
| **Frame Rate (Mobile)** | **30+ FPS** | Sustained FPS on mid-range mobile devices |
| **Memory (Desktop)** | <2GB | Peak memory usage for 100K+ object model |
| **Memory (Mobile)** | **<500MB** | Peak memory usage (critical for iPad/Android) |
| **Model Capacity** | **100K+ objects** | Federated multi-model viewing |

### Performance Techniques (Unanimous Consensus)

All 4 consultants agree these are **required** for production performance:

1. **LOD (Level of Detail)** - 3+ quality levels per object
2. **Frustum Culling** - Don't render off-screen objects
3. **Mesh Instancing** - Single draw call for repeated geometry (96%+ reduction for steel structures)
4. **Progressive Loading** - Show 12% of data for initial usable model (0.3s vs 6.7s)
5. **Streaming** - Adaptive network transmission based on bandwidth

### Compression Targets (Consultant 4)

| Stage | Technique | Reduction | Example |
|-------|-----------|-----------|---------|
| **Content-Based** | Identical geometry deduplication | **40%** | 100 chairs → 1 definition |
| | Material reuse | | 50 black + 50 white → 2 materials |
| | Property consolidation | | |
| **Spatial Partitioning** | Building story extraction | **~70%** | Load 12% for initial overview |
| | Component space indexing | | Internal components on-demand |
| | Progressive detail | | Detail based on camera proximity |
| **TOTAL** | Combined (multiplicative) | **~85%** | 4.5GB → ~675MB |

**Real-World Example** (Consultant 4, xeokit):
- 49MB IFC → **1.5MB XKT** (33x compression)
- Loads in **2-3 seconds** over network
- 100K+ objects @ **60fps desktop, 30fps mobile**

---

## Database Performance

### Query Targets

| Query Type | Target | Measurement Method |
|------------|--------|--------------------|
| **Simple Lookup** (by GUID, type) | **<100ms** | Single entity fetch |
| **Property Search** (JSONB indexed) | **<200ms** | Filter by property value |
| **Spatial Query** (GiST indexed) | **<500ms** | Bounding box intersection |
| **Complex Relationship** (JOINs) | <2 seconds | Multi-hop relationship traversal |

### Indexing Strategy

Required indexes for performance targets:
- **B-tree**: GUID, type, storey (fast lookups)
- **GiST**: Bounding box (spatial queries)
- **GIN**: Properties JSONB (flexible queries)

**Decision Point**: If complex relationship queries consistently >2 seconds → Evaluate Neo4j (Phase 3)

---

## Validation Performance

### Validation Layers (4-Layer Strategy, Consultant 4)

| Layer | Processing Time | Blocking? | Use Case |
|-------|----------------|-----------|----------|
| **Pre-Import** | <5 seconds | Yes (critical errors only) | File size, format, estimated time |
| **Import-Time** | <30 seconds | Configurable | Schema conformance, syntax errors |
| **Post-Import** | <60 seconds | No (report only) | Semantic relationships, quality |
| **Use-Case (IDS)** | <120 seconds | No (report only) | Project requirements, MVD compliance |

**Default Mode**: Balanced (reject syntax/schema errors, warn on quality issues, import everything parseable)

---

## Competitive Benchmarks

### Dalux (Mobile Performance Leader)

**Reported Capability**: 1M+ BIM objects smooth on iPad
**Architecture**: Proprietary 3D engine, 250+ developer team, computer graphics specialists
**Validation**: Pragmatic (imports Solibri clash results)

**Our Target**: Match mobile performance (30+ FPS @ 100K+ objects) with better validation

### Solibri (Validation Leader)

**Validation**: Strict (rejects malformed IFC), 25+ years rule development, 70+ predefined rulesets
**Performance**: Desktop-only, up to 64GB RAM recommended
**Architecture**: OpenGL, buildingSMART certification

**Our Target**: Match validation rigor in cloud-native architecture (tiered validation, optional strict mode)

### ACC/Procore (Cloud Platforms)

**Validation**: Pragmatic (accept imperfect files)
**Performance**: Middling (WebGL, server-side processing)
**Focus**: Construction management with embedded BIM

**Our Target**: Better performance (xeokit/web-ifc) + better validation (IDS support) than cloud platforms

### Market Gap (Consultant 4)

> "Dalux owns mobile, Solibri owns validation, ACC/Procore middling. **Opportunity: Cloud-native with xeokit-level web performance + Solibri-level validation.**"

---

## Benchmarking Plan

### Phase 0: Baseline Measurement (2-4 weeks)

**Goal**: Measure current performance vs. targets

**Parser Benchmarks**:
- [ ] IfcOpenShell parse time: 10MB, 100MB, 500MB, 1GB files
- [ ] Metadata extraction time (separate from geometry)
- [ ] Geometry extraction time (serial vs parallel)
- [ ] Memory usage per file size

**Database Benchmarks**:
- [ ] Simple lookup (<100ms target)
- [ ] JSONB property search (<200ms target)
- [ ] Spatial query (<500ms target)
- [ ] Complex JOIN performance (<2s target)
- [ ] Load 10K, 100K, 1M entities

**Viewer Benchmarks** (Phase 2, with viewer):
- [ ] Initial display time (<3s target)
- [ ] Time to interactive (<1s target)
- [ ] Frame rate: 10K, 50K, 100K triangles
- [ ] Memory usage on desktop & mobile
- [ ] With/without LOD, instancing, culling

**Competitor Benchmarks**:
- [ ] Solibri load times (same files)
- [ ] Dalux viewer performance (observe)
- [ ] IFC.js performance (open-source comparison)

**Deliverable**: `Performance_Baseline_Report.md` in `/quality-control/`

### Phase 1: Optimization (Iterative)

**Priority Order** (based on Consultant 4's bottleneck analysis):

1. **Parallel Geometry Extraction** (Expected: 4-8x speedup)
   - Implement multiprocessing (4-8 workers)
   - Benchmark: Before/after comparison
   - Target: 100MB file geometry <30 seconds

2. **LOD Mesh Generation** (Expected: 67% vertex reduction)
   - Generate 3 quality levels
   - Implement distance-based switching
   - Benchmark: Frame rate improvement

3. **Mesh Instancing** (Expected: 96%+ reduction for steel)
   - Identify repeated geometry
   - Single draw call per geometry type
   - Benchmark: Draw call count, frame rate

4. **Compression** (Expected: 40% + 70% = ~85%)
   - Content-based deduplication
   - Spatial partitioning
   - Benchmark: File size, memory usage

5. **Caching** (Only if needed)
   - Add Redis if DB queries >500ms
   - Benchmark: Query time improvement

**Deliverable**: Update `Performance_Baseline_Report.md` after each optimization

---

## IFC5 Performance Considerations

**Timeline** (Consultant 4):
- buildingSMART alpha release: November 2024
- Production stability: 2026+
- IFC4.x dominance: 3-5 years

**Architecture Changes**:
- EXPRESS/STEP → TypeSpec/JSON (simpler parsing)
- Procedural geometry → Mesh-first (faster processing)
- Modular structure → Better progressive loading

**Recommendation**: Plan dual IFC4/IFC5 support starting 2025, but don't block MVP on IFC5. Monitor standard development.

---

## Success Criteria

### MVP (Phase 1) - Production-Ready Baseline

- ✅ Parse 100MB IFC in <3 seconds (metadata)
- ✅ Extract geometry for 100MB IFC in <3 minutes (parallel)
- ✅ Initial viewer display <3 seconds (external components)
- ✅ Viewer interactive <1 second after initial display
- ✅ 30+ FPS mobile, 60+ FPS desktop (100K objects)
- ✅ <500MB memory on mobile
- ✅ Database queries <200ms (JSONB indexed)
- ✅ Validation report generated <60 seconds

### Phase 2 - Competitive Performance

- ✅ Match Dalux mobile performance (30+ FPS @ 1M objects target)
- ✅ Match Solibri validation rigor (IDS support, configurable strictness)
- ✅ Better than ACC/Procore (faster viewer + better validation)
- ✅ Compression: ~85% size/memory reduction
- ✅ Support federated models (100K+ objects)

### Phase 3 - Market Leader

- ✅ Exceed Dalux performance (GPU compute shaders, advanced LOD)
- ✅ Exceed Solibri validation (AI-powered predictive issue detection)
- ✅ Real-time collaboration (WebSocket, BCF integration)
- ✅ Custom scripting (Python API for BIM coordinators)
- ✅ Advanced analytics (quantity dashboards, clash trends)

---

## References

**Consultant 4 Benchmarks**:
- IfcOpenShell: ~45 MB/s (measured)
- web-ifc: 80-100 MB/s (measured)
- Ara3D: ~167 MB/s (measured, .NET)
- xeokit compression: 33x (49MB → 1.5MB)
- Real-world example: 334MB parses in 15s, geometry takes hours

**Competitive Analysis**:
- Dalux: 1M+ objects smooth on iPad (reported)
- Solibri: Up to 64GB RAM recommended (desktop-only)
- xeokit: Schependomlaan model 100K+ objects @ 60fps desktop, 30fps mobile

**Research Sources**:
- `/efficiency/consultant4.md` - Production benchmarks
- `/efficiency/CRITICAL_ANALYSIS.md` - Competitive analysis section
- `/efficiency/DECISION_MATRIX.md` - Performance scoring

---

**Last Updated**: 2025-10-25
**Status**: ✅ Targets Defined
**Next Action**: Execute Phase 0 benchmarking plan
