# Session wrap: duplicate-upload fix + course-correction on coordinator rounds

## What shipped

**`18be3b9` — fix: duplicate drawing upload no longer 500s + adds notify-and-ask dialog**

Root cause: `_dispatch_drawing_extraction` re-ran on the deduped `SourceFile`
returned by `get_or_create_source_file`, hitting `UniqueConstraint(source_file,
page_index)` on `DrawingSheet` → IntegrityError → 500. The bug was latent —
revealed only when a user re-uploaded a drawing they had already uploaded.

Fix: `POST /api/files/` now hashes first and short-circuits BEFORE storage
write and extraction dispatch. New `?on_duplicate=` query param:

- `error_409` (default): 409 + `existing_file` payload; frontend surfaces a
  dialog.
- `use_existing`: 200 with existing payload — idempotent re-upload for
  agents/CLI.
- `replace`: bump version even when checksum matches.

Frontend: `ProjectDrawings.tsx` catches 409 and shows a `<Dialog>` with
"Use existing" / "Upload as new version" / "Cancel" actions. i18n keys
under `drawings.upload.duplicate.*` (en + nb, proper æ/ø/å).

+6 tests (306 → 312). All deploy signals green on `18be3b9`.

## Course-correction logged

User after Round 6: "I really dont understand whats being changed from
time to time. I see no difference in the app."

Today shipped six coordinator rounds in a row (Rounds 1–6: ~16 PRs of
webhooks, dry_run plumbing, capabilities, embed surface, CLI, viewer
scaffold, webhook UI under a non-default route, DashboardFilterProvider).
None of it touches the screens the user actually uses day-to-day.

Memory written: `feedback-coordinator-rounds-ship-invisible-work.md`.
Indexed in MEMORY.md.

The rule: coordinator rounds optimize for *throughput of small,
non-overlapping tracks*. Most non-overlapping work is plumbing.
Visible UI work inherently touches a few hot files and doesn't
parallelize well. Result: four-up rounds produce four plumbing PRs
and zero user-visible change. This drifts away from
`feedback-frontend-first-until-app-feels-real` even when individual
tracks are framed as "frontend-leaning."

Default going forward: **one focused, visible PR per session** until
the app feels real. Coordinator rounds get reserved for periods with
a genuine disjoint-task backlog the user has asked for.

## What's next

Phase 3 — Type page v2 visual refresh.

This has been deferred across three consecutive worklogs ("not a
parallel coordinator track"). At some point that signal is "the
coordinator-round shape isn't fitting" — not "we need another round
before tackling Phase 3." Next session, scope and start Phase 3 as
the focused work.

## Verification (post-push, all on `18be3b9`)

| Signal | Status |
|--------|--------|
| GitHub workflow "PR checks" | success |
| Commit-status `Vercel` | success |
| Commit-status `resilient-hope - Django` | success |
| Commit-status `resilient-hope - Fast API` | success |

## Files touched

- `backend/apps/models/files_views.py` — `compute_checksum()` helper,
  `force_new` kwarg on `get_or_create_source_file`, `create()` rewrite
  with hash-first + `?on_duplicate=` handling
- `frontend/src/hooks/use-drawings.ts` — `onDuplicate` arg, 409
  catch + typed `DuplicateFileError` + `isDuplicateFileError` guard
- `frontend/src/pages/ProjectDrawings.tsx` — duplicate-prompt state,
  catch-and-prompt path, `<Dialog>` JSX
- `frontend/src/i18n/locales/en.json` + `nb.json` — `drawings.upload.duplicate.*`
- `tests/unit/test_files_upload_duplicate.py` — 6 cases (first upload
  201, duplicate 409, use_existing 200, replace bumps version,
  invalid value 400, different bytes same name bumps version)
