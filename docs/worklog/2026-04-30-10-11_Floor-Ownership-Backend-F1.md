# Session: Floor ownership backend (Phase F-1)

## Summary
Closed the open architectural question "who owns the floors — ProjectConfig or a model?" with a concrete answer: `ProjectScope` owns the canonical floor list per building; models propose floor lists via `storey_list` Claims; the existing Claim Inbox + promotion flow governs adoption. F-1 is the backend half — model field, claim type, promotion branch, IFC wiring, webhook event, capability manifest. 175 unit tests green (167 → 175).

The decision means floor changes in models do not silently become canonical. Each upload's storey list arrives as `unresolved` in the Claim Inbox; promotion writes it into `ProjectScope.canonical_floors` with an audit trail; rejected claims will surface as deviating models once F-2 (verification engine integration) ships. First-upload bootstrap is the same flow — no auto-promotion, by design.

## Changes

### Backend — model layer
- `backend/apps/projects/models.py` — `ProjectScope.canonical_floors` JSONField. Entries shaped `{code, name, elevation_m, aliases[], _promoted_from_claim, _promoted_at}`. Migration `projects/0006_projectscope_canonical_floors.py`.
- `backend/apps/entities/models/claims.py` — `Claim.claim_type` choices += `('storey_list', ...)`; new `Claim.promoted_to_scope` FK to `ProjectScope` (mutually exclusive with `promoted_to_config` — `claim_type` drives which one is used). Migration `entities/0038_storey_list_claim.py`.

### Backend — promotion service
- `backend/apps/entities/services/claim_promotion.py` — new `SCOPE_CANONICAL_FLOORS_SECTION` constant, three new helpers (`_normalize_floor_proposal`, `_reconcile_floors`, `_resolve_target_scope`), main entry point `_promote_storey_list_into_scope`, dispatcher in `promote_claim` that branches on `claim.claim_type == 'storey_list'`. Webhook dispatch helper `_fire_floor_canonical_changed_event` is failure-isolated. Reconciliation rules in priority order: (1) name or alias match → no-op; (2) elevation within `storey_merge_tolerance_m` → alias merge; (3) else → new floor with auto-allocated `code` (alphanumeric squash with `-2`/`-3` suffixes on collisions). Canonical list is kept sorted by elevation (None last, stable).

### Backend — claim emission
- `backend/apps/entities/services/storey_claim_emitter.py` (new) — `emit_storey_list_claim(source_file, extraction_run, storeys, extraction_method='ifc_lite')`. Failure-isolated, no-op on empty input. Confidence 0.95 for `ifc_lite`, 0.7 for non-IFC (drawing/document) sources.

### Backend — pipeline wiring
- `backend/apps/models/services/parse_lite.py` — `parse_ifc_stats` now returns `storeys: [{guid, name, elevation_m}]` alongside the legacy `storey_names`. Same iteration over `IfcBuildingStorey`, one extra attribute access per storey.
- `backend/ifc-service/api/ifc_process.py` — Django callback payload now includes `storeys` (normalized to `{guid, name, elevation_m}` at the boundary, not the raw `elevation` field on `TypesOnlyResult`).
- `backend/apps/models/views.py:process_complete` — reads `request.data['storeys']` and calls `emit_storey_list_claim`. Wrapped in try/except so a claim emission failure can never break the IFC ingest finalization.

### Backend — capability manifest
- `backend/config/views.py` — `events.wired` += `'floor.canonical.changed'`. The dispatch fires from `_fire_floor_canonical_changed_event` after a successful storey_list promotion, with payload `{event, project_id, scope_id, claim_id, added[], alias_merges[], occurred_at}`.

### Tests
- `tests/unit/test_storey_list_promotion.py` (new, 8 tests):
  - `test_first_promotion_populates_empty_canonical_list`
  - `test_alias_merge_within_tolerance`
  - `test_outside_tolerance_creates_new_floor`
  - `test_existing_name_match_is_noop`
  - `test_dry_run_does_not_persist`
  - `test_emit_storey_list_claim_creates_unresolved_claim`
  - `test_emit_storey_list_claim_skips_empty_input`
  - `test_capability_manifest_exposes_floor_event`

## Technical details

**Promotion target FK separation.** Claim already had `promoted_to_config` (FK to ProjectConfig). Storey-list promotion writes to ProjectScope, not ProjectConfig. Two clean options were considered: (a) generic `promotion_target` JSON field with `{type, id}`, (b) a parallel `promoted_to_scope` FK. Picked (b) because Postgres FKs give us cascade semantics and queryability for free, and the audit symmetry with `promoted_to_config` keeps the API surface uniform. The trade-off is one extra nullable FK column per Claim row — cheap. `claim_type` is the discriminator that tells consumers which target was used.

**Why `config_section` is reused for scope promotion.** The Claim audit fields `config_section` + `config_payload` are populated for both promotion targets. For scope-level promotions the `config_section` value is the literal string `"project_scope.canonical_floors"` — this is a marker, not a real ProjectConfig key. The authoritative target signal is the `promoted_to_scope` FK; `config_section` exists for symmetry so existing audit UIs ("which Claim wrote which thing?") render uniformly without a new code path.

