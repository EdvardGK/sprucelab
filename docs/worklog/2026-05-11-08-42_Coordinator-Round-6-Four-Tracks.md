# Session: Coordinator Round 6 — four parallel tracks landed

## Summary

User asked the coordinator to keep pushing toward a working app via
parallel agents — same lifecycle as Rounds 3–5 (worktree isolation,
cherry-pick + batched push, end-to-end verification, post-push deploy
poll).

Picked four non-overlapping tracks from the open-follow-ups list in
`2026-05-11-07-33_Coordinator-Round-5-Four-Tracks.md` plus the
`docs/todos/current.md` "Active backlog" surface. Per memory
`feedback-frontend-first-until-app-feels-real` (2026-05-11
directional shift), tracks leaned frontend: 2 frontend, 1 backend, 1
CLI. Phase 3 Type page v2 was held back per its standing instruction
("dedicated session, NOT a parallel coordinator track"). Embed PR 6
ViewerTile wiring also held back pending the product decision flagged
in Round 5.

| Track | Scope | Commit | Status |
|-------|-------|--------|--------|
| AA — Frontend Webhook UI | New `frontend/src/pages/Settings/WebhookSubscriptions.tsx` + `WebhookDeliveries.tsx`, new `frontend/src/hooks/use-webhooks.ts` (9 hooks), three new feature components (`CreateWebhookDialog`, `SecretRevealBanner`, `DeliveryStatusBadge`), 2 new routes in App.tsx, Sidebar link, full `webhooks.*` i18n. All actions wired to real backend (test/redeliver/rotate-secret all exist on the ViewSets). One-shot HMAC secret reveal on create AND rotate. | `09803a7` | shipped, all green |
| BB — DashboardFilterProvider | New `frontend/src/lib/embed/DashboardFilterProvider.tsx` (Context + provider with `setFilter`/`patchFilter`, invariant clamping on `project_id` + `protocol_version`, DEV-only warn). New `useFilterContext()` + `useOptionalFilterContext()` hooks. Refactored `EmbedDashboard.tsx` into outer-fetcher + inner `EmbedDashboardBody` reading the provider. ViewerTile `filterContext` prop is now optional; provider wins when both present. Public postMessage contract unchanged. No i18n changes (no user-facing strings). | `c03d901` | shipped, all green |
| CC — Backend SavedFilter dry_run | `?dry_run=true` on `POST /api/filters/saved/` + `PATCH /api/filters/saved/{id}/`. Refactored `perform_create()` into `_gate_create()` helper so scope-permission gating runs in both dry-run and persist paths (preview parity with real writes). Capabilities backfill: 2 entries added to root `mutations_supporting_dry_run` (`backend/config/views.py:33`) AND embed mirror (`backend/apps/embed/views.py:158`). Both lists now at 10 entries. 7 new tests + 1 root capabilities assertion + 1 embed mirror assertion = +9 (297 → 306). | `8829f86` | shipped, all green |
| DD — CLI `spruce webhooks` | New `cli/spruce/webhooks.py` (Typer + Rich + httpx, 446 lines) with 7 subcommands: `list`, `create`, `disable`, `delete`, `deliveries`, `redeliver`, `test`. `--dry-run/-n` on create wired to Round 5 Track T's backend dry_run support. `--secret-out FILE` writes secret with 0600 perms and suppresses stdout echo. 20 new tests. Registered in `cli/spruce/cli.py`. | `60d302e` | shipped, all green |

## Track details

### Track AA — `frontend: webhook subscriptions + deliveries UI (Round 6 Track AA)`

- NEW `frontend/src/hooks/use-webhooks.ts` (311 lines): query-key
  factory + 9 hooks: `useWebhookSubscriptions`,
  `useWebhookSubscription`, `useCreateWebhookSubscription`,
  `useUpdateWebhookSubscription`, `useDeleteWebhookSubscription`,
  `useRotateWebhookSecret`, `useTestWebhookSubscription`,
  `useWebhookDeliveries`, `useRedeliverWebhook`.
- NEW `frontend/src/pages/Settings/WebhookSubscriptions.tsx` (320):
  list + create + enable/disable + test + rotate-secret + delete
  with confirms.
