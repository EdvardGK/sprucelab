# Sprucelab PRD v2.1 - Data-First BIM Intelligence Platform

**Version**: 2.1
**Date**: 2026-03-29
**Status**: Active
**Supersedes**: PRD v2.0, PRELIMINARY_PRD.md, PLAN.md

---

## Executive Summary

### Product Vision

**"IFC in → Actionable insight out. Types are the language. Data is the product."**

Sprucelab turns IFC files into actionable data. Drop a model, get answers in seconds: What types exist? What's classified? What's wrong? What changed? The 3D model is a data source, not the destination. Dashboards, verification results, and change detection are the product.

**Core insight**: Types are the unit of coordination in BIM, not individual entities. A building might have 50,000 entities but only 300-500 unique types. By focusing on types, we make BIM data manageable, actionable, and valuable.

**Design principle**: Every feature must answer one of these questions: *Is this model ready? What needs attention? What changed? How do I fix it?* If it doesn't, it's Phase 2.

### What We Are NOT

- NOT a modeling tool (we don't create IFC)
- NOT a clash detection platform (Solibri/Navisworks territory)
- NOT a document management system (ACC/Dalux territory)
- NOT a general property editor (too broad, too slow)

### What We ARE

- A platform that **answers questions** about BIM models in seconds
- An engine that **surfaces what needs attention** before you ask
- A system that **remembers classifications** across projects (classify once, apply everywhere)
- A dashboard that **tracks health over time** so you see progress, not just state

---

## Target Users

### Primary: BIM Coordinators & BIM Managers

- Receive models from disciplines
- Need to verify quality and completeness
- Must classify types for FM, LCA, QTO
- Track what changed between versions
- Report to project leadership

### Secondary: FM Professionals

- Need accurate type data for handover
- Track material compositions
- Link to asset management systems

### Tertiary: LCA Consultants

- Need type → material → carbon data
- Compare design scenarios
- Export to OneClickLCA, Reduzer

---

## Core Product Concept: The Type Warehouse

### The "Drop & See" Experience

1. **Upload IFC** (any authoring tool)
2. **2-second parse** (types-only extraction)
3. **Dashboard view**: All types, grouped by IFC class
4. **Each type card shows**:
   - Instance count
   - Material composition (sandwich view)
   - Key properties (external, loadbearing, fire rating)
   - Classification status (NS3451, OmniClass)
   - Verification status (green/yellow/red)

### Type Detail View (The "Deep Dive")

For each type:

- **3D viewer** showing all instances in model (highlight/isolate)
- **Instance list** with locations (Building > Storey > Space)
- **Material sandwich** (2D section showing layers + thickness)
- **Property table** (all Psets from IFC)
- **Classification editor** (NS3451 cascading selector)
- **Notes & comments**
- **Observation history** (where else has this type appeared?)

### TypeBank: Cross-Project Intelligence

Types accumulate into a global TypeBank:

- Same type seen across 10 projects → classify once, apply everywhere
- Confidence scoring based on observation count
- Alias management (same type, different names)
- ML training data for auto-classification (future)

---

## Core Features

### 1. Model Processing (Layer 1)

| Aspect | Specification |
|--------|---------------|
| Input | IFC 2x3/4 from any authoring tool |
| Output | Type inventory (300-500 types per model) |
| Speed | < 5 seconds for 100MB model |
| Stored | Types + instance counts + key properties |
| NOT stored | Individual entity data (viewer loads IFC directly) |

### 2. Type Classification Workflow

- **NS3451** (Norwegian building classification)
- **OmniClass** (international standard)
- **Custom taxonomies** (project-specific)
- **Excel import/export** for batch classification
- **Keyboard-driven** focused workflow (arrow keys, shortcuts)

### 3. Material Composition (Sandwich View)

- **Layer editor**: Define material layers per type
- **2D section diagram**: Simple stacked rectangles showing layers
  - Each layer: material name, thickness (mm), color coding
  - Clear visual communication of type composition
  - No complex 3D geometry required
- **EPD linking**: Connect layers to carbon data
- **Thickness tracking**: mm per layer, auto-sum total
- **Export**: LCA tools (Reduzer, OneClickLCA)

### 4. Verification Engine

**Core rules** (built-in):
- Required properties present
- Required Psets per IFC class
- Classification completeness
- Material data completeness

**Custom rules** (user-defined, per-project via ProjectConfig):
- Property value constraints
- Naming conventions
- Project-specific requirements

**Rule configuration**:
- **GUI builder** for accessibility (visual rule editor in UI)
- **Config files** (JSON/YAML) for power users, version control, automation
- Both read/write the same underlying ProjectConfig

**Output**: Per-type validation status + issue list

### 5. Insight Layer (Primary Interface)

The dashboard is the product. It answers:
- **Is this model ready?** → Health score (classification + verification + materials)
- **What needs attention?** → Action items sorted by severity, click to investigate
- **What changed?** → Version change badges + summary
- **Which disciplines are behind?** → Per-discipline progress breakdown
- **How are we trending?** → Health scores over time (future)

Specifics:
- **Model health score** (% types classified, % verified, % with materials)
- **Verification summary** (pass/warning/fail counts, top issues)
- **Action items** (flagged types with what to fix, click to navigate)
- **Progress bars** (mapped/pending/review/ignored)
- **Version change card** (new/removed/changed since last upload)
- **Professional, clean aesthetic** - no leaderboards, badges, or XP

### 6. Version Change Detection

- **New type badge**: Type appears in new version but not previous
- **Removed type badge**: Type was in previous version but not current
- **Changed badge**: Instance count changed significantly (configurable threshold)
- **Dashboard summary**: "+12 new, -3 removed, 5 changed" with click-to-filter
- **Auto-detect on upload**: Compare triggers automatically when uploading a new version

### 7. 3D Context (Supporting)

The viewer serves the data, not the other way around. When the dashboard flags an issue or a type needs review, the embedded viewer shows instances in-model. Users never need to "open" a viewer as a primary action.

- **ThatOpen Components** (Three.js-based)
- **Type filtering**: Show only selected type's instances
- **Instance navigation**: Click through instances from type detail
- **On-demand properties**: Query FastAPI for element details

---

## The Insight Flow

The core user experience, from upload to action:

```
Upload IFC (2 sec) → Dashboard (instant) → Health Score (auto-verified) →
  Flagged Issues (click to investigate) → Type Detail (3D as context, not destination) →
    Action (classify / verify / export / fix)
```

The user never needs to "browse" a 3D model. Data surfaces problems; the viewer provides spatial context when needed.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│   React Frontend                                │
│   - Type dashboard                              │
│   - Type detail view (3D + sandwich + props)    │
│   - Classification workflow                     │
│   - Verification reports                        │
└──────────────────┬──────────────────────────────┘
                   │ REST API
                   ▼
┌─────────────────────────────────────────────────┐
│   Django Backend                                │
│   - TypeBank (global types)                     │
│   - TypeMapping (per-model classification)      │
│   - ProjectConfig (rules, scopes)               │
│   - User/Project management                     │
└──────────────────┬──────────────────────────────┘
                   │ Internal HTTP
                   ▼
┌─────────────────────────────────────────────────┐
│   FastAPI IFC Service                           │
│   - Types-only parsing (2 sec)                  │
│   - On-demand property queries                  │
│   - Validation engine                           │
│   - IFC reconstruction (for exports)            │
└─────────────────────────────────────────────────┘
```

---

## Implementation Status

### Built (Ready)

- [x] Types-only parsing (2 sec)
- [x] TypeBank models + API
- [x] TypeMapping workflow
- [x] NS3451 cascading selector
- [x] Excel export/import
- [x] Material layer editor
- [x] TypeInstanceViewer (3D)
- [x] Keyboard shortcuts
- [x] i18n (EN/NB)
- [x] Airtable-style grid view
- [x] ProjectConfig model (Phase 1)

### MVP Priorities

1. ~~**Type Dashboard**~~ - DONE (health scores, progress, at-a-glance status)
2. **Verification Engine** - type-level verification against ProjectConfig rules
3. **Version Change Detection** - what changed since last upload?
4. **Dashboard Enhancement** - surface verification results + action items
5. **Excel Workflow UI** - wire existing endpoints to frontend
6. **Sandwich View** - 2D material section diagram

### Phase 2 (Post-MVP)

- BCF export (verification failures → BCF issues)
- Full change diff view
- Auto-classification suggestions
- TypeBank ML training

### Deprioritized / Cut

- BEP system (too complex, over-engineered)
- Clash detection (Solibri's moat, not our focus)
- Full property editing (too broad, Excel workflow sufficient)
- Graph queries (over-engineered for current needs)

---

## Success Metrics

### Primary

| Metric | Target |
|--------|--------|
| Time to first insight | < 30 seconds from upload to type dashboard |
| Classification velocity | 50+ types/hour with keyboard workflow |
| Verification pass rate | Track improvement over time |

### Secondary

- Types classified per project
- TypeBank entries (global knowledge accumulation)
- Cross-project type reuse rate
- LCA exports generated

---

## Competitive Position

| Platform | Focus | Our Difference |
|----------|-------|----------------|
| Solibri | Rule-based validation | We're types-first, not rules-first |
| Dalux | Field viewing | We're office coordination, not field |
| ACC | Document management | We're BIM intelligence, not storage |
| dRofus | Programmatic info | We're IFC-native, not proprietary |

**Unique position**: Type-centric BIM intelligence with professional, keyboard-driven UX.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Rule scope | Per-project (ProjectConfig) | Each project can customize; TypeBank stays classification-only |
| Gamification | Minimal | Progress bars, health scores, completion %. Professional, not gimmicky |
| Sandwich view | 2D diagram | Simple stacked rectangles with layers + thickness. Fast, clear |
| Rule editor | Both GUI + config | GUI for accessibility, JSON/YAML for power users & version control |
| BCF export | Phase 2 | Focus MVP on classification + verification |
| Change detection | Basic indicators | Show new/removed/changed type badges |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-10-25 | PRELIMINARY_PRD - BIM Coordination Platform vision |
| 1.1 | 2025-11-09 | PLAN.md - Property Editing Platform pivot |
| 2.0 | 2026-02-05 | **Current** - Type-Centric BIM Intelligence Platform |

### Evolution Context

- **Oct 2025**: Started as BIM Coordination Platform (Solibri competitor)
- **Nov 2025**: Pivoted to Property Editing Platform (bulk IFC editing)
- **Dec 2025**: Session 031 breakthrough - Types-Only Architecture (10x performance)
- **Feb 2026**: Crystallized as Type-Centric BIM Intelligence Platform
