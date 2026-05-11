# Coordinator Round 7 — four parallel tracks

Continues from `2026-05-11-14-52_DXF-MTEXT-Decoder-Fix.md`. The previous
worklog declared the session "truly ended"; user re-opened with explicit
direction: *"continue where we left off. remember to be the coordinator
and launch agents for parallel work."*

That's an explicit override of the morning's
`feedback-coordinator-rounds-ship-invisible-work` ("one focused PR per
session") for agent-surface scope. The override is consistent with
`feedback-agent-first-or-die` item 10: *"Coordinator rounds that ship
plumbing are GOOD for agent readiness even when they look invisible to a
human user."*

Phase 3 Type page v2 stayed parked, per the same memory's separate note
that the visual UI refresh wants a dedicated session, not a parallel
track.

## Tracks

| Track | Mission | Worktree commit |
|---|---|---|
| **W** | PR B — `spruce files` CLI vertical (list/show/upload/download/reprocess/versions) | `b2a8cea` |
| **X** | `/.well-known/agent-tools.json` + `llms.txt` site-scan discovery | `1ce1b3e` |
| **Y** | PR A.2 — CLI error messages suggest next command verbatim (`_errors.py` helper) | `e225195` |
| **Z** | Observations PR 2 — claim extractor over text-block observations + `Claim.origin_observation` FK | `3099584` |

All four landed on `main` via cherry-pick. One conflict (Track X's
`discovery` block landed adjacent to Track W's `cli_commands` block in
`backend/config/views.py:capabilities`); resolved by keeping both,
W's first.

## Cumulative diff on `main`

| Metric | Before round 7 | After |
|---|---|---|
| Backend unit tests | 337 | **376** (+39) |
| CLI tests | 63 | **118** (+55) |
| Commits on main | (post round-6 + agent-first hinge + MTEXT fix) | +4 in this round |

Each track is its own commit, separately revertable.

## What ships

### W — `spruce files`

Six subcommands against `/api/files/`:

- `spruce files list [--project] [--scope] [--format] [--current-only] [--limit] [--json]`
- `spruce files show <id> [--json]`
- `spruce files upload <path> --project <uuid> [--on-duplicate ask|use_existing|replace]` — defaults to `use_existing` so re-runs are idempotent for agents
- `spruce files download <id> [--out PATH] [--overwrite]` — streams from `file_url`
- `spruce files reprocess <id> [--json]`
- `spruce files versions <id> [--json]` — resolved client-side (no `/versions/` endpoint exists yet; documented in commit body)

`/api/capabilities/` now mirrors a `cli_commands` block so agents can
discover the verb set without scraping the CLI source.

### X — agent discovery

- `GET /.well-known/agent-tools.json` — JSON manifest with endpoints,
  auth scheme (`Bearer`, register at `/api/automation/agent/register/`),
  CLI verbs, extraction surfaces, and good use cases. `api_base`
  derived from `request.build_absolute_uri('/')`.
- `GET /llms.txt` — plaintext, `text/plain; charset=utf-8`, follows
  the `https://llmstxt.org/` informal spec.
- `/api/capabilities/` exposes both URLs under a new `discovery` key.

Both endpoints public, throttling-exempt. Spec deviations vs. the
plan: scheme is `Bearer` not `Token` (matches
`AgentTokenAuthentication`); register endpoint is the real one not the
spec's; `/api/schema/` dropped because drf-spectacular is not
installed.

### Y — CLI error hints

`cli/spruce/_errors.py` holds two pure helpers and two unified
printers:

```
format_http_error_hint(status, command_context) -> str | None
format_request_error_hint() -> str
print_http_error(console, err, *, json_out, command_context)
print_request_error(console, err, *, json_out, command_context)
```

Adopted across `models`, `verify`, `scripts`, `types`, `webhooks`,
`embed`, `capabilities` (and `cli.py` for shared error context).
`log.py` was already canonical and untouched. Each `_handle_http`
delegates to the helper; new `httpx.RequestError` branch handles
network failures with config-pointer hints.

JSON error shape gained `status`, `body`, and `hint` keys — the
backward-compatible `error` key is preserved. One existing test
(`test_types_cli`) updated to read `body` instead of `detail`.

Defaults audit found nothing to change — every user-facing command
already defaults to a Rich table or human summary with `--json`
flipping to JSON.

### Z — observation→claim extractor

- New `Claim.origin_observation` FK (nullable, `SET_NULL`,
  `claims_origin_obs_idx`). Migration `0042`.
- New `backend/apps/entities/services/observation_claim_extractor.py`.
- `observation_emitter.emit_for_drawing_sheet` calls the extractor
  after `bulk_create` (trigger pattern (b) — direct call, not signals;
  entities app has no `signals.py` infra and per-row firing was the
  wrong shape).
- Extraction rules (start narrow):
  - **elevation**: `^(?:[+\-]\d+(?:[.,]\d+)?|\d+[.,]\d+)$` — sign or
    decimal required so bare integers don't collide with NS3451
  - **ns3451_code**: `^\d{3}(?:\.\d+)?$`, checked first
  - **grid_label**: `^[A-Z](?:\d{1,2})?$`, capped at 2 digits
- Idempotency: pre-load existing
  `Claim.origin_observation_id__in=obs_ids`, skip those.
- Cascade `SET_NULL` so claims survive observation deletion (audit
  trail outlives observation re-emission cycles). Test
  `test_claim_survives_observation_deletion` covers this.

Migration `0041_backfill_observations` was patched to pass
`extract_claims=False` for the historical-model path — forward-
compatible kwarg, applied DBs unaffected, fresh DBs get same
observation rows without the new claim side-effect (correct for
backfill).

## Conflict resolution

Single conflict in `backend/config/views.py` between Track W's
`cli_commands` block and Track X's `discovery` block in the same
`capabilities()` Response dict. Resolved by keeping both, alphabetical
within block boundaries.

Track Y's CLI helper adoption did NOT collide with Track W's new
`files.py` because Track W was launched in parallel and shipped its
own `_handle_http` (the established pattern at briefing time). Small
follow-up: fold W's `files.py` to use Y's `_errors.py` helper — not
blocking. Filed as next-session item.

## Open follow-ups

1. **`spruce files` → `_errors.py` adoption.** Small DRY-up after both
   landed in the same round.
2. **Phase 3 — Type page v2.** Still parked, dedicated-session
   territory. Six consecutive worklogs now.
3. **Embed PR 6 wiring decision** (from previous worklog) — still
   needs a product decision: extend `/api/embed/instances/` to return
   GUIDs, or do a type_id → GUID hop in ViewerTile.
4. **`DashboardFilterProvider` + `useFilterContext`** still missing in
   the frontend tree.
5. **MCP server wrapping the CLI** — design rule from
   `feedback-agent-first-or-die`: "Sprucelab as an MCP server is a
   distribution channel." Not started.
6. **`spruce files versions` real endpoint.** Today resolved
   client-side. A real `/api/files/<id>/versions/` would be cleaner.
7. **Heuristic title-block scan for PDF drawings** (PyMuPDF). Would
   10× observations on real drawings; carried over from the
   agent-first hinge worklog.

## Notes

- 4/4 worktree-isolated. No agent saw another's branch. Cherry-pick
  cadence held.
- Fast feedback loops worked: each agent ran the relevant test slice
  before reporting; coordinator only ran the union sweep
  (`tests/unit` + `cli/tests`) once at integration time.
- Worklog written before push, per
  `feedback-worklog-includes-commit-push-verify`. Push + deploy
  verification next.
