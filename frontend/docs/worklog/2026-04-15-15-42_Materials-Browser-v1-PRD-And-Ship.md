# Materials Browser v1 — PRD, taxonomy research, and first ship

**Session date:** 2026-04-15
**Branch:** dev (fast-forwarded to main at session start; was 135 commits behind)
**Owner:** Edvard + Claude

## What happened

Two things in one session. First half was planning — a full PRD covering the Materials Browser and its long-tail subsystems (Balance Sheet, Waste, Passports, Standards Workspace). Second half was building v1: a working Materials Browser page wired to existing project data, with a sprucelab-native L1/L2 material taxonomy.

## Planning outcome — PRD v3

`docs/plans/2026-04-15-13-00_Materials-Browser-PRD.md` — ~40KB, eight rollout phases.

Key architectural decisions:

- **Sprucelab-native L1 taxonomy** (13 families: Concrete, Masonry, Metal, Wood, Boards, Insulation, Glass, Membrane, Polymer, Finish, Composite, Technical, Other). Research (see `/tmp/materials-taxonomy-research.md`) confirmed no external standard fits designer-navigable material browsing — CPV is procurement-shaped, EN 15804/NPCR is EPD-shaped, NS 9431 is waste-shaped. KBOB (Swiss) is the closest real-world reference but isn't a formal standard. Correct move: invent the L1 list, crosswalk outward to the standards that matter.
- **Standards-agnostic schema from day one.** Not hardcoded columns (`ns9431_fraksjon, npcr_code, cpv_code`) — instead a `Standard → ClassificationCode → MaterialClassification` many-to-many. Adding a new standard is data, not schema. Ships with Norwegian defaults seeded, Standards Workspace (v1.3) unlocks per-project selection + bsDD integration + custom classifications.
- **Fungible → non-fungible** as the organizing principle for the full subsystem. Materials are interchangeable quantities in flow (Balance Sheet v1.5) and become unique assets at installation (Passports v2.5). Same event log (`MaterialTransaction`), different projection.
- **Rollout ordering (locked):** v1 Browser → v1.1 Screening LCA → v1.2 Change + proliferation → **v1.3 Standards Workspace** (architectural international unlock) → v1.5 Balance Sheet → v2 Waste → v2.5 Passports → v3 MaterialBank → v3+ Procurement SDK.
- **Procurement integration is agnostic** (v3+). No vendor lock-in — core integration surface is CSV + generic REST webhook + connector SDK pattern. ACC/Cobuilder/WebBBM become plugins.

Open questions answered: composite classified at layer level (not type level), KBOB used as seed reference, Madaster-compatible passport schema from day one, batch-level passports by default with instance-level opt-in for discrete items.

**The Norwegian "aligned with Enova classification" comment in `backend/apps/entities/models.py:642` is misleading** — there is no canonical Enova taxonomy, only a GWP reference table. To be replaced in v1.0.1 when the backend schema refactor lands.

**Field module check:** `backend/apps/field/models.py` is a TEK17/NS compliance checklist system (CheckItem, Checklist, ChecklistTemplate), not a per-type install tracker. Balance Sheet v1.5's "installed" state cannot reuse Field data — needs its own `MaterialTransaction` log.

## V1 ship — what shipped

**Frontend-only.** Strategic call: backend Standard/ClassificationCode schema + migration + seed + endpoint is a heavy lift, and a working screen on day one is more useful than a perfect schema nobody can see. Client-side aggregation over existing `/api/entities/types/` per-model endpoint. Backend refactor becomes v1.0.1.

### New files

- **`frontend/src/lib/material-families.ts`** (~420 lines). L1/L2 family definitions (13 families, ~70 subtypes). Heuristic classifier `classifyMaterialName(name)` — keyword-based Norwegian + English, first-match wins, ~80 rules. Specific rules ordered before generic ones ("lettbetong" before "betong", "glassull" before "mineralull"). Legacy `MATERIAL_CATEGORY_CHOICES` keys mapped to new L1/L2 via `LEGACY_CATEGORY_TO_FAMILY` so existing MaterialLibrary rows classify cleanly without migration. Two export points: `resolveFamily(rawName, legacyCategory)` and `classifyMaterialName(name)`.

- **`frontend/src/hooks/use-project-materials.ts`** (~330 lines). `useProjectMaterials(projectId)` hook. Uses React Query's `useQueries` to fan out fetches across all project models in parallel. Aggregates client-side: walks `type.mapping.definition_layers`, dedupes materials by `(family, normalized_name)`, rolls up quantities by unit, builds family tree, hashes set signatures, computes summary stats (coverage %, EPD linked %, etc.). Returns `ProjectMaterialsData` with `families`, `materials`, `sets`, `summary`. `aggregateProjectMaterials` is exported separately for testing/reuse.

