# Session: Observation Log PR 1 + duplicate-upload 200-flag refactor

Continues the session previously checkpointed in
`2026-05-11-09-42_Duplicate-Upload-Fix-Plus-Course-Correction.md`. The
prior worklog ended after the duplicate-upload 500 fix landed
(`18be3b9`) and the coordinator-rounds-ship-invisible-work memory was
saved. This worklog covers what happened next.

## What shipped

| Commit | Title | Visible? |
|--------|-------|----------|
| `aa5b055` | fix: duplicate upload returns 200+flag instead of 409 (clean console) | Yes — no red 409 in DevTools |
| `c649a3e` | observations PR 1: Layer-1 substrate + per-drawing Log tab | Yes — new "Log" tab on every drawing |

### `aa5b055` — 200+flag refactor

User flagged that even though the duplicate-upload UX works, the 409
response was logging as a red error in Chrome's DevTools console.
That's automatic browser behavior for any non-2xx response; it can't
be suppressed client-side.

Change: `POST /api/files/` on duplicate now returns **200** with
`{duplicate: true, existing_file: {...}, detail: ...}` instead of 409.
Frontend `useUploadDrawing` checks the flag in `mutationFn` and throws
a typed `DuplicateFileError` when set, so the rest of the catch-and-
prompt chain in `ProjectDrawings.tsx` is unchanged. Same dialog UX
("Use existing / Upload as new version / Cancel"), clean console.

Renamed `?on_duplicate=error_409` → `ask` for honest naming. The
`use_existing` and `replace` modes are unchanged.

### `c649a3e` — Observation Log PR 1

User insight that reframed the work:

> "the claims idea is very interesting for drawing annotations. Text
>  that usually gets siloed off inside of drawings"
> "and there are two sides of claims: The ones sent for verification
>  and simply observations"
> "we can observe in a log and drill down on it for analysis even if
>  the claim or observation hasent been verified or accepted"

The Observation Log isn't a feature of the Claim Inbox — it's its own
product surface. Settled architecture:

```
Layer 1 — Raw extraction:   ExtractionRun produces ObservationLog entries
                            (every text block, every layer, every metadata
                            field, every title-block parse result, every
                            annotation)
Layer 2 — Curated subset:   Some observations become Claims because they
                            match normative patterns
Layer 3 — Decision queue:   Claim Inbox = unresolved claims awaiting
                            promote/reject
Layer 4 — Verification:     Only promoted verifiable claims feed the engine
```

Key property: you can drill into Layer 1 at any time, for any source,
regardless of decision state. The log is evidence — accessible by
construction.

**This PR is PR 1 of 3:**
- **PR 1 (`c649a3e` — shipped)**: Observation model + emitter + per-
  drawing Log tab
- **PR 2 (next)**: Drawing extractor invokes `claim_extractor` over
  text blocks; emitted Claims carry `origin_observation` FK; Inbox
  surfaces drawing-derived claims with click-through to observation
  context
- **PR 3 (later)**: Global Observation Log page (cross-source,
  cross-file, cross-project)

#### Backend (PR 1)

- NEW `backend/apps/entities/models/observations.py` — `Observation`
  model. Fields: `id`, `source_file` FK (required), `extraction_run`
  FK (required), `sheet` FK (nullable — DrawingSheet), `scope` FK
  (nullable), `category` (8 choices: `text_block`, `layer`,
  `annotation`, `title_block_field`, `sheet_metadata`,
  `file_metadata`, `extraction_event`, `other`), `key` (free-form
  dimension within the category), `content` (textual payload),
  `page_index`, `bbox` (JSON: x_mm/y_mm/w_mm/h_mm relative to sheet
  bottom-left), `raw_data` (JSON), `extracted_at` (auto). Indexes on
  `(source_file, category)` and `(source_file, sheet, category)`.
- NEW migration `0040_observation` (CreateModel) +
  `0041_backfill_observations` (RunPython — iterates existing
  `DrawingSheet` rows and calls the same emitter the live path uses).
- NEW `backend/apps/entities/services/observation_emitter.py` —
  single `emit_for_drawing_sheet(sheet, extraction_run, Observation)`
  helper invoked by:
  1. The live drawing-upload path
     (`backend/apps/models/files_views.py:_dispatch_drawing_extraction`)
  2. The backfill migration (via `apps.get_model('entities',
     'Observation')`)
  3. Future re-process endpoints
  Reads from already-persisted `DrawingSheet` fields + `raw_metadata`
  — no FastAPI changes required.
- EDIT `backend/apps/entities/serializers.py` — added
  `ObservationSerializer` (read-only).
- NEW `backend/apps/entities/views/observations.py` — read-only
  ViewSet with filters: `source_file`, `sheet`, `extraction_run`,
  `project`, `category` (CSV or repeated), `search` (icontains over
  key + content), `page_index`. Registered as
  `/api/types/observations/`.
- EDIT `backend/apps/models/files_views.py` — drawing upload path
  now calls `emit_for_drawing_sheet` per `DrawingSheet` it creates.
