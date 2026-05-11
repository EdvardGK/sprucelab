# Viewer Highlight-Mode Spike — gating embed PR 5 (ViewerTile)

**Status:** desk-spike (no real-model run yet); unblocks PR 5 design
**Predecessors:** `docs/plans/2026-05-10-22-16_Embed-Roadmap-PR5-Plus.md` (Q1), `docs/plans/2026-05-03-21-15_Forward-Deployed-Embed.md` (§Highlight vs filter, Q5)
**Memory anchors:** `frontend-fragmentsmodels-v3`, `single-project-filter-store-bidirectional`, `feedback-keep-layouts-simple`, `feedback-viewer-perf-rabbithole`

---

## 1. Question

Embed PR 5 ships `ViewerTile` — `UnifiedBIMViewer` wrapped as a
`DashboardFilterProvider` consumer, with the resolver-driven set of
`type_id` / `instance` ids translated into one of two viewer modes:
**filter** (non-matching removed entirely) or **highlight** (non-matching
ghosted, matching accented). The roadmap doc tagged the highlight-rendering
approach for an omarchy spike that — per the May 4–5 worklogs — never
ran, so PR 5 cannot pick a rendering strategy yet. The 2026-05-10
migration to `@thatopen/fragments` v3 also reset the API surface the
spike was originally scoped against. This doc closes the design loop
without a real-model run by reading the installed v3 type surface plus
the in-tree usage, lists the gaps that genuinely need a model on disk,
and writes down the simplest viewer API that satisfies PR 5 while
staying inside the embed robustness contract.

## 2. Current state

`UnifiedBIMViewer` (`frontend/src/components/features/viewer/UnifiedBIMViewer.tsx`)
already exposes a single `isolation` prop and routes everything through it:

- `IsolationConfig` shape — `frontend/src/components/features/viewer/UnifiedBIMViewer.tsx:99-104` — `guids[] + mode: 'single' | 'all' + currentGuid? + zoomOnChange?`. GUID-keyed; resolver returns express ids, GUID translation happens via `FragmentsManager.guidToFragmentIdMap` (v2 path) or per-model express→localId map (v3 path).
- Isolation effect — `…/UnifiedBIMViewer.tsx:2046-2121` — when active calls `hider.set(false)` then `hider.set(true, map)`; in `single` mode also `highlighter.highlightByID('current', cur, false, false)` to paint the cursor instance orange. Reset path: `hider.set(true)`, `highlighter.clear('current')`, blow away type/storey delta refs so they re-sync from scratch.
- v3 highlight wiring (selection only, not isolation) — `…/UnifiedBIMViewer.tsx:894-943` — `MaterialDefinition { color: 0x88ccff, opacity: 1, transparent: false, renderedFaces: 0 }` passed to `model.highlight([localId], def)`.
- v3 visibility for filter mode — `…/UnifiedBIMViewer.tsx:1929-1936` — `lm.v3Model.setVisible(ref.localIds, now)` per model that contributes to a type, dispatched in parallel.
- Class-color override (today) — `…/UnifiedBIMViewer.tsx:2125-2155` — v2 only, walks `typeInfo` and calls `fragment.setColor(color, [...expressIds])`. **Has no v3 equivalent in the tree**; v3 path is silently skipped.
- View modes (xray / wireframe) — `…/UnifiedBIMViewer.tsx:432-459` — scene-traversal material swap. v2/v3 agnostic, but it overwrites materials globally so it can't drive a per-element ghost.
- Single consumer of `isolation` today — `frontend/src/components/features/viewer/InlineViewer.tsx:308-316` — Type page passes the GUID set + cursor.

Filter→viewer wiring inside the in-app surface lives in the
`ProjectFilterProvider` (memory: `single-project-filter-store-bidirectional`).
The embed deliberately runs its own `DashboardFilterProvider` (PR 2,
`frontend/src/lib/embed/types.ts:91-140` — already includes `mode: 'filter' | 'highlight'`,
`type_id?[]`, `selected_express_id`, etc.), and PR 4 stood up the host
`/embed/:dashboard` route (`frontend/src/pages/EmbedDashboard.tsx`) but
that page does not yet mount any viewer.

