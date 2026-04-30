# Session: Webhook System — Phase 1 Backend MVP

## Summary
Closed the biggest agent-first brick still missing from the previous session's "Next" list: HMAC-signed outbound webhooks. After today's work, an external automation can subscribe once and react in real time when a model parses, when a document yields claims, or when verification completes — no more polling `/api/files/extractions/` to discover state changes. 38 new tests, suite went 129 → 167 green; frontend typecheck clean.

## Changes

### New webhook substrate (`apps.automation`)
- **Models**: `WebhookSubscription` (project-scoped or firehose, free-form `event_type` so future events need no schema migration, auto-generated 64-char secret, `consecutive_failures` counter) + `WebhookDelivery` (immutable per-attempt log; `subscription` FK is `SET_NULL` so audit history survives subscription churn). Migration `automation/0002_webhooksubscription_webhookdelivery_and_more.py`.
- **Service** `apps/automation/services/webhook_dispatcher.py` — `dispatch_event(event_type, payload, project_id)` and `sign_payload(secret, body, timestamp)`. Dispatcher is non-blocking, never raises to caller, queues Celery tasks via `transaction.on_commit` so we never queue a task for an unpersisted delivery row.
- **Celery task** `apps/automation/tasks.py:deliver_webhook_task` — HMAC-SHA256 over `f"{timestamp}.{body}"`, exponential backoff retry (`60 * 2^retries`), 4 KB response-body truncation, auto-disable subscription after `WEBHOOK_AUTO_DISABLE_THRESHOLD` (default 20) consecutive failures.
- **ViewSets**: `WebhookSubscriptionViewSet` (CRUD + `test`/`deliveries`/`rotate-secret` actions) + `WebhookDeliveryViewSet` (RO + `redeliver`). Plaintext `secret` revealed exactly twice per subscription: on create and on `rotate-secret`. Mirrors the existing `AgentRegistrationCreateSerializer` API-key pattern.

### Event wiring (4 events, 6 call sites)
| Event | File | Line |
|---|---|---|
| `model.processed` | `apps/models/views.py` | 1581 (IFC `process_complete` callback) |
| `model.processed` | `apps/models/files_views.py` | 362 (DXF/DWG drawing dispatch) |
| `model.processed` | `apps/models/files_views.py` | ~565 (PDF mixed, when ≥1 sheet) |
| `document.processed` | `apps/models/files_views.py` | 417 (DOCX/XLSX/PPTX) |
| `document.processed` | `apps/models/files_views.py` | ~580 (PDF mixed, when ≥1 doc page) |
| `claim.extracted` | `apps/models/files_views.py` | 692 (`_extract_claims_from_documents`, batched per ExtractionRun with all new claim ids) |
| `verification.complete` | `apps/entities/services/verification_engine.py` | 248 (just before `verify_model` returns) |

Every site uses the shared `_fire_event` helper in `files_views.py` (or an inline `try/except` in the IFC view + engine). A dispatcher failure can never break extraction or verification — the wrapping logger.exception is the loud signal.

### Capability manifest + docs
- `/api/capabilities/` gained an `events` block listing wired (4) + planned (`types.classified`, `quantities.extracted`) events, signing scheme (`hmac-sha256`), header names (`X-Webhook-Signature`, `X-Webhook-Timestamp`, `X-Webhook-Event`, `X-Webhook-Delivery-Id`), and the subscription/delivery endpoints.
- `docs/knowledge/API_SURFACE.md` got a Webhooks subsection under Automation: ViewSet table + a complete events reference (firing conditions, payload shapes, signing protocol). Receivers MUST verify the signature and SHOULD reject timestamps outside a tolerance window.

### Settings
- New `WEBHOOK_REQUEST_TIMEOUT_SECONDS=15`, `WEBHOOK_AUTO_DISABLE_THRESHOLD=20`, `WEBHOOK_RESPONSE_BODY_TRUNCATE_BYTES=4096`, `WEBHOOK_MAX_DELIVERY_RETRIES=3` env-driven settings appended to `backend/config/settings.py`.

### Tests
4 new modules + 1 capability-test extension, 38 tests total:
- `test_webhook_subscriptions.py` — CRUD, secret-once-on-create, secret-on-rotate, project filter, event_type filter, unique constraint, test/deliveries/redeliver actions, FK SET_NULL on subscription delete.
- `test_webhook_dispatcher.py` — sign_payload determinism + change-on-secret/body/timestamp; project-scoped + firehose match; inactive subs skipped; non-matching event_type skipped; queue errors swallowed.
- `test_webhook_delivery_task.py` — 2xx success, 4xx retry, 5xx retry, RequestException retry, max-retries finalize, response-body truncation, auto-disable threshold, inactive-subscription short-circuit, signature verification.
- `test_webhook_event_wiring.py` — every chokepoint fires the right event with the right payload (IFC callback, DXF, DOCX, PDF mixed → both events, claim batch, verification engine).
- `test_capabilities.py` extended with one assertion that `events.wired` and `events.planned` contain the right names.

## Technical Details

