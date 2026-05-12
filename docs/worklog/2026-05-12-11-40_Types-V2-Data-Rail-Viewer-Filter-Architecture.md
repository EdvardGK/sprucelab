# Session: Types v2 data rail + viewer-filter architecture diagnosis

## Summary

Continuation of the 10:01 Project Config session. Seven commits between
93970a2 (last worklog) and 95a965d (this one). Iterated the v2 Types
page detail panel through three shapes (sized-to-content → flex sibling
column → glass HUD overlay → reverted to flex sibling), tried wiring
real UnifiedBIMViewer for class-filter isolation (didn't work, reverted),
diagnosed two compound viewer failures, and proposed a `type_merge_candidate`
Claim pattern for handling Revit-export duplicate types. Three new
architectural memory entries; one small frontend bug fix on the table
sticky header.

Why it matters: this session surfaced two deep architectural issues
that would have stayed silent — the data-extraction (TYPE classes)
vs fragments-runtime (ENTITY classes) mismatch, and the
Revit-duplicate-types problem. Both now have written analysis +
proposed fixes captured durably.

## Changes

### `09eb757` — Detail panel sizes to content
User feedback: panel had `min-h-[clamp(320px,40vh,540px)]` that
stretched the card beyond its content, pushing the lists below the
fold further down than necessary. Replaced with `max-h-[clamp(360px,
70vh,720px)]` + content-driven height. Panel body still scrolls
internally when very long.

### `6e8f83c` — Detail panel beside viewer + filter-reactive sparklines + first viewer-state-aware version
User: "the information panel can just be on the same row as the viewer? Right side", then "Just steal equal width from the treemap and viewer". Hero went from 2-col DashboardGrid to plain CSS Grid with conditional 2-or-3 cols. Also wired filter-reactive sparklines: when class filter active, single-class progress strip in that class's treemap color. Also wired the viewer to be class-aware (`ClassFilteredState` informational card).

### `77a6ae4` — Data rail inside viewer card as sidebar
User: "Let the data panel show at all times and make it a sidebar with, not a 1/3 width. Its a supporting panel for the viewer". Created new `TypeDataRail` component (compact single-column version of detail content), mounted as flex sibling inside `TypeViewerPaneV2`. Hero viz row goes back to 2 cols.

### `73e05e5` — Glass HUD overlay + real UnifiedBIMViewer (REVERTED)
User: "Or you just build it as a HUD/sidebar in the viewer itself" + "the viewer card has to show the model objects, not 'There are x instances' as text. Actually show the frag model filtered by those instances". Tried both: data rail absolute-positioned glass HUD; UnifiedBIMViewer mounted with computed typeVisibility for class isolation. Built `buildTypeVisibility` (strip /Type$/ /Style$/ regex), `classColorMapForViewer` (TYPE-class → ENTITY-class keying).

### `9d317c0` — Revert HUD + UnifiedBIMViewer
User feedback was clear: "The panel hub is actually not looking good, so the previous version with it as a separate sidebar was much better" + "See in model isnt working either. Renders nothing but a blank canvas". Both reverted to the `77a6ae4` state. The blank-canvas symptom led to the deeper diagnosis below.

### `9f519fa` — Friendly state for untyped rows
User pasted a 404: `GET /api/types/types/{id}/instances/ → 404 (Not Found)`. Then "looks like it doesnt work when filters arent applied as well" → "for openingelement" → "ah, its untyped too".

Diagnosis: clicking `IfcOpeningElement::<untyped>` (107 instances in G55) hit the backend route which then built `/api/v1/ifc/{file_id}/types/{type_guid}/instances` against FastAPI — but `type_guid` was null for that row, so FastAPI got `/types/None/instances` and 404'd. Backend should be null-safe (return 200 with empty list + error field), but that's a backend PR.

Frontend guard: when `selectedType.type_guid` is null, render new `UntypedState` card explaining "no canonical type definition (no IfcTypeObject). Common for IfcOpeningElement and other void-style entities. Per-type 3D isolation is unavailable until a Type is attached upstream." + "Pick a different type" CTA. Data rail still renders normal type detail alongside.

### `95a965d` — Sticky table header opaque
User: "the headers are see through so you see the text through them when scrolling". Was `bg-muted/30`, now `bg-card + shadow-[0_1px_0_0_hsl(var(--border))]`.

## Technical details

**Three rounds of "detail panel placement" iterated through five
shapes**: (a) below the fold full-width row, (b) 1/3 column in viz row,
(c) flex sibling inside viewer card, (d) absolute HUD overlay, (e)
back to flex sibling. User landed firmly on (e). Lesson: don't ship
absolute-overlay glass HUDs on cards that are already small.

**The TYPE-class vs ENTITY-class mapping** (memory:
`data-extraction-vs-fragments-runtime-mismatch.md`): backend extracts
`IfcWallType`; the fragments viewer surfaces `IfcWall`. Regex-strip
of `/Type$/` and `/Style$/` is heuristic — works for common cases,
fails for `::<untyped>` and other edge cases. Plus `UnifiedBIMViewer`'s
typeVisibility apply logic uses prev/now delta tracking with a
"first-sync = no change" assumption, so even when the mapping is
right, initial filter application doesn't fire. Three documented fix
paths in the memory:
1. Add `entity_ifc_type` field on `IFCType` (best — explicit
   contract, ~1-line migration + small extractor change).
2. Add `instance_guids: string[]` on `IFCType` (precomputed
   isolation set; use UnifiedBIMViewer's IsolationConfig directly).
3. Fix the viewer's first-sync default to `true` instead of `now`.

**The Revit duplicate types pattern** (memory:
`type-merge-candidate-pattern.md`): user observed "tons of types
with the same type name, represented as separate types" — caused by
Revit/Civil3D/ArchiCAD creating distinct `IfcTypeObject.GlobalId`
values for semantically identical types (material overrides, shared
parameters, instance-bound variants). Our extractor correctly
preserves them (1:1 with the IFC file). Right surface: a new
`Claim(claim_type='type_merge_candidate')` per cluster, with
signature-tuple detection (`(ifc_type, normalized(type_name),
predefined_type, canonical_material, canonical_quantities)`) and
three confidence bands (exact 0.95+, fuzzy 0.75–0.85,
predefined_diff 0.55–0.7). Promote action merges N → 1 with audit
trail. Don't auto-merge — model owner promotes via ClaimInbox.

**Compound failure on /instances/**: separately from the
TYPE/ENTITY mismatch, the existing single-type-selected path
(InlineViewer + useTypeInstances) 404s when `IFCType.type_guid` is
null. Frontend now guards via `UntypedState`; backend null-safe
return is queued.

## Next

- **PR: backend null-safe** for `/api/types/{id}/instances/`. Return
  200 with empty list + explicit `error: 'no_type_guid'` when
  type_guid is null, rather than 404 via FastAPI. ~10 lines.
- **PR: `entity_ifc_type` field on `IFCType`**. Backend migration +
  extractor update to populate it from
  `IfcRelDefinesByType`. Unblocks reliable typeVisibility-based
  class filtering in the viewer.
- **PR: type_merge_candidate Claim kind** (3-PR sequence per memory):
  detection service → promote handler → frontend surface
  (KPI tile + table chips + ClaimInbox filter).
- **PR: EIR-column-as-configurator** in Settings page (carried from
  earlier session). Replace prose EIR placeholders with actual editor
  forms (toggles + dropdowns + multi-select).
- **PR: BEP backend restore from `archive/`** (per existing plan
  doc). Unblocks the BEP forms in Settings.
- Bottom-row KPI sparklines on Types v2 still visually subtle.

## Notes

- The user's design-discussion cadence stayed high all session. Many
  of the architecture decisions ended up captured as memory entries
  rather than code: EIR-as-configurator, EIR/BEP/Status triad, EIR
  PDF export + LLM-Claim ingestion, classification-driven-by-EIR,
  strategy-vs-forma, data-extraction-vs-fragments mismatch,
  type-merge-candidate pattern. The code is downstream of the
  memory in this phase of the project.
- `archive/backend/bep/` (1340 lines) + `archive/frontend/{bep,eir,
  pages,hooks}/` (~2803 lines) remain ready for restore per the
  earlier plan doc.
- Stale `.claude/worktrees/agent-*` cleanup still pending.
