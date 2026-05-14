# Session: Storey verification + GUID bridge + KPI rework + Wireframe kit + Dashboard engine vision

## Summary

Long iterative session across four interlocking themes: (1) shipped end-to-end storey verification on Model dash + ghost rows for missing canonical floors + orphan-row at the bottom; (2) Dion-Moult-lens KPI cluster rework (7 type-and-quality tiles + Discipline/main pills, dropping the duplicate ModelInfoCard); (3) full GUID bridge between backend AnalysisStorey and viewer fragments-v3, with click-on-storey → viewer filter verified live via chrome-devtools MCP; (4) light-and-fast wireframe kit covering every route + iframe navigator. Strategic capstone: documented the dashboard-engine architecture (definition-driven, agent-first) AND the marketplace vision (3 tiers: platform-shipped, user-custom, paid templates), with the architectural choices to lock in early so retrofit isn't required.

Top of `main` at session close: `7bc57ea` (render-nudge for floor filter). 29/29 storey tests green, all 8 prod models reanalyzed, viewer floor-filter verified clicking Plan 04 → Plan 07 on G55_ARK.

## Changes

### Backend (shipped + live)

- **Storey verification endpoint** (`6483743`): `GET /api/models/{id}/storey-verification/` returns `{has_canonical, matched_count, canonical_count, tolerance_m, model_storeys[], missing_canonical[]}`. Reuses `check_storey_deviation`'s match rules but in structured per-storey form.
- **Orphan-count semantics fix** (`9feafe3`): subtract IfcOpeningElement / IfcAnnotation / IfcGrid / IfcGridAxis / IfcVirtualElement before computing `orphan = total - sum_storey_element_count`. Exposes `physical_total` + `non_physical_count` alongside `total_products` in payload.
- **GUID bridge layer 1** (`4ec6c8f`): `AnalysisStorey.guid` CharField(22) + db_index + migration `0044`. Parser → ingestion → endpoint all carry GUID. Frontend chart click sends GUID, falls back to name for legacy data. KPI orphan-percent uses `physical_total` as denominator.
- **`reanalyze_models` management command** (`b415e01`): walk every Model with an IFC file, re-fire `run_model_analysis_task`. Flags: `--model UUID`, `--dry-run`, `--limit N`, `--sync`, `--throttle`.
- **`is_primary_for_discipline` exposed on Model serializer** (`51ffd4b`): bridges existing field to frontend `main`-pill rendering.

### Frontend (shipped + live)

- **`VerifiedStoreyChart`** (`6483743`): replaces inline StoreyChart in ModelWorkspace. Per-storey status edge + ghost rows for missing canonical floors + header progress-ring + orphan row at the bottom.
- **`AnalysisKpiCluster` Dion-rework** (`51ffd4b`): 7 tiles — Types · Classified · With material · Untyped · Reuse · Proxy+Userdef · Orphan. Classified + With material show em-dash with "Data extraction pending" until backend aggregations land; the other 5 derive directly from `analysis.types[]`.
- **Header pills** (`51ffd4b`): Discipline (ARK/RIB/RIE/...) + "main" pill when `is_primary_for_discipline`. Live on every Model dash header.
- **ModelInfoCard dropped from Overview** (`51ffd4b`): Schema/CRS/Authoring tool/Units/Coords are owned by Metadata tab. Quality + Geometry widened to col-span-3 each.
- **i18n** (`51ffd4b`): full strings under `modelDash.kpis` for classified, withMaterial, reuse, proxyUserdef, usedUnusedShort, mappedRatioShort, orphanShare, pendingExtraction. Plus `modelDash.storeys.orphanLabel` simplified to "Orphan".
- **GUID bridge — viewer side** (`4ec6c8f`, `2d9b713`, `72bb012`, `1ce3cc5`, `7bc57ea`): five iterative fixes to get fragments-v3 floor filter working. (a) `storeyInfo` Map gains `v3Refs: Array<{modelId, localIds}>`. (b) `finalizeV3Model` walks `v3Model.getSpatialStructure()` to find storeys. (c) UPPERCASE category match (`IFCBUILDINGSTOREY` not `IfcBuildingStorey`). (d) Storey nodes are CHILDREN of the IFCBUILDINGSTOREY container — walk those, not the container itself. (e) Explicit `renderer.three.render()` nudge after `setVisible` so the canvas repaints without the user needing to move the camera.

