# PRD Overview & Research Foundation

**Date**: 2025-10-25
**Status**: ✅ Research Complete → Preliminary PRD Created
**Purpose**: Connect research documents to product requirements

---

## Quick Links

### Core Product Document
📄 **[PRELIMINARY_PRD.md](./PRELIMINARY_PRD.md)** - The main product requirements document
- 50+ pages covering vision, features, roadmap, competitive analysis
- Based on 4 months of research and 18+ development sessions
- Ready for stakeholder review and approval

---

## Research Foundation

The PRD synthesizes **three major research streams**:

### 1. Technical Efficiency Research
**Location**: `../research/efficiency/`

**Key Documents**:
- 📊 [README.md](../research/efficiency/README.md) - Executive summary of 4 consultant recommendations
- 📋 [DECISION_MATRIX.md](../research/efficiency/DECISION_MATRIX.md) - Scored comparison (5-minute read)
- 📖 [CRITICAL_ANALYSIS.md](../research/efficiency/CRITICAL_ANALYSIS.md) - 50-page deep analysis
- 🔬 [consultant4.md](../research/efficiency/consultant4.md) - Production benchmarks (Consultant 4)

**Key Findings**:
- ✅ **Stack validated**: IfcOpenShell (45 MB/s) + PostgreSQL + xeokit/Three.js
- ✅ **Architecture validated**: Layered processing (Parse → Geometry → Validate) is optimal
- ✅ **Performance targets**: <3s parse, <5min validation, 30+ FPS viewer, 100K+ objects
- ✅ **Risk level**: LOW (proven technologies, hard benchmarks available)
- ✅ **Time to MVP**: 3-4 months (validated by all consultants)

**Impact on PRD**:
- Technical requirements section (proven stack, validated performance targets)
- Risk assessment (low technical risk due to proven technologies)
- Timeline (3-4 month MVP is realistic, not aspirational)

### 2. BIM Coordinator Workflow Research
**Location**: `./BIM_COORDINATOR_WORKFLOWS.md`

**Key Documents**:
- 📋 [BIM_COORDINATOR_WORKFLOWS.md](./BIM_COORDINATOR_WORKFLOWS.md) - 50-page field study

**Key Findings**:
- ✅ **EPIC framework**: Educator, Precursor, Integrator, Coordinator roles
- ✅ **ROI validated**: 10x return ($200K → $2.5M industry benchmark)
- ✅ **Time savings**: 70% reduction in coordination meeting time (8-10 hrs → 2-3 hrs/week)
- ✅ **Table stakes identified**: BCF, IDS validation, clash detection are TIER 1
- ✅ **Competitive moat**: Workflow automation (no competitor offers this)

**Impact on PRD**:
- User personas section (BIM Coordinator daily workflows)
- Feature prioritization (TIER 1/2/3 based on coordinator value)
- Success metrics (70% time savings = primary metric)
- Competitive differentiation (automation vs. manual tools)

### 3. Research Synthesis (Technical + Workflow)
**Location**: `./RESEARCH_SYNTHESIS.md`

**Key Documents**:
- 🔗 [RESEARCH_SYNTHESIS.md](./RESEARCH_SYNTHESIS.md) - Unified strategy document

**Key Findings**:
- ✅ **Both research streams are correct**: Technical stack is right, but feature priorities needed shift
- ✅ **Architecture alignment**: Layered processing (Session 012) is PERFECT for coordinator workflows
- ✅ **Feature reprioritization**: Coordinator features (TIER 1) → Automation (TIER 2) → Performance (TIER 3)
- ✅ **Market positioning**: Cloud-native with Solibri validation + Dalux performance + workflow automation
- ✅ **Competitive moat validated**: Universal coordination (BCF) + automation + validation rigor

**Impact on PRD**:
- Executive summary (unified vision: technical excellence + coordinator value)
- Feature roadmap (3-phase strategy: MVP → Automation → Market Leader)
- Competitive analysis (differentiation strategy across all competitors)
- Success criteria (technical + business metrics aligned)

---

