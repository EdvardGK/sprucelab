# Session: Phase 5 close-out, repo hygiene push, auto-commit overhaul

## Summary

Three threads, all shipped. (1) Closed out Phase 5 by writing the three
deferred drawing-extractor tests now that `ezdxf` + `pymupdf` are installed;
unit suite went 35→45, e2e went 4→5, both fully green. (2) Cleaned up the
77-entry working tree that had been backlogged across many sessions and
pushed `dev` to origin (325 commits ahead → in sync). (3) Killed the
per-edit auto-commit storm — the throttle constant in `auto-sync.py`
existed but was never wired in, so every Edit/Write tool call produced a
commit. Replaced the intra-session cadence entirely with one
`[session-start]` safety snapshot at SessionStart; Stop-time squash-and-push
unchanged. New behavioral rule landed in memory: no hard deletes, archive
to a dated directory and let a separate 90-day cleanup job prune.

## Changes

### Phase 5 close-out (sprucelab repo)

- **`tests/fixtures/drawing_factory.py`** (new) — five module-level builders
  matching the `ifc_factory.py` pattern: `build_dxf_with_text_blocks`,
  `build_dxf_with_inch_units`, `build_pdf_a3_drawing`, `build_pdf_a4_document`,
  `build_pdf_multipage_mixed`. Each takes `out: Path`, lazy-imports its
  dep, returns the path.
- **`tests/unit/test_drawing_extractor.py`** (new) — 10 tests. DXF: extents
  in mm + inch-unit conversion + text/layer enumeration. PDF: A3 drawing
  classification + A4 document classification + multipage per-page
  classification. Error paths: missing file, unsupported format. Pure-
  function tests for `_looks_like_document_page` thresholds + 
  `parse_title_block` centroid/region resolution. No Django DB; mirrors
  `test_grid_extraction.py` style.
- **`tests/conftest.py`** — added `sample_pdf_path` session-scoped
  fixture next to `sample_ifc_path` / `sample_ifc_with_grid_path`.
- **`tests/e2e/test_upload_pipeline.py`** — added
  `test_pdf_upload_creates_drawing_sheets`: POST 2-page PDF to
  `/api/files/`, wait for ExtractionRun completion, assert
  `quality_report` counts (1 drawing + 1 document), GET
  `/api/types/drawings/?source_file=...` returns both rows in
  page-index order, detail-fetch each to verify
  `raw_metadata.is_drawing` == `[True, False]`.
- **conda env**: `ezdxf 1.4.3` + `pymupdf 1.27.2.3` installed into
  `sprucelab` env via `tools/python -m pip install`. Already declared
  in `backend/ifc-service/requirements.txt` from the previous session.

### Repo hygiene (sprucelab)

- **`.gitignore`** — added `.claude/scheduled_tasks.lock` and
  `sunshine-install-log.txt` patterns so they stop showing in `git status`.
- **Single cleanup commit** (`e993e8f chore: archive deprecated apps +
  finalize Phase 2 migration`) — git renamed 50+ deletions into the
  pre-existing `archive/backend/` and `archive/frontend/` directories
  (BEP, contacts, graph, MMI, EIR, RFI/Issues pages, ProcessingStatusBadge).
  Plus: Phase 2 migration `0018_create_source_file_and_extraction_run.py`
  finally landed; orphan `automation/0001_initial.py` migration noted in
  memory finally landed; admin dashboard URLs/views; data-foundation plan
  doc; two trailing worklogs; three frontend `entities → types` URL fixes
  matching the Django app rename; tools/api + tools/python made executable;
  PLAN.md moved to `docs/archive/PLAN-2025-11.md`.
- **Pushed** `dev` to `origin/dev`. Working tree now clean, branch in sync.

### Auto-commit cadence overhaul (`~/workspace/spruceforge/core/hooks/`)

- **`auto-sync.py`** — `do_git_sync` call removed from `main()`. The
  helper functions stay in the file for manual invocation. Earlier in
  the session I'd dropped the throttle constant from 4h to 1h and
  wired up the dead `throttle_ok`/`mark_synced` helpers; once the user
  said "session-start only," that wiring went away too. ACC upload,
  SharePoint mirror, and Notion-activity update paths all untouched.
- **`pre-edit-safety.py`** — `main()` short-circuited to always return
  `{"decision": "approve"}` without commit work. Helper functions
  (`create_safety_commit`, `file_has_changes`, etc.) preserved for
  potential manual use.
- **`session-start.sh`** — added a pre-session safety-snapshot block:
  if cwd is in a git repo, branch isn't protected (main/master/
  production/release), no rebase/merge in flight, and the working tree
  is dirty, run `git add -A && git commit -m "[session-start] safety
  snapshot @ <ts>"`. Failures swallow with `|| true` so session start
  never blocks.
- **No-rm rule applied immediately**: replaced the existing
  `rm -f ~/.claude/todo-notion-map.json` in session-start.sh with a
  move into `~/.claude/archive/todo-notion-map/<ts>.json`.

### Memory rules added