- **Two-root taxonomy decision** (made during planning): `model.processed` for geometry-bearing files (IFC, DWG, DXF) and `document.processed` for text-bearing files (PDF, DOCX, XLSX, PPTX). Symmetric so QTO agents subscribe to one root, claim agents to the other, no client-side filtering on `format`. The PDF mixed pipeline is the only place where one upload yields two root events — fired iff each extractor produced rows.

- **Free-form `event_type` field**: `CharField(max_length=80)` on `WebhookSubscription` instead of an enum. New events (today's `types.classified`/`quantities.extracted`, tomorrow's whatever) wire in with a single `dispatch_event(...)` call at the new chokepoint. Subscribers can subscribe to a `planned` event today; deliveries start automatically once the producer ships.

- **Signing canonical form**: `f"{timestamp}.{body}"` with body via `json.dumps(payload, sort_keys=True, separators=(',', ':'))`. Sort-keys means receivers can validate against a re-serialized version of the parsed payload. Including the timestamp in the signed message means receivers can reject replays by enforcing a tolerance window — Sprucelab signs with the timestamp; receivers MUST validate.

- **`transaction.on_commit` matters**: dispatcher creates `WebhookDelivery` rows inside `transaction.atomic()` and queues Celery tasks via `transaction.on_commit(...)`. If the parent transaction rolls back (e.g., extraction fails after rows are written but before commit), no orphan tasks fire against rows that don't exist.

- **Test contamination gotcha (NEW LEARNING — see knowledge.md)**: top-level `import apps.models.files_views` in a test module forces DRF's `APIView.authentication_classes` to bind to the *un-overridden* settings before the autouse `_open_permissions` fixture runs. Every later test in the session then 401s, including pre-existing tests in unrelated modules. Cost me ~30 minutes of debugging — printed `WebhookSubscriptionViewSet.authentication_classes` from inside a failing test and saw `[SupabaseAuthentication, SessionAuthentication]` while `api_settings.DEFAULT_AUTHENTICATION_CLASSES=[]`. Fix: defer view-module imports into fixtures/test bodies. Comment in `test_webhook_event_wiring.py` flags this for the next test author.

- **Lazy view imports vs. monkeypatch**: the `test`/`redeliver` action methods do `from .tasks import deliver_webhook_task` lazily, so `monkeypatch.setattr('apps.automation.views.deliver_webhook_task', ...)` doesn't take effect. Instead patch `.delay` directly on the task object: `monkeypatch.setattr(deliver_webhook_task, 'delay', ...)`.

- **`transaction.on_commit` doesn't fire under `@pytest.mark.django_db`** — the test wraps each test in a transaction that's rolled back at end. Added a `fire_on_commit` fixture in `test_webhook_dispatcher.py` that monkeypatches `wd.transaction.on_commit` to invoke the callback inline; tests that need to assert "task would be queued" depend on it.

- **Pre-existing celery retry pattern** at `apps/models/tasks.py:572-623` (`generate_fragments_task`) is the template for `deliver_webhook_task` — same `bind=True` / `self.request.retries` / `countdown=60 * 2**retries` shape.

## Next
- **End-to-end browser smoke** of the full webhook loop (`just dev`, create subscription, upload IFC/PDF, verify, watch a tiny `webhook_listener.py` receive signed events with `X-Webhook-Signature` validating against the captured secret). Still open from the previous session's "Next" list — only meaningful validation left.
- **Frontend webhook UI** — `frontend/src/lib/webhook-types.ts`, `frontend/src/hooks/use-webhooks.ts`, then a Settings page that lists/creates/tests/rotates/deletes subscriptions and surfaces delivery logs. Backend contract is stable; this is a vertical slice.
- **Wire `types.classified`** — cheap follow-up: `TypeMappingViewSet.bulk-update` and the Excel import path are real chokepoints today, advertised in the manifest as `planned`. One `dispatch_event(...)` line each + a wiring test.
- **Idempotency keys** on inbound mutations — complements `dry_run` so agents can retry safely. Independent piece of agent-first hardening.
- **`WebhookDelivery` retention cron** — `WEBHOOK_DELIVERY_RETENTION_DAYS` cleanup task. Punted from this session.
- **TypeBank empirical validation** with real project data — perennial open thread.

## Notes
- The `mapped_at` naive-datetime warning in `test_type_mapping_bulk_update.py` is pre-existing (TypeMapping bulk-update uses `datetime.now()` instead of `timezone.now()`) — surfaced in the test output but not introduced this session. Trivial fix to `apps/entities/views/types.py` if anyone trips over it.
- `WebhookSubscription` also stores its plaintext secret in the DB (rather than an HMAC hash like `AgentRegistration.api_key_hash`) because we *use* the secret to sign outbound deliveries, not just verify inbound credentials. The serializer is what enforces "show once": detail/list reads strip the field; only create + `rotate-secret` actions return it.
- The "Webhooks" doc subsection in `API_SURFACE.md` deliberately documents the receiver's responsibilities (signature verification, replay rejection) — those are out of scope for Sprucelab itself but critical for any subscriber.
- Sprint 6.3 (LLM claim extraction) remains pinned. The webhook system is independent of that work — `claim.extracted` fires the same way whether claims came from the heuristic extractor (today) or an LLM (post-6.3).