## Architecture Foundation

### Current State (Sessions 1-18)

**What We've Built** (✅ COMPLETE):
- ✅ **Backend**: Django 5.0 + DRF + PostgreSQL (Supabase) - 95% complete
- ✅ **Parser**: IfcOpenShell 0.8.0, layered processing (Session 012)
- ✅ **Database**: 15 tables, GUID tracking, JSONB properties, GIN indexes
- ✅ **BEP System**: 7 models (MMI scale, technical requirements) - Session 010
- ✅ **Queue**: Django Q for async processing (Session 017-018)
- ✅ **Frontend**: React 18 + TypeScript + Vite - 70% complete

**Key Documents**:
- 🏗️ [LAYERED_ARCHITECTURE_IMPLEMENTATION.md](../../LAYERED_ARCHITECTURE_IMPLEMENTATION.md) - Session 012
- 📘 [CLAUDE.md](../../CLAUDE.md) - Project development guide
- 🔧 [DJANGO_Q_SETUP.md](../../backend/DJANGO_Q_SETUP.md) - Async task setup

**Critical Insight**: The layered architecture (Session 012) is PERFECT for coordinator workflows:
- **Layer 1 (Parse)**: Fast metadata extraction (5-15s) → Quick validation reports
- **Layer 2 (Geometry)**: Optional, retryable (30s-5min) → Viewer can wait while coordination happens
- **Layer 3 (Validate)**: Reports issues without blocking (5-30s) → IDS validation ready

This is exactly what Consultant 4 recommended: "Separate metadata parsing from mesh generation entirely."

---

## PRD Structure Overview

The **[PRELIMINARY_PRD.md](./PRELIMINARY_PRD.md)** contains:

### 1. Executive Summary (Page 1-3)
- Product vision: "Cloud-native BIM coordination with Solibri validation + Dalux performance + workflow automation"
- Market opportunity: $1.2B+ market, 200K+ coordinators, 10x ROI demonstrated
- Competitive positioning: vs. Solibri, Dalux, ACC/Procore, Navisworks

### 2. Product Overview (Page 3-6)
- Problem statement: Manual work, inconsistent validation, fragmented tools
- Solution approach: Universal ingestion + automated analysis + intelligent workflows
- Core value proposition: 70% time savings, 10x ROI, universal coordination
- Success metrics: Primary = 70% time savings, Supporting = adoption/business/technical

### 3. User Personas & Workflows (Page 6-10)
- Primary: BIM Coordinator (EPIC framework: Educator/Precursor/Integrator/Coordinator)
- Secondary: BIM Manager (ROI proof, portfolio dashboards)
- Tertiary: Discipline Leads (BCF integration, validation requirements)
- Weekly time breakdown: 10 hours → 2.75 hours (73% reduction)

### 4. Feature Requirements (Page 10-25)
- **TIER 1 MVP** (4-6 months): IFC ingestion ✅, IDS validation 🔨, BCF 🚧, Clash detection 🚧, Change detection 🔨, Viewer 🚧
- **TIER 2 Automation** (6-12 months): Scheduled clash, AI grouping, auto-assignment, workflow triggers, dashboards
- **TIER 3 Market Leader** (12+ months): Performance optimization, business intelligence, analytics

### 5. Technical Requirements (Page 25-28)
- Current state: 95% backend done, 70% frontend done
- Target architecture: IfcOpenShell + PostgreSQL + xeokit/Three.js + Django Q
- Performance targets: <3s parse, <5min validation, <10min clash, 30+ FPS viewer
- Integration: IFC, BCF, IDS standards compliance

### 6. Roadmap & Timeline (Page 28-32)
- **Phase 1** (4-6 months): MVP with BCF, IDS, clash detection, viewer
- **Phase 2** (6-12 months): Workflow automation (70% time savings)
- **Phase 3** (12-24 months): Market leader (performance + analytics)