## 3. fragments v3 highlight API surface (installed: 3.0.11)

All citations against `frontend/node_modules/@thatopen/fragments/dist/index.d.ts`.
The relevant per-model surface is `class FragmentsModel` (`:689-980`):

| API | Signature | Purpose |
|---|---|---|
| `setVisible(localIds \| undefined, visible)` | `:909` | Per-element show/hide. `undefined` = whole model. |
| `toggleVisible(localIds?)` | `:914` | Inverse of current state. |
| `getItemsByVisibility(visible)` | `:919` | Batch read — useful for "what is currently isolated". |
| `getVisible(localIds)` | `:924` | Per-element read. |
| `resetVisible()` | `:928` | Single call, restores all to visible. |
| `highlight(localIds \| undefined, MaterialDefinition)` | `:934` | Apply an arbitrary `{color, opacity, transparent, renderedFaces, customId?}` to a set of items. Stackable per `customId`. |
| `getHighlight(localIds?)` | `:939` | Read current highlight materials. |
| `resetHighlight(localIds?)` | `:944` | Drop highlight on a subset (or all). |
| `getHighlightItemIds()` | `:948` | Read all currently highlighted ids. |
| `getItemsOfCategory(category)` | `:811` | Returns `Item_2[]` for a class — the building block we already use for type extraction. |

`MaterialDefinition` (`:1709-1720`) is the entire color-override
vocabulary: `color: THREE.Color`, `opacity: number`, `transparent:
boolean`, `renderedFaces: RenderedFaces` (enum at `:2060` — `ONE` /
`TWO`), `customId?: string`. `MaterialManager.resetColors(definitions)`
(`:1728`) clears static refs.

There is **no** dedicated "ghost the rest" call. Ghosting is composed:
either (a) `highlight(everything-except-matching, ghostMaterial)` then
`highlight(matching, accentMaterial)`, or (b) `setVisible(non-matching,
false)` for true filter mode. The `transparent: true + opacity: 0.1-0.2`
shape of `MaterialDefinition` is what the existing v2 xray mode does
material-by-material (`UnifiedBIMViewer.tsx:446-457`); v3 does it on the
worker side via `highlight()` with the same numbers and a stable
`customId`. Multi-model coordination is done at `FragmentsModels` (`:986-1059`)
but the ghost/accent calls are still per-model — there's no
`fragments.highlight(allModels, def)` shortcut.

## 4. Gap analysis

| Capability needed by PR 5 | v3 surface today | UnifiedBIMViewer today | Gap |
|---|---|---|---|
| Filter mode (non-matching hidden) | `setVisible(ids, false)` | `lm.v3Model.setVisible(refs.localIds, now)` already wired for type toggle | None — wire to embed filter. |
| Highlight mode — accent on matching | `highlight(ids, accentDef)` | Used only for click-selection (`:941`) | Reuse for filter-driven highlight; need a stable `customId` so click-selection can layer on top without clobbering it. |
| Highlight mode — ghost on non-matching | `highlight(non-matching, {transparent:true, opacity:~0.15})` | Not wired (v2 xray does scene-level material swap; v3 has no equivalent in tree) | Compose: per-model, compute `non-matching = allLocalIds \ matchingLocalIds` and apply ghost def with `customId='embed:ghost'`. |
| Color override per type / per category | `highlight(ids, {color: typeColor})` per type | v2 only via `fragment.setColor` (`:2125-2155`); v3 path silently skipped | Add v3 branch that maps `typeInfo.v3Refs` → `model.highlight(localIds, {color, opacity:1, transparent:false, customId:'embed:colorBy:<dim>'})`. |
| Multi-instance selection | `getHighlightItemIds()` + `highlight()` | Single click only | Add multi-select via the embed's `selected_global_ids[]` (`embed/types.ts:132`). |
| Reset all | `resetHighlight()` + `resetVisible()` per model | Whole-isolation reset works for v2; v3 reset is per-model | Wrap into one `clearEmbedView()` helper that loops loaded v3 models. |
| Crash containment | n/a | Iframe boundary (PR 4) + per-tile error bubble (PR 7) | PR 5 must wrap viewer mount in an error boundary that tears the model down on `webglcontextlost`. |

