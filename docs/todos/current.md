# Current TODO - Sprucelab BIM Platform

**Last Updated**: 2026-03-29
**Current Phase**: Data-First Sprint - Verification, Change Detection, Dashboard
**Status**: Type Dashboard complete, Verification Engine next

---

## Active Sprint: IFC in -> Actionable Insight Out

### B1. Excel Workflow UI (quick win)
- [ ] `ExcelWorkflowBar` component (Export + Import buttons)
- [ ] `useExcelExport(modelId)` hook (triggers download)
- [ ] `useExcelImport()` hook (file upload + result dialog)
- [ ] Integrate into TypeLibraryPanel and TypeAnalysisWorkbench toolbars
- [ ] i18n keys (en.json + nb.json)

**Backend**: Endpoints already exist and work. Zero backend changes needed.

### B2. Verification Engine v1 (critical path)
- [ ] `verification_schemas.py` - Pydantic models (TypeVerificationRule, TypeIssue, ModelVerificationResult)
- [ ] `config_loader.py` - Load rules from ProjectConfig.config['verification'], default fallback
- [ ] `type_verifier.py` - Core engine: check types against rules (reads DB, not IFC file)
- [ ] FastAPI endpoint: `POST /verify/model/{model_id}?project_id=...`
- [ ] Django proxy: `verify` action on IFCTypeViewSet
- [ ] Default rules: has_ns3451, has_unit, has_material_layers, type_name_pattern

### B3. Dashboard Enhancement
- [ ] Update `dashboard_metrics` endpoint with verification_score and verification_issues
- [ ] Verification Summary widget (pass/warning/fail, top issues)
- [ ] Action Items widget (types needing attention, sorted by severity, click to navigate)
- [ ] HealthScoreRing sub-segments (classification 30%, unit 15%, material 25%, verification 30%)

### B4. Version Change Detection
- [ ] `version_compare.py` service (compare types by signature tuple)
- [ ] Auto-compare on upload when parent_model exists
- [ ] Store results in Model.version_diff JSONField
- [ ] API endpoint: `GET /api/entities/ifc-types/version-changes/?model={id}`
- [ ] Frontend badges: NEW (green), REMOVED (red), CHANGED (orange) on type rows
- [ ] Dashboard card: "+X new, -Y removed, Z changed" with click-to-filter

### B5. Sandwich View
- [ ] `SandwichDiagram.tsx` - SVG/CSS stacked rectangles
- [ ] Integrate into TypeDetailPanel Materials tab
- [ ] Color by material category, total thickness annotation

---

## Complete

- [x] Types-only extraction (2-second parsing)
- [x] TypeBank cross-project intelligence
- [x] TypeMapping workflow + keyboard shortcuts
- [x] NS3451 cascading selector
- [x] Excel export/import endpoints (backend)
- [x] Material layer editor (TypeDefinitionLayer)
- [x] Type Dashboard (health scores, progress bars)
- [x] Type Analysis Dashboard (KPIs, quality checks, treemap)
- [x] TypeInstanceViewer (3D)
- [x] i18n (EN/NB)
- [x] Airtable-style grid view
- [x] ProjectConfig model
- [x] EPD Architecture Phase 1 (data models)
- [x] Responsibility Matrix (21 discipline codes)
- [x] Production deployment (Railway + Vercel)

---

## Phase 2 Backlog

- [ ] Rule Configuration GUI (visual rule builder)
- [ ] BCF export from verification failures
- [ ] Auto-classification suggestions (TypeBank ML)
- [ ] Design scenario comparison (A/B/C LCA)
- [ ] EPD Architecture Phase 2-4 (ProjectConfig inheritance, EPD browser UI)
- [ ] MMI extraction
- [ ] Measurement rules per IFC class
- [ ] Reduzer product seeding

---

## Deprioritized

- BEP System (over-engineered, ProjectConfig sufficient)
- Full property editing (Excel workflow sufficient)
- Graph queries (over-engineered for MVP)
- Clash detection (Solibri's moat)
- Standalone viewer features (viewer serves data, not standalone)

---

## Known Issues

1. **Production migration needed**: `reused_status` column missing on Railway
2. **Dashboard health at 0%**: Types pending classification (expected for new projects)

---

## Progress Tracking

**Overall MVP Completion**: ~50% (recalculated with new priorities)

| Component | Status | Notes |
|-----------|--------|-------|
| Type extraction | Done | 2-second parsing works |
| TypeBank | Done | Cross-project intelligence |
| Type Dashboard | Done | Health scores, progress bars |
| Type Library UI | Done | Grid, detail panel, verification badges |
| Excel Workflow UI | Pending | Endpoints exist, UI not wired |
| Verification Engine | Pending | Critical path - next up |
| Version Change Detection | Pending | Infrastructure ready (Model.version_diff) |
| Dashboard Enhancement | Blocked | Needs verification engine first |
| Sandwich View | Pending | Pure frontend, data exists |

---

**Next Action**: B1 - Excel Workflow UI (quick win, unlocks bulk classification)
**Then**: B2 - Verification Engine v1 (critical path)