### 7. Competitive Analysis (Page 32-36)
- Market landscape: Desktop leaders (Solibri, Navisworks), Cloud platforms (Dalux, ACC), Open source (IFC.js)
- Differentiation: Universal coordination, validation as code, workflow automation, cloud-native, accessible pricing
- Competitive moat: Features that win (automation, AI grouping, benchmarking, scriptable workflows)

### 8. Risk Assessment (Page 36-38)
- Technical risks: Medium (proven stack, mitigation plans)
- Market risks: Medium (clear gap, but established competitors)
- Execution risks: Medium-Low (clear roadmap, domain expertise)

### 9. Success Criteria & Metrics (Page 38-40)
- Phase 1: 10+ coordinators, 5+ projects, $50K ARR
- Phase 2: 50+ coordinators, 25+ projects, $250K ARR, 70% time savings validated
- Phase 3: 200+ coordinators, 100+ projects, $1M+ ARR, 10x ROI demonstrated

### 10. Appendices (Page 40-45)
- Research references (all documents linked)
- Standards compliance (IFC, BCF, IDS, ISO 19650)
- Resource requirements (team, infrastructure, costs)
- Go-to-market strategy (pilot, launch, pricing, sales)

---

## Key Decisions Documented

### Decision 1: Feature Prioritization ✅

**BEFORE** (Technical Focus):
1. Parallel geometry extraction
2. LOD mesh generation
3. Compression strategies
4. Viewer optimization
5. Eventually get to BCF/clash detection

**AFTER** (Coordinator Value Focus):
1. **BCF Integration** (universal coordination language) - **TIER 1**
2. **IDS Validation** (extend BEP → IDS parser) - **TIER 1**
3. **Clash Detection** (basic spatial intersection) - **TIER 1**
4. **Change Detection UI** (GUID comparison viewer) - **TIER 1**
5. **Viewer** (xeokit vs Three.js) - **TIER 1**
6. Workflow automation (scheduled tasks, auto-assignment) - TIER 2
7. Analytics (dashboards, ROI reporting) - TIER 3
8. Parallel geometry, LOD, compression - TIER 3 (performance optimization)

**Rationale**: Coordinators will pay for clash detection even if it's slow. No coordinator will pay for a fast viewer without clash detection. Performance optimization is TIER 3, not TIER 1.

### Decision 2: Viewer Technology 🤔

**Options Analyzed**:

**Option A: xeokit-sdk** (Fast MVP, License Cost)
- **Pros**: BIM features built-in, 33x compression, 100K+ objects tested, 3-4 month MVP
- **Cons**: AGPL-3.0 (~$2-5K/year for SaaS), less flexible
- **Recommendation**: Choose if fast time-to-market is priority

**Option B: Three.js + web-ifc** (MIT, More Dev Time)
- **Pros**: MIT license (free), full control, community ecosystem
- **Cons**: 5-6 month MVP (build BIM features), manual optimization
- **Recommendation**: Choose if MIT licensing is critical concern

**Preliminary Recommendation**: **xeokit for Phase 1 MVP**
- $2-5K/year is negligible vs. 2-3 months faster launch = earlier revenue
- BIM features built-in (storey isolation, sections, BCF viewpoints) = lower dev cost
- Proven 100K+ object performance = less risk
- Can evaluate migration to Three.js later (after revenue/feedback)

**Status**: Decision pending (evaluate in Week 3-4 of 30-day action plan)

### Decision 3: IDS vs BEP 🔀

**The Relationship**:
- **BEP**: Project-level requirements (what the project needs)
- **IDS**: Model-level validation (what the model must have)
- **Integration**: BEP defines requirements → IDS enforces them

**Decision**: **Extend BEP to support IDS**, don't replace it
1. Keep BEP system (MMI scale, technical requirements, naming conventions) - Session 010
2. Add IDS parser to validate models against BEP requirements
3. BEP = project setup, IDS = automated enforcement
4. Gives both project management (BEP) and validation (IDS)

**Implementation**: Create `apps/bep/services/ids_validator.py`

**Timeline**: 2-4 weeks to add IDS support on top of existing BEP

---

## Next Steps (From PRD Approval)