- NEW `frontend/src/pages/Settings/WebhookDeliveries.tsx` (342):
  filterable list (subscription, status) with `?subscription=&status=`
  URL round-trip, redeliver action, refresh button.
- NEW `frontend/src/components/features/webhooks/CreateWebhookDialog.tsx`
  (229): modal form with event-type autocomplete, project scope
  select, validation.
- NEW `frontend/src/components/features/webhooks/SecretRevealBanner.tsx`
  (83): one-shot HMAC secret reveal with clipboard copy + explicit
  dismiss. Used on both create AND rotate paths.
- NEW `frontend/src/components/features/webhooks/DeliveryStatusBadge.tsx`
  (29): typed status badge for pending/success/failed/giving_up.
- EDIT `frontend/src/App.tsx`: lazy import + 2 auth-guarded routes
  (`/settings/webhooks`, `/settings/webhooks/deliveries`).
- EDIT `frontend/src/components/Layout/Sidebar.tsx`: added
  "Webhooks" link under Developer (only visible outside project
  context).
- EDIT `frontend/src/i18n/locales/en.json` + `nb.json`: added
  `nav.webhooks` and full `webhooks.*` block; Norwegian uses proper
  æ/ø/å (per memory).

**Backend gaps hit**: none. `test`, `rotate-secret`, `deliveries`,
and `redeliver` actions all exist on `WebhookSubscriptionViewSet` /
`WebhookDeliveryViewSet` (`backend/apps/automation/views.py:526-706`).

### Track BB — `frontend: embed PR 6 prep — DashboardFilterProvider + useFilterContext (Round 6 Track BB)`

- NEW `frontend/src/lib/embed/DashboardFilterProvider.tsx` (192 lines):
  Context + provider exposing
  `{ filter, setFilter(next), patchFilter(patch) }`. Pins
  `protocol_version` and `project_id` as invariants; mismatched
  patches are clamped and DEV-warned (mirrors the messaging-bus
  stance). Accepts `initialFilter`, optional `onChange`, optional
  `onWarn`. URL coupling deliberately NOT in this layer —
  EmbedDashboard owns the postMessage echo loop and any URL sync.
- NEW `frontend/src/lib/embed/useFilterContext.ts`: throws outside a
  provider for the strict path; `useOptionalFilterContext()` returns
  `null` for the prop-based fallback path.
- EDIT `frontend/src/pages/EmbedDashboard.tsx`: refactored into
  outer-fetcher + inner `EmbedDashboardBody`. Outer still owns
  token/capabilities/error flow and computes `initialFilter` via
  `useMemo`. Once capabilities arrive, it mounts
  `<DashboardFilterProvider initialFilter={…}>` around the body,
  which reads `useFilterContext()` and owns the postMessage bus.
  `set_filter` envelopes now call `patchFilter()` instead of
  `setFilter(prev => …)`. Public postMessage contract unchanged —
  same `ready`, `filter_changed`, `error` envelopes flow with
  identical payloads.
- EDIT `frontend/src/components/embed/ViewerTile.tsx`: `filterContext`
  prop became optional; `useOptionalFilterContext()` consumed first,
  prop is the fallback. Provider wins when both present. Throws if
  neither is available. Existing prop-based call sites continue to
  work unchanged.

**No i18n changes**: only DEV-only `console.warn` and one thrown
Error (programmer-facing). The anticipated `embed.*` ↔ AA `webhooks.*`
conflict was therefore moot.

### Track CC — `backend: dry_run on SavedFilter create + update + capabilities backfill (Round 6 Track CC)`

- EDIT `backend/apps/filters/views.py`: added `create()` +
  `update()` + `partial_update()` overrides to `SavedFilterViewSet`
  (+123 / −2). Refactored existing `perform_create()` into a
  `_gate_create()` helper so scope-permission gating runs in both
  dry-run and persist paths (preview parity with real writes).
  Uses `_bool_param` from `apps.entities.views.claims` (shared
  idiom, now imported by four call sites).
- EDIT `backend/config/views.py`: appended the two new entries to
  the root `/api/capabilities/` manifest (now 10 entries).
- EDIT `backend/apps/embed/views.py:158`: appended the two new
  entries to the embed mirror, inserted alphabetically between
  `automation` and `projects` groups (now 10 entries).