- **`frontend/src/components/features/materials/MaterialBrowserView.tsx`** (~660 lines). 3-column layout: family tree left, materials/sets table center, detail panel right. Header bar shows coverage stats (materials, sets, classified %, EPD %, procurement %) + lens toggle (All / LCA / Procurement). Tab toggle between Materials and Sets. Family tree is hierarchical with L1 expandable to L2. Material rows show dedup aliases, suggested/unclassified badges, dominant quantity, used-in count, LCA readiness dot, procurement readiness dot. Set cards show a stacked color-coded layer bar (colors by family). Detail panels for both materials and sets — material detail has alias chips, quantity breakdown by unit, LCA/procurement readiness boxes, clickable "used in" list that navigates to Type Browser. Set detail has a sandwich visualization with proportional layer thicknesses. All sizing uses `clamp()` per sprucelab dashboard convention. All text is i18n'd.

### Modified files

- **`frontend/src/pages/ProjectMaterialLibrary.tsx`** — replaced "coming soon" stub with `<MaterialBrowserView projectId={project.id} />`. Preserved `AppLayout`, `useProject` loading/error states.

- **`frontend/src/i18n/locales/nb.json`** and **`frontend/src/i18n/locales/en.json`** — new `materialBrowser.*` namespace. 13 family labels, ~70 subtype labels, header/tab/lens/column/detail/set label groups, empty states, error states, search placeholder, suggested/unclassified badges. Norwegian primary, English parallel.

### What works in v1

- Opens `/projects/:id/material-library` → fetches all ready models → walks their types → deduplicates materials across the project → groups by sprucelab-native L1 family with L2 subtypes → shows a family tree, a materials table with the two lens columns, a sets tab with layer visualization
- Clicking a family filters the table to that family; clicking an L2 subtype filters further
- Material row click opens detail panel with aliases, quantities, coverage lights, click-through to Type Browser
- Set card click opens composition panel with sandwich visualization
- Search works across material names and aliases
- Progressive loading: rolls in models as their type fetches complete, header shows `{{loaded}} models loaded, {{pending}} pending`
- Empty state, error state, loading state
- Lens toggle hides/shows LCA or procurement columns

### What's deliberately red in v1

- **LCA readiness light** — red for every material because no EPD data exists in the current schema. v1.1 (Screening LCA) unblocks.
- **Procurement readiness light** — red for every material because there's no supplier/price/lead time data. v3+ unblocks.
- **These red dots are the spec, not a bug.** Coverage gap is the browser's primary job.

## Verification

- `yarn tsc --noEmit` → exit 0, no errors
- `python3 -c "import json; json.load(...)"` → both locale files valid
- Chrome DevTools MCP navigate to `/login` → page renders, 0 console errors, 0 warnings — confirms bundle compiles and new code doesn't crash on load
- **Authenticated visual check deferred** — MCP runs a separate chromium from the user's main session, so it can't use the saved Supabase credentials. User needs to navigate to `/projects/:id/material-library` in their own chromium and report back.

## Known gaps / deferred

- **No backend schema yet.** `Standard`, `ClassificationCode`, `ProjectStandard`, `MaterialClassification` tables are spec'd in PRD but not built. Task #3 is parked as "DEFERRED to v1.0.1". Client-side aggregation is the v1 shortcut.
- **Family map lives in frontend.** When the backend schema ships (v1.0.1), the family definitions should move to a shared location or be served from the backend so the classifier can run server-side. The frontend classifier is a stopgap.
- **No project-wide aggregation endpoint.** v1 walks N type endpoints client-side. Fine up to ~20 models; perf optimization comes in v1.0.1.
- **Composite types are classified at layer level, not assembly level.** Per the PRD decision. A composite "window type" doesn't show up as a Composite family — its constituent glass, aluminium, sealant materials each appear in their own families. Correct for LCA and waste but may be surprising to users. Document in the v1.0.1 release notes.
- **No tests.** Unit tests for `aggregateProjectMaterials` and `classifyMaterialName` would be useful — deferred.

## Tasks queued for follow-up

- **Backend refactor (v1.0.1):** new models + migration + Norwegian seed data + project-level aggregation endpoint. Parked at task #3.
- **Balance Sheet (v1.5) Field module check:** confirmed Field is compliance-only, not install-tracking. Balance Sheet needs its own `MaterialTransaction` log.
- **Blast radius check on `MATERIAL_CATEGORY_CHOICES`:** need to query production DB for populated rows before deprecating the enum.

## Handoff — how to test

1. `cd backend && python manage.py runserver 8000` (Django — already running in a background process I'll leave alone)
2. `cd frontend && yarn dev` (Vite — already running)
3. Navigate in your chromium to any project → sidebar → Materialbibliotek (or `/projects/:id/material-library`)
4. Expected: family tree on the left with Norwegian labels (Betong, Stål, Isolasjon, ...), materials table center with dedup aliases and red coverage lights, sets tab with sandwich visualizations, detail panels on click
5. If no materials show up, the project doesn't have any types with `definition_layers` populated — go to Type Browser and add a few material layers, then reload

## Files

- `docs/plans/2026-04-15-13-00_Materials-Browser-PRD.md` — full PRD v3
- `/tmp/materials-taxonomy-research.md` — background research (keep for reference, not checked in)
- `frontend/src/lib/material-families.ts`
- `frontend/src/hooks/use-project-materials.ts`
- `frontend/src/components/features/materials/MaterialBrowserView.tsx`
- `frontend/src/pages/ProjectMaterialLibrary.tsx` (stub → real)
- `frontend/src/i18n/locales/nb.json`
- `frontend/src/i18n/locales/en.json`
