# Session: Coordinator Round 2 — five parallel tracks landed

## Summary

User asked me to pick up where Round 1 left off — same coordinator
pattern, parallel worktree agents, serialized cherry-picks. Plan:
`~/.claude/plans/lets-pick-up-where-indexed-toast.md`. Pre-launch
AskUserQuestion confirmed: include Track I (Vercel pin), all three CLI
scopes for Track J, delete the dead embed branch after main work.

Five agents in parallel, five cherry-picks serialized onto `main`, all
five Vercel + Railway commit-statuses green.

| Track | Scope | Commit | Status |
|-------|-------|--------|--------|
| F — PR 1.5 | `<SavedFiltersDropdown>` + `useSavedFilters` hook + Radix dropdown UI + chips-bar mount + i18n | `e2f7b0c` | shipped, all green |
| G — ifc-service | SIGKILL / OOM detection in `fragments.py`, structured logs, pure helper `_classify_subprocess_failure`, 4 tests | `6837c6b` | shipped, all green |
| H — DrillTarget | `style?: CSSProperties` prop + ModelWorkspace.tsx treemap+GeometryBar consolidation (2 hand-rolled blocks replaced) | `dba3932` | shipped, all green |
| I — infra | `frontend/vercel.json` `installCommand` → Corepack enable + activate yarn@4.12.0 | `1219b83` | shipped, **Corepack works on Vercel** — Round 1 lesson closed |
| J — CLI | `spruce {types,verify,scripts}` subcommands, Typer + Rich + httpx, all support `--json` | `991cce9` | shipped, all green |

Post-execution: `origin/feat/embed-scoped-tokens-iframe` was already
deleted (Round 1's recommended cleanup must've happened in the
intervening window). `git push origin --delete` returned "remote ref
does not exist"; `git ls-remote --heads | grep embed` empty. Nothing
to do.

## Track details

### Track F — `frontend: PR 1.5 — SavedFiltersDropdown + useSavedFilters hook`
- NEW `frontend/src/hooks/use-saved-filters.ts` — query-key factory +
  `useSavedFilters` / `useCreateSavedFilter` / `useUpdateSavedFilter` /
  `useDeleteSavedFilter` modeled on `use-claims.ts`.
- NEW `frontend/src/components/filters/SavedFiltersDropdown.tsx` — Radix
  `<DropdownMenu>` (Bookmark icon trigger), list with delete X, "Save
  current as…" via window.prompt, empty-state copy.
- EDIT `frontend/src/components/features/viewer/CanvasOverlays.tsx` —
  mount alongside `FilterChips` inside the bottom-right
  `CanvasStatusPanel` chip row; row reworked so the dropdown shows
  even when no chips are active.
- EDIT `frontend/src/i18n/locales/{en,nb}.json` — keys under
  `filters.saved.*`. Norwegian uses proper æøå.

**Agent deviations from prompt** (all sound):
1. Backend `SavedFilterViewSet` doesn't filter by `?scope=`/`?project=`
   on the server side — the visibility queryset is `_visible_savedfilter_q`
   (owner-scoped). Hook still sends the query params for forward-compat.
2. DB CheckConstraint requires `owner_project IS NULL` when
   `scope=personal`, so create call does NOT forward `project` as
   `owner_project`. Project id rides inside `payload.project_id`.
3. List serializer omits `payload` (keeps list payloads small); restore
   lazily fetches `/filters/saved/<id>/` for the full payload before
   calling `replace(...)` on `useProjectFilterActions`.
4. Cross-filter restore semantics: `replace(next: FilterContext)` — full
   replace, not merge. Matches "load a saved view" intuition.

### Track G — `ifc-service: distinguish SIGKILL/OOM from generic conversion failure`
- EDIT `backend/ifc-service/api/fragments.py` — pure helper
  `_classify_subprocess_failure(result, model_id, file_size_mb) -> Exception`
  branches on `result.returncode in (-9, 137)` → emits structured
  `fragments_oom` log + `"OOM (SIGKILL during conversion) …"` reason.
  Generic non-zero codes log `fragments_failed` with `stderr_tail` and
  return `"Conversion failed (exit N): …"` — no more empty-stderr
  swallowing.
- NEW `backend/ifc-service/tests/test_fragments_failure.py` — 4 tests
  (OOM `-9`, shell-layer `137`, generic w/ stderr, generic w/ empty
  stderr). All 4 green.

Pairs naturally with Round 1's Track C (Django-side sweep-on-read
timeout recovery, `04d61dd`). Together: ifc-service now reports OOM
loudly; Django side recovers stuck `fragments_status` rows.

### Track H — `frontend: DrillTarget style?: prop + ModelWorkspace consolidation`
- EDIT `frontend/src/components/filters/DrillTarget.tsx` — added
  `CSSProperties` import, `style?: CSSProperties` prop, threaded
  through `createElement` props alongside `className`. Fully backward-
  compatible additive change.
- EDIT `frontend/src/pages/ModelWorkspace.tsx` — replaced 2 hand-rolled
  `role="button"` blocks (Treemap rectangles + GeometryBar segments)
  with `<DrillTarget as="div" style={...}>`. Cross-filter handler
  semantics unchanged.

**Caveat**: agent dropped the `title=` HTML tooltips on the treemap
rectangles to avoid widening DrillTarget's API. Information preserved
via `ariaLabel`. GeometryBar segments folded their tooltip text into
`ariaLabel` instead (those were content-less anyway). If we want native
hover tooltips back, extend DrillTarget with `title?:` later.