- NEW `tests/unit/test_saved_filter_dry_run.py` (185 lines, 7
  cases): create dry_run preview returns payload, no DB row;
  create default persists; create dry_run with invalid payload
  returns 400; partial_update dry_run preview, no DB mutation;
  partial_update default persists; explicit `dry_run=false` string
  persists; scope-permission gate fires on dry-run path too.
- EDIT `tests/unit/test_capabilities.py` (+1 case): assert root
  manifest contains both new entries.
- EDIT `tests/unit/test_embed_resolver.py` (+1 case): assert embed
  mirror contains both new entries.

**Snag worth noting for future dry_run tracks**: Python's `logging`
module reserves `name` as a `LogRecord` attribute; the first run
blew up on `extra={'name': ...}`. Fixed by renaming the log key to
`filter_name`. If a model has a `name` field and you want to log it,
don't pass it through `extra`.

### Track DD — `cli: spruce webhooks list/create/disable/deliveries/redeliver (Round 6 Track DD)`

- NEW `cli/spruce/webhooks.py` (446 lines): Typer app with 7
  subcommands mirroring the `verify.py` / `models.py` pattern.
- NEW `cli/tests/test_webhooks_cli.py` (20 cases): list (table /
  json / project filter / no-auth / HTTP 500), create
  (success-prints-secret, dry-run query param + no secret echo,
  `--secret-out` writes file 0600 + suppresses stdout echo,
  multi-event), disable (false), disable `--enable` (true), delete
  (confirm-declines / `--yes` skips), deliveries (table / status
  filter / subscription filter), redeliver (success + missing-endpoint
  graceful exit), test (success + missing-endpoint).
- EDIT `cli/spruce/cli.py`: registered the new app
  (`from .webhooks import app as webhooks_app` +
  `cli.add_typer(webhooks_app, name='webhooks')`).
- EDIT `cli/tests/conftest.py`: added
  `spruce.webhooks.get_api_url` monkeypatch, plus an autouse
  `COLUMNS=200` fixture so Rich doesn't truncate columns we assert
  on (benefits all CLI suites going forward).
- EDIT `cli/README.md`: one sentence under existing
  Pipelines/Runs sections.

**Backend endpoints confirmed live** (no follow-up issues needed):
- `POST /api/automation/webhook-subscriptions/<id>/test/` —
  `backend/apps/automation/views.py:623`
- `POST /api/automation/webhook-deliveries/<id>/redeliver/` —
  `backend/apps/automation/views.py:685`

The "missing endpoint" code paths exit code 2 with `"not implemented"`
error message — safety net only, exercised in tests via 404/405 mocks.

**Spec-vs-reality field-name divergence** (worth a coordinator
note): The brief used speculative field names (`enabled`,
`failure_count`, `last_success_at`, `auto_disabled_at`, `http_code`,
`attempt`, `sent_at`, `latency_ms`). The backend actually exposes
`is_active`, `consecutive_failures`, `last_fired_at` (no
`auto_disabled_at`), `response_status_code`, `attempt_count`,
`created_at`/`last_attempt_at`/`completed_at` (no `sent_at` or
`latency_ms`). CLI keeps user-facing column headings spec-friendly
("Enabled", "Failures", "Last fired", "HTTP", "Attempt") but talks
to the API using real field names. `disable` PATCHes `is_active`,
not `enabled`. Module docstring + the `disable` docstring both call
this out. The Track AA frontend hit the same divergence
independently and resolved it the same way.

## Verification (end-to-end, pre-push)

| Surface | Status |
|---------|--------|
| CLI tests (`cd cli && python -m pytest tests/`) | 49/49 passed + 4 skipped (live), 1.03s — baseline 29 + Track DD 20 = 49 |
| Backend unit tests (`./tools/python -m pytest tests/unit`) | 306/306 passed, 24.80s — baseline 297 + Track CC 9 = 306 |
| Frontend `tsc --noEmit` | clean |
| Frontend `yarn build` | clean (21.77s, pre-existing UnifiedBIMViewer 4.7 MB chunk warning only — no new warnings) |

## Verification (post-push, all on `09803a7`)

| Signal | Status |
|--------|--------|
| GitHub workflow "PR checks" (rolls up Supabase Preview + Backend unit + Frontend type check) | success |
| Commit-status `Vercel` | success |
| Commit-status `resilient-hope - Django` | success |
| Commit-status `resilient-hope - Fast API` | success |

