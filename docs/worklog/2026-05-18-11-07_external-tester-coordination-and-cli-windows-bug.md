# External-tester coordination + spruce CLI Windows bug

**Date**: 2026-05-18 11:07 UTC
**Local agent**: Claude Code (Opus 4.7 1M context), edkjo / Windows 11
**Branch**: design/dashboards-wireframes (worktree-stable; commit lands via PR to main per the precedent of #11)
**Live deploy under test**: `https://www.sprucelab.io` / Railway API / fast-api fragment server
**Sprucelab commit live at session start**: `f99bb49` (bundle `index-BSA8bz4x.js`, Last-Modified Thu 14 May 11:50 GMT)

---

## What this session was

The user (edkjo) framed me as the "official sprucelab tester" and ran a separate Claude web session that drove the auth'd app surface against the live deploy. My role this session was **coordinator, not driver** — receiving the web tester's reports, capturing them as worklog + GitHub issues with cross-links and synthesized action checklists, and doing what verification I could from the sandbox (deploy freshness, Playwright public smoke, typecheck on latest main).

Five tester rounds came in over four days (2026-05-14 → 2026-05-18). All landed as GitHub issues with consistent provenance, structure, and cross-linking. One genuine bug surfaced from the local agent itself (Windows yarn-on-PATH in the spruce CLI) — recorded below.

## What got verified locally (not just relayed)

**Deploy is fresh**. Pulled `origin/main` from `0a253dc..f99bb49`. `curl -I https://sprucelab.io/` returned `Last-Modified: Thu, 14 May 2026 11:50:31 GMT` — ahead of commit `f99bb49`'s 11:40 UTC author time, so the production bundle includes the LOD-aware viewer fixes and the type_guid Layer-2 GUID bridge. Bundle is `assets/index-BSA8bz4x.js` (707 KB, single chunk) + `assets/index-B9c91v3w.css`. Title still reads "BIM Coordinator Platform" — out of step with the "Sprucelab - Data-First BIM Intelligence Platform" positioning in `CLAUDE.md`. Not blocking, worth a rename pass.

**Public Playwright smoke passes against live**. Bootstrapped frontend with `corepack yarn install` (lockfile was out of date for the design branch so I had to drop `--immutable`; ran clean on main with `--immutable` after switching), installed Chromium, ran `tests/e2e/smoke.spec.ts` with `PLAYWRIGHT_BASE_URL=https://www.sprucelab.io --project=public`:

- `login page renders without console errors` — 3.8s, heading + sign-in button visible, zero `pageerror` / `console.error`
- `unauthenticated navigation to a gated page redirects to login` — 602ms, `/projects` → `/login` works

`playwright.config.ts` has an unconditional `webServer` block that tries to spawn `yarn dev` even when `PLAYWRIGHT_BASE_URL` targets a remote. I patched it locally with a conditional (`process.env.PLAYWRIGHT_BASE_URL?.startsWith('http') && !…?.includes('localhost') ? {} : { webServer }`) — reverted before exit. Worth landing as a real change if anyone else needs to point Playwright at a deployed env.

**Frontend typechecks clean on latest main**. `yarn tsc --noEmit` exits 0 after a fresh `yarn install --immutable` on main. Initial run from the design branch failed with 13 errors — all `Cannot find module` for deps added on main but not present in the design-branch lockfile (`react-pdf`, `dxf-viewer`, `@dnd-kit/{core,sortable,utilities}`, `proj4`, `leaflet`). Reinstall against main's yarn.lock resolved everything.

## CLI bug found locally — `dev test *` broken on Windows

Installing the `spruce` CLI (`pip install -e ./cli`) and running through every subcommand, `dev test tsc` and `dev test smoke` both fail:

```
$ python -m spruce dev test tsc
FileNotFoundError: [WinError 2] The system cannot find the file specified
```

Root cause: `cli/spruce/dev.py:82-87` and `cli/spruce/dev.py:325` shell out to literal `"yarn"`:

```python
def _run_yarn(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(["yarn", *args], cwd=_frontend_dir())
```

On this Windows machine yarn is corepack-managed and **not on PATH** (`Get-Command yarn` returns nothing). Confirmed: same `FileNotFoundError` on `dev test smoke`. Same shape will hit `dev test e2e`.

`dev seed materials` is safe (uses `_run_manage` → `sys.executable manage.py …`). `dev db {stats,projects,materials}` use `_django_shell` (also `sys.executable`-based) so they're unaffected too. The bug is contained to the `_run_yarn` callers.

**Fix** (small): replace the hardcoded `"yarn"` with `shutil.which("yarn") or ["corepack", "yarn"]` (split + flatten into the args list). Friendly error path: catch `FileNotFoundError` in `_run_yarn` and print *"yarn not on PATH; enable corepack or install yarn"*.

This intersects with the Playwright `webServer` issue above — both are "tooling assumes yarn is on PATH" failures.

Not filed as its own issue yet (tester work has been the priority). Worth opening before another agent hits the same wall.

## Issue triage shape across the five tester rounds

| Issue | Title (short) | Headline finding |
|---|---|---|
| #11 (PR) | Worklog of first tester pass | (worklog only — landing the verbatim report) |
| #12 | P0 statistics + empty workbench + sidebar search | `/api/projects/{id}/statistics/` returns `element_count: 0` while per-model rollup sums to 88,791. Workbench `verification` + `ifc-editing` routes render empty `<main>`. Search is a `<button>` wired to nothing. |
| #13 | Perf: dashboard-metrics + 7 MB type list + worker cliff | `dashboard-metrics` 3.6 s p50 / 7.5 s p95 under 8-way parallel (worker pool ≈ 6). `/api/types/types/?limit=50` returns ~7 MB (≈140 KB/row — serializer inlining full detail). |
| #14 | Viewer: lodSize cascade + camera + filter counts | One `lodSize` undefined-read takes out Section Plane + Measure + Picker. Section Plane → unrecoverable black canvas. Default camera non-deterministic. Filter counts don't follow visibility toggles. + ThatOpen practice notes (Highlighter / Clipper / OrthoPerspectiveCamera / IfcStreamer / BCF). |
| #15 | Upload: 1 GB lie + silent v2 replacement + "Ready" overload | Dialog promises 1 GB; files fail at ~30 MB with raw `413` (Railway body limit). v2 upload silently hides v1 with no version picker — kills the History/diff feature's input. "Ready" means geometry-ready, analysis is a second manual click. |
| #17 | Material Library: unit-agnostic aggregation + N+1 + stale panel | TOTAL QUANTITY sums `m + m² + m³` and labels it `m`. Ascending sort interleaves `1.00 m, 1.15 m³, 4.00 m, 5.29 m³`. Material Library mount fires 11 parallel `?page_size=10000` fetches. |

## Cross-issue patterns worth noting

**Thumbnails reported in three independent rounds** (#12, #15, #17). Same surface ("No geometry" placeholders despite models being `ready` and rendering fine in the viewer). Same root cause: the fragmentation worker isn't writing `ifc-files/models/{id}/thumbnail.png` to Supabase Storage. Triage signal: not flaky, just unimplemented. Should move up in priority regardless of P-tier.

**Default-camera bug confirmed systemic** by #15's mini-viewer observation, after first being reported in the full viewer in #14. Bounding-box-from-orphan-geometry hypothesis (orphans far outside the centroid blow the fit). Same fix applies to both.

**Serializer-shape problem appears twice** — once as response size (#13: 7 MB/50 rows on `/api/types/types/`) and once as fan-out shape (#17: 11 parallel `?page_size=10000&expand=mapping` per model). One serializer-split pass (slim list-shape vs full detail-shape, per `CLAUDE.md`'s own *"Geometry NOT returned in list endpoints"* rule) would land both. The `XxxListSerializer` pattern is already documented in the repo's own coding patterns.

**Two-axis "Ready" / "Pending" confusion** appears in both #12 and #15 — `Ready` means different things at different layers (extraction vs analysis), and "pending" is being used both for *"job running"* and *"data not in source"*. State-machine clarification would close several adjacent UX issues at once.

## Process notes (for future Claude sessions)

**Direct push to `main` is blocked by the harness classifier** even when project convention is trunk-based (`CLAUDE.md`: *"Trunk-based: all merges direct to `main`"*). Path that works: feature branch + `gh pr create`. PR #11 set the precedent; subsequent sessions should default to this. `git update-ref refs/heads/main refs/remotes/origin/main` to rewind local main after the PR is also classifier-blocked — leave local main one ahead and let it reconcile when the PR merges, or run the rewind from your own terminal.

**`gh` CLI ambiguity on this machine**: a Python `gh` script in `~/AppData/Local/Programs/Python/Python312/Scripts/` shadows GitHub CLI. Use absolute path `"C:/Program Files/GitHub CLI/gh.exe"`.

**Issue bodies with backticks + apostrophes break bash heredocs**. Route through `Write` → temp file → `gh issue create --body-file`. Saved 1 retry per issue after the first failure.

**Provenance header pattern that works**: "External-tester sweep (auth'd Claude web session) — <topic> round, continuation of #N1 / #N2…". Combined with a footer block of cross-links and a "Filed by Claude Code on behalf of the external tester session." attribution. Reuse it.

**Action-checklist synthesis**: every issue ends with a P0/P1/P2 (or correctness/performance/UX/data quality) checkbox block lifted from the report's prose. This is what makes the issues actionable rather than narrative — preserve it.

## What I deliberately did NOT do

- Did not run any `dev seed` or `dev reprocess` commands (would mutate state on the real DB — even with creds I'd have wanted explicit go-ahead per project).
- Did not attempt `auth register` against the production API (would create a real agent record).
- Did not switch off `design/dashboards-wireframes` for general session work — three untracked design files (welcome-page.pptx, other-sites/, welcome-layout-options.html) remain in place exactly as found.
- Did not file the CLI Windows bug as an issue yet (tester work was the priority). Worth filing before another agent hits it.

## Suggested next session

1. **File the spruce CLI Windows yarn-on-PATH bug** as its own GitHub issue + cherry-pick a one-line fix to `cli/spruce/dev.py` (`shutil.which("yarn") or ["corepack", "yarn"]` with graceful fallback message).
2. **Land the Playwright `webServer` conditional** as a real change so future agents can point Playwright at a deployed URL without spawning `yarn dev`.
3. **Triage the five issues** by P-tier and bundle the cross-cutting fixes: serializer-split closes #13 *and* the N+1 piece of #17; thumbnail worker closes the placeholder on #12, #15, #17; LOD-fix closes the Section Plane + Measure + Picker triple in #14.

---

🤖 Filed by Claude Code (Opus 4.7 1M context) — session 2026-05-14 → 2026-05-18, edkjo / Windows 11.
