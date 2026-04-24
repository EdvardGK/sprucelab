# Current TODO - Sprucelab BIM Platform

**Last Updated**: 2026-04-24
**Current Phase**: Data-First Sprint + Agent-Ready Platform
**Status**: B1-B2 complete, views split, script execution API wired, batch API enhanced

---

## Active Sprint: IFC in -> Actionable Insight Out

### B3. Dashboard Enhancement
- [ ] Update `dashboard_metrics` endpoint with verification_score and verification_issues
- [ ] Verification Summary widget (pass/warning/fail, top issues)
- [ ] Action Items widget (types needing attention, sorted by severity, click to navigate)
- [ ] HealthScoreRing sub-segments (classification 30%, unit 15%, material 25%, verification 30%)

### B4. Version Change Detection
- [ ] `version_compare.py` service (compare types by signature tuple)
- [ ] Auto-compare on upload when parent_model exists
- [ ] Store results in Model.version_diff JSONField
- [ ] API endpoint: `GET /api/types/types/version-changes/?model={id}`
- [ ] Frontend badges: NEW (green), REMOVED (red), CHANGED (orange) on type rows
- [ ] Dashboard card: "+X new, -Y removed, Z changed" with click-to-filter

### B5. Sandwich View
- [ ] `SandwichDiagram.tsx` - SVG/CSS stacked rectangles
- [ ] Integrate into TypeDetailPanel Materials tab
- [ ] Color by material category, total thickness annotation

### Agent-Ready: Event/Webhook System
- [ ] `WebhookSubscription` model (project, event_type, url, secret, is_active)
- [ ] `dispatch_event()` utility (POST to subscribers with HMAC)
- [ ] Wire into: model processing complete, types classified, verification complete
- [ ] Start with 3 events: `model.processed`, `types.classified`, `verification.complete`

### Agent-Ready: CLI Expansion (spruce types/verify/scripts)
- [ ] `spruce types list --model X` -- list types with mapping status
- [ ] `spruce types classify --model X --type Y --ns3451 222 --unit m2`
- [ ] `spruce types export --model X --format excel|reduzer`
- [ ] `spruce verify --model X` -- run verification, print results table
- [ ] `spruce scripts list` / `spruce scripts run --script X --model Y`
- [ ] All commands support `--json` for agent consumption

---

## Complete

- [x] Types-only extraction (2-second parsing)
- [x] TypeBank cross-project intelligence
- [x] TypeMapping workflow + keyboard shortcuts
- [x] NS3451 cascading selector
- [x] Excel export/import (backend endpoints + frontend UI)
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
- [x] Verification Engine v1 (4 default rules, ProjectConfig custom rules, bulk update)
- [x] Script Execution API endpoint (POST /api/scripts/{id}/execute/)
- [x] Batch Classification API (POST /api/types/type-mappings/bulk-update/ with all fields)
- [x] API Surface Map (docs/knowledge/API_SURFACE.md)
- [x] Common Patterns in CLAUDE.md
- [x] entities/views.py split (2855 lines -> 8 modules)
- [x] Codebase simplification (BEP archived, dead apps removed, -13.8k lines)
- [x] Dashboard Enhancement (verification bar, action items, weighted health score)
- [x] Version Change Detection (service, endpoint, hook, TypeScript types)
- [x] Sandwich View (SandwichDiagram.tsx SVG component with material colors)

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
- [ ] Test infrastructure bootstrap (pytest + conftest + smoke tests)
- [ ] Dry-run support for mutations (?dry_run=true)

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

**Overall MVP Completion**: ~65%

| Component | Status | Notes |
|-----------|--------|-------|
| Type extraction | Done | 2-second parsing works |
| TypeBank | Done | Cross-project intelligence |
| Type Dashboard | Done | Health scores, progress bars |
| Type Library UI | Done | Grid, detail panel, verification badges |
| Excel Workflow UI | Done | Export/Import/Reduzer in TypeBrowser toolbar |
| Verification Engine | Done | 4 rules, ProjectConfig custom rules |
| Script Execution API | Done | POST /api/scripts/{id}/execute/ |
| Batch Classification | Done | All fields supported |
| Version Change Detection | Done | Service + endpoint + hook |
| Dashboard Enhancement | Done | Verification bar + action items |
| Sandwich View | Done | SVG component with material colors |
| Event/Webhook System | Pending | Agent-ready platform feature |
| CLI Expansion | Pending | types/verify/scripts commands |

---

**Next Action**: B3 - Dashboard Enhancement (integrate verification data)
**Then**: B4 - Version Change Detection
