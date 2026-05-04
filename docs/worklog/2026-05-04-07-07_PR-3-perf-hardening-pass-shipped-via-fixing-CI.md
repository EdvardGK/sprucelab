# Session: PR #3 perf-hardening-pass shipped (via first fixing the CI workflow)

## Summary

User asked "can you start any of the things we spoke about without edkjo
replies?" — A.x track and Framework PR 1 were both gated on inbound
replies. The unblocked highest-leverage move was the May-1 perf-pass tree
that the May-3 session left unstaged thinking it was "someone else's work
in flight" — but per the user-machines memory, omarchy and edkjo are the
same operator, so it was just our own pending work. Shipped it as PR #3
and unblocked the CI workflow itself in the process.

The big throughline: opening the first PR through the new `pr.yml`
workflow was supposed to validate it. Instead it failed both checks and
forced a real fix to the CI infrastructure that landed in `0a253dc`. So
the perf PR ended up doing double duty — shipping eight-track perf wins
AND unblocking every future PR's CI run.

## Changes

### Shipped on `feat/perf-hardening-pass` → PR #3

**Commit 1 — `infra+backend+frontend: perf hardening pass A/B/C1/D`**

The May-1 work, finally landed. 18 files (13 modified, 5 new — including
the May-1 worklog itself):

- Track A frontend: 23 routes converted to `React.lazy` + `Suspense`,
  login bundle 1.6 MB → ~200 KB gzipped (8×). `InlineViewer` memoized.
  10 ungated `console.log` calls now `import.meta.env.DEV`-gated.
  Instance-preview hooks get `gcTime: Infinity` + `retry: false` to stop
  404 retry storms.
- Track B backend N+1: `_get_top_types` 3N → 1, `_get_top_materials`
  3N → 2, `floors` 1+3N → ~3 (Postgres `DISTINCT ON` for bulk latest-claim
  fetch; `check_storey_deviation` accepts a pre-fetched claim).
- Track C1: composite index `claims_sf_type_extracted_idx` on
  `(source_file_id, claim_type, -extracted_at)`. Migration 0039.
- Track D: `QueryCountProfilerMiddleware` (apps/core). `?profile=1` on
  any DRF URL adds `X-DB-Query-Count`, `X-DB-Query-Time-Ms`,
  `X-Total-Time-Ms`, `Server-Timing: db;dur=…`.
- Tests: `tests/unit/test_query_counts.py` — parity-style regression
  asserts (N=1 vs N=10 query count must match). 196 unit tests green.
- `docs/knowledge/perf-budgets.md` — living budget doc.

**Commit 2 — `infra: fix first-run CI workflow bugs`**

First end-to-end run of `pr.yml` failed both checks. Root causes:

- *Backend*: Every test ERRORed on `TimeoutError: FastAPI not ready`.
  The conftest's autouse `_wire_service_urls` fixture pulls in
  `fastapi_service`, which boots the ifc-service subprocess for every
  test session. CI was installing only `backend/requirements.txt`, so
  FastAPI's deps weren't present and the subprocess never came up.
  Fix: add `pip install -r backend/ifc-service/requirements.txt`.
- *Frontend*: `yarn install --frozen-lockfile` exited with "Your
  lockfile needs to be updated." Two underlying causes:
    1. Repo is on Yarn Berry (lockfile metadata version 8) but CI was
       using bundled Yarn 1.22 — can't read Berry lockfiles.
    2. Orphan `frontend/package-lock.json` from an earlier npm install
       was tracked alongside `yarn.lock`.
  Fixes: `packageManager: "yarn@4.12.0"` in package.json, `corepack
  enable` step in workflow, `--frozen-lockfile` → `--immutable`, removed
  `package-lock.json` from version control, synced 55 lines into
  `yarn.lock` that had drifted.

After commit 2 push: backend 1m55s pass, frontend 43s pass.

### Files NOT touched (intentional)

- `docs/worklog/2026-05-03-22-40_*.md` — left untracked. It documents
  already-shipped `0a253dc` and belongs in its own tiny doc PR, not
  smuggled into a perf PR.

## Technical Details

### Why the May-3 session got the hand-off wrong

