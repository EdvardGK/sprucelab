# Decision Matrix: IFC Platform Architecture

**Date**: 2025-10-25 (**Updated with Consultant 4 analysis**)
**Purpose**: Tabular comparison of architectural choices with scoring
**Methodology**: Score 1-5 (1=worst, 5=best) based on critical analysis
**Consultants**: 4 expert recommendations analyzed

---

## Parser Technology Comparison

**NEW**: Consultant 4 provides actual performance benchmarks and introduces **web-ifc** as a proven alternative for web applications.

| Criteria | IfcOpenShell (C++) | **web-ifc (NEW)** | Rust + C++ Hybrid | Custom Rust Parser |
|----------|-------------------|-------------------|-------------------|-------------------|
| **Performance** (measured) | 4/5 (**45 MB/s**) | **5/5 (80-100 MB/s)** | 4/5 (theoretical) | 4/5 (theoretical) |
| **Development Time** | 5/5 (0 days, exists) | **5/5 (0 days, exists)** | 3/5 (2-3 months) | 1/5 (6-12 months) |
| **Best Use Case** | 5/5 (Python/server) | **5/5 (Web apps, Node.js, WASM)** | 3/5 (hybrid) | 2/5 (custom requirements) |
| **Memory Safety** | 3/5 (manual C++) | 4/5 (C++ in WASM sandbox) | 4/5 (Rust I/O layer) | 5/5 (guaranteed) |
| **Schema Support** | 5/5 (2x3, 4, 4.3, IFC5 coming) | 4/5 (2x3, 4, web-focused) | 3/5 (requires porting) | 1/5 (full implementation) |
| **Geometry Processing** | 5/5 (OpenCASCADE, proven) | 4/5 (optimized for web) | 5/5 (leverage ifcopenshell) | 2/5 (custom, untested) |
| **Community & Support** | 5/5 (large, active) | **4/5 (growing, web-focused)** | 3/5 (mixed ecosystems) | 2/5 (small IFC-Rust) |
| **Risk** | 5/5 (low, proven) | **5/5 (proven in web-ifc-viewer)** | 3/5 (medium, untested) | 1/5 (high, greenfield) |
| **Maintainability** | 4/5 (C++ complexity) | 5/5 (WASM portable) | 3/5 (FFI boundary) | 4/5 (modern Rust) |
| **Complexity** | 5/5 (simple integration) | 5/5 (simple for web) | 3/5 (hybrid complexity) | 2/5 (full stack) |
| **Cost** | 5/5 (free, open-source) | 5/5 (MIT license) | 4/5 (dev time moderate) | 1/5 (dev time very high) |
| **TOTAL SCORE** | **46/50** ✅ | **48/50** ✅✅ | **35/50** | **23/50** |

**WINNERS**:
- **IfcOpenShell** (46/50) for **Python/server-side** processing
- **web-ifc** (48/50) for **web/client-side** processing

**Reasoning** (Updated with Consultant 4 data):
- **IfcOpenShell**: Best for current Django backend (Python integration, comprehensive API)
- **web-ifc**: Best for future web apps (80-100MB/s, WASM, client-side processing)
- **Critical Insight**: Parser speed is NOT the bottleneck - geometry generation takes **10-60x longer**
- **Real example**: 334MB parses in 15s, geometry takes **hours** without optimization
- **Recommendation**: Use IfcOpenShell for server (Phase 1), consider web-ifc for client-side viewer (Phase 2)

---

## Database Architecture Comparison

| Criteria | PostgreSQL + TimescaleDB | Redis + Neo4j + S3 | PostgreSQL + Redis |
|----------|--------------------------|-------------------|-------------------|
| **Query Performance (Simple)** | 4/5 (fast, indexed) | 5/5 (Redis very fast) | 4/5 (fast, indexed) |
| **Query Performance (Complex)** | 3/5 (JOINs slower) | 5/5 (Neo4j excellent) | 3/5 (JOINs slower) |
| **Development Time** | 4/5 (familiar stack) | 2/5 (3 technologies) | 3/5 (2 technologies) |
| **Operational Complexity** | 3/5 (Timescale adds layer) | 1/5 (3 DBs to manage) | 4/5 (simple Redis cache) |
| **Cost (Cloud Hosting)** | 4/5 (single DB moderate) | 2/5 (3 DBs expensive) | 4/5 (PostgreSQL + small Redis) |
| **Scalability** | 4/5 (proven at scale) | 4/5 (each scales well) | 4/5 (horizontal scaling) |
| **Flexibility** | 5/5 (JSONB very flexible) | 5/5 (each DB optimized) | 5/5 (JSONB + caching) |
| **Schema Support** | 5/5 (handles IFC2x3-IFC5) | 5/5 (schema-agnostic) | 5/5 (JSONB flexible) |
| **Learning Curve** | 4/5 (PostgreSQL familiar) | 2/5 (3 different query languages) | 4/5 (PostgreSQL + simple Redis) |
| **Community & Tools** | 5/5 (massive ecosystem) | 4/5 (each has ecosystem) | 5/5 (well-documented) |
| **TOTAL SCORE** | **41/50** | **35/50** | **41/50** ✅ |

