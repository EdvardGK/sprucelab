# Session: Layer 2 GUID bridge → color-system rethink → design-tokens unification → tester-sweep plan

## Summary

Long, dense session that picked up from the architecture-only conversation of 2026-05-13. Shipped **eight code commits** plus a wireframe and a planning doc, then pivoted twice in response to live user feedback: first to ship a viewer fix for visible "ghost glass square" artifacts, then to rethink the entire color vocabulary into a single OKLCH design-tokens system after the Types-dash vs Model-dash inconsistency surfaced. Closed with the user-instructed pinning of Issue #12 (21-item tester-findings sweep) as a structured 6-wave plan rather than chasing items linearly.

Net product impact: every interactive surface on Types page v2 is now URL-driven and cross-filter-composable; viewer no longer renders opening voids as ghost geometry; Types and Model dashes now share a single perceptual-uniform OKLCH gradient palette; all design constants live behind one tokens file with a documented iron rule against bypassing it.

Top of `main`: `ebb609f`.

## Changes

### Frontend code (shipped + live)

- **`dcdc475` Layer 2 GUID bridge** — `type_guid` promoted to a first-class filter dimension in `ProjectFilterProvider`, mirroring how Layer 1 (shipped previous session) promoted `AnalysisStorey.guid` to `floor_code`. Four files: `lib/embed/types.ts` (FilterContext + createFilterContext), `contexts/ProjectFilterProvider.tsx` (set_dimension key + setTypeGuid action creator), `hooks/useProjectFilterUrl.ts` (URL round-trip), `components/features/warehouse-v2/TypeBrowserV2.tsx` (lifted selection from local state to provider; mount-skip ref so URL-hydrated `type_guid` survives first render).

- **`ff23c67` ifc_class URL persistence** — `ifcClassFilter` lifted from local state into the provider's existing `ifc_class` dimension. Adapter callback preserves the single-select `'all'`-sentinel UX over the provider's multi-select array shape so call sites (treemap toggle, table-header filter, filter-bar dropdown) stay untouched.

- **`f99bb49` Hide non-physical IFC categories at v3 load** — added `NON_PHYSICAL_V3_CATEGORIES = {IFCOPENINGELEMENT, IFCOPENINGSTANDARDCASE, IFCVIRTUALELEMENT}` to `UnifiedBIMViewer.tsx`. After fragments-v3 category extraction, calls `v3Model.setVisible(localIds, false)` for these classes + updates `typeVisibility` defaults to false. Kills the "scattered glass-like squares near windows/doors" artefacts. Mirrors the backend's physical/orphan accounting from commit `9feafe3` (2026-05-13).

- **`cc3cf97` Triangle gradient palette generator** — new `lib/colorMath.ts` with OKLCH polyline sampling (lime → forest → navy), van der Corput / bit-reversal subdivision, `paletteSlot(n)` → deterministic stable color. `warehouse-v2/classColors.ts` swapped its internals from a 12-color brand hex array to `paletteSlot(rank)`. `buildClassColorMap` signature unchanged so every consumer (treemap, sparklines, table row stripes, KPI bars) inherited new colors with zero call-site touches.

- **`5449e15` Design tokens unification** — the same 12-color brand palette was duplicated across **four** files; the Types-page-only swap above produced visibly different vocabularies between Types and Model dashes. Fixed the architecture: `lib/design-tokens.ts` extended with `tokens.dataPalette` (vertices + 12 slots + `slot(i)` generator) and six OKLCH status families (`success` / `warning` / `danger` / `info` / `signal` / `neutral` × {solid / `*Bg` / `*Text`}) plus a `STATUS` catalog pairing each kind with a glyph (NN/g rule). Tailwind config exposes the new tokens as `bg-signal`, `bg-success-bg`, `text-danger-text`, etc. Four violator sites (warehouse-v2 + StatisticsTab + AnalysisKpiCluster + ModelWorkspace) all swapped to `tokens.dataPalette.slots`. Iron rule documented at the top of `design-tokens.ts`: no hex literals or oklch strings outside this file (+ its math helper).

- **`de80352` Untrack stray `.claude/worktrees/` submodules** — `git add -A` in the previous commit swept up 42 transient agent worktrees as submodule entries (mode 160000). Removed from index, added `.claude/worktrees/` to `.gitignore`. No deploy break.

### Docs (shipped + live)

- **`f861dd0` / `aa066cf` Worklog (Layer 2 + ifc_class)** — `docs/worklog/2026-05-13-23-10_Layer-2-GUID-bridge-ifc-class-URL-persist.md`. Second commit added a "Memory captured" subsection for parity with peer worklogs.

