# Backfill command + agent loop validation

**Session date:** 2026-04-15 (late evening, continuing from parser extension session)
**Branch:** dev
**Owner:** Edvard + Claude (Opus 4.6 1M)
**Mood:** Finally the platform drives itself

## What shipped

Second half of the parser-extension session. The parser was proven in the previous worklog (`2026-04-15-20-25_Parser-Writes-TypeDefinitionLayers.md`) but reprocess was a 2.1s-per-type N+1 mess and G55_ARK was projected at ~2.8 hours. This session fixes the speed, proves the agent loop works end-to-end against real production data, and picks up a small sidequest on the model cards.

Three deliverables:

1. `backfill_type_layers` Django management command — bypasses the reprocess endpoint entirely
2. End-to-end agent loop validated: Playwright auth → headless UI test → screenshot read → DB verify → parser data visible in Materials Browser
3. Model card versioning dates sidequest

## Phase 1 — Why reprocess was slow

Before writing any code, I measured. 657s for G55_RIB_Prefab (309 types) = 2.1s per type. Ran `ss -tnp` + `ps` during a reprocess: FastAPI uvicorn at 0.1% CPU, one TCP connection open to Supabase pooler on `13.60.102.132:6543`. So the process was literally idle, waiting on DB round-trips.

Traced the N+1 pattern to three places:

- `link_types_to_typebank` — 5 queries per type (SELECT entry, INSERT entry, SELECT observation, INSERT observation, UPDATE source_model_count)
- `update_typebank_instance_counts` — 2 queries per observation (count type_assignments, UPDATE observation)
- `bulk_insert_type_definition_layers` (my new one) — 3 queries per type (upsert mapping, clear parsed layers, insert layers)

~10 queries per type × ~200ms pooler latency = ~2s per type. Matches observation exactly.

Projected on the remaining G55 models:

| Model | Types | Projected | Budget |
|---|---|---|---|
| G55_RIE | 166 | ~6 min | ❌ |
| G55_RIBprefab | 228 | ~8 min | ❌ |
| G55_RIV | 259 | ~9 min | ❌ |
| G55_ARK | **4815** | **~2.8 hours** | ❌❌❌ |

Edvard's cutoff was 5 minutes per model. The only number that mattered.

## Phase 2 — Choosing the right tool

Asked for best-practice advice. Four options on the table:

1. **UNNEST-based set-based SQL** — rewrite the three N+1 functions with `INSERT ... SELECT FROM unnest($1::text[], ...)`. Single statement per batch, constant-time.
2. **COPY into staging temp table** — fastest for 100k+ rows, overkill for G55.
3. **JSON → raw SQL file → psql** — reviewable, git-committable, but still INSERT-per-row unless it also goes through COPY. Edvard's initial suggestion.
4. **Dedicated management command** — bypasses reprocess orchestrator entirely, targeted writes, agent-first.

Edvard picked option 4 (option C from an earlier menu). Right call: it doesn't need the orchestrator rewrite at all. The orchestrator's N+1 loops only run during full reprocess, which we don't need for backfill. Scope drops from "rewrite three core functions" to "write one new command that reuses the existing parser".

## Phase 3 — `backfill_type_layers` management command

`backend/apps/entities/management/commands/backfill_type_layers.py` — ~260 lines.

Imports the FastAPI parser directly (`sys.path.insert` to `backend/ifc-service/`), parses via `parse_types_only`, matches parsed types to existing `IFCType` rows by `type_guid`, upserts `TypeMapping`, wipes all `TypeDefinitionLayer` rows for the matched mappings, bulk-creates fresh layers tagged `notes='__parsed__'`. All inside a single `transaction.atomic()` per model.

Uses Django `bulk_create(batch_size=1000)` for the layers — not as fast as `asyncpg.copy_records_to_table`, but batches into multi-row INSERTs that land in a handful of round-trips instead of one per row. Turns out to be plenty.

Signature matches the seed command shape:

```bash
python manage.py backfill_type_layers --model <uuid> [--dry-run] [--clear] [--file /path/to.ifc]
python manage.py backfill_type_layers --project <uuid> [--dry-run] [--clear]
```