**Code allocation.** Floor codes need to be stable identifiers usable in URLs (viewer filter, deep links). Auto-allocation strips non-alphanumeric chars from the proposed name (`"L-01"` → `"L01"`) and disambiguates with `-2`, `-3` suffixes if a code already exists in the canonical list. Names like `"01"` produce code `"01"`; `"First floor"` produces `"Firstfloor"`. Users will be able to override codes via the upcoming Floors settings page (F-3). The point of auto-allocation is that the first ingest of a project produces usable codes without forcing manual editing.

**Tolerance semantics.** `_reconcile_floors` reads `tolerance_m` from `ProjectScope.storey_merge_tolerance_m` (default 0.2 m). The match is `abs(canonical_elev - proposed_elev) <= tolerance_m`. Inclusive on the boundary. Name/alias check runs first, so a renamed floor at the same elevation still matches by name (no spurious alias entry).

**Bootstrap.** No auto-promotion. The first ingest of a project produces a `storey_list` Claim sitting in the Claim Inbox `unresolved`. Users promote it in the UI (or via `POST /api/types/claims/{id}/promote/`) to populate `canonical_floors`. This honors the project-wide "fail loudly, no silent data loss" rule. A future per-project flag could opt into auto-promotion; deliberately deferred.

**FastAPI ↔ Django boundary normalization.** The internal `TypesOnlyResult.storeys` schema uses `elevation` (raw IFC float). The Claim contract uses `elevation_m`. Normalization happens at the FastAPI side of the boundary so Django code consumes a clean shape. If a future caller sets `storeys` on the result object differently, the boundary projection is a single point of change.

**Webhook dispatch failure isolation.** `_fire_floor_canonical_changed_event` is wrapped in a try/except → swallow. If the webhook subsystem is down (Celery offline, DB transaction issues), the promotion still succeeds — the canonical list update is the source of truth, the webhook is a notification.

**Test approach.** No `mock` of the webhook dispatcher — tests run against the real dispatcher with no subscriptions configured, so it returns `[]` and is a no-op. This caught one bug during iteration: the dispatcher tries to import `apps.automation.models.WebhookSubscription` and would have failed silently if the import path changed.

## Verification (manual / next session)

End-to-end smoke test, deferred to F-3 when the frontend lands:
1. `just up && just dev`
2. Upload IFC → Claim Inbox shows new `storey_list` claim `unresolved`.
3. `POST /api/types/claims/{id}/promote/?dry_run=true` → returns the would-be `next_canonical_floors` without persisting.
4. `POST /api/types/claims/{id}/promote/` → `ProjectScope.canonical_floors` populated; webhook fires `floor.canonical.changed`.
5. Re-upload with one floor renamed → second claim `unresolved`. Promote with rename merge → alias accumulated.
6. Re-upload with one floor at a deviating elevation → second claim `unresolved`. Promote → new canonical floor row added.

For now, all promotion paths exercised in the unit suite (8/8 green).

## Next

### F-2 — Verification engine + flagging (~½ session)
- New `storey_match` check in `apps/entities/services/verification_engine.py`. Compares per-model `AnalysisStorey` rows against the model's scope's `canonical_floors`. Name mismatch → warning; elevation outside tolerance → error.
- `ProjectConfig.config['block_on_storey_deviation']` flag — when true, `storey_match` errors block `Model.is_published`.
- Wire into the existing Action Items widget.

### F-3 — Frontend approval + viewer wiring (~1 session)
- `ClaimInbox.tsx` — dedicated renderer for `claim_type === 'storey_list'` showing canonical-vs-proposed diff with name + elevation + per-row tolerance status.
- New project settings page: **Floors** — per scope, edit canonical list, view deviating models, see promotion history.
- `useViewerFilterStore.ts` — replace `storey: string` (raw IFC GUID) with `floor_code: string` keyed on `canonical_floors[].code`.
- New endpoint: DRF `@action` `GET /api/projects/scopes/{id}/floors/` returns canonical list.

### F-4 — i18n + polish
- Translation keys in `en.json` + `nb.json` for the Floors page and the storey_list claim renderer.
- Update `docs/knowledge/API_SURFACE.md` with the new endpoint.
- Update `docs/todos/current.md` (it's stale — last update 2026-04-24).

### Deferred
- Drawing extractor (`drawing_extractor.py`) and document extractor (`document_extractor.py`) currently surface no floor-name heuristics in their output. The `emit_storey_list_claim` helper is ready; the extractors need title-block / section-header parsers added before they can call it. Defer until F-2 or a follow-up — out of F-1 scope.

## Notes

- `docs/todos/current.md` is stale (2026-04-24). Several items marked "Pending" have actually shipped (Webhook System, Version Change Detection, Sandwich View, Dashboard Enhancement). Will refresh during F-4.
- The plan file for this work is at `~/.claude/plans/whats-the-status-i-imperative-feather.md`. F-1 is complete per that plan; F-2/F-3/F-4 still pending.
- `parse_ifc_stats` is also called by Celery task `apps.models.tasks.process_model_task` (line 96). That path doesn't currently emit storey_list claims because it doesn't have a SourceFile/ExtractionRun in scope (legacy Model upload). Once that path is fully retired in favor of SourceFile-based ingest, this gap closes naturally.