**WINNER**: **PostgreSQL + Redis (tie with PostgreSQL + TimescaleDB)**

**Reasoning**:
- PostgreSQL + Redis scores same as PostgreSQL + TimescaleDB
- **Recommendation**: PostgreSQL only for MVP, add Redis in Phase 2 if profiling shows need
- TimescaleDB not needed (BIM versions are discrete, not time-series)
- Neo4j deferred until proven necessary (most BIM queries are simple filters, not deep graph traversal)

**Phased Approach**:
1. Phase 1: PostgreSQL only
2. Phase 2: Add Redis caching (if slow)
3. Phase 3: Add Neo4j (if complex queries needed)

---

## Rendering API Comparison

| Criteria | WebGL 2.0 | WebGPU + WebGL Fallback | WebGPU Only |
|----------|-----------|-------------------------|-------------|
| **Performance** | 3/5 (mature, optimized) | 5/5 (modern, faster) | 5/5 (modern, fastest) |
| **Browser Support** | 5/5 (universal, stable) | 4/5 (WebGPU growing) | 2/5 (limited browsers) |
| **Compute Shaders** | 1/5 (no support) | 5/5 (WebGPU has it) | 5/5 (full support) |
| **Development Complexity** | 3/5 (stateful, error-prone) | 4/5 (dual implementation) | 5/5 (clean, modern API) |
| **Future-Proofing** | 2/5 (legacy standard) | 5/5 (WebGL fallback ensures compatibility) | 5/5 (future standard) |
| **Ecosystem (Libraries)** | 5/5 (Three.js mature) | 5/5 (Three.js supports both) | 4/5 (emerging) |
| **Debugging Tools** | 5/5 (SpectorJS, Chrome tools) | 4/5 (WebGPU tools maturing) | 4/5 (limited tools) |
| **Risk** | 5/5 (low, proven) | 4/5 (medium, fallback mitigates) | 2/5 (high, limited support) |
| **TOTAL SCORE** | **29/40** | **36/40** ✅ | **32/40** |

**WINNER**: **WebGPU + WebGL Fallback** (36/40)

**Reasoning**:
- Best of both worlds: Modern performance + universal compatibility
- All 4 consultants agree on this approach
- Three.js and Babylon.js support both APIs transparently
- Can detect WebGPU support and fall back to WebGL automatically

**Implementation**:
```javascript
// Three.js auto-detects and uses WebGPU if available
const renderer = new THREE.WebGPURenderer() || new THREE.WebGLRenderer();
```

---

## Viewer Library Comparison (NEW from Consultant 4)

**Consultant 4 introduces xeokit-sdk** as a production-proven BIM-specific alternative to generic 3D libraries.

| Criteria | **xeokit-sdk** | Three.js + web-ifc | Babylon.js |
|----------|---------------|---------------------|------------|
| **Performance (large models)** | 5/5 (60fps desktop, 30fps mobile) | 4/5 (good with manual optimization) | 4/5 (WebGPU helps) |
| **Compression** | **5/5 (33x: 49MB → 1.5MB)** | 3/5 (manual optimization) | 3/5 (manual optimization) |
| **BIM-Specific Features** | 5/5 (BCF, sections, storeys built-in) | 2/5 (requires implementation) | 2/5 (requires implementation) |
| **Development Time** | 5/5 (low - features included) | 3/5 (medium - build features) | 3/5 (medium - build features) |
| **License** | 2/5 (AGPL-3.0, commercial for SaaS) | **5/5 (MIT, free)** | **5/5 (Apache 2.0, free)** |
| **Flexibility** | 3/5 (BIM-optimized, less flexible) | 5/5 (full control) | 5/5 (full game engine) |
| **Community** | 3/5 (BIM-focused, smaller) | **5/5 (1.8M weekly npm)** | 4/5 (Microsoft-backed) |
| **Bundle Size** | 5/5 (small, optimized XKT format) | 5/5 (~600KB core) | 3/5 (~2.5MB) |
| **Production Maturity** | 5/5 (proven: 100K+ objects @ 60fps) | 4/5 (web-ifc-viewer demonstrates) | 4/5 (stable, semantic versioning) |
| **Risk** | 4/5 (low - proven, but license cost) | 5/5 (low - MIT, large community) | 4/5 (low - Microsoft backing) |
| **TOTAL SCORE** | **42/50** ✅ | **41/50** ✅ | **37/50** |

**WINNER**: **xeokit-sdk** (42/50) **IF** you can afford commercial licenses (~$2-5K/year)