All signals green on `09803a7`. Per
`feedback-verify-deploys-after-push`. No fixes needed.

## Coordinator approach

Rounds 3+4+5 cadence, kept the wins, didn't experiment:

- **Worktree isolation** — all four tracks ran in
  `.claude/worktrees/agent-*` branches. Round 6 = 4/4 isolated.
  Streak holds: Rounds 4–6 are 12/12 with worktree isolation. No
  fall-through to main.
- **Cherry-pick + batched push** — 4 track commits, zero conflicts
  this round (different from Round 5 which had a single anticipated
  `mutations_supporting_dry_run` conflict). Single deploy cycle,
  single status poll.
- **Anticipated conflict that didn't materialize** — flagged
  AA + BB on `frontend/src/i18n/locales/{en,nb}.json` union-merge.
  Track BB ended up not needing i18n changes (no user-facing
  strings), so the union resolve wasn't needed. Track AA had clean
  ownership.
- **Spec-vs-reality divergence on webhook fields** — both AA and DD
  independently hit the same gap (brief used
  `enabled`/`failure_count`/etc. but backend exposes
  `is_active`/`consecutive_failures`/etc.). Both tracks resolved
  the same way: friendly column headings on the user-facing
  surface, real field names on the wire. Worth tightening future
  briefs by reading the actual serializer first.
- **`_bool_param` helper now used in four call sites** — claims.py,
  projects/views.py, automation/views.py, and now filters/views.py.
  Round 5 flagged "if it moves to a shared utils module, three
  updates needed"; it's now four. Still not urgent, but the case
  for consolidation is getting stronger.
- **Auto-mode active** — picked tracks myself per Round 5's
  open-follow-ups, didn't pre-ask. User course-correction window
  was the launch text; no corrections came.
- **Frontend-first observance** — 2 of 4 tracks frontend (AA +
  BB), 1 CLI (DD, also user-facing for agent operators), 1 backend
  (CC, smallest scope). Honors `feedback-frontend-first-until-app-
  feels-real` while keeping the agent-first surface advancing.

## Open follow-ups for next round

1. **Phase 3 — Type page v2** STILL the next big anchor PR.
   Dedicated session, NOT a parallel coordinator track. This is
   the third round in a row this has been deferred — at some point
   the user needs to flip the switch and start it.
2. **Embed PR 6 — ViewerTile wiring decision.** Track U's scaffold
   (Round 5) and Track BB's provider (Round 6) both wait on the
   product decision: extend `/api/embed/instances/` to surface
   GUIDs, OR add a type_id → GUID hop in ViewerTile. Discuss
   before PR 6 starts.
3. **Three real-model spike items** still gate PR 5 ViewerTile
   from being mounted: ghost-mesh transparency artifacts on
   stacked walls, `model.highlight()` apply-time at ~1500 matching
   / ~5k visible, multi-model coordination via
   `FragmentsModels.update()`. Omarchy session.
4. **`_bool_param` shared utils** — four call sites now. Threshold
   for "consolidate" is getting closer. Trivial refactor when the
   user flags it.
5. **Webhook field-name reconciliation** — backend exposes
   `is_active`/`consecutive_failures`/etc. but spec docs and
   briefs use `enabled`/`failure_count`/etc. Either (a) rename
   serializer output to match spec, or (b) update internal docs
   to match reality. Pick one — drift is the worst outcome.
6. **Cross-project create restriction on Drawing/Document/TitleBlock**
   still pinned. Flips when Phase 7 org model lands.
7. **Stale worktree branches** — Round 5 left 16+; Round 6 adds 4
   more. Cleanup recipe in `.claude/worktrees/README.md` per
   Round 5 Track V. Human runs it; coordinator does not auto-clean.

## Notes

- Round 6 was the smoothest yet: zero cherry-pick conflicts, all
  four tracks reported `tsc + build / pytest / pytest` clean on
  first try, no union-merges needed. The agents are getting better
  at reading existing patterns first; the briefs are getting
  better at flagging only real conflict surfaces.
- The deploy poll is the last gate. Will be appended to the
  Verification (post-push) section above once all six settle.
