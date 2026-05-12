# Plan — Restore BEP/EIR module from `archive/`

**Date**: 2026-05-12  
**Status**: Draft. Not started. Awaiting user approval to begin.

## Context

On 2026-04-29 (commit `e993e8f`), the BEP/EIR module — both backend
(`backend/apps/bep/`, 1340+ lines) and frontend
(`frontend/src/pages/ProjectBEP.tsx` + `bep/` + `eir/` + hooks, ~2803
lines) — was archived to `archive/` under "replaced by the data-
foundation pipeline". In practice the data-foundation pipeline does
not replace the BEP/EIR semantics; it complements them. The user
flagged this on 2026-05-12 (referencing the missing CRS dropdown,
canonical floor editor, project basepoint config).

This plan restores the archive as the project-config surface, with
reconciliation against the Phase 2-5 data-foundation models. The
classification work from
`feedback-classification-driven-by-eir.md` lands at the end.

## What the restore brings back

### Backend (`archive/backend/bep/`)
- `models/bep.py` — `BEP`, `BEPCoordinates` (CRS + basepoint),
  `BEPStorey` (canonical floors), `BEPDiscipline`, `BEPMMIMatrix`,
  `BEPTechnicalRequirement`
- `models/eir.py` — `EIR`, `EIRRequirement`, classification system
  references
- `models/response.py` — `BEPResponse` (BEP's response to a EIR
  requirement)
- `models/validation.py` — validation engine for BEP/EIR pairs
- `serializers.py` (466 lines), `views.py` (874 lines)
- Management command `load_bep_templates`
- `bep_defaults.py` — default EIR/BEP templates for new projects

### Frontend (`archive/frontend/`)
- `pages/ProjectBEP.tsx` (241 lines) — main page, tabbed layout
- `bep/CoordinateSystemForm.tsx` (310 lines) — Norwegian CRS dropdown
  (NTM 5–14, UTM 32/33/35), vertical CRS (NN2000/NN1954/EVRF2007/
  EGM96/EGM2008), local origin XYZ, eastings + northings basepoint,
  orthometric height, true-north rotation, position + rotation
  tolerances
- `bep/StoreyTable.tsx` (226 lines) — canonical floor editor
- `bep/DisciplineTable.tsx` (262 lines)
- `bep/MMITableMaker.tsx` (362 lines)
- `bep/TechnicalRequirementsForm.tsx` (221 lines)
- `bep/BEPOverview.tsx` (162 lines)
- `eir/EIROverview.tsx`, `EIRRequirementList.tsx` (249 lines),
  `IDSSpecList.tsx`, `BEPResponsePanel.tsx`, `ComplianceDashboard.tsx`
- `hooks/use-bep.ts`, `use-eir.ts`

## Reconciliation work (the hard part)

The archive is a 2026-04-29 snapshot. The active tree has evolved
since then. On restore we must reconcile:

1. **Backend app rename `entities` → `types`** (Django app).
   - The archive's `bep/views.py` and serializers may reference the
     old `entities` namespace. Grep + fix.
2. **`ProjectScope` (Phase 2-5, spatial) vs archived `BEPStorey`
   (canonical floors).** Both have storey lists. Today
   `ProjectScope.canonical_floors` (JSON field on ProjectConfig)
   holds the canonical list, and `AnalysisStorey` /
   `AnalysisTypeStorey` are the per-model deviation tables. The
   archived `BEPStorey` is a more structured per-row model.
   - **Decision needed**: keep `ProjectConfig.canonical_floors` JSON
     and migrate the archived `StoreyTable.tsx` to write to it, OR
     re-instate the `BEPStorey` table and migrate
     `ProjectConfig.canonical_floors` to FK references.
   - Recommendation: keep JSON for now (simpler, already works with
     `ProjectFloorsTab`); promote to FK in a later cleanup.
3. **`ProjectConfig` field overlap.** Today `ProjectConfig` has
   `storey_merge_tolerance_m`, `block_on_storey_deviation`,
   `canonical_floors`. The archived `BEPCoordinates` overlaps on
   none of those — it's purely CRS + basepoint. Clean restore:
   `BEPCoordinates` becomes a 1:1 child of `ProjectConfig`.