### Week 1-2: PRD Review & Approval
1. ✅ PRD created (today)
2. Internal review (product + engineering team)
3. BIM domain expert review (workflows, standards)
4. Business review (market, financials, GTM)
5. Final revisions → approval

### Week 3-4: Phase 0 Preparation
1. **Viewer technology decision**: xeokit vs Three.js prototype evaluation
2. **Pilot customer recruitment**: Identify 5-10 BIM coordinators
3. **Benchmarking plan**: Validate technical assumptions (optional if time allows)
4. **Sprint planning**: Break TIER 1 features into 2-week sprints

### Month 1: Kick Off Phase 1 MVP
1. **IDS validation**: Extend BEP system (2-4 weeks)
2. **BCF schema design**: Create `apps/bcf/` models and API spec (2 weeks)
3. **Viewer prototype**: xeokit or Three.js integration (2 weeks)
4. **Parallel development**: BCF API + Viewer + IDS validation

### Month 2-6: Phase 1 MVP Development
Follow TIER 1 roadmap in PRD (page 28-29)

---

## Success Indicators (PRD Complete)

✅ **Research Synthesized**: 3 major research streams unified
✅ **Vision Defined**: "Cloud-native BIM coordination with Solibri validation + Dalux performance + workflow automation"
✅ **Users Defined**: BIM Coordinator (primary), BIM Manager (secondary), Discipline Leads (tertiary)
✅ **Features Prioritized**: TIER 1 (MVP) / TIER 2 (Automation) / TIER 3 (Market Leader)
✅ **Roadmap Clear**: 4-6 months MVP, 6-12 months automation, 12-24 months market leader
✅ **Success Metrics**: 70% time savings (primary), 10x ROI (business), <3s parse (technical)
✅ **Risks Assessed**: Technical (medium), Market (medium), Execution (medium-low)
✅ **Competitive Analysis**: vs. Solibri, Dalux, ACC/Procore, Navisworks (clear differentiation)
✅ **Go-to-Market**: Pilot → Launch → Pricing → Sales strategy defined

**Next Action**: Stakeholder review and approval (Week 1-2)

---

## Document Map (All Research & Planning)

```
project-management/
├── planning/
│   ├── 📄 PRELIMINARY_PRD.md ⭐ [THIS IS THE MAIN DOCUMENT]
│   ├── 📋 PRD_OVERVIEW.md [YOU ARE HERE - INDEX/GUIDE]
│   ├── 🔗 RESEARCH_SYNTHESIS.md [Technical + Workflow unified strategy]
│   ├── 📋 BIM_COORDINATOR_WORKFLOWS.md [Field study, EPIC framework]
│   ├── 📊 BEP_IMPLEMENTATION_SUMMARY.md [Session 010 summary]
│   ├── 🎯 BCF_IMPLEMENTATION_PLAN.md [Future: BCF detailed plan]
│   ├── ... [other session plans]
│
├── research/
│   └── efficiency/
│       ├── 📊 README.md [4 consultant summary]
│       ├── 📋 DECISION_MATRIX.md [5-minute comparison]
│       ├── 📖 CRITICAL_ANALYSIS.md [50-page deep analysis]
│       ├── 🔬 consultant4.md [Production benchmarks]
│       └── ... [other consultant documents]
│
├── worklog/
│   ├── session-018-codebase-cleanup.md [Latest: Celery removal]
│   ├── session-012-ifc-processing-bugfixes.md [Layered architecture]
│   └── ... [sessions 1-18]
│
├── to-do/
│   └── current.md [Current TODO: Viewer layout, 3D integration]
│
└── quality-control/
    └── ... [QC documentation]

Root:
├── 🏗️ LAYERED_ARCHITECTURE_IMPLEMENTATION.md [Session 012 - critical]
├── 📘 CLAUDE.md [Development guide]
└── ... [other root docs]
```

---

**Last Updated**: 2025-10-25
**Status**: ✅ PRD Complete, Ready for Review
**Owner**: Product Team
**Next Review**: Week 1-2 (Stakeholder approval cycle)