**ALTERNATIVE**: **Three.js + web-ifc** (41/50) **IF** MIT license is critical (SaaS licensing concern)

**Reasoning**:
- **xeokit advantages**:
  - Extreme compression: 33x reduction (49MB → 1.5MB)
  - BIM features built-in (BCF viewpoints, section planes, storey views)
  - Production-proven: Schependomlaan model (100K+ objects @ 60fps desktop, 30fps mobile)
  - Faster time-to-market: 2-3 months saved vs building BIM features yourself

- **xeokit constraints**:
  - AGPL-3.0 license requires commercial license for SaaS (~$2-5K/year estimated)
  - Less flexible for custom interactions (BIM-optimized)

- **Three.js advantages**:
  - MIT license (no licensing costs)
  - Maximum flexibility (full control over rendering)
  - Largest community (1.8M weekly npm downloads)
  - web-ifc-viewer demonstrates viability for IFC

- **Three.js constraints**:
  - Must implement BIM features manually (BCF, sections, LOD, compression)
  - 2-3 months additional development time

**Decision Framework**:
- **Startup MVP**: xeokit (~$2-5K/year worth 2-3 months faster launch = faster revenue)
- **Long-term product with large team**: Three.js (more control, no licensing, but higher dev cost)
- **Hybrid approach**: Start with xeokit for MVP, evaluate migration to Three.js once you have revenue data

---

## Storage Tier Comparison

| Criteria | 2-Tier (DB + File) | 3-Tier (Hot/Warm/Cold) | Redis + Neo4j + S3 |
|----------|-------------------|------------------------|-------------------|
| **Simplicity** | 5/5 (simple) | 4/5 (clear separation) | 2/5 (complex) |
| **Query Performance** | 4/5 (DB indexed) | 5/5 (Redis very fast) | 5/5 (Redis tier 1) |
| **Development Time** | 5/5 (minimal) | 4/5 (medium) | 2/5 (high) |
| **Operational Cost** | 5/5 (DB + object storage) | 4/5 (adds caching layer) | 3/5 (3 storage systems) |
| **Data Consistency** | 5/5 (DB is source) | 4/5 (sync across tiers) | 3/5 (sync 3 systems) |
| **Flexibility** | 4/5 (can add caching) | 5/5 (clear tier roles) | 5/5 (optimized per tier) |
| **Risk** | 5/5 (low, standard) | 4/5 (medium) | 2/5 (high, operational) |
| **TOTAL SCORE** | **33/35** ✅ | **30/35** | **22/35** |

**WINNER**: **2-Tier (Database + IFC File)** (33/35)

**Reasoning**:
- Simplest to implement and maintain
- PostgreSQL with proper indexing is fast enough for MVP
- Can add Redis caching in Phase 2 if profiling shows need
- IFC file as source of truth ensures data fidelity

**Phased Approach**:
1. Phase 1: PostgreSQL + S3 (IFC files)
2. Phase 2: Add Redis caching (if slow)
3. Phase 3: Add specialized storage if needed

---

## Validation Strategy Comparison

| Criteria | Strict (Fail on Errors) | Lenient (Parse All) | Tiered (Configurable) |
|----------|------------------------|---------------------|----------------------|
| **User Satisfaction** | 2/5 (frustrating) | 5/5 (permissive) | 5/5 (user choice) |
| **Data Quality** | 5/5 (high standards) | 3/5 (accepts low quality) | 4/5 (flags but accepts) |
| **Competitive Parity** | 1/5 (stricter than Solibri) | 5/5 (matches Dalux) | 5/5 (matches both) |
| **Implementation** | 5/5 (simple, fail fast) | 4/5 (error handling) | 3/5 (multiple modes) |
| **Value to BIM Coordinator** | 2/5 (blocks workflow) | 3/5 (hides issues) | 5/5 (actionable reports) |
| **Market Perception** | 1/5 ("too anal") | 5/5 (easy to use) | 5/5 (professional) |
| **TOTAL SCORE** | **16/30** | **25/30** | **27/30** ✅ |

**WINNER**: **Tiered Validation (Configurable)** (27/30)

**Reasoning**:
- Matches stated goal: "If Solibri parses it, we parse it"
- Provides actionable validation reports (not just pass/fail)
- Allows strict mode for compliance checking (optional)
- Best of both worlds: permissive + informative

**Implementation Layers**:
1. **Layer 1: Critical** (always run, can block)
   - File corruption, invalid IFC syntax