### Wireframe kit (`ba66c75`, `3660523`, `213c5d9`, `9a671de`)

- 27 light HTML wireframes covering every route in App.tsx: welcome, my-page, projects-gallery, admin, webhooks, webhook-deliveries, embed, type-library-global, project-dashboard, project-models, model-workspace, model-kpi-dion (Dion proposal), project-floors, project-my-page, viewer-groups, federated-viewer, project-documents, project-claims, project-drawings, project-types, project-type-library, project-material-library, project-field, project-eir, project-workbench.
- Shared `_light.css` (greyscale + 1 accent + structural tokens). Mock viewers = hatched diagonal pattern.
- `index.html` = iframe navigator: left sidebar grouped by section, right iframe preview, `←↑/→↓` keyboard navigation, URL hash deep-link. Open `docs/wireframes/index.html` directly in browser to iterate.

### Memory captured (NOT shipped — strategic + reference for future sessions)

- `feedback-dev-language-english.md` — switch dev conversations to English (Norwegian for domain terms still OK)
- `feedback-all-prod-data-is-test.md` — backfill / re-analyze / drop-and-rebuild without asking until launch
- `feedback-elements-types-orphan-terminology.md` — elements typed/untyped, types used/unused, orphan = outside spatial hierarchy
- `feedback-chart-truncate-bar-before-labels.md` — bar length shrinks before axis labels
- `feedback-text-scales-with-component.md` — viz labels scale with component box, not viewport (container-query units)
- `persona-dion-moult-dashboard-checklist.md` — reference list of 30+ candidate KPIs per dash
- `settings-architecture.md` — Dalux pattern: gear → tabbed shell (Access · Modules · Setup · My page · Integrations). Module-control is the billing-tier on-ramp
- `fragments-v3-spatial-tree-shape.md` — getSpatialStructure() returns UPPERCASE category containers wrapping null-category instance children. Don't match on instance category — match container then iterate children
- `dashboard-engine-architecture.md` — long-term plan: definition-driven engine across all dashboards, tile/chart contract, agent-first
- `dashboard-marketplace-vision.md` — 3 tiers (platform, user-custom, marketplace). Architectural choices to lock in NOW: pure-JSON definitions, versioned source contracts, explicit binding slots, no code-in-templates

## Technical Details

**The GUID bridge debug saga (4 commits, ~90 minutes).** The user reported "0 response in the viewer" after the storey-row click chain was wired up. Debugged live via chrome-devtools MCP, navigating to G55_ARK and watching console. Five iterations:

1. First click confirmed state IS updating (URL gains `?d=eyJmbG9vcl9jb2RlIjpbIjNQT1hxSHVNOTZEd1p6TTJjMjVHel8iXX0` = `floor_code: [<guid>]`). So the dispatch chain works; the viewer is what's silent.
2. Added always-on console logs (the `if (import.meta.env.DEV)`-gated ones are stripped in prod). Reload → log shows `[Viewer] v3 spatial structure had no IfcBuildingStorey nodes`. The classification block never populated storeyInfo.
3. Logged the actual `getCategories()` output — discovered fragments-v3 uses UPPERCASE category names (`IFCBUILDINGSTOREY`), not pascalcase. My comparison was case-sensitive against `IfcBuildingStorey`.
4. Fixed the case — still 0 storeys. Logged the tree shape: `IFCBUILDINGSTOREY: 1`, but the analysis has 10 storeys. Logged what the walker found at each storey node: `{localId: null, descendantCount: 12364, directChildren: 10}`. **Aha** — the IFCBUILDINGSTOREY node is a *category container* with localId=null; its 10 direct children are the storey instances with `category: null` and `localId` set.
5. Fixed the walker to iterate the container's children as storey instances. End-to-end works. Then user reported "froze, have to move camera" — added explicit `renderer.three.render()` after setVisible. Fixed.

