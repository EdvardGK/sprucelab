# BIM Coordinator Platform - Preliminary Product Requirements Document

**Version**: 1.0
**Date**: 2025-10-25
**Status**: Preliminary - Ready for Stakeholder Review
**Document Owner**: Product Team

---

## Executive Summary

### Product Vision

**"The first cloud-native BIM coordination platform that combines Solibri-level validation rigor, Dalux-level performance, and workflow automation that no competitor offers."**

We are building a professional BIM coordination platform that fundamentally transforms how building projects detect issues, validate quality, and coordinate across disciplines. By combining automated validation, intelligent clash detection, and universal coordination via BCF, we enable BIM coordinators to save 6-7 hours per week while proving 10x ROI to management.

### Market Opportunity

**Problem**: Current BIM coordination tools require coordinators to spend 8-10 hours per week on manual processes - running clash tests, filtering results, creating issues, chasing status updates. Validation checking is manual and inconsistent. Desktop-only tools (Solibri, Navisworks) can't enable real-time collaboration. Cloud platforms (ACC, Procore) lack BIM-specific validation rigor.

**Opportunity**:
- **$1.2B+ market** for BIM coordination software (growing 15% annually)
- **200K+ BIM coordinators** globally performing repetitive manual tasks
- **10x ROI demonstrated** in industry: $200K coordination investment → $2.5M in prevented rework
- **70% time savings possible** with workflow automation (8-10 hrs/week → 2-3 hrs/week)
- **Market gap**: No platform combines cloud collaboration + validation depth + workflow automation

### Target Users

**Primary**: BIM Coordinators at mid-to-large AEC firms (50-5,000 employees)
- Coordinate models across disciplines (architecture, structure, MEP)
- Run clash detection weekly
- Validate model quality against project requirements
- Manage issue resolution through construction
- Report project health to management

**Secondary**: BIM Managers, Project Managers, Discipline Leads

**Initial Market**: Norwegian AEC firms (buildingSMART Norway compliance), expand Nordic → EU → Global

### Competitive Positioning

| Competitor | Strength | Weakness | Our Advantage |
|-----------|----------|----------|---------------|
| **Solibri** | Deep validation (25+ years), 70+ rulesets | Desktop-only, Windows, expensive licenses | Cloud-based, accessible pricing, collaborative |
| **Dalux** | Mobile viewing (1M+ objects iPad), fast | Limited validation, no scripting, weak analytics | Validation depth + workflow automation |
| **ACC / Procore** | Document management, PM tools | BIM workflows adapted (not native) | Purpose-built BIM coordination |
| **Navisworks** | Clash detection power, mature | Windows-only, no cloud, manual workflows | Cloud-native, cross-platform, automated |