### Track I — `infra: pin Vercel to Corepack Yarn 4 (matches local + CI resolver)`
- EDIT `frontend/vercel.json` — `installCommand` now `corepack enable
  && corepack prepare yarn@4.12.0 --activate && yarn install --immutable`.
  Existing `framework: vite`, `buildCommand`, `outputDirectory`,
  `ignoreCommand`, and SPA `rewrites` preserved.

**Outcome**: Vercel ran Corepack successfully on the first deploy
(`1219b83`). Confirms the Round 1 hypothesis — Corepack ships with
Node ≥16.10 on Vercel's standard build images. Round 1's portable
vite config (opentype.js alias in `ae397a9`) stays as defensive
fallback per `feedback-keep-layouts-simple.md` instinct, but the
underlying mismatch is now gone.

### Track J — `cli: spruce {types,verify,scripts} subcommands`
- NEW `cli/spruce/types.py` — `list / classify / export`.
- NEW `cli/spruce/verify.py` — `verify` command.
- NEW `cli/spruce/scripts.py` — `list / run`.
- EDIT `cli/spruce/cli.py` (NOT `main.py` — project convention is `cli.py`
  per `pyproject.toml` entry point `spruce = "spruce.cli:app"`).

Typer + Rich + httpx framework (mirrors `embed.py` exactly).
All commands support `--json`. Auth: `$SPRUCELAB_ADMIN_TOKEN` Bearer.
Base URL read from `~/.spruce/config.yaml` via `get_api_url()`.

**Agent deviations from prompt** (all sound, validated against backend):
1. `verify` endpoint is `POST /api/types/types/verify/` (not GET), per
   `backend/apps/entities/views/types.py:286`.
2. `types classify` uses `POST /api/types/type-mappings/bulk-update/`
   with single-element `mappings` array (backend uses
   `update_or_create` keyed on `ifc_type_id`). No extra GET round-trip
   needed.
3. `types export --format excel|reduzer` streams binary to
   `sys.stdout.buffer`, status text on stderr (so `> out.xlsx`
   redirection works). `--json` mode emits metadata only, not base64.

CLI install: `pip install -e ./cli` succeeded, `spruce --help` shows
the three new groups. Live API smoke is a coordinator follow-up
(no Django dev server running this session).

## Verification (end-to-end)

| Surface | Status |
|---------|--------|
| Backend unit tests (ifc-service Track G subset) | 4/4 passed |
| Frontend `tsc --noEmit` after F+H+I cherry-picks | clean |
| `yarn build` after F+H+I cherry-picks | clean (pre-existing UnifiedBIMViewer chunk warning only) |
| Railway Django healthcheck on `e2f7b0c` | success |
| Railway FastAPI healthcheck on `e2f7b0c` | success |
| Vercel commit-status on `e2f7b0c` | success (Corepack-Yarn-4 install path) |
| `spruce --help` after install | shows types/verify/scripts |

Every push verified per `feedback-verify-deploys-after-push.md` before
the next push: G → H → J → I → F. Five separate commit-status polls,
all green within 1–3 polls each.

## Coordinator approach (what worked, what changed)

- **Same worktree-isolation pattern as Round 1** — five agents, five
  `isolation: "worktree"` calls in a single message. Zero edit
  collision. Cherry-picks applied cleanly with no conflicts; the only
  shared file across tracks (none, actually — boundaries held).
- **AskUserQuestion before launch** locked the three open priorities
  (Track I include, Track J scope, embed-branch deletion). Per
  `feedback-external-system-writes-need-explicit-auth.md` the branch
  delete needed explicit user say-so even with auto-mode active —
  AskUserQuestion got it pre-flight.
- **Order change vs plan**: planned G → J → I → H → F, actually ran
  G → H → J → I → F because H reported before J and I waited for J.
  Reordering was safe because none of the four remaining files
  conflicted with each other. Final state identical.
- **Track I (Vercel pin) was the only risky push** — pushed alone with
  no concurrent code change to isolate blast radius. Corepack worked
  on first try.

## Open follow-ups for next round

1. **Live API smoke for the CLI** — `spruce types list --model <id> --json`,
   `spruce verify --model <id>`, `spruce scripts list` against the dev
   API. CLI ships with `--help` working; live verification deferred.
2. **DrillTarget `title?:` prop** if we want native hover tooltips
   back on treemap rectangles. Currently lives in `ariaLabel` only.
3. **Phase 3 — Type page v2** is the next big phase from the frontend
   refresh roadmap. This is the visual-refresh anchor PR; deserves a
   dedicated session, NOT a parallel track.
4. **Viewer perf** — `UnifiedBIMViewer` is still 4.7 MB
   (896 KB gzipped). Parked per `feedback-viewer-perf-rabbithole.md`;
   surface when explicitly asked.
5. **Embed PR 5/10 onward** — embed surface PRs 1–4 shipped. No tickets
   for 5+ in `docs/todos/current.md`; the embed roadmap lives in
   `~/.claude/plans/` somewhere — needs surfacing before next round.

## Open for user

- **`docs/todos/current.md` is stale** — last updated 2026-04-24, marks
  Webhook System and CLI Expansion as "Pending" but both shipped weeks
  ago. Worth a 5-minute cleanup pass.

## Notes

- Trunk-based: 5 commits direct to `main` (5 cherry-picks). No PRs.
- Plan file (consumed by ExitPlanMode this session):
  `~/.claude/plans/lets-pick-up-where-indexed-toast.md`.
- Per `feedback-frontend-no-unit-tests.md`: frontend verification is
  `tsc --noEmit` + `yarn build` + Vercel commit-status only. No vitest.
- Per `feedback-verify-deploys-after-push.md`: each push hit a Railway
  200 + Vercel commit-status check before the next push.