- **`686f0c2` Color-system wireframe v1** — `docs/wireframes/color-system.html`. Six sections: triangle gradient strip, canonical class swatches grouped by discipline, typical-case treemap, 22-class stress test with tail collapse, signal-orange cross-filter chips + KPI tile, before/after comparison. Plus an entry in `docs/wireframes/index.html` under a new "Design system (proposals)" nav group.

- **`af5f561` Color-system wireframe v2** — four new sections in the same file: van der Corput bit-reversal subdivision at N=2/4/8/16, two-stage generator-vs-assignment model with code shapes, stress-test treemap recoloured via bit-reversal + class-name hash, and a full traffic-light + callout system with six semantic families at three intensities + status dots + threshold ladder for KPIs + a notes block cross-referencing WCAG 2.2 / NN/g / Material 3 / Apple HIG / Tableau for each palette decision.

- **`ebb609f` Tester-findings sweep plan** — `docs/plans/2026-05-14-10-46_Tester-findings-sweep.md`. Pins all 21 items from [Issue #12](https://github.com/EdvardGK/sprucelab/issues/12) (filed today by another Claude session driving the live app) as a 6-wave plan with recommended order: Wave 1 (quick wins) → Wave 4 (P0 statistics aggregator) → Wave 2 (empty/error states) → Wave 5 (API base URL consolidation) → Wave 3 (cross-filter scope) → Wave 6 (My Page real data). Two items flagged for clarification before action (thumbnail-copy + logger-level — grep finds no matching string in the repo).

### Memory captured

- `~/.claude/projects/-home-edkjo-workspace-sidehustles-sprucelab/memory/type-guid-synth-hash-fallback.md` — non-obvious invariant from `backend/ifc-service/services/ifc_parser.py:398`. Extractor generates `synth_<md5[:18]>` from `(ifc_class, object_type)` whenever no `IfcTypeObject` exists, so `IFCType.type_guid` is rarely null in modern extractions. Synth hashes round-trip through `?d=` URL filters as cleanly as real 22-char IFC GUIDs. Cross-links to the older `data-extraction-vs-fragments-runtime-mismatch.md` which still describes null-`type_guid` as common; reality post-synth is that null means legacy / pre-synth data.

## Technical Details

### Layer 2 design philosophy (mirrors Layer 1)

Same recipe as the storey GUID bridge from 2026-05-13: promote the canonical IFC identifier (GlobalId for storeys, type objects, etc.) to user-visible URL state; internal Django UUIDs become derived state where still needed for downstream component props (`InlineViewer typeId={selectedType.id}` keeps receiving the Django UUID, but `selectedType` itself is now resolved from `type_guid` in the URL). Net: cross-filter key is shareable, cross-model-stable, and composable with the rest of the provider state. The five-file recipe should drop in trivially for Layer 3a grouping axes (Spaces, Zones, Systems, Openings).

### Mount-skip ref bug and fix

Original reset effect cleared the selection on any change to `[modelId, ifcClassFilter, searchQuery]`. My first attempt (`dcdc475`) added a "skip first run" ref, but the dependency tuple still changes a second time when React Query populates `models[0].id` after mount — wiping a URL-hydrated `type_guid`. Caught during live verification (the user reported "no data in the types dash now"). The hardened pattern lives in `TypeBrowserV2.tsx`: the mount-skip ref now also handles the React-Query init case. Verified via reload of `?d=eyJ...type_guid:[0cfAb$UiMw6u7UKfDg5E6r]...` — both keys preserved.

### Synth-hash discovery

Live click on the `<untyped>` row in the Top-10 list produced `type_guid: ["synth_4093a37b9b838214a3"]` in the URL — proving the extractor synthesises non-null hashes for proxy/userdef. The local-id fallback I added in `TypeBrowserV2.tsx` for truly null `type_guid` is defensive and currently unreachable. Memorised as `type-guid-synth-hash-fallback.md` to update the older mismatch memo's framing.

### Color-system rethink (the big arc)

User redirected from "ship more PRs" to "rethink the color scheme". Conversation arc:

1. **Single gradient idea** — pick colors from a single gradient range + complementary orange as signal. Storey chart's navy→forest gradient as the model.
2. **Sub-divide for large treemaps** — proposed linear gradient. User pushed back: subdivide further, but predictable subdivision pattern, not random colors.
3. **"Not random"** — user clarified: position should be class-stable, not rank-dependent. Same WallType in Project A and B should be the same shade.
4. **Triangle gradient** — user proposed lime → dark green → dark blue. Doubles perceptual range vs single-segment. Hue cliff at the forest vertex (155° → 260°) prevents adjacent-discipline blur.
5. **Mathematical model for subdivision** — bit-reversal (van der Corput, base 2) so any N samples are well-distributed and adding/removing classes never reshuffles existing assignments.
6. **Generator vs assignment** — for main UI use canonical class table (semantic); for treemaps and multi-item charts use stable-hash-to-slot (assignment can be random, generation must be predictable).
7. **Traffic lights + callouts** — added on user request, with WCAG / NN/g / Material 3 / Apple HIG / Tableau cross-references inline in the wireframe notes block.

The wireframe at `docs/wireframes/color-system.html` is the visual spec. Implementation arrived in two PRs: `cc3cf97` (palette generator + replace `CLASS_PALETTE` in classColors.ts only), then `5449e15` (unify across all four violator sites via `design-tokens.ts`). PR 2 of the color work (wiring `--signal` to DrillTarget active state) is queued.

### Design-tokens "iron control"

User: *"we need a single config for all colors, component types etc. We need to make sure we have iron control and ease of maintainability for agents and humans alike"*. The architecture for this already existed at `lib/design-tokens.ts` — the violation was four duplicate hex arrays bypassing it. Fix in `5449e15` doesn't introduce a new system, it ENFORCES the existing one by:

1. Extending `tokens` with the missing surfaces (`dataPalette`, OKLCH status families, `STATUS` catalog with glyphs).
2. Replacing all duplicate hex arrays with imports from `tokens`.
3. Documenting the iron rule at the top of the file so future agents (and humans) have a clear contract.

Future tightening: add an ESLint rule that forbids hex literals and `oklch(...)` strings outside `lib/colorMath.ts` and `lib/design-tokens.ts`. Not in scope this session.

### Submodule mistake

The `5449e15` commit used `git add -A` which is the wrong tool when subagent worktrees are present in `.claude/worktrees/`. Created 42 submodule references in the index. The hint output from git would have warned me on the first stage, but `add -A` doesn't — it just adds them with `warning: adding embedded git repository`. Caught on inspection of the commit output and reversed in `de80352` via `git rm --cached -r .claude/worktrees/` + `.gitignore` entry. Deploys never broke because Vercel and Railway clone main without recursive submodules. Lesson: never `git add -A` when there are unrelated nested-repo directories around. Prefer explicit paths.

### Tester-sweep pinning

Issue #12 came in mid-session from another Claude web session driving the live `sprucelab.io` with auth. 21 actionable findings across P0/P1/P2. I started creating Wave-1 tasks via TaskCreate; user redirected with *"no, this is too big. Pin the wave as a plan and point the worklog to it. Solve the design tokens issue now"*. Tasks deleted; plan doc written instead. Plan calls out which waves compose with future color-system PRs (lead-filter `order: string[]` from Wave 3 + cross-filter scope banner).

## Next

1. **Wave 1 of tester sweep** — frontend quick wins. Sidebar Search "coming soon" tooltip + 404 errorElement + i18n debug:false. Two items flagged (thumbnail-copy, logger-level) need user screenshot before action.
2. **Color system PR 2 — `--signal` wiring** — apply `tokens.color.signal` orange to `DrillTarget` active state + `FilterChips` active chip. Tailwind tokens already in place.
3. **Wave 4 of tester sweep — P0 statistics aggregator** — `/api/projects/{id}/statistics/` returns zeros while per-model rollup sums to 88,791. Backend audit + fix + reanalysis pass on 8 prod projects.
4. **Layer 3a (#15)** — Spaces / Zones / Systems / Openings as `AnalysisX` tables. Still queued from architecture session of 2026-05-13.

## Notes

- Trunk-based discipline held: 10 commits direct to `main` (8 feature/fix + 1 cleanup + 1 plan doc). Each verified with type-check + build + Vercel + Railway green before moving on.
- The two-stage color model (generator vs assignment) is the cleanest architectural insight of the session. Generator is pure math owned by `colorMath.ts`; assignment is per-surface and lives where the data is (`buildClassColorMap`, future canonical-class lookup table). Keeps the system flexible without compromising consistency.
- The `--signal` orange (`oklch(0.78 0.18 50)`) was deliberately picked to live outside the gradient's bounding box in OKLCH so a treemap cell can NEVER look like a signal. Same math reasoning applies to all six status families — they share L bands but use hues outside the data range.
- Tester-findings plan doc explicitly notes that Wave 3 (cross-filter scope) and the colour-system PR 3 (lead-filter `order: string[]`) compose — when the user activates a filter on `/models` it should carry to `/types` with a "from Models" origin chip rather than silently leaking.
- Frontend-first + coordinator-rounds-must-include-frontend memories continued to apply — every PR this session moved a pixel on the live app, even the design-tokens unification (Types and Model dashes now read identically). The closest exception was the wireframe commits but those WERE the design conversation, not invisible plumbing.