This pattern (container-then-instances, UPPERCASE categories) is now memorized so we don't re-learn it for the type GUID bridge layer 2.

**Reanalysis flow.** New schema field on AnalysisStorey + 8 prod models with `guid=null` until they're reanalyzed. Ran `railway run tools/python backend/manage.py reanalyze_models --sync --throttle 2.0` against Railway's prod env (using conda shim to avoid the Django 5.0 vs 5.1+ CheckConstraint gotcha). 8/8 succeeded, 57/57 storeys now have GUIDs.

**Orphan-count clamp.** `total_products` in the deep analysis counts ALL IfcProducts (excluding spatial elements like IfcSite/Building/Storey/Space). But it still includes IfcOpeningElement, IfcAnnotation, IfcGrid, IfcVirtualElement — products that are never expected to live in storey containment. Without subtracting these, the orphan count was inflated on every model (~14% of products on G55_ARK). Fix: read `analysis.types.all()`, sum `instance_count` where `element_class` ∈ `_NON_PHYSICAL_IFC_CLASSES`, subtract from `total_products` to get `physical_total`, then compute `orphan_count = physical_total - sum_storey_element_count`. New test confirms the math: 180 total - 80 non-physical = 100 physical; 100 in storeys = 0 orphans.

**Dashboard engine + marketplace vision.** Triggered by the user asking "do we have a central dashboard engine?" then "think about scalability and maintenance at scale" then "users should be able to build their own + marketplace down the line". Crystallized: same definition-driven engine serves platform-shipped, user-custom, and marketplace templates. Architectural choices to lock in NOW (so retrofit doesn't bite later): pure-JSON definitions (no embedded code, kills the sandboxing problem), versioned source-path contract, explicit binding slots (project/scope/model_role), no inline JS in templates. The same JSON IS the agent payload — "Claude, install storey-deviation dashboard on G55" becomes fetch template → bind → save as DashboardInstance. Saved as task #14 + two memory files.

## Next

1. **Phase 1 of #14 — extract DashboardSurface engine.** Port Types page first (it's the gold-standard cross-filter pattern). Then Phase 2 ports Model dash (which solves cross-filter parity from #11). Builds the foundation for the marketplace vision.
2. **Layer 2 of GUID bridge** — IFCType GUID → treemap click → viewer type isolation. Pattern proven by layer 1; should be a focused single ship.
3. **#10 Settings architecture** — Dalux pattern: gear → tabbed shell (Access · Modules · Setup · My page · Integrations). Wireframe lives at `docs/wireframes/project-eir.html` etc.; frontend port pending.
4. **Verify floor filter on prod after `7bc57ea` lands.** The render-nudge fix shipped at session close; once Vercel deploys, the freeze-until-camera-moves bug should be gone. Quick chrome-devtools verification.

## Notes

- **All prod data is test data** until launch — re-analyze/reset freely (memorized).
- **Storey GUID extraction relies on getItemsData attributes** — fragments-v3 stores `Name` sometimes as raw string, sometimes as `{value: string}`. Handle both. Already done in current code.
- **Backend orphan was inflated for months pre-fix** — every model's "orphan" count was previously dominated by `IfcOpeningElement` instances. Real physical orphans on G55_ARK = 1,748 of 12,348 physical_total (14.2%) which is still high; the actual cause is now diagnosable rather than buried under noise.
- **Diagnostic logs were live in prod for ~6 commits** during debugging. All gated back to DEV in `05412a6`. Future cross-filter wiring should add similar always-on diagnostics during development; revert before final ship.
- **Wireframe kit can iterate without backend** — `docs/wireframes/index.html` is a self-contained design surface. Use for layout debates without touching React.