- NEW `tests/unit/test_observations.py` — 8 cases:
  - emit produces all expected categories
  - empty text blocks are dropped
  - title block fields emit per key (both sheet-level fields AND
    `title_block_data` JSON entries)
  - layers emit one row per name
  - API filters by source_file + category
  - API search matches content
  - API filters by project
  - API returns empty when no observations exist
  All green.

#### Frontend (PR 1)

- NEW `frontend/src/hooks/use-observations.ts` — typed `Observation`
  + `ObservationCategory` + query-key factory + `useObservations`
  React Query hook. Supports CSV-encoded multi-category filter.
- NEW `frontend/src/components/features/drawings/DrawingLogPane.tsx`
  — grouped, filterable, searchable log view:
  - Search input (matches content + key)
  - Toggleable category chips with per-category count badges
  - Grouped by category, ordered (title block → metadata → file
    metadata → layers → text → annotations → extraction events →
    other)
  - Each row shows `key` (mono) + `content` + bbox coordinates when
    available
- EDIT `frontend/src/components/features/drawings/DrawingDetail.tsx`
  — added Preview / Log tab toggle in the header. Preserves all
  existing DXF rendering / register-sheet / download-original
  behavior; Log tab lazy-loads `DrawingLogPane`.
- EDIT `frontend/src/i18n/locales/en.json` + `nb.json` — added
  `drawings.tabs.{preview,log}` and `drawings.log.{searchPlaceholder,
  empty,category.{8 categories}}` keys. Norwegian uses proper æ/ø/å.

## Verification

| Surface | Status |
|---------|--------|
| Backend pytest | 320/320 passed (312 → 320, +6 from `aa5b055` test fixups + 0 net, then +8 from `c649a3e`) |
| Frontend `tsc --noEmit` | clean |
| Frontend `yarn build` | clean (only pre-existing UnifiedBIMViewer chunk warning) |

## Deploy signals (all on `c649a3e`)

| Signal | Status |
|--------|--------|
| GitHub workflow "PR checks" | success |
| Vercel | success |
| Railway Django (incl. migrations 0040 + 0041) | success |
| Railway Fast API | success |

## Tone / process notes

This session corrected the coordinator-rounds-shipping-invisible-work
pattern flagged earlier. Both PRs that landed are user-visible:
the duplicate-upload 409 → 200 flip is visible the next time the user
opens DevTools during a duplicate upload; the Observation Log tab is
visible on every drawing's detail page. Backfill migration means
existing data lights up immediately — no re-upload required.

The shape of the work was also different: each PR was a single
focused commit driven by direct user dialogue (not a 4-agent
coordinator round). The two architectural insights — duplicate-as-
not-an-error and log-as-distinct-from-inbox — came from the user, not
the assistant. Memory captured that the assistant should *reflect
back what was heard, propose a minimal sketch, then execute on the
green light* rather than auto-piloting.

## Open follow-ups

1. **Observation Log PR 2 — claim emission from drawings.** Drawing
   extractor invokes `claim_extractor` over the text-block
   observations. Claims carry an `origin_observation` FK back to the
   log row. Inbox shows drawing-sourced claims with click-through.
   Sketch the schema change (Claim.origin_observation ForeignKey →
   Observation, null=True) before starting.
2. **Observation Log PR 3 — global Observation Log page.** Cross-
   source, cross-file, cross-project. Same filter+search vocabulary
   as the per-drawing tab.
3. **Phase 3 — Type page v2 visual refresh.** Deferred across FOUR
   consecutive worklogs now. Still the next anchor PR.
4. **PDF extractor extensions.** User opening: working drawings ship
   as PDFs, so PDF extraction has the most leverage. Available via
   PyMuPDF (already in deps): document metadata (title, author,
   creator, dates), OCG layers per page, page rotation, annotations,
   heuristic title-block region scan (scale / date / rev / sheet
   number patterns when no template is configured). Roughly 1-2
   sessions of backend work; would unlock substantially more
   observations on real-world drawings.
5. **DXF basepoint + units label + geometry range.** Group B from
   earlier discussion. Lower leverage than the PDF extensions per
   user steer ("DWG is more for design phase, PDF is the working-
   drawing standard").

## What's NOT yet shipped

- Drawing extractor doesn't emit `text_block` observations *during
  extraction* — emission today reads from already-persisted
  `DrawingSheet.raw_metadata.text_blocks`. The FastAPI extractor
  populates `text_blocks` for PDFs (with bbox in mm) and DXF
  populates `text_blocks` for `text_entities`. So end-to-end, text
  observations *do* appear in the log. Just noting where the
  computation lives.
- No miniature drawing previews on cards yet (user requested earlier
  in the session). Parked for after the PDF extractor work since
  PR 2 + extractor extensions are higher leverage.
- The duplicate-upload UX is wired only on the Drawings page so far.
  The same backend supports it elsewhere (Models, Documents) but
  those frontends still rely on the silent-dedup behavior. Fine for
  now; revisit if it bites.