The gap is small. The viewer can already do filter mode for free; highlight mode needs one new effect that calls `highlight()` twice per model (ghost set, accent set) with stable `customId`s, plus a v3 branch on the existing class-color path.

## 5. Recommended PR 5 design

Per `feedback-keep-layouts-simple`: no state machine, no new manager
class. PR 5 adds **one** consumer component plus one **one** effect on
`UnifiedBIMViewer`.

### 5a. New prop on `UnifiedBIMViewer`

Extend `IsolationConfig` with two optional, additive fields. Existing
Type-page call site (`InlineViewer.tsx:308-316`) is unchanged because
both fields are optional.

```ts
// UnifiedBIMViewer.tsx :99-104, additive
export interface IsolationConfig {
  guids: string[];
  mode: 'single' | 'all';
  currentGuid?: string | null;
  zoomOnChange?: boolean;

  // PR 5 additions:
  /** 'isolate' = hide non-matching (default, today's behavior).
   *  'highlight' = ghost non-matching + accent matching, no setVisible churn. */
  renderMode?: 'isolate' | 'highlight';
  /** Optional accent override; defaults to the existing 0x88ccff. */
  accentColor?: string;
}
```

Highlight-mode branch of the isolation effect (`:2061-2117` today):

```ts
// pseudocode
if (renderMode === 'highlight' && isActive) {
  for (const lm of loadedModelsRef.current.filter(m => m.v3Model)) {
    const matching: number[] = mapGuidsToLocalIds(lm, isolation.guids);
    const all: number[] = await lm.v3Model.getItemsByVisibility(true);
    const nonMatching = all.filter(id => !matching.has(id));
    await lm.v3Model.resetHighlight();              // drop prior embed view
    await lm.v3Model.highlight(nonMatching, GHOST); // {opacity:0.15, transparent:true, customId:'embed:ghost'}
    await lm.v3Model.highlight(matching, ACCENT);   // {color: accentColor, opacity:1, customId:'embed:accent'}
  }
  v3FragmentsRef.current?.update();
}
```

Reset is symmetric: `lm.v3Model.resetHighlight()` then
`v3FragmentsRef.current?.update()`. v2-format models in a federated
group fall back to the existing `hider.set(...)` path for filter mode
and degrade highlight to "isolate" for now (logged once; the v2 path is
shrinking by attrition as models get re-converted via the backfill
command).

### 5b. New `ViewerTile` component (embed-side)

Lives in `frontend/src/components/dashboard-primitives/ViewerTile.tsx`
(new file). Pure consumer — takes no props from the page; reads
`useFilterContext()` (PR 2 hook on `DashboardFilterProvider`) and pipes
to `UnifiedBIMViewer`:

```ts
// pseudocode — embed-only
function ViewerTile({ modelIds }: { modelIds: string[] }) {
  const { ctx } = useFilterContext();           // FilterContext from embed
  const { data: resolved } = useEmbedInstances(ctx);  // /api/embed/instances/

  const isolation = useMemo<IsolationConfig | null>(() => {
    if (!resolved || resolved.instance_express_ids.length === 0) return null;
    return {
      guids: resolved.global_ids,                // resolver returns these
      mode: 'all',
      renderMode: ctx.mode === 'highlight' ? 'highlight' : 'isolate',
      zoomOnChange: false,                        // embed = host owns layout
    };
  }, [resolved, ctx.mode]);

  return (
    <ErrorBoundary fallback={<TileErrorBubble />}>
      <UnifiedBIMViewer
        modelIds={modelIds}
        isolation={isolation}
        showPropertiesPanel={false}
        showModelInfo={false}
        showControls={false}
        autoFitToView={false}
        onSelectionChange={(el) => postSelectionChanged(el)}
      />
    </ErrorBoundary>
  );
}
```

