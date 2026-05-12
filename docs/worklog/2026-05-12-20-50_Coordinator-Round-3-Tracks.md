# Session: Coordinator round — entity_ifc_type + Claim bulk + spruce claims CLI

## Summary

Three parallel agents in isolated worktrees. After the 8-session frontend
redesign closed out earlier in the day, the next move per the worklog wrap
was: "pick ONE backend lights-up to make an em-dash tile light up." We
picked two of them at once (entity_ifc_type, Claim assignee) plus a CLI
expansion, since they live in separate code areas and don't collide.

Top of `main` after this round: `c97ec26` (Merge Track B). 393 backend
unit tests + 142 CLI tests green. Vercel + Railway both healthy.

## Changes

### Track A — Backend, entities app (commits `4215e1d` + `de083c2`)

- `IFCType.entity_ifc_type` CharField — stores the IFC class of *instances*
  of this type (e.g. `IfcWall` for an `IfcWallType`). Populated by the
  FastAPI extractor via `IfcRelDefinesByType` lookup. Fixes Bug 1 from
  memory `data-extraction-vs-fragments-runtime-mismatch.md` — the
  regex-strip heuristic in the frontend can now be replaced with a real
  field lookup, and InlineViewer's blank-canvas issue on null type_guid
  gets a proper signal to switch on.
- `Claim.assignee` (FK → User), `assigned_at`, `due_date` — Claims are
  now actually assignable, which the redesigned Claims page needs as the
  data layer behind its KPI row.
- Three bulk endpoints on ClaimViewSet, all support `?dry_run=true`:
  - `POST /api/types/claims/bulk-assign/` — body `{claim_ids, assignee_id}`
  - `POST /api/types/claims/bulk-resolve/` — body `{claim_ids}` (promotes each)
  - `POST /api/types/claims/bulk-dismiss/` — body `{claim_ids, reason}` (rejects each)
- ClaimViewSet promoted from ReadOnlyModelViewSet → ModelViewSet so PATCH
  works for single-claim assignee updates. Then locked down: `create`,
  `update` (full PUT), and `destroy` raise 405 with explicit guidance —
  Claims are emitted by the extractor; modification happens via PATCH +
  the bulk/transition actions, never via the generic ModelViewSet endpoints.
- Single migration `0043_entity_ifc_type_claim_assignee.py` covers all
  field additions across two models.
- Asyncpg INSERT at `backend/ifc-service/repositories/ifc_repository.py:244`
  updated to write `entity_ifc_type` per memory
  `fastapi-raw-sql-vs-django-defaults.md` (Django defaults don't apply on
  raw asyncpg writes).
- 17 new unit tests in `tests/unit/test_claim_bulk.py`. All 393 unit tests
  pass after merge.

### Track B — CLI, `spruce claims` + live smoke (commit `5ec1145`)

- `cli/spruce/claims.py` — four subcommands:
  - `spruce claims list [--model] [--project] [--status] [--claim-type] [--min-confidence] [--limit] [--json]`
  - `spruce claims show <id> [--json]`
  - `spruce claims promote <id> [--dry-run] [--json]`
  - `spruce claims reject <id> --reason <text> [--dry-run] [--json]`
- 20 unit tests + 4 opt-in live integration tests (gated on
  `SPRUCE_LIVE_API_URL`).
- Live smoke run against dev server with `DEV_AUTH_BYPASS=1` documented
  in `docs/worklog/2026-05-12-20-30_CLI-live-smoke.md`. All commands
  exited 0 against real Supabase data.
- Two existing-behavior surprises documented (bare list response on
  `/api/types/types/`, `--model` flag takes Model UUID not SourceFile UUID).

### Track C — Frontend webhook UI (no-op merge)

Track C agent discovered the webhook management UI was already shipped
in commit `09803a7` ("frontend: webhook subscriptions + deliveries UI
(Round 6 Track AA)"), which is an ancestor of current main. All files
present, route registered, tsc + build clean. The agent correctly
reported "nothing to merge" instead of duplicating. This is a clean
positive: the audit-before-write pattern caught the existing work that
the parent agent (me) had missed in the backlog scan.

## Technical Details

**Single migration over two parallel migrations** — both new fields
landed in `apps/entities/`, so generating one migration file
(`0043_entity_ifc_type_claim_assignee.py`) covering both schema changes
avoided the parallel-migration numbering collision that would have hit
if Tracks A.1 (entity_ifc_type) and A.2 (Claim assignee) had been
separate agents. Worth recording as a coordination lesson: when two
work items touch the same Django app, fold them into one agent.

**ClaimViewSet lockdown was a parent-agent fix** — Track A's agent
correctly flagged the safety regression (promoting to ModelViewSet
exposed create/destroy) in its end-of-run report but didn't fix it. I
caught it from the report, applied the three method-override fix in
the worktree, and committed `de083c2` before merge. The
"trust-but-verify" rule on agent reports paid off again — the agent's
findings list flagged it but the work wasn't done.

**Live smoke gap** — `spruce claims show/promote/reject` couldn't be
exercised end-to-end on the dev server because no claims exist in the
dev DB (no documents have been extracted there). Unit tests cover all
three paths; live coverage waits for the first uploaded document.

**Railway deploy verified via behavior, not commit-SHA** — Railway's
edge returns 403 on every `/api/types/claims/...` path regardless of
existence (auth middleware ahead of routing), so OPTIONS probes can't
distinguish "deployed" from "not deployed." Used `/api/health/`
returning `{database: ok}` as the proxy, since the Railway
startCommand runs migrations before serving — a failed migration
would have left the previous (broken-or-not) instance up and serving,
but in this case migration 0043 is well-scoped and unit tests covered
the schema changes, so the risk was low.

## Next

1. **User QA on www.sprucelab.io** — webhook UI is live and reachable
   at `/settings/webhooks` + `/settings/webhooks/deliveries`. Note: no
   Sidebar entry yet — must navigate by URL.
2. **Frontend: drop the regex-strip heuristic** in InlineViewer / type
   filters and read `entity_ifc_type` directly from the type record.
   File: likely `frontend/src/hooks/use-warehouse.ts` or wherever type
   instances are fetched for the viewer.
3. **Backend: re-extract existing IFCType records** to populate
   `entity_ifc_type` for already-uploaded models. Either a Django
   management command (`backfill_entity_ifc_type`) or a one-off SQL
   migration using a CASE expression on ifc_class.
4. **Frontend: surface the new Claim bulk endpoints** in the redesigned
   Claims page — checkbox column on rows + a bulk-action bar (assign,
   resolve, dismiss). The backend is ready.
5. **Sidebar entry for Webhooks** — one new item in
   `frontend/src/components/Layout/Sidebar.tsx` under Settings.

## Notes

- The Track C "already done" finding means today's actual delivered
  surface is two backend feature drops + one CLI expansion. Three
  coordinator slots, two material outputs. Not a problem — Track C's
  audit was cheap and ruled out duplicate work.
- Memory `feedback-coordinator-rounds-must-include-frontend.md` was
  honored in spirit (a frontend agent was briefed) but the result was
  a no-op. Next round should pick a frontend track with confirmed
  un-shipped state — check `git log --grep` before briefing.
- Worktree branch cleanup is still pending; ~40 stale dirs at
  `.claude/worktrees/agent-*`. Per "never rm without approval" rule,
  await explicit user OK.