The May-3 worklog read the dirty F-3 perf-pass tree as "someone else's
work in flight" and explicitly didn't commit. But the user-machines
memory says omarchy and edkjo are the same operator, so the "someone
else" framing was wrong — it was just our own pending work from the
May-1 session waiting for a commit. This session corrected the read and
shipped.

Lesson worth keeping (not memory-worthy on its own — already covered by
the user-machines memory): when the prior worklog defers to "the owner
of that work," check whether that owner is actually a different person
or just a different session of the same operator. The latter is the
default in this repo.

### Why the conftest design is mildly broken in CI

`_wire_service_urls` is autouse=True and depends on `fastapi_service`.
That means every single unit test triggers FastAPI subprocess startup
even when the test doesn't touch HTTP. Locally this is fine (FastAPI is
installed in the `sprucelab` conda env, ~2s session boot, amortized).
In CI it's expensive overhead AND a hard dependency on `ifc-service`
deps. The right long-term fix is to make `fastapi_service` lazy — only
boot when a test explicitly requests it (e.g. a `requires_fastapi`
marker, or move the fixture onto e2e tests only). Quick fix here was to
just install the deps. Tracked as a follow-up note, not blocking.

### Yarn 4 + Corepack on GitHub Actions

The `actions/setup-node@v4` action ships only Yarn 1. For Yarn 4 you
either: (a) explicitly install via `npm i -g yarn@4`, or (b) `corepack
enable` and rely on `packageManager` in package.json. Path (b) is the
sanctioned upstream way and what this commit uses. Removed the
`cache: yarn` setup-node config — Corepack manages its own
`.yarn/cache` and the setup-node cache key wouldn't match Berry's
layout anyway.

### Lockfile drift

The 55-line yarn.lock sync wasn't anything dramatic — looked like a
prior install that resolved a few transitive deps and never got
committed. Running `yarn install` (without `--immutable`) regenerated
the additions; nothing controversial.

## Next

1. **User decision: merge PR #3 or hold for review.** Merging triggers
   Vercel + Railway deploy AND migration `entities/0039` on prod DB
   (`python manage.py migrate entities` post-deploy). Held the merge —
   want explicit go.
2. **Browser-verify Track A** + populate `perf-budgets.md` baselines —
   can run locally without merging. `just dev`, open Login → Network
   panel confirms ~200 KB gz; navigate type browser confirming no
   `[InlineViewer]` log + no rAF violations; hit endpoints with
   `?profile=1`, replace placeholder numbers with measured values, land
   as a follow-up doc commit on this branch (or a separate doc PR).
3. **May 3 worklog → its own tiny doc PR** once #3 merges. It's been
   sitting untracked since 22:40 yesterday; documents `0a253dc`.
4. **Skiplum ETL importer (`seed_skiplum_projects`)** if user wants a
   parallel track. Decision 5 already locked. Caveat: source data
   (`dalux-ifc-copy.json`) not in this repo or workspace; would be
   scaffolding-only against an inferred schema until the file lands.
5. **Conftest lazy-FastAPI refactor** — make `_wire_service_urls`
   conditional so unit tests don't trigger subprocess startup. Quality
   improvement, not blocker. Open as a follow-up PR.

Still gated on edkjo/user replies (not changed by this session):
- A.x track (PR #2 v0.1 lock)
- Framework PR 1 (Qs 1–17 answers + user sign-off + edkjo pass)

## Notes

- PR #3 URL: https://github.com/EdvardGK/sprucelab/pull/3
- Two CI checks now genuinely validated end-to-end on real hardware. Any
  future PR that breaks them is breaking real coverage, not the workflow
  itself.
- The `frontend/.yarn/install-state.gz` file shows up as modified after
  any local `yarn install` — it's tracked in the repo but probably
  shouldn't be (it's a build artifact). Out of scope for this PR; flag
  for a future cleanup that adds it to `.gitignore` and `git rm`s the
  tracked copy.
- Branch protection still intentionally NOT configured per CONTRIBUTING
  ("light-touch self-review, not gating"). PR #3's green checks are
  advisory; merging is on the user's call.
- Did not write a memory for this session's specific outcome — the
  CI fix is one-time, the perf-pass content is already covered by the
  perf-budgets doc, and the user-machines memory already covers the
  edkjo/omarchy framing.