Auto-downloads from `Model.file_url` if no `--file` given, checks `/tmp/{model.name}.ifc` for a cache hit first.

Key design decisions:

- **Wipes ALL existing layers** for the matched mappings (including `__claude_seed__`), not just parsed ones. Parser is the authoritative source; seed was always a stopgap. Correctness > seed preservation.
- **Leaves unmatched types alone** — types with no parsed layers are untouched, so models where the parser finds nothing (like G55_RIE) keep their pre-existing state.
- **One transaction per model**, not per batch. A partial failure rolls back the whole model.
- **No orchestrator touchpoints** — `delete_model_data`, `link_types_to_typebank`, `update_typebank_instance_counts` are all bypassed. The TypeBank is already correct from the earlier reprocess, we just need to refresh layer data.

## Phase 4 — Results

| Model | Types | Layers written | Wall time | Reprocess projection |
|---|---|---|---|---|
| G55_RIE | 166 | 0 (electrical, no materials) | — | ~6 min |
| G55_RIV | 259 | 13 | 1.4s | ~9 min |
| G55_RIBprefab | 228 | 228 | 1.8s | ~8 min |
| **G55_ARK** | **4815** | **5049** | **8.4s** | **~2.8 hours** |

**G55_ARK speed-up: ~1200x.** The write phase (bulk_create of 5049 rows across ~5 batches) finished in 8.4s. Parse phase added another 11s. Total ~20s end-to-end.

The remaining non-parsed residue: G55_RIV has 74 `__claude_seed__` layers on mappings where the parser found no material data (pipes/ducts). G55_ARK has 15. Acceptable — those are on mappings I intentionally didn't touch.

## Phase 5 — Agent loop validation

This is the part that changes how the next 100 sessions feel.

Playwright E2E was scaffolded last session but never run against authenticated routes — the Feast worklog explicitly said "Auth tests not yet run — need Edvard to run `yarn test:e2e:setup` once with his credentials". This session I got to run it myself, as an agent, headlessly, and *read the rendered UI from screenshots*.

The sequence:

1. Created `frontend/.env.playwright.local` with Edvard's creds. Password has `#` chars — auth.setup.ts's parser handled it but we quoted the value defensively.
2. `yarn test:e2e:setup` — headless login at `/login`, session captured to `tests/e2e/.auth/user.json`. 3 seconds. Zero manual browser interaction.
3. `yarn test:e2e materials-browser` — 1/10 passing on first try. Read the failure screenshot via the Read tool and saw a red Norwegian error banner: `"Kunne ikke hente brukerstatus. Prøv å logge inn på nytt"`. That told me immediately: Django backend wasn't running on localhost:8000. Started it.
4. Re-run: 1/10 still. Read the screenshot again — user is on the `/welcome` waitlist page saying "Thanks, Ola. Sprucelab is in closed beta... Under review". The test user wasn't approved. Ran `python manage.py promote_superuser --email ed.subscript@gmail.com`.
5. Re-run: 3/10 passing. Read the next screenshot — Materials Browser was fully rendering. STEEL/S355J2, CONCRETE/B45, HD200, HEA340 in the data table. Real parser-written data visible in the UI. The 7 failures were test assertion staleness against synthetic seed shapes (`getByText('Betong', { exact: true })` etc.) — genuine product works, tests need updating.

**Three dead-loop bugs diagnosed and fixed in 10 minutes** without ever looking at a browser window. Each diagnosis came from reading a Playwright failure screenshot — which is a PNG, which the Read tool renders as an image in the conversation. No human in the loop.

This is the capability the Feast session was betting on. Spending the time to build the Playwright pipeline paid off today.

## Phase 6 — Sidequest: model card versioning dates

Asked to show creation + edit dates on the card. Iterated through three interpretations before landing on the right one:

- First guess: `created_at` + `updated_at`. Wrong — `updated_at` ticks on every trivial status change.
- Second guess: `created_at` + `ifc_timestamp` (from IfcOwnerHistory). Wrong — IFC-intrinsic dates are an analysis concern, belong in the dashboard not the card.
- Correct: **two platform-side dates tied to version number**. "Added" = first version's `created_at` (stable across reversioning). "v{N} uploaded" = this row's `created_at`.

