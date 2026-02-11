# Current TODO - Sprucelab BIM Platform

**Last Updated**: 2026-02-07
**Current Phase**: MVP Phase 1 Complete, EPD Architecture Phase 1 Complete
**Status**: Type Library complete, EPD data models implemented

---

## 🎯 Immediate Priority: EPD Architecture Refactor

**Reference**: `docs/worklog/2026-02-07-17-15_Type-Materials-EPD-Architecture.md`

### Phase 1: Data Model Refactor ✅ COMPLETE
- [x] Add EPDLibrary model (EPDs as first-class entities)
- [x] Add EPDMapping model (flexible EPD→target linking)
- [x] Add IFCMaterialNormalization model (IFC material→normalized)
- [x] Remove EPD fields from MaterialLibrary/ProductLibrary
- [x] Create Django migration (0025_add_epd_architecture)
- [ ] Seed EPDLibrary with Reduzer products (optional, can do later)

### Phase 2: Project Config Enhancement
- [ ] Add inheritance fields to ProjectConfig
- [ ] Add EPD source configuration
- [ ] Add normalization rule configuration

### Phase 3: UI Implementation
- [ ] Create Project Types & Materials page (`/projects/:id/types-materials`)
- [ ] Create EPD Library browser component
- [ ] Create EPD Mapping editor
- [ ] Create Material Mapping grid

### Phase 4: Export Updates
- [ ] Update Reduzer export to use EPDMapping
- [ ] Add EPD resolution logic (project→global fallback)

---

## ✅ Phase 1 Complete (Type Library)

**Reference**: `docs/knowledge/PROJECT_STATUS.md`

- [x] Types-only extraction (2-second parsing)
- [x] TypeBankEntry model with verification workflow
- [x] TypeBankObservation for cross-project tracking
- [x] GlobalTypeLibraryViewSet with all endpoints
- [x] TypeLibraryPage with 3-panel layout
- [x] TypeDetailPanel with tabbed interface
- [x] VerificationBadge status indicators
- [x] Material layer editor (TypeDefinitionLayer)
- [x] Keyboard shortcuts (A=save, F=flag, I=ignore)
- [x] i18n (English + Norwegian Bokmål)
- [x] Type Dashboard with health scores

---

## 🔨 MVP Priority #2: Verification Engine

**Reference**: `docs/plans/PRD_v2.md`

- [ ] Define rule schema in ProjectConfig
- [ ] Build rule execution engine in FastAPI
- [ ] Connect ProjectConfig → validation rules
- [ ] Per-type issue reporting
- [ ] Health score calculation from verification results

---

## 🔨 MVP Priority #3: Sandwich View

- [ ] Design 2D material section diagram component
- [ ] Render TypeDefinitionLayer as visual sandwich
- [ ] Add to TypeDetailPanel Materials tab

---

## ⏳ Planned (Phase 2+)

### From PRD
- [ ] Rule Configuration GUI (visual rule builder)
- [ ] Version Change Badges (new/removed/changed indicators)
- [ ] Excel import/export UI wiring
- [ ] BCF export from verification failures
- [ ] Multi-scenario LCA export (A/B/C comparison)

### From magna-reduzer Comparison
- [ ] MMI (Model Maturity Index) extraction
- [ ] Measurement rules per IFC class (auto-detect unit)
- [ ] Direct Shape detection (Revit artifact handling)
- [ ] Seed EPDLibrary with 33 confirmed Reduzer products

---

## 🔴 Deprioritized

- BEP System (over-engineered, ProjectConfig sufficient)
- Full property editing (Excel workflow sufficient)
- Graph queries (over-engineered for MVP)
- Clash detection (Solibri's moat)

---

## 🐛 Known Issues

1. **Production migration needed**: `reused_status` column missing on Railway
2. **Dashboard health at 0%**: 620/623 types pending classification (expected)

---

## 📊 Progress Tracking

**Overall MVP Completion**: ~70%

| Component | Status | Notes |
|-----------|--------|-------|
| Type extraction | ✅ 100% | 2-second parsing works |
| TypeBank | ✅ 100% | Cross-project intelligence |
| Type Dashboard | ✅ 95% | Health scores, progress bars |
| Type Library UI | ✅ 90% | Grid, detail panel, verification |
| Verification Engine | 🟡 20% | Models exist, engine pending |
| EPD Architecture | 🟡 30% | Phase 1 complete (data models) |
| Sandwich View | 🔴 0% | Not started |
| Excel Workflows | 🟡 50% | Endpoints exist, UI not wired |
| LCA Export | 🟡 30% | Endpoint exists, needs EPD refactor |

---

## 📋 Key Documentation

| Document | Purpose |
|----------|---------|
| `CLAUDE.md` | Project context, rules, architecture |
| `docs/knowledge/PROJECT_STATUS.md` | Current state overview |
| `docs/knowledge/architecture-flowchart.md` | System diagrams |
| `docs/knowledge/magna-reduzer-comparison.md` | Prototype comparison |
| `docs/plans/PRD_v2.md` | Product requirements |
| `docs/worklog/2026-02-07-*` | Latest session logs |

---

**Next Action**: Implement EPD Architecture Phase 2 (Project Config Enhancement)
**Blocker**: None
**Reference Worklog**: `docs/worklog/2026-02-07-17-15_Type-Materials-EPD-Architecture.md`