**Unique Value**: Universal coordination (BCF works with everyone's tools) + automated validation (IDS-based) + intelligent workflow automation (AI-assisted clash grouping, auto-assignment)

---

## Product Overview

### Problem Statement

BIM coordinators today face three critical challenges:

1. **Manual Repetitive Work**: Running clash tests, filtering duplicates, creating issues, tracking status consumes 8-10 hours per week per coordinator

2. **Inconsistent Validation**: Manual checking of model quality requirements is time-consuming, error-prone, and inconsistent across team members

3. **Fragmented Tools**: Desktop software (Solibri, Navisworks) can't collaborate in real-time. Cloud platforms (ACC, Procore) lack BIM-specific validation rigor. No single tool bridges the gap.

**Industry Impact**:
- **$2.5M+ wasted** per major project on preventable construction rework
- **50-70% of coordination meetings** spent on status updates (not problem-solving)
- **40-60% validation pass rate** due to manual checking inconsistency
- **Vendor lock-in** prevents teams from coordinating across tools

### Solution Approach

We provide a cloud-native BIM coordination platform with three core capabilities:

#### 1. **Universal IFC Ingestion** ✅ (Built)
- Accept IFC models from any tool (Revit, ArchiCAD, Tekla, etc.)
- Pragmatic parsing (handle real-world files competitors parse)
- Layered processing: Parse (5-15s) → Geometry (30s-5min) → Validate (5-30s)
- GUID-based change tracking across versions

#### 2. **Automated Analysis** 🔨 (Partially Built)
- **IDS Validation**: Machine-readable requirements, automated checking
- **Clash Detection**: Spatial intersection with intelligent grouping
- **Change Detection**: Visual comparison of model versions (GUID tracking)
- **Quantity Extraction**: Flexible rules for cost/schedule impact

#### 3. **Intelligent Workflows** 🚧 (New - Tier 1 Priority)
- **BCF Integration**: Universal issue language, sync with authoring tools
- **Auto-Assignment**: Route issues by discipline/zone automatically
- **Scheduled Automation**: Nightly clash runs, not manual
- **Meeting Automation**: Auto-generate agendas from open issues
- **Progress Dashboards**: Resolution velocity, bottleneck identification

### Core Value Proposition

**For BIM Coordinators**:
> "Upload your IFC models from any tool, get validation reports in 5 minutes, coordinate with anyone via BCF, and reduce coordination meeting time by 70%."

**For BIM Managers**:
> "Prove 10x ROI to management with automated workflows, consistent quality validation, and dashboards showing real-time project health."

**For Project Managers**:
> "Prevent $2.5M in construction rework by catching issues in design when they're 10x cheaper to fix."

### Success Metrics

#### Primary Success Metric (North Star)
**70% reduction in coordination meeting time** (8-10 hrs/week → 2-3 hrs/week)

**Why This Matters**:
- 6-7 hours/week × $75/hour × 52 weeks = **$23K-$27K per coordinator per year**
- Enables coordinators to manage more projects simultaneously
- Shifts coordination from status updates to problem-solving
- Measurable, customer-validated, industry-leading

#### Supporting Success Metrics

**User Metrics**:
- Weekly active coordinators using platform
- Models processed per week
- BCF issues created/resolved per week
- Average time in platform per coordinator per week

**Business Metrics**:
- 10x ROI demonstrated ($200K investment → $2.5M savings)
- Validation pass rate increase (40-60% → 80%+)
- Issue resolution velocity (days from detection to closure)
- Rework costs prevented (design issues vs. construction issues)

**Technical Metrics** (from Consultant 4 research):
- Parse 100MB IFC: < 3 seconds (metadata only)
- Validation report: < 5 minutes
- Clash detection: < 10 minutes (100MB model)
- Viewer load: < 3 seconds initial display
- Frame rate: 30+ FPS mobile, 60+ FPS desktop

---

## User Personas & Workflows

### Primary Persona: BIM Coordinator (Integrator/Coordinator)

**Profile**:
- **Experience**: 3-8 years in AEC, technical background (architect/engineer)
- **Role**: Cross-discipline coordination, clash management, quality validation
- **Tools Used**: Navisworks/Solibri (desktop), Revit/ArchiCAD (viewing), ACC/BIM360 (document management)
- **Pain Points**: Manual clash filtering, inconsistent validation, desktop-only tools, vendor lock-in
- **Success Metrics**: Issue resolution velocity, rework prevented, meeting efficiency

**Daily Workflow** (EPIC Framework):

#### As **Educator**:
- Train teams on BIM processes and standards
- Enforce naming conventions and model quality requirements
- Onboard new team members to coordination workflows

**Platform Needs**:
- BEP template library with Norwegian standards (MMI scale)
- Training materials integrated into platform
- Automated validation enforces standards consistently

#### As **Precursor**:
- Set up new projects with clash tests, validation rules, coordination processes
- Define information requirements (IDS files)
- Configure project-specific workflows

**Platform Needs**:
- Project templates (pre-configured clash tests, IDS rules)
- Visual IDS editor (no XML editing)
- Workflow configuration UI (no coding)

#### As **Integrator**:
- Coordinate models across disciplines (architecture, structure, MEP)
- Run weekly clash detection and distribute results
- Manage model federation (spatial coordination)

**Platform Needs**:
- Automated clash detection with intelligent grouping
- BCF issue management (universal coordination language)
- Multi-model federation viewer

#### As **Coordinator**:
- Manage clash detection results (filter, prioritize, assign)
- Track issue resolution status across teams
- Conduct coordination meetings (weekly)
- Report project health to stakeholders

**Platform Needs**:
- Issue lifecycle management (creation → resolution → verification → closure)
- Dashboards showing resolution velocity and bottlenecks
- Meeting automation (agenda generation, status summaries)

**Weekly Time Breakdown** (Current vs. Target):

| Activity | Current (Manual) | With Platform (Automated) | Time Saved |
|----------|------------------|---------------------------|------------|
| Clash detection runs | 2 hours | 15 minutes (review results) | 1.75 hrs |
| Filtering/grouping clashes | 2 hours | 15 minutes (AI pre-filtered) | 1.75 hrs |
| Creating/assigning issues | 1.5 hours | 30 minutes (auto-assigned) | 1 hour |
| Status tracking/follow-up | 2 hours | 30 minutes (dashboard review) | 1.5 hrs |
| Meeting prep/execution | 1 hour | 30 minutes (auto-agenda) | 0.5 hrs |
| Validation checking | 1.5 hours | 15 minutes (automated report) | 1.25 hrs |
| **Total** | **10 hours** | **2.75 hours** | **7.25 hrs (73%)** |

### Secondary Persona: BIM Manager

**Profile**:
- **Experience**: 8-15 years in AEC, strategic role
- **Role**: BIM strategy, standards enforcement, team management, ROI reporting
- **Pain Points**: No visibility into project health, manual ROI calculation, inconsistent quality across projects

**Platform Needs**:
- Executive dashboards (portfolio view across projects)
- ROI reporting (hours saved, rework prevented, value delivered)
- Benchmarking (compare projects to industry standards)
- Template management (standardize across projects)

### Tertiary Persona: Discipline Lead (Architect, Engineer, MEP Designer)

**Profile**:
- **Experience**: 5-15 years discipline-specific
- **Role**: Design authoring, issue resolution, model quality
- **Pain Points**: Issues arrive via email/PDF (not actionable), unclear requirements, manual checking

**Platform Needs**:
- BCF integration with authoring tools (Revit, ArchiCAD)
- Clear validation requirements (IDS-based)
- Real-time validation feedback (modelers see requirements while creating)

---

## Feature Requirements

### TIER 1: MVP - Core Coordination (4-6 months) 🎯

**Goal**: "Upload IFC, get validation report in 5 minutes, coordinate via BCF, detect clashes"

These features are **table stakes** for a BIM coordination platform. Without them, coordinators cannot perform core workflows.

#### 1.1 Universal IFC Ingestion ✅ **COMPLETE**

**Status**: Built in Sessions 1-12 (layered architecture)

**Capabilities**:
- Accept IFC 2x3, IFC4, IFC4.3 from any authoring tool
- Pragmatic parsing (handle real-world files)
- Layered processing: Parse → Geometry → Validate
- GUID-based change tracking
- Property extraction (all Psets stored in JSONB)
- Spatial hierarchy (Project/Site/Building/Storey)

**Performance** (validated in Session 012):
- Parse 100MB IFC: ~2-3 seconds (metadata only)
- Geometry extraction: 30s-5 minutes (optional, deferred)
- Validation: 5-30 seconds

**Technical Foundation**:
- Parser: IfcOpenShell 0.8.0 (45 MB/s, validated by Consultant 4)
- Database: PostgreSQL with JSONB, GIN indexes
- Storage: Supabase S3 for IFC files
- Queue: Django Q for async processing

#### 1.2 IDS Validation System 🔨 **HIGH PRIORITY**

**Status**: BEP system exists (Session 010), needs IDS extension

**User Story**:
> "As a BIM coordinator, I want to upload an IDS file with project requirements and automatically validate uploaded models, so I can generate validation reports in 5 minutes instead of spending 2 hours manually checking."

**Capabilities**:
- **IDS Parser**: Read IDS XML files (buildingSMART spec)
- **Validation Engine**: Execute rules against IFCEntity properties
- **Validation Reports**: Clear, actionable feedback ("25 doors missing fire rating - here's how to fix in Revit")
- **Template Library**: Pre-built IDS files for common project types (Norwegian standards)
- **Visual IDS Editor**: Create/edit IDS files without XML editing
- **Auto-BCF Creation**: Generate BCF issues for failed validation checks

**Technical Implementation**:
- Extend `apps/bep/` with IDS parser (`services/ids_validator.py`)
- Parse IDS XML → validate against `IFCEntity` properties
- Generate `ValidationReport` model entries
- Link validation failures to BCF issues

**Success Criteria**:
- Validation report generated < 5 minutes after upload
- 90%+ of manual validation checks automated
- Actionable feedback (not just errors - tell users how to fix)

**Effort**: Medium (2-4 weeks)

**Dependencies**: BEP system (exists), IFCEntity properties (exists)

#### 1.3 BCF Integration (Universal Coordination) 🚧 **CRITICAL**

**Status**: Not implemented (new Django app needed)

**User Story**:
> "As a BIM coordinator, I want to create BCF issues from clash detection results and have them sync with discipline leads' authoring tools (Revit/ArchiCAD), so coordination works with everyone's existing software."

**Capabilities**:
- **BCF 2.1 / 3.0 API**: Import/export BCF XML/JSON
- **Issue Lifecycle**: Create → Assign → Discuss → Resolve → Verify → Close
- **3D Context**: Link issues to specific IFC elements with viewpoints
- **Multi-Platform Sync**: Issues created in platform appear in Revit/ArchiCAD/Solibri
- **Smart Notifications**: Notify only when action required (not every comment)
- **Issue Types**: Clash, validation failure, change request, general coordination
- **Priority Management**: Critical, high, medium, low
- **Status Workflow**: Open → In Progress → Resolved → Closed

**Technical Implementation**:
- Create `apps/bcf/` Django app
- Models: `Issue`, `Comment`, `Viewpoint`, `Label`, `Snapshot`
- API endpoints: BCF 2.1/3.0 compliant RESTful API
- Link to `IFCEntity` (issues reference specific elements)
- Webhook support for external tool notifications

**Success Criteria**:
- BCF roundtrip with Revit/Solibri works (create in platform → view in Revit)
- Issue lifecycle tracked with full audit trail
- 90%+ of coordination via BCF (vs. email/PDF)

**Effort**: High (6-8 weeks for full BCF 2.1/3.0 compliance)

**Dependencies**: IFCEntity (exists), 3D viewer (for viewpoint creation)

#### 1.4 Clash Detection Engine 🚧 **CRITICAL**

**Status**: Not implemented (requires spatial indexing + geometry)

**User Story**:
> "As a BIM coordinator, I want to automatically detect spatial conflicts between disciplines (structure-architecture, MEP-architecture) and get intelligent grouping of duplicates, so I can focus on 20 critical issues instead of manually filtering 1,200 raw clashes."

**Capabilities**:
- **Spatial Intersection**: Detect geometric overlaps between elements
- **Clash Matrices**: Prioritize which disciplines to test (struct-arch, MEP-arch, etc.)
- **Tolerance Rules**: Configurable clearance distances by element type
- **Intelligent Grouping**: Auto-detect duplicate clashes (proximity-based, type-based)
- **Priority Scoring**: Critical (structural collision) vs. soft (clearance issue)
- **Version Comparison**: Highlight new/resolved/persistent clashes after model updates
- **BCF Export**: Auto-create BCF issues from clash results

**Technical Implementation**:
- Spatial indexing: PostgreSQL PostGIS or custom R-tree
- Geometry intersection: ifcopenshell geometry API
- Clash detection algorithm: Bounding box → precise geometry check
- Grouping algorithm: Cluster similar clashes (location, type, tolerance)
- Store clashes in `Clash` model with status tracking

**Success Criteria**:
- Clash detection completes < 10 minutes (100MB model)
- Intelligent grouping reduces noise 90%+ (1,200 raw → 120 unique → 20 critical)
- Version comparison highlights changes accurately

**Effort**: High (8-10 weeks for spatial indexing + detection + grouping)

**Dependencies**: Geometry extraction (Layer 2), spatial indexing, BCF system

**Phase 1 Scope** (MVP):
- Basic spatial intersection (hard clashes only)
- Manual grouping by coordinator (AI grouping in Phase 2)
- BCF export for clash results

#### 1.5 Change Detection UI 🔨 **HIGH PRIORITY**

**Status**: Backend complete (GUID tracking), UI needed

**User Story**:
> "As a BIM coordinator, I want to visually compare model versions to see exactly what changed (additions, modifications, deletions) highlighted in 3D, so I can quickly assess change impact without manually diffing GUIDs."

**Capabilities**:
- **GUID Comparison**: Detect added/modified/deleted elements
- **Property Comparison**: Highlight changed attributes (type, properties, location)
- **Visual Diff**: Color-coded 3D rendering (green=added, yellow=modified, red=deleted)
- **Side-by-Side Viewer**: Compare Version A vs. Version B
- **Change Summary**: Quantified report (15 added, 8 modified, 3 deleted)
- **Impact Analysis**: Estimate cost/schedule impact of changes

**Technical Implementation**:
- Backend: GUID comparison logic (already exists in `services/change_detection.py`)
- Frontend: 3D viewer with color-coded rendering
- Change diffing: Compare `IFCEntity` records by GUID + version
- Property diffing: JSON comparison of JSONB properties

**Success Criteria**:
- Change detection highlights adds/mods/deletes accurately
- Visual diff clear and intuitive
- Change summary quantifies impact

**Effort**: Medium (4-6 weeks for UI + 3D rendering integration)

**Dependencies**: 3D viewer, GUID tracking (exists), geometry (Layer 2)

#### 1.6 3D Viewer (Model Visualization) 🚧 **CRITICAL**

**Status**: Not implemented (viewer technology decision pending)

**User Story**:
> "As a BIM coordinator, I want to view federated models from multiple disciplines in 3D with fast performance (30+ FPS, 100K+ objects) and BIM-specific controls (storey isolation, element selection, property inspection)."

**Capabilities**:
- **Multi-Model Federation**: Load architecture + structure + MEP simultaneously
- **Camera Controls**: Orbit, pan, zoom, fit-to-view, saved viewpoints
- **Element Selection**: Click element → show properties, highlight in tree
- **Visibility Controls**: Show/hide by type, discipline, storey, system
- **Visual Overrides**: Color-code by type, status, discipline
- **Section Planes**: Cut views for MEP coordination
- **Measurement Tools**: Distance, area, volume (Phase 2)
- **BCF Viewpoint Capture**: Save camera position + visible elements

**Technical Decision** (from Research Synthesis):

**Option A: xeokit-sdk** (Fast MVP, License Cost)
- **Pros**: BIM features built-in, 33x compression, 100K+ objects tested, 3-4 month MVP
- **Cons**: AGPL-3.0 (~$2-5K/year for SaaS), less flexible
- **Recommendation**: Choose if fast time-to-market is priority

**Option B: Three.js + web-ifc** (MIT, More Dev Time)
- **Pros**: MIT license (free), full control, community ecosystem
- **Cons**: 5-6 month MVP (build BIM features), manual optimization
- **Recommendation**: Choose if MIT licensing is critical concern

**Preliminary Decision**: **xeokit for Phase 1 MVP** (validated by Consultant 4)
- $2-5K/year is negligible vs. 2-3 months faster launch
- BIM features built-in (storey isolation, sections, BCF viewpoints)
- Can evaluate migration to Three.js after revenue/feedback
- Proven 100K+ object performance

**Technical Implementation**:
- Viewer: xeokit-sdk v2.5+ OR Three.js + @react-three/fiber
- Backend: Serve geometry as compressed mesh (40% + 70% = ~85% reduction)
- LOD: Level-of-detail mesh generation (3 quality levels)
- Instancing: Reuse geometry for repeated elements (windows, doors)
- Progressive loading: 12% for initial view → stream rest

**Success Criteria**:
- Initial display: < 3 seconds
- Frame rate: 30+ FPS mobile, 60+ FPS desktop
- Capacity: 100K+ objects federated
- Memory: < 500MB mobile

**Effort**: High (8-12 weeks xeokit, 12-16 weeks Three.js)

**Dependencies**: Geometry extraction (Layer 2), compression (Phase 2 optimization)

---

### TIER 2: Workflow Automation (6-12 months after MVP) 🚀

**Goal**: "Reduce coordination meeting time by 70% through intelligent automation"

These features are the **competitive moat** - Navisworks is manual, Solibri is desktop-only, ACC/Procore don't have BIM-specific automation.

#### 2.1 Scheduled Clash Detection

**Capability**: Nightly/weekly automated clash runs (2 AM after modelers finish)

**Value**: Coordinators review results (not run processes manually)

**Technical**: Django Q scheduled tasks + cron jobs

**Effort**: Low (2 weeks)

#### 2.2 Intelligent Clash Grouping (AI-Assisted)

**Capability**: Auto-filter duplicates, prioritize critical, learn from resolution patterns

**Value**: Reduce 1,200 raw clashes → 120 unique → 20 critical automatically

**Technical**: ML clustering on clash location/type, pattern recognition on resolution history

**Effort**: Medium (6-8 weeks)

#### 2.3 Auto-Assignment Rules

**Capability**: Route issues by discipline (MEP, struct, arch) or zone (floor, building)

**Value**: Issues assigned within 5 minutes of detection (not manual)

**Technical**: Rule engine on `IFCEntity.ifc_type` → assign to discipline lead

**Effort**: Medium (4-6 weeks)

#### 2.4 Workflow Triggers

**Capability**: Upload → validate → notify → create BCF issues automatically

**Value**: Orchestrate entire coordination workflow without manual steps

**Technical**: Django signals + webhooks to chain tasks

**Effort**: Medium (6-8 weeks)

#### 2.5 Meeting Automation

**Capability**: Auto-generate agendas from open BCF issues, filter by discipline/priority

**Value**: Reduce meeting prep time 80% (1 hour → 10 minutes)

**Technical**: BCF query + template generation

**Effort**: Low (2-3 weeks)

#### 2.6 Progress Dashboards

**Capability**: Resolution velocity, bottleneck identification, coordination health

**Value**: Real-time project health visibility for management

**Technical**: Aggregate BCF issue status, visualize trends

**Effort**: Medium (6-8 weeks)

---

### TIER 3: Market Leader (12+ months after MVP) 📊

**Goal**: "Prove 10x ROI with analytics, match Dalux performance, exceed Solibri validation"

#### Track A: Performance Optimization

- **Parallel Geometry Extraction**: 4-8 workers, 4-8x speedup
- **LOD Mesh Generation**: 3 quality levels, 67% vertex reduction
- **Mesh Instancing**: 96%+ reduction for repeated geometry
- **Compression**: 40% content-based + 70% spatial = ~85% total
- **web-ifc Integration**: Client-side processing, 80-100 MB/s

#### Track B: Business Intelligence

- **Coordination Analytics**: Clashes per 1K objects, resolution velocity benchmarks
- **Quantity Tracking**: Change impact on cost/schedule
- **Predictive Analytics**: Issue patterns → schedule risk alerts
- **Benchmarking**: Compare project to industry standards
- **ROI Reporting**: Hours saved, rework prevented, value delivered

---

## Technical Requirements

### Architecture Overview

**Current State** (Session 012 - 018):

```
✅ COMPLETE:
• Backend: Django 5.0 + DRF + PostgreSQL (Supabase)
• Parser: IfcOpenShell 0.8.0, layered processing (Parse → Geometry → Validate)
• Database: 15 tables, GUID tracking, JSONB properties, GIN indexes
• Queue: Django Q for async processing
• BEP System: 7 models (MMI scale, technical requirements, validation rules)
• Storage: Supabase S3 for IFC files
• API: RESTful with pagination, status endpoints

🔨 PARTIAL:
• Geometry: Extraction working, needs parallel processing + LOD
• Validation: BEP system exists, needs IDS extension
• Change Detection: GUID tracking exists, needs UI

🚧 NEEDED (TIER 1):
• BCF Integration: New Django app (apps/bcf/)
• Clash Detection: Spatial indexing + intersection algorithm
• 3D Viewer: xeokit or Three.js (decision pending)
• Frontend: Viewer integration, change detection UI
```

**Target Architecture** (Phase 1 MVP):

```
STACK:
• Parser: IfcOpenShell 0.8.0 (45 MB/s) [DONE]
• Viewer: xeokit-sdk (33x compression) OR Three.js + web-ifc
• Database: PostgreSQL 15+ (JSONB, GiST, GIN indexes) [DONE]
• Storage: Supabase S3 (IFC files) [DONE]
• Cache: Redis (optional Phase 2, if DB >500ms)
• Backend: Django 5.0 + DRF [DONE]
• Queue: Django Q [DONE]
• Frontend: React 18 + TypeScript + Vite [70% DONE]

ARCHITECTURE:
• 2-tier storage (PostgreSQL hot + S3 cold)
• Layered processing (Parse → Geometry → Validate) [DONE]
• Parallel geometry (4-8 workers) [NEEDED]
• Progressive viewer loading (12% for initial view)
• BCF API (2.1/3.0 compliant) [NEEDED]
• IDS validation (extend BEP) [NEEDED]
• Spatial indexing (clash detection) [NEEDED]
```

### Performance Targets (from Consultant 4)

| Metric | Target | Current | Gap |
|--------|--------|---------|-----|
| **Parse 100MB IFC** | < 3 seconds | ~2-3 seconds | ✅ DONE |
| **Validation Report** | < 5 minutes | ~30 seconds (BEP) | 🔨 Add IDS |
| **Clash Detection** | < 10 minutes (100MB) | N/A | 🚧 Build |
| **Viewer Initial Load** | < 3 seconds | N/A | 🚧 Build |
| **Viewer Frame Rate** | 30+ FPS mobile, 60+ FPS desktop | N/A | 🚧 Build |
| **Viewer Capacity** | 100K+ objects federated | N/A | 🚧 Build |
| **BCF Roundtrip** | < 5 seconds (create issue) | N/A | 🚧 Build |

### Integration Requirements

**buildingSMART Standards Compliance**:
- **IFC**: 2x3, 4, 4.3 support (via IfcOpenShell) ✅
- **BCF**: 2.1 / 3.0 API compliance 🚧
- **IDS**: Information Delivery Specification parser 🔨
- **MVD**: Model View Definition support (Phase 2)

**External Tool Integration**:
- **Revit**: BCF plugin sync (existing Revit BCF plugins)
- **ArchiCAD**: BCF plugin sync
- **Solibri**: BCF import/export
- **Navisworks**: BCF import/export

**Standards Bodies**:
- buildingSMART International (IFC, BCF, IDS specs)
- buildingSMART Norway (MMI scale, POFIN guidelines)
- ISO 19650 (BIM Execution Plans)

### Security & Compliance

**Data Security**:
- HTTPS only (TLS 1.3)
- At-rest encryption (Supabase storage)
- Role-based access control (RBAC)
- Audit logging (user actions, data modifications)

**Compliance**:
- GDPR (European data protection)
- ISO 27001 (information security management)
- Norwegian data residency (Supabase EU hosting)

**Authentication**:
- OAuth 2.0 / SAML SSO (Phase 2)
- Multi-factor authentication (MFA)
- API key management for integrations

### Scalability & Operations

**Scaling Strategy**:
- **Phase 1** (0-50 users): Single backend server, Supabase pooling
- **Phase 2** (50-500 users): Horizontal scaling, load balancer, Redis cache
- **Phase 3** (500+ users): Microservices, CDN, dedicated database

**Monitoring**:
- Application performance monitoring (APM)
- Error tracking (Sentry or similar)
- User analytics (Mixpanel or similar)
- Infrastructure monitoring (Supabase dashboard)

**Backup & Recovery**:
- Daily database backups (Supabase automatic)
- Point-in-time recovery (7-day retention minimum)
- Disaster recovery plan (RTO: 4 hours, RPO: 1 hour)

---

## Roadmap & Timeline

### Phase 1: MVP - Core Coordination (4-6 months)

**Months 1-2**: Foundation
- ✅ Backend complete (DONE in Sessions 1-12)
- IDS validation (extend BEP system)
- Viewer technology decision (xeokit vs Three.js)
- BCF schema design + API spec

**Months 3-4**: Core Features
- BCF API implementation (issue lifecycle)
- 3D viewer integration (xeokit or Three.js)
- Change detection UI (visual diff)
- IDS validation UI (template library, reports)

**Months 5-6**: Clash Detection + Polish
- Spatial indexing (PostGIS or R-tree)
- Clash detection engine (basic, manual grouping)
- BCF export from clashes
- Integration testing + performance tuning
- User acceptance testing (3-5 pilot coordinators)

**Deliverables**:
- Upload IFC → validation report (5 minutes)
- BCF issue management (create, assign, track, close)
- Basic clash detection (spatial intersection)
- Change detection (visual diff)
- 3D viewer (federated models, BIM controls)

**Success Metrics**:
- 10+ BIM coordinators using platform regularly
- 5+ projects with active BCF coordination
- 90%+ validation automation (vs manual checking)
- $50K+ ARR (Annual Recurring Revenue)

### Phase 2: Workflow Automation (6-12 months after MVP)

**Months 7-9**: Automation Foundation
- Scheduled clash detection (Django Q cron)
- Auto-assignment rules (discipline/zone routing)
- Workflow triggers (upload → validate → notify)
- Meeting automation (agenda generation)

**Months 10-12**: Intelligence Layer
- AI-assisted clash grouping (ML clustering)
- Progress dashboards (resolution velocity, bottlenecks)
- Predictive analytics (issue patterns → risk)
- Benchmarking (industry comparisons)

**Deliverables**:
- 70% reduction in coordination meeting time
- Intelligent clash filtering (reduce noise 90%)
- Auto-assignment (issues assigned <5 minutes)
- Real-time dashboards (project health visibility)

**Success Metrics**:
- 50+ BIM coordinators using platform
- 25+ active projects
- 70% coordination time savings (validated via survey)
- $250K+ ARR

### Phase 3: Market Leader (12-24 months after MVP)

**Track A: Performance** (Months 13-18)
- Parallel geometry extraction (4-8x speedup)
- LOD mesh generation (67% vertex reduction)
- Compression (40% + 70% = 85% reduction)
- web-ifc integration (client-side processing)

**Track B: Business Intelligence** (Months 19-24)
- Coordination analytics (benchmark against industry)
- Quantity tracking (cost/schedule impact)
- ROI reporting (prove 10x return)
- Executive dashboards (management adoption)

**Deliverables**:
- Match Dalux mobile performance (30+ FPS @ 100K+ objects)
- Match Solibri validation rigor (buildingSMART certified)
- Exceed ACC/Procore (faster viewer + better validation)
- Prove 10x ROI with customer case studies

**Success Metrics**:
- 200+ BIM coordinators
- 100+ active projects
- $1M+ ARR
- 10x ROI demonstrated ($200K → $2.5M industry benchmark)
- Executive adoption (management uses dashboards weekly)

---

## Competitive Analysis

### Market Landscape

**Desktop Leaders** (Legacy, Mature):

| Platform | Users | Strengths | Weaknesses | Our Edge |
|----------|-------|-----------|------------|----------|
| **Solibri** | 10K+ firms | Deep validation (70+ rulesets), 25+ years rules, buildingSMART certification | Desktop-only, Windows, expensive licenses (~$5-10K/year), no cloud collaboration | Cloud-based, accessible pricing (~$1-2K/year), collaborative workflows, modern UX |
| **Navisworks** | 100K+ users | Clash detection power, mature tooling, Autodesk ecosystem | Windows-only, no cloud collaboration, manual workflows, expensive bundle | Cloud-native, cross-platform, automated workflows, BCF universal coordination |

**Cloud Platforms** (Growing, Adapted):

| Platform | Users | Strengths | Weaknesses | Our Edge |
|----------|-------|-----------|------------|----------|
| **Dalux** | 300K+ users | Mobile viewing (1M+ objects iPad), field access, fast rendering | Limited validation rigor, no scripting, weak analytics, Danish market focus | Desktop-class validation, workflow automation, analytics power, Nordic → global |
| **ACC / Procore** | 1M+ users | Document management, general PM tools, integrations, Autodesk ecosystem | BIM workflows adapted (not native), validation depth lacking, not BIM-first | Purpose-built BIM coordination, validation rigor, workflow automation |

**Open Source** (Developer Tools):

| Platform | Users | Strengths | Weaknesses | Our Edge |
|----------|-------|-----------|------------|----------|
| **IFC.js** | 5K+ devs | Open-source, web-based, MIT license, community | Developer tool (not product), no coordination workflows, DIY everything | Production-ready platform, coordinator workflows, support + updates |

### Differentiation Strategy

**What Makes Us Different**:

1. **Universal Coordination** (vs. Vendor Lock-in)
   - BCF works with everyone's tools (Revit, ArchiCAD, Solibri, Navisworks)
   - IFC ingestion from any authoring tool
   - No proprietary formats or forced ecosystems

2. **Validation as Code** (vs. Manual Configuration)
   - IDS templates you can fork/customize/share (like GitHub for validation)
   - Solibri: Manual rule configuration, proprietary format, desktop-only
   - Us: **IDS templates as Git repos**, community sharing, cloud-based

3. **Workflow Automation** (vs. Manual Processes)
   - 70% reduction in coordination meeting time
   - Automated clash detection, intelligent grouping, auto-assignment
   - Navisworks/Solibri: Manual processes, no automation

4. **Cloud-Native** (vs. Desktop-Only)
   - Real-time collaboration, web-based access
   - Mobile support (dashboards, issue management)
   - Solibri/Navisworks: Desktop-only, Windows, no collaboration

5. **Accessible Pricing** (vs. Enterprise-Only)
   - SaaS pricing (~$1-2K/year per coordinator)
   - Mid-market focus (50-500 employee firms)
   - Solibri/Navisworks: $5-10K/year + Autodesk bundles

### Competitive Moat (Features That Win)

**Phase 1 Moat**:
- Universal coordination (BCF API) - no one else offers true tool-agnostic collaboration
- IDS validation automation - only Solibri has validation depth, but desktop-only
- Cloud-native collaboration - only Dalux offers mobile, but lacks validation rigor

**Phase 2 Moat** (Automation):
- AI-assisted clash grouping (learns from your patterns) - **no competitor has this**
- 70% time savings (quantified, validated) - Navisworks/Solibri are manual
- Auto-assignment rules (route by discipline/zone) - ACC/Procore lack BIM-specific logic

**Phase 3 Moat** (Intelligence):
- Coordination analytics (benchmark against industry) - **no platform offers this**
- ROI reporting (prove 10x return to management) - critical for executive buy-in
- Predictive analytics (issue patterns → schedule risk) - proactive coordination

**Why This Moat Is Defensible**:
1. **Network effects**: More users → better benchmarks → more value
2. **Data moat**: Coordination patterns enable smarter automation over time
3. **Integration complexity**: BCF + IDS + IFC creates high switching cost
4. **Community**: IDS template marketplace creates lock-in via content
5. **Technical depth**: Layered architecture (Session 012) is unique approach

### Market Entry Strategy

**Phase 1** (Norwegian Market):
- Target: Norwegian AEC firms (buildingSMART Norway compliance)
- Advantage: MMI scale support, Norwegian standards built-in
- Partners: buildingSMART Norway, RIF (Norwegian consulting engineers)
- Size: ~1,000 BIM coordinators in Norway

**Phase 2** (Nordic Expansion):
- Target: Sweden, Denmark, Finland (similar standards)
- Localization: Swedish/Danish/Finnish language support
- Compliance: Adapt to local building codes/standards
- Size: ~5,000 BIM coordinators in Nordics

**Phase 3** (European Expansion):
- Target: Germany, UK, Netherlands (large AEC markets)
- Compliance: GDPR, ISO 19650, local standards
- Partnerships: buildingSMART national chapters
- Size: ~50,000 BIM coordinators in Europe

**Phase 4** (Global):
- Target: North America, Asia-Pacific (mature BIM markets)
- Localization: Full internationalization (i18n)
- Compliance: Regional data residency, certifications
- Size: ~200,000 BIM coordinators globally

---

## Risk Assessment

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **IfcOpenShell performance insufficient** | Medium | High | Benchmark first (Phase 0), optimize (parallel workers), fallback: Rust wrapper |
| **PostgreSQL too slow for clash detection** | Low | Medium | Add PostGIS spatial indexing, Redis cache, profiling before Neo4j |
| **Viewer technology choice wrong** | Medium | Medium | Start xeokit (fast MVP), evaluate Three.js migration after feedback |
| **BCF spec complexity underestimated** | Medium | High | Use existing BCF libraries, reference implementations, start with BCF 2.1 |
| **Geometry extraction too slow** | Medium | High | Consultant 4 identified bottleneck: parallel processing (4-8x speedup) |

**Overall Technical Risk**: **Medium** (proven stack reduces risk, layered architecture enables incremental delivery)

### Market Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **Coordinators prefer desktop tools** | Low | High | Hybrid approach (desktop + web), focus on collaboration (desktop can't do) |
| **Solibri adds cloud version** | Medium | High | Beat them to market (4-6 months), differentiate on workflow automation |
| **Autodesk bundles ACC for free** | Medium | Medium | Focus on BIM-specific validation (ACC lacks depth), mid-market (Autodesk = enterprise) |
| **Norwegian market too small** | Low | Medium | Nordic expansion (Phase 2), proven in Norway → credibility for EU |
| **Pricing too high/low** | Medium | Medium | Start $1-2K/year, adjust based on LTV/CAC, prove ROI (10x return) |

**Overall Market Risk**: **Medium** (established competitors, but clear gap in cloud + validation + automation)

### Execution Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **MVP takes > 6 months** | Medium | High | Fixed scope (TIER 1 only), proven stack (low unknowns), cut features if needed |
| **Team lacks BIM domain expertise** | Low | High | Consultant network (4 experts consulted), buildingSMART Norway partnership |
| **Pilot customers not available** | Low | Medium | Pre-committed pilot customers from network, buildingSMART Norway connections |
| **Feature scope creep** | High | Medium | Strict TIER 1 definition, defer TIER 2/3, validate with pilots before building |

**Overall Execution Risk**: **Medium-Low** (clear roadmap, proven stack, domain expertise available)

### Mitigation Summary

**Reduce Technical Risk**:
1. **Phase 0 benchmarking** (2-4 weeks): Validate IfcOpenShell, PostgreSQL, viewer performance
2. **Incremental delivery**: Layered architecture enables feature-by-feature launch
3. **Fallback options**: Rust wrapper (parser), Neo4j (relationships), Three.js (viewer)

**Reduce Market Risk**:
1. **Pilot customers** (5-10 BIM coordinators): Validate workflows, refine features before launch
2. **buildingSMART partnership**: Credibility, standards compliance, market access
3. **ROI proof**: 70% time savings (quantified), 10x return (industry benchmark)

**Reduce Execution Risk**:
1. **Fixed MVP scope**: TIER 1 only (4-6 months), no feature creep
2. **Domain expertise**: 4 consultant recommendations synthesized, buildingSMART Norway guidance
3. **Proven stack**: IfcOpenShell (10+ years), PostgreSQL (mature), Django (battle-tested)

---

## Success Criteria & Metrics

### Phase 1 MVP Success (4-6 months)

**User Adoption**:
- ✅ 10+ BIM coordinators using platform regularly (weekly active users)
- ✅ 5+ projects with active BCF coordination
- ✅ 50+ IFC models processed per month
- ✅ 200+ BCF issues created/resolved per month

**Technical Performance**:
- ✅ Parse 100MB IFC: < 3 seconds (metadata)
- ✅ Validation report: < 5 minutes
- ✅ Clash detection: < 10 minutes (100MB model)
- ✅ Viewer load: < 3 seconds initial
- ✅ BCF roundtrip: works with Revit/Solibri

**Business Metrics**:
- ✅ 90%+ validation automation (vs manual checking)
- ✅ $50K+ ARR (Annual Recurring Revenue)
- ✅ 80%+ user satisfaction (survey score)
- ✅ 3-5 successful pilot projects completed

### Phase 2 Automation Success (6-12 months)

**Efficiency Gains**:
- ✅ 70% reduction in coordination meeting time (8-10 hrs → 2-3 hrs/week)
- ✅ 90% clash noise reduction (1,200 raw → 120 unique → 20 critical)
- ✅ 5 minutes to auto-assign issues (vs manual distribution)
- ✅ 80%+ of issues resolved via BCF (vs email/PDF)

**User Adoption**:
- ✅ 50+ BIM coordinators
- ✅ 25+ active projects
- ✅ 1,000+ IFC models processed per month
- ✅ 5,000+ BCF issues created/resolved per month

**Business Metrics**:
- ✅ $250K+ ARR
- ✅ 70% time savings validated via customer survey
- ✅ 3+ customer case studies (ROI proof)
- ✅ 90%+ user retention (churn < 10%)

### Phase 3 Market Leader Success (12-24 months)

**Performance**:
- ✅ Match Dalux mobile performance (30+ FPS @ 100K+ objects)
- ✅ Match Solibri validation rigor (buildingSMART certified)
- ✅ Exceed ACC/Procore (faster viewer + better validation)

**Business Intelligence**:
- ✅ 10x ROI demonstrated with customer data ($200K → $2.5M)
- ✅ Coordination analytics (benchmark 100+ projects)
- ✅ Executive adoption (management uses dashboards weekly)

**Market Position**:
- ✅ 200+ BIM coordinators
- ✅ 100+ active projects
- ✅ $1M+ ARR
- ✅ Nordic market leader (Norway + Sweden + Denmark + Finland)
- ✅ 5+ enterprise customers (500+ employee firms)

---

## Appendices

### A. Research References

**Technical Research**:
- `project-management/research/efficiency/README.md` - 4 consultant analysis
- `project-management/research/efficiency/CRITICAL_ANALYSIS.md` - Comprehensive evaluation
- `project-management/research/efficiency/DECISION_MATRIX.md` - Scored comparison
- `project-management/research/efficiency/consultant4.md` - Production benchmarks (Consultant 4)

**Workflow Research**:
- `project-management/planning/BIM_COORDINATOR_WORKFLOWS.md` - Field study (EPIC framework)
- `project-management/planning/RESEARCH_SYNTHESIS.md` - Unified strategy

**Architecture Documentation**:
- `LAYERED_ARCHITECTURE_IMPLEMENTATION.md` - Parse → Geometry → Validate (Session 012)
- `CLAUDE.md` - Project development guide
- `MIGRATION_GUIDE.md` - Migration instructions
- `backend/DJANGO_Q_SETUP.md` - Async task configuration

**Session History**:
- `project-management/worklog/` - Detailed session notes (Sessions 1-18)
- `project-management/planning/` - Implementation plans

### B. Standards Compliance

**buildingSMART International**:
- **IFC 2x3, IFC4, IFC4.3**: Supported via IfcOpenShell 0.8.0
- **BCF 2.1 / 3.0**: Target for TIER 1 MVP
- **IDS 1.0**: Information Delivery Specification (TIER 1 MVP)
- **MVD**: Model View Definition support (Phase 2)

**Norwegian Standards**:
- **MMI-veileder 2.0**: Model maturity levels (0-2000 range, 19 official levels)
- **POFIN**: buildingSMART Norway guidelines (ISO 19650 + local adaptations)
- **NS 3451**: Building classification system
- **NS 3420**: General conditions for design services

**ISO Standards**:
- **ISO 19650**: BIM Execution Plans (BEP system compliance)
- **ISO 16739**: IFC specification
- **ISO 29481**: Building information modelling — Information delivery manual

### C. Resource Requirements

**Phase 1 MVP** (4-6 months):

**Team**:
- 1x Backend Engineer (Django, Python, IfcOpenShell)
- 1x Frontend Engineer (React, TypeScript, 3D graphics)
- 0.5x BIM Domain Expert (coordination workflows, standards compliance)
- 0.5x Product Manager (roadmap, customer interviews)

**Infrastructure**:
- Supabase Pro plan: ~$25/month (database + storage)
- xeokit license: ~$2-5K/year (if chosen over Three.js)
- Domain + hosting: ~$50/month
- Development tools: ~$100/month (GitHub, Sentry, etc.)

**External Costs**:
- Consultant reviews: ~$5-10K (optional, for technical validation)
- buildingSMART membership: ~$1-2K/year (standards access, credibility)
- Legal (contracts, terms): ~$2-5K (one-time)

**Total Phase 1 Investment**: ~$200-300K (team salaries + infrastructure + external)

**Phase 2 ROI**:
- Target: $250K ARR (50 coordinators × $5K/year)
- Break-even: ~12-15 months after MVP launch
- LTV:CAC target: 3:1 (lifetime value vs. customer acquisition cost)

### D. Go-to-Market Strategy

**Pilot Program** (Pre-launch, Month 4-6):
- 5-10 BIM coordinators from network
- Free access during pilot (3 months)
- Weekly feedback sessions
- Co-development of workflows
- Case study agreement (ROI proof)

**Launch** (Month 6):
- buildingSMART Norway announcement
- LinkedIn thought leadership (BIM coordination efficiency)
- Direct outreach to mid-market AEC firms (50-500 employees)
- Webinars (demo + ROI proof)
- Free trial (14 days) → paid conversion

**Pricing** (Initial):
- **Coordinator Plan**: $1,500/year per coordinator (target: BIM coordinators)
- **Manager Plan**: $3,000/year per manager (includes portfolio dashboards)
- **Enterprise Plan**: Custom pricing (SSO, compliance, SLAs)
- **Discounts**: Annual payment (save 20%), pilot customers (50% year 1)

**Sales Strategy**:
- **Self-serve**: Free trial → credit card signup (Coordinator Plan)
- **Sales-assisted**: Manager/Enterprise Plans (demo → proposal → contract)
- **Partnerships**: buildingSMART Norway, RIF, AEC software resellers

**Customer Success**:
- Onboarding: 2-hour training session (workflows, best practices)
- Support: Email + documentation (Phase 1), chat + video (Phase 2)
- Quarterly business reviews (Manager/Enterprise customers)
- User community: Slack/Discord for peer support, feature requests

---

## Document Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-25 | Product Team | Initial preliminary PRD based on research synthesis |

---

## Approval & Next Steps

**Document Status**: Preliminary - Pending Stakeholder Review

**Required Approvals**:
- [ ] Product Team Lead
- [ ] Engineering Lead
- [ ] BIM Domain Expert
- [ ] Business/Finance

**Review Cycle**:
1. **Week 1**: Internal review (product + engineering)
2. **Week 2**: BIM domain expert review (workflows, standards)
3. **Week 3**: Business review (market, financials, GTM)
4. **Week 4**: Final revisions → approval

**Next Steps After Approval**:
1. **Phase 0 Benchmarking** (2-4 weeks): Validate technical assumptions
2. **Pilot Customer Recruitment** (2 weeks): Identify 5-10 BIM coordinators
3. **Detailed Sprint Planning** (1 week): Break TIER 1 features into 2-week sprints
4. **Kick Off Phase 1 MVP** (Month 1): Start development

---

**END OF DOCUMENT**
