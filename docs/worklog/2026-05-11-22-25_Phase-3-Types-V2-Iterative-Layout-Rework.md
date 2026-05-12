# Session: Phase 3 Type page v2 — iterative live-feedback rework

## Summary

Started the session intending to ship Phase 3 Type page v2 as a "first cut"
shippable single-session anchor PR (commits `e41c272` + `2241c79` early in
the session). That part landed as planned: a four-section skiplum-reports
layout at `/projects/:id/types?v=2`, plus a worklog and todo update.

The unplanned half — and the actually-useful half — was an iterative
live-feedback loop on the deployed page. Across six follow-up commits I
rewired the page based on rapid-fire user feedback (each round = me
deploying, them clicking through, them telling me what's wrong, me
shipping again). Final shape diverged substantially from the original
plan: bound the table not the page, restore the 3D viewer, drop the
"manual mapping" framing in favor of surfacing what's missing, surface
real IFC property data per type (LB/EXT/Fire/Acoustic/U-value/MMI),
upgrade KPIs to 6 traffic-light callouts (untyped/orphan/missing as
first-class signals), and reshape the page into three named rows:
KPIs full width / treemap+viewer 50/50 / top-10 (25%) + table (75%).

Why it matters: this is the first session under the "frontend-first
until the app feels real" + "must include a frontend agent in any
parallel round" + "design for the modeler workflow we actually believe
in, not generic CRUD" directives. The live iteration loop produced a
page that materially advances the product narrative ("bad models are
the product, surface gaps, don't classify on their behalf") rather
than yet another generic dashboard.

## Changes

### Commit `e41c272` — Phase 3 first cut (planned)

- New `frontend/src/components/features/warehouse-v2/` (6 files):
  `TypeBrowserV2`, `TypeBrowserHeaderV2`, `TypeBrowserFilterBarV2`,
  `TypeTreemap` (squarified via `lib/treemap.ts`), `TypeTopBarList`
  (hand-rolled flex bars), `TypeTableV2`.
- `ProjectTypesPage.tsx` switches on `?v=2`. v1 untouched.
- "Try the new Types page →" link added to v1 header.
- i18n keys under `typesV2.*` in en + nb; `status.verified` +
  `status.flagged` added to top-level `status` namespace.
- `frontend-refresh-roadmap.md` memory updated to reflect Phase 3
  shipped + corrected an earlier false claim that Phase 0 had added
  a `size` policy prop to `DashboardTile.tsx` (it had not).

### Commit `2241c79` — Worklog + todo update

- `docs/worklog/2026-05-11-16-59_Phase-3-Types-V2-First-Cut.md`.
- `docs/todos/current.md` — Phase 3 first cut marked shipped;
  Phase 3b/3c/3d/3.x added as follow-ups.

### Commit `ed33ef6` — Visibility + Select warning

- The "Try the new Types page →" link was easy to miss as muted gray
  text. Promoted to a pill (`bg-primary/10` + `rounded-full`).
- `TypeBrowserFilterBarV2` model Select: default `value` from
  `undefined` to `''` to avoid uncontrolled-→-controlled React warning.

### Commit `dc727d4` — Three reframes in one pass

- **Bound the page**: wrapped v2 in `h-[calc(100vh-4rem)]
  overflow-hidden`; orchestrator became `h-full flex-col`; table got
  `flex-1 min-h-0` with sticky thead. (Reverted in `3b0daaa`.)
- **Restore the 3D viewer**: new `TypeViewerPaneV2` wrapping the
  existing `<InlineViewer>` from `components/features/viewer/`. Click
  a table row → `selectedTypeId` state → viewer isolates the type;
  X button clears.
- **Drop "manual mapping" framing**: stat tile "Mapped %" replaced
  with "Missing classification" (amber when > 0). Table no longer
  shows mapping_status pills. New columns pull real values from IFC
  psets via `extractTypeProperties()`: Load-bearing · External · Fire
  rating · Acoustic · U-value · MMI. Each renders the value or an
  amber em-dash when missing. NS3451 unchanged.
- New helper `warehouse-v2/typeProperties.ts` — tolerant Pset
  extractor; bool/string/number coercion; probes multiple custom MMI
  pset names.

### Commit `3a3deab` — Viz row breakpoint fix (intermediate)

- Dropped the `lg:grid-cols-3` (1024 px) to `md:grid-cols-3` (768 px)
  for the viz row so the 3-col layout works on 1024–1440 viewports.
- Treemap canvas: `flex-1 min-h-0` instead of `aspect-[16/9]` so it
  fills its bounded tile.
- Reverted in the next commit when the bounded-page approach itself
  was rejected.

### Commit `3b0daaa` — Revert viewport lock; charts get real space

- User pushback: *"Let charts be charts. They need space. Lists can
  show x/n items in the main viewport. There is no lock-to-viewport
  rule here."*
- Dropped the `h-[calc(100vh-4rem)] overflow-hidden` on the v2 page.
  Page scrolls naturally again.
- Hero row became `grid-cols-2 h-[480px]` — treemap (col-span-2) +
  viewer (col-span-1). Wait — that was wrong; corrected in next
  commit.
- Only the table is bounded: `max-h-[640px]` with internal scroll.

### Commit `404ee85` — Three-row layout (KPIs+Top10 / Treemap+Viewer / Table)

- Row 1 (`h-[240px]`): KPI cards (75% width) + Top 10 types (25%
  width) — new `TypeKpiGrid` component.
- Row 2 (`h-[520px]`): Treemap (50%) + 3D viewer (50%).
- Row 3 (`max-h-[640px]`): All-types table with sticky thead.
- `TypeBrowserHeaderV2` stripped to title + classic-view link.
- `TypeTopBarList` defaults to topN=10 (was 20); compact bars +
  internal scroll inside its narrow 25%-width slot.

### Commit `fba012d` — KPI callouts with traffic light + final row reshape

- **KPI 6-callout grid** (3×2): Total types · Instances · Avg per
  type / Untyped instances · Orphan types · Missing classification.
  Traffic-light ring tone via `trafficLight(percent, {warn, danger})`:
  - Untyped: warn@5% danger@15% of instances
  - Orphan: warn@10% danger@25% of types
  - Missing: warn@25% danger@60% of types
- **Computed in orchestrator**:
  - `untypedInstances`: sum of `instance_count` where
    `type_guid === null` OR name matches `/<untyped>/i` OR empty
  - `orphanTypes`: types with `instance_count === 0`
  - `avgInstancesPerType`: `instances / totalTypes`
- **Row 2 reshape**: treemap `aspect-square`, viewer `aspect-[4/3]`,
  `items-start` so they top-align cleanly. Treemap finally looks
  like a treemap; viewer keeps a classic 4:3 frame.
- **Row 3 reshape** (`h-[640px]`): Top-10 (25%) + table (75%).
  `TypeTopBarList` gained a `fillHeight` prop — when set, bars
  spread vertically with `justify-between` and taller `h-2` bars
  (vs `h-1` default), so 10 items "concentrate" to fill the 640px
  card height instead of clustering at the top.
- Column headers in the types table changed from abbreviations
  (LB/EXT/Fire/Acoustic/U-value/MMI) to full words (Load-bearing /
  External / Fire rating / Acoustic rating / U-value / MMI).
- i18n: `typesV2.stats.{avgPerType,untyped,orphan,
  percentOfInstances,percentOfTypes}` in en + nb.

## Technical Details

**Layout was the dominant work-product, not data plumbing.** Every
commit after `e41c272` was reshape-driven. The data layer (hooks,
endpoints) is unchanged from earlier sessions. This matches the
"frontend-first" directive: the win is the rendered UI on prod, not
new APIs.

**Tolerant Pset extraction**: G55's IFC file has very sparse
`Pset_*Common` data — most types' Load-bearing / External / Fire
columns render `—`. That is **the correct rendering** under the new
framing: surface what the modeler did and didn't fill in. Walls
(WallType: Maling, Yttervegg) do carry instance-level properties,
which is why clicking a Wall row produces a real 3D model in the
viewer with proper metadata (storey, GUID, neighbours).

**Aspect-ratio cells with items-start**: avoids the "row stretches
to tallest cell, shorter cells have whitespace below" cliché. With
treemap (aspect-square @ 50% width = ~570×570) and viewer (4/3 @ 50%
width = ~570×427), top-aligning gives the visual hierarchy the user
asked for. The empty space below the viewer is acceptable for a
first cut; tightening it would need either a non-50/50 split or a
viewer that lets its inner canvas grow.

**Live iteration loop via Chrome DevTools MCP**: opening the
deployed page in the actual browser, clicking through a real
project (G55), and screenshotting the result let me see what the
user was seeing on each round. Three of the six rounds turned on
visible rendering issues that wouldn't have surfaced from
`yarn build` alone (lg vs md breakpoint, aspect-ratio mismatch,
viewport-lock looking cramped). The MCP tools paid for themselves
in this session.

**Cache invalidation**: every push, Vercel rebuilt and the bundle
hash on `https://www.sprucelab.io/` flipped. Polling for the hash
to change (via `curl` + `until`) was sufficient to know when the
deploy went live. No service worker on prod — just a `/sw.js` SPA
fallback that returns `index.html` (verified in this session, no
SW caching to worry about).

**Verification end-state**:
- Frontend: `yarn type-check` + `yarn build` clean on every commit.
- Vercel: each commit deployed; final bundle `index-Dhn4pwEO.js`.
- Railway: `/api/health/` returned `{status: healthy, database: ok}`
  throughout.
- Browser: G55 project, 297 types, 591 instances, click row →
  3D viewer isolates type with metadata.

## Next

- **Phase 3b** — type detail pane: click row → besides isolating
  the viewer, surface classification triple, properties grid, layer
  buildup, MMI distribution per instance. Currently only viewer
  isolation works.
- **Notes per type + create issues**: user asked for the ability to
  add notes and file issues from a type. Backend has `Claim` model
  already (used by ClaimInbox); could surface a "Flag this type"
  action that creates a Claim with the type as origin.
- **Dedicated "type workspace" route**: separate from the overview
  page. This is where the modeler-style classification UI lives
  (currently in v1 TypeBrowser's 3-column form). User's framing:
  "model owners own the data; we suggest and have our own workspace."
- **MMI distribution as real distribution**: currently shows single
  MMI value (or `—`) per type. A real distribution chart needs
  per-instance MMI aggregation — probably a new
  `useTypeMmiDistribution(typeId)` hook hitting a new
  `/api/types/{id}/mmi-distribution/` endpoint.
- **Orphan signal is currently weak**: "types with 0 instances" is
  one read of orphan. The user might mean entities not in a spatial
  hierarchy. Worth confirming before adding more orphan-derived UI.
- Phase 3c/3d/3.x from earlier todos still apply.

## Notes

- Live MCP feedback loop is the new normal for visible UI work.
  Don't claim "verified" without a real browser screenshot when the
  user is reviewing on a live deploy.
- The "single-track, ONE visible PR per session" rule produced
  seven commits in this session — not one — but they all rolled up
  into one user-visible artifact (the `?v=2` page). Multiple
  commits ≠ multiple tracks; the rule still held.
- 20+ stale agent worktrees in `.claude/worktrees/` still pending
  cleanup (carried over from rounds 7 + 8). Not blocking.
- User feedback was issued in real-time WHILE I was working (8+
  `system-reminder` interrupts during commits). The interrupt-driven
  flow worked OK because each interrupt was actionable on the
  current file set. Worth remembering: the user expects to be able
  to interject mid-task.