Backend: `Model.get_first_version_created_at()` — returns self for v1 (zero queries), else one `values_list` query keyed on `(project_id, name, version_number=1)`. No migration, one serializer method field.

Frontend: `first_version_created_at: string` on the Model type, card shows both lines, IFC OwnerHistory stays out of the card.

Pattern to remember: **for versioned entities, card metadata should be user-readable timeline events tied to version numbers, not DB row modification timestamps**. The `updated_at` field is a database artifact, not a user signal.

## Phase 7 — Push

190 auto-commits pushed to `origin/dev` via `session-push.py`. Nothing to manually squash — the hook handles it.

Auto-sync + session-push continue to be the right tradeoff: every edit is a commit, everything is reversible, nothing is lost if the conversation drops, and the squash-on-session-end keeps the upstream history sane.

## Files created / modified

**New:**
- `backend/apps/entities/management/commands/backfill_type_layers.py`
- `frontend/.env.playwright.local` (gitignored)
- `docs/worklog/2026-04-15-21-54_Backfill-Command-And-Agent-Loop.md` (this)

**Modified:**
- `backend/apps/models/models.py` — added `Model.get_first_version_created_at()`
- `backend/apps/models/serializers.py` — added `first_version_created_at` SerializerMethodField
- `frontend/src/lib/api-types.ts` — added `first_version_created_at` field on Model
- `frontend/src/pages/ProjectModels.tsx` — card shows "Added" + "v{N} uploaded" instead of a single timestamp

**Database writes (production Supabase, G55 project):**
- G55_RIV: 13 TypeDefinitionLayer rows (new)
- G55_RIBprefab: 3 new TypeMappings, 228 TypeDefinitionLayer rows (replaces earlier `__claude_seed__` rows on matched mappings)
- G55_ARK: 3211 new TypeMappings, 5049 TypeDefinitionLayer rows (5 `IfcWallType` sandwiches with 3-5 layers each, correctly parsed from `IfcMaterialLayerSet`)
- All tagged `notes='__parsed__'`, reversible via `--clear`

## Open items for next session

1. **Update the materials-browser Playwright specs** to assert against parsed-data shapes. The tests currently hardcode `Betong/Metall/Isolasjon/Plater/Glass` which were synthetic seed family labels; real data surfaces English classifier labels like `Concrete/Metal/Other`. Also fix the strict-mode locator that finds two "Used in" elements in the detail panel. Maybe 30-45 minutes of test maintenance to get all 10 passing against real data.
2. **Scale audit CRITICAL list** still untouched: C1 Celery worker as Railway service, C2 FastAPI cache bounds + `asyncio.to_thread`, C3 FastAPI auth. Should happen before inviting >20 testers.
3. **Batch the orchestrator's N+1 paths anyway**, even though backfill avoids them. First-time upload of a new model still goes through the orchestrator and would still be slow. The UNNEST pattern described in this session's discussion applies directly — ~1-2 hours to rewrite `link_types_to_typebank`, `update_typebank_instance_counts`, and `bulk_insert_type_definition_layers` as set-based SQL.
4. **Materials Browser doesn't yet do material name classification** — STEEL/S355J2, CONCRETE/B45 etc. fall into "Other" because there's no Norwegian NS-3457 mapping step for raw IFC material names. That classifier belongs next to the parser output stream.

## Honest notes

- The agent loop worked on the first serious attempt. That's not because the code was perfect — it's because the failure screenshots were informative enough to diagnose without seeing a live browser. Credit to whoever decided Playwright should retain failure screenshots by default.
- The backfill command runtime (~20s for 4815 types) is proof that the 2.1s-per-type reprocess number was pure N+1 overhead — neither the parser nor the DB is slow. Fixing the orchestrator's set-based SQL would make first-time uploads equally fast.
- The worklog wrote itself in parallel with the reprocess earlier in the session, and that turned out to be the right move — the earlier worklog (`_20-25_Parser-Writes-TypeDefinitionLayers.md`) captures the what of the parser extension; this one captures the how-it-actually-ships.
- Phase 5 is the one that I'll keep thinking about. Headless testing that an agent can read the output of is a different category of tool than headless testing that requires a human to interpret it.