### 5c. Why this stays inside the robustness contract

- **Iframe isolation (§1)** — already given by PR 4; ViewerTile is just rendered inside the embed page.
- **Crash containment (§3)** — `<ErrorBoundary>` around the viewer turns a viewer throw into an inline tile bubble; the rest of the dashboard keeps painting.
- **Backpressure on filters (§4)** — the existing `useEmbedInstances` query already gets its key from `FilterContext`; React Query's keepPreviousData + the resolver's idempotent shape mean a 50-Hz filter mash collapses to one in-flight request. No new debouncer needed in PR 5.
- **WebGL loss (§5)** — the viewer's `webglcontextlost` listener exists on the renderer mount path (`UnifiedBIMViewer.tsx` init effect); PR 7 will harden the recovery, PR 5 just doesn't break it.
- **Explicit teardown (§6)** — `<ErrorBoundary>` + the existing v3 dispose hook (worker termination on unmount) keep this in line.
- **No host-page trust (§7)** — `ViewerTile` only reads from `useFilterContext()`, which the `DashboardFilterProvider` populates from validated postMessage envelopes.

### 5d. Filter-store separation (memory: `single-project-filter-store-bidirectional`)

`ViewerTile` reads from `useFilterContext()` (embed) and **never** from
`useProjectFilter()` (in-app). The two are intentionally
non-importing of each other; if a future tile needs both surfaces it
takes the shape, not the source. This keeps PR 5 isolated from the
Zustand store the in-app viewer uses today.

## 6. Open follow-ups for an actual omarchy spike

The desk spike resolves the **API choice** but two things still want a
real-model run before PR 5 ships:

1. **Ghost-mesh perceptual quality.** `highlight()` with `transparent:
   true, opacity: 0.15` is the recommendation, but ThatOpen's
   transparency pipeline historically had z-fighting / depth-sort
   artifacts on stacked walls. The omarchy spike should load one
   federated 3-model group and confirm that ghosted walls behind
   matching walls render cleanly (no flicker, no wrong-order draw).
   If it bites, fallback is `setVisible(non-matching, false)` plus an
   `accentColor` only (drops "context preserved" affordance, keeps
   correctness).
2. **Highlight() throughput at scale.** PR 3 truncates the resolver at
   2500 instances. We don't yet know if `model.highlight(localIds,
   def)` with `localIds.length` in the high hundreds blocks the worker
   long enough to drop a frame on the main thread. The spike should
   measure: time to apply ghost+accent on a model with ~5k items
   visible and ~1500 matching. Acceptance: < 1 frame budget (~16 ms)
   on the apply call, no frame drop on the next camera move.
3. **Multi-model ghost coordination.** `FragmentsModels.update()`
   batches per-frame; calling `highlight()` on N models in parallel
   should still settle in one update tick. The spike should confirm
   no visual tear between models on a 3-model group.

These are the only items that need a model on disk. Everything else in
the design above is settled by reading the installed `.d.ts` plus the
existing in-tree usage.

---

## Sources

- `frontend/node_modules/@thatopen/fragments/dist/index.d.ts` (v3.0.11) — authoritative API surface
- `frontend/src/components/features/viewer/UnifiedBIMViewer.tsx` — current viewer (isolation, v3 highlight, class color)
- `frontend/src/components/features/viewer/InlineViewer.tsx` — only `isolation` consumer today
- `frontend/src/lib/embed/types.ts` — `FilterContext` shape (mode, type_id, selected_*)
- `frontend/src/pages/EmbedDashboard.tsx` — PR 4 host page (no viewer mounted yet)
- `docs/worklog/2026-05-10-09-04_FragmentsModels-v3-Migration.md` — v3 migration anchor
- `docs/plans/2026-05-10-22-16_Embed-Roadmap-PR5-Plus.md` — PR 5 scope, Q1
- `docs/plans/2026-05-03-21-15_Forward-Deployed-Embed.md` — robustness contract, §Highlight vs filter, Q5