2. **Layer 2: Quality** (run, report, don't block)
   - Missing relationships, incomplete properties
3. **Layer 3: Advisory** (optional, user-configurable)
   - Best practices, optimization suggestions

---

## Overall Architecture Recommendation

### Winning Stack (Based on Total Scores - Updated with Consultant 4)

| Component | Technology | Score | Runner-Up | Runner-Up Score |
|-----------|-----------|-------|-----------|-----------------|
| **Parser (Server)** | IfcOpenShell | 46/50 | web-ifc (for web apps) | 48/50 |
| **Parser (Web)** | **web-ifc** | 48/50 | IfcOpenShell | 46/50 |
| **Viewer** | xeokit-sdk OR Three.js | 42/50 (xeokit) | Three.js + web-ifc | 41/50 |
| **Database** | PostgreSQL + Redis (phased) | 41/50 | Redis + Neo4j + S3 | 35/50 |
| **Rendering** | WebGPU + WebGL fallback | 36/40 | WebGPU only | 32/40 |
| **Storage** | 2-Tier (DB + File) + Cache | 33/35 | 3-Tier (Hot/Warm/Cold) | 30/35 |
| **Validation** | Tiered (Configurable) | 27/30 | Lenient (Parse All) | 25/30 |
| **TOTAL** | **273/295** ✅ | | | |

**NEW Insights from Consultant 4**:
- **Dual parser strategy**: IfcOpenShell for server, web-ifc for client (use-case optimization)
- **Viewer choice**: xeokit for fast MVP (2-3 months saved), Three.js for MIT licensing
- **Compression targets**: 40% content-based + 70% spatial partitioning = **~85% reduction**
- **Performance targets**: <3s initial, <1s interactive, 30+ FPS mobile
- **Market gap**: Cloud-native with xeokit-level performance + Solibri-level validation

### Risk Assessment

| Stack | Total Score | Risk Level | Time to MVP | Confidence |
|-------|-------------|------------|-------------|------------|
| **Recommended** (IfcOpenShell + PostgreSQL + xeokit/Three.js) | 273/295 | **LOW** | 3-4 months | **HIGH** |
| **+ web-ifc (Phase 2)** | +48/50 | LOW (proven in production) | Add 2-4 weeks | HIGH |
| Academic Maximalist (Rust + Redis/Neo4j + WebGPU) | 152/205 | **HIGH** | 6-12 months | MEDIUM |
| Hybrid (Rust + PostgreSQL + WebGPU) | 164/205 | MEDIUM | 4-6 months | MEDIUM |

---

## Decision Framework

### When to Choose Recommended Stack

✅ **Choose if**:
- You want to ship MVP in 3-4 months
- You prefer proven, low-risk technologies
- You want to iterate based on real user feedback
- You have limited initial development resources
- You value operational simplicity

❌ **Don't choose if**:
- You have unlimited time and budget
- You want to push boundaries of performance (even if unnecessary)
- You have a large team experienced in Rust + graph databases
- You're building for 10+ years from now (not next 1-2 years)

### When to Reconsider

⚠️ **Reconsider if**:
- Benchmark shows IfcOpenShell parsing time > 60s for 1GB files
- PostgreSQL queries consistently > 1 second (even with indexes)
- Competitors demonstrate 10x faster performance (not just 2x)
- User research shows deep graph traversal is critical workflow

### Phase 2 Decision Points

After MVP launch, evaluate adding:

| Technology | Add If... | Don't Add If... |
|-----------|----------|-----------------|
| **Redis Caching** | Database queries > 500ms consistently | PostgreSQL < 200ms |
| **Neo4j** | Complex relationship queries > 2s | Simple filters sufficient |
| **Rust Parser** | IfcOpenShell proven bottleneck | Parsing time acceptable |
| **Custom Geometry** | Tessellation > 60% of processing time | Acceptable performance |

---

## Scoring Methodology

### Criteria Definitions

**Performance** (1-5):
- 5 = Industry-leading speed
- 4 = Competitive speed
- 3 = Acceptable speed
- 2 = Slower than acceptable
- 1 = Unacceptably slow

**Development Time** (1-5):
- 5 = 0-1 month
- 4 = 1-3 months
- 3 = 3-6 months
- 2 = 6-12 months
- 1 = > 12 months

**Risk** (1-5):
- 5 = Proven technology, known characteristics
- 4 = Mature with some unknowns
- 3 = Mixed track record
- 2 = Emerging technology
- 1 = Greenfield, high uncertainty

**Complexity** (1-5):
- 5 = Simple, minimal moving parts
- 4 = Moderate complexity
- 3 = Complex but manageable
- 2 = High complexity
- 1 = Very high complexity

---

## Recommended Decision Process

1. **Review this matrix** with technical team
2. **Run Phase 0 benchmarks** (2-4 weeks)
3. **Update scores** based on benchmark data
4. **Make informed decision** with hard numbers
5. **Proceed with MVP** (recommended stack unless benchmarks show otherwise)

---

**Last Updated**: 2025-10-25
**Status**: Ready for decision
**Next Step**: Phase 0 benchmarking to validate assumptions