- **`feedback-deletes-and-archive.md`** — never `rm`/hard-delete; move to
  dated archive dir; cleanup past 90 days is a separate scheduled job.
  Applies to user files AND internal Claude state files.
- **`feedback-auto-commit-cadence.md`** — intra-session auto-commits stay
  silenced. Only `[session-start]` (SessionStart) and Stop-time
  squash-and-push are allowed to write commits automatically.
- **`MEMORY.md`** — both new entries indexed.
- **`data-foundation-status.md`** — Phase 5 marked shipped, deferred-tests
  callout removed, replaced with the closing-session details (45 unit + 5
  e2e green, fixture-builder names, the DXF `extmin/extmax` and pymupdf
  density gotchas).
- **`dev-environment.md`** — noted the sprucelab-vs-base conda divergence
  and the `tools/python -m pip install` recipe; added pymupdf and ezdxf
  to the listed deps.

## Technical Details

### DXF fixture gotcha — extent corners must be truthy

ezdxf's `update_extents()` reads `msp.dxf.extmin/extmax` and only writes
them to the header when both are truthy. Vec3(0,0,0) reads as falsy, so
extents authored at the origin disappear on save. Fix: offset the corners
by 1mm (e.g. `(1,1)` to `(421,298)` for "A3"). The extractor computes
`abs(ext_max - ext_min)` so the resulting width/height is unchanged.

Layers must also be added to `doc.layers` explicitly — `msp.add_text(...,
dxfattribs={'layer': 'TITLE'})` references a layer name but doesn't
create the layer entry, so the extractor's `doc.layers` enumeration
won't see it.

### PDF density fixture — insert_textbox not insert_text

`page.insert_text()` writes a single non-wrapping text run, which can't
plausibly clear the 0.05 chars/mm² document cutoff on a normal page.
`page.insert_textbox(rect, text, ...)` word-wraps and fills, and 100×
copies of a lorem-ipsum sentence comfortably reaches ~0.09 chars/mm².
The fixture builds 100 copies; the test asserts `is_drawing=False`,
not a specific density, so platform variance in pymupdf's text shaping
won't flake.

### Why two passes on the auto-sync hook

The first pass changed the throttle to 1h and wired up the existing
`throttle_ok`/`mark_synced` helpers — fixing the bug where the throttle
constant looked active in source but had no effect. Then the user said
"actually fire at session-start instead of hourly," which made the
throttle wiring irrelevant. Second pass: removed the `do_git_sync` call
from `main()` entirely, letting the throttle code stay as inert helpers.
The session-start.sh hook took over the safety-net role.

### Why the snapshot uses `git add -A`

A safety net that misses untracked files isn't a safety net — if auto
mode creates a temp file and then deletes it during the session, an
`add -u` snapshot would never have seen it. `git add -A` trusts
`.gitignore` to exclude what shouldn't be tracked. The session is
already committing on a feature branch (the `case` statement skips
main/master/production/release), so the worst case is a noisy commit
on the dev branch — easily reverted.

### Cleanup commit shape

Most of the 77-entry working tree was actually rename pairs once
git's similarity detection kicked in: 50+ deletes paired with their
new homes under `archive/`. The remaining handful were genuine deletes
(`backend/apps/entities/models.py` and `views.py` were split into
directory packages; `ProcessingStatusBadge.tsx` superseded by the
extraction-status badge), genuine adds (Phase 2 migration, admin
dashboard, data-foundation plan, etc.), and small modifications.
Single chore commit captures the entire backlog.

## Next

- **Phase 6 — Document extraction** is the natural next track. Plan
  doc: `docs/plans/2026-04-26-data-foundation-plan.md` line 208.
  The drawing-vs-document classifier built in Phase 5 already exists;
  the new work is `services/document_extractor.py` (pdfplumber/python-docx/
  openpyxl/python-pptx) + `apps/entities/models/documents.py` for
  `DocumentContent`, plus a search endpoint.
- **Frontend Phase 3+4 follow-up** still outstanding: scope picker
  (ProjectScope CRUD UI), scope tree, and grid overlay in the viewer
  for `discovered_grid`. None of the data layer is missing — it's UI
  surface work.
- **Verify the new SessionStart hook in practice** — next session in
  any sprucelab dev work should produce exactly one `[session-start]`
  commit (or none, if the tree is clean), and zero `[auto]`/
  `[safety-snapshot]` commits during the session.

## Notes

- `dev` is now in sync with `origin/dev`. `main` hasn't been touched
  on the remote in a long time — ready when you want to open a PR.
- The `do_git_sync` and `create_safety_commit` helpers stayed in their
  files even though nothing calls them. Easier to reactivate than to
  rewrite, and they're cheap idle code.
- The auto-sync hook still does ACC upload, SharePoint mirror, and
  Notion activity update on every Edit/Write — only the git portion is
  off. Edits to project files in projects with `gullbrand_urn` will
  still mirror to ACC + SharePoint.
- Memory now spans 5 entries (was 3). MEMORY.md index stays well under
  the 200-line truncation cap.