4. **Hook path migration.** `use-bep.ts` calls
   `/api/projects/<id>/bep/` and similar. Verify against current
   `/api/projects/` namespace + decide whether BEP gets its own
   `/api/bep/` namespace or nests under projects.
5. **i18n strings.** Pull the BEP/EIR strings out of archive,
   merge into `frontend/src/i18n/locales/{en,nb}.json` under
   `bep.*` / `eir.*` namespaces.
6. **Sidebar entry.** Currently no "Project Settings" / "BEP" link
   in the sidebar. Add one, point at `/projects/:id/bep` (or
   `/projects/:id/settings`).
7. **Tests.** The archive's tests may use the old fixtures
   (`models/0001_initial.py` era). Run them; fix or skip.

## Sequencing (5 PRs)

### PR 1: Backend restore + reconciliation
- `git mv archive/backend/bep backend/apps/bep`
- Update `INSTALLED_APPS` in `backend/config/settings.py`.
- Reconcile model overlaps per §2 + §3 above.
- New migration: lift archived migrations forward (probably need a
  squash + fresh `0001_initial.py` because the archive's migrations
  reference an older state).
- Replace `entities` → `types` references in views/serializers.
- Run existing tests; fix or skip; add a smoke test for each viewset.

### PR 2: Frontend pages + hooks restore
- `git mv archive/frontend/bep frontend/src/components/features/bep`
  (and `eir`, `pages/ProjectBEP.tsx`, `hooks/use-bep.ts`,
  `hooks/use-eir.ts`).
- Fix any `/api/entities/` → `/api/types/` calls in the hooks.
- Merge i18n strings into `en.json` + `nb.json`.
- `yarn type-check` + `yarn build` clean.

### PR 3: Sidebar entry + route + AppLayout wiring
- Add `path: "bep"` to `App.tsx` under `/projects/:id`.
- Sidebar `to={'/projects/${projectId}/bep'}` with appropriate icon
  (Settings2 or ClipboardList).
- Optional: a "/projects/:id/settings" alias that redirects to
  `/projects/:id/bep` for naming flexibility.

### PR 4: EIR → Types v2 classification wiring
- Per `feedback-classification-driven-by-eir.md`.
- New hook `useProjectClassificationRequirement(projectId)` reads
  the active EIR's `required_classification_systems` array.
- The Types v2 "Missing classification" KPI computes missingness
  against the active system(s); the label templates on system name;
  the detail panel shows the right code field.

### PR 5+: Deeper integrations
- Verification engine reads EIR `EIRRequirement` rows as rules.
- IDS export from `EIRRequirement` rows (per
  `ids-as-interop-format.md`).
- BEP response workflow surfaced in ClaimInbox.
- TypeMapper writes back the active classification system code, not
  hard-coded `ns3451_code` field.

## Verification

End-to-end:
1. Open a project that has no BEP yet → "Create BEP from template"
   button → templated BEP appears.
2. Edit the CRS form → select ETRS89/NTM zone 10 + NN2000 → save →
   round-trips through the API.
3. Add canonical floors → they appear in
   `ProjectDashboard.ProjectFloorsTab` and in the viewer's floor
   selector.
4. Add an EIR requiring NS3451 → Types v2 KPI label changes to
   "Missing NS3451 codes per EIR"; classification check honors the
   EIR.

## What this plan is NOT

- Not a wholesale revert. The archive is a 2026-04-29 snapshot; some
  of it will need rewriting to match current schema.
- Not on the autonomous queue. Each PR needs the user's go-ahead
  because it touches the backend.
- Not blocking the Types v2 polish work — those can ship in parallel
  with PR 1.

## References

- Archive locations: `archive/backend/bep/`, `archive/backend/bep_defaults.py`,
  `archive/frontend/{bep,eir,pages,hooks}/`
- Archive commit: `e993e8f` ("chore: archive deprecated apps +
  finalize Phase 2 migration"), 2026-04-29
- Memory: `bep-eir-archive-restore-plan.md`,
  `feedback-classification-driven-by-eir.md`,
  `feedback-iso19650-requirement-fulfillment.md`,
  `feedback-deletes-and-archive.md`
