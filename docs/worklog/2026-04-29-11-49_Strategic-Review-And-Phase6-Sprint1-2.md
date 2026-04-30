# Session: Strategic product review + Phase 6 sprints 6.1 & 6.2

## Summary

Three threads, all shipped. (1) A full strategic product review answered "are we
solving the right problems?" — initial framing called the multi-format roadmap
"drift," but the user's reframe sharpened it to *"no dead documents, no orphan
information; every project signal is structured, ownable, agent-addressable. IFC
remains the canonical model exchange; drawings/PDFs/Excel are supporting
decision/data exchange artifacts that today live as dead documents — parse them
and ownership becomes resolvable."* Type-first is a *lens*, not the moat. Layer
1 is the moat. (2) Sprint 6.1 (substrate) shipped: DocumentContent model +
multi-format extractor (PDF/DOCX/XLSX/PPTX) + Django dispatch + DRF API +
universal search. (3) Sprint 6.2 (kill-dead-docs payoff) shipped: Claim model +
heuristic NB+EN normative-statement extractor + promote/reject/supersede
service + DRF API with `?dry_run=true` everywhere. Test count went 45 unit + 5
e2e → **80 unit + 12 e2e** (all green).

## Changes

### Strategic review (`/home/edkjo/.claude/plans/whats-next-jiggly-rainbow.md`)

- Multi-agent research (PRD/roadmap, backend reality, frontend reality)
- Critical report with TL;DR, where-thesis-holds, where-thesis-fragile, five
  tensions, recommended pivots, sourcing index
- Two reframe iterations after user feedback: (a) multi-format = ownership
  reclamation, not scope creep; (b) type-first is a perspective shift inside
  the BIM scope, not the product. Layer 1 quality is the operating focus.
- Locked-in Sprint 6.1 → 6.2 sequencing inside Phase 6

### Sprint 6.1 — Substrate (Phase 6, Document extraction)

**New files:**
- `backend/apps/entities/models/documents.py` — `DocumentContent` model
- `backend/apps/entities/migrations/0036_add_document_content.py`
- `backend/ifc-service/services/document_extractor.py` — PDF (pymupdf
  text-layer → markdown w/ heading detection via font-size proxy), DOCX
  (python-docx → markdown preserving headings/lists/tables), XLSX (openpyxl
  → typed JSON with date-as-ISO), PPTX (python-pptx → per-slide markdown)
- `backend/ifc-service/api/documents.py` — `POST /api/v1/documents/extract`
- `backend/apps/entities/views/documents.py` — `DocumentContentViewSet`
- `tests/fixtures/document_factory.py` — bilingual NB+EN PDF/DOCX/XLSX/PPTX
  builders
- `tests/unit/test_document_extractor.py` — 10 tests
- `tests/e2e/test_document_pipeline.py` — 5 tests

**Modified:**
- `backend/ifc-service/requirements.txt` — added `python-docx>=1.0.0` and
  `python-pptx>=1.0.0` (pymupdf + openpyxl already present from Phase 5)
- `backend/apps/models/services/fastapi_client.py` — added `extract_document`
- `backend/apps/models/files_views.py` — new `_dispatch_document_extraction`
  for DOCX/XLSX/PPTX and `_dispatch_pdf_extraction` that runs both drawing +
  document extractors over the same PDF and merges into one ExtractionRun
- `backend/apps/projects/views.py` — new `search` action on `ProjectViewSet`
  exposing `GET /api/projects/{id}/search/?q=&format=&scope=`
- `backend/apps/entities/serializers.py` — `DocumentContentSerializer` (full)
  + `DocumentContentListSerializer` (lightweight, char_count only)
- `backend/apps/entities/urls.py` — registered `documents/` route
- `backend/apps/entities/models/__init__.py` — re-export `DocumentContent`
- `tests/conftest.py` — fixtures `sample_pdf_document_path`, `sample_docx_path`,
  `sample_xlsx_path`, `sample_pptx_path`, `sample_pdf_doc_and_drawing_path`

### Sprint 6.2 — Claim/ownership layer

**New files:**
- `backend/apps/entities/models/claims.py` — `Claim` model with provenance
  (source_file, document, extraction_run, scope, source_location), structured
  normalization JSON (predicate, subject, value, units, lang), state machine
  (unresolved → promoted/rejected/superseded), full audit (decided_by,
  decided_at, rejected_reason, superseded_by self-FK, promoted_to_config +
  config_section + config_payload)
- `backend/apps/entities/migrations/0037_add_claims.py`
- `backend/ifc-service/services/claim_extractor.py` — heuristic extractor with
  NB+EN normative verbs, four predicate patterns (fire-resistance class,
  flow rate L/s, U-value W/m²K, acoustic dB), value+unit triples required,
  past-tense rejection branch, char-offset source locations, confidence
  calibration (0.85 baseline, 0.92 with strong subject, −0.05 when value
  precedes verb)
- `backend/ifc-service/api/claims.py` — `POST /api/v1/claims/extract`
- `backend/apps/entities/services/claim_promotion.py` — `promote_claim`,
  `reject_claim`, `supersede_claim`, `find_conflicts`. Promotion appends to
  `ProjectConfig.config['claim_derived_rules']` (an append-only list of
  entries each tagged with `_claim_id`/`_promoted_at`/`_normalized` so a JSON
  consumer can cross-reference). State-machine errors raise `ClaimStateError`.
- `backend/apps/entities/views/claims.py` — `ClaimViewSet` with list/detail
  + promote/reject/supersede/conflicts actions, all mutations support
  `?dry_run=true`
- `tests/unit/test_claim_extractor.py` — 12 tests
- `tests/unit/test_claim_promotion.py` — 13 tests
- `tests/e2e/test_claim_pipeline.py` — 2 tests

**Modified:**
- `backend/ifc-service/api/router.py` — wired `claims_router` and
  `documents_router`
- `backend/ifc-service/models/schemas.py` — `DocumentExtract*` and
  `ClaimExtract*` schemas
- `backend/apps/models/services/fastapi_client.py` — added `extract_claims`
- `backend/apps/models/files_views.py` — `_persist_document_payloads` now
  returns the persisted DocumentContent list; new
  `_extract_claims_from_documents` runs after document persist (failure-
  isolated — claim-extractor errors don't fail the run); claim count rolls
  into `ExtractionRun.quality_report['claim_count']`
- `backend/apps/entities/serializers.py` — `ClaimSerializer` +
  `ClaimListSerializer`
- `backend/apps/entities/urls.py` — registered `claims/` route
- `backend/apps/entities/models/__init__.py` — re-export `Claim`
- `tests/conftest.py` — added `sample_pdf_claim_corpus_path` fixture; extended
  `_open_permissions` autouse to also disable DRF throttling so the e2e suite
  doesn't trip the 60/min anon rate limit

## Technical Details

### Three notable design calls in 6.2

1. **Promotion writes to JSON config, not a parallel rules table.**
   ProjectConfig is one big JSON blob. Introducing a separate
   `ProjectConfigRule` table just for claim-derived rules would split source
   of truth. Instead, claim-derived rules go into
   `config['claim_derived_rules']` as an append-only list, each entry tagged
   with `_claim_id`. Provenance is queryable from both sides — Claim has
   `promoted_to_config` FK + `config_payload`, and a JSON consumer can read
   `_claim_id` from any rule entry.

2. **Dry-run is fully read-only.** Earlier iteration created the active
   ProjectConfig row eagerly in `_resolve_active_config`, which made
   `dry_run=true` non-idempotent — calling it on a project with no config
   would persist a new config row even though the user only asked for a
   preview. Fixed: `_resolve_active_config(allow_create=False)` returns
   `None` for dry-runs and the function synthesizes an in-memory preview via
   a tiny stub object that satisfies the `_next_config_state` contract.

3. **DRF throttling disabled in tests.** Prod ships 60/min anon + 600/min
   user. Phase 6 added enough internal traffic per test (uploads + polls +
   claim API hits) to trip it once enough tests ran in one session. Disabled
   in the same `_open_permissions` autouse fixture that already bypasses
   auth — throttle correctness is a separate concern.

### Sentence splitter — variable-width lookbehind not supported in stdlib re

First version of the claim extractor's sentence splitter used
`re.split(r"(?:\n+|(?<=^|\n)\s*[-*]\s+)", markdown)` with a variable-width
lookbehind. Python's stdlib `re` rejects that with
`re.error: look-behind requires fixed-width pattern`. Fixed by walking line
by line, stripping markdown decorations per line via a separate prefix-
matching regex, and tracking the prefix length so char offsets back to the
original markdown stay accurate.

### PDF document fixture density tuning

pymupdf's `insert_textbox` returns negative when text overflows the box and
silently writes nothing. First fixture overshot at 24000 chars in 760 pt of
height and produced an "empty" PDF that classified as a drawing
(0.0003 chars/mm² density). Settled on ~25 repetitions of a 240-char
bilingual sentence ≈ 6000 chars / 62370 mm² ≈ 0.096 chars/mm² — comfortably
above the 0.05 cutoff in `_looks_like_document_page` and well below
overflow. Same density math as Phase 5's `build_pdf_a4_document`.

### `?as=` instead of `?format=` on /content/

The `DocumentContentViewSet.content` action uses a query param to select
the response shape. DRF reserves `?format=...` for content-negotiation
suffix renderer selection — a `?format=markdown` request finds no renderer
named "markdown" and returns 404 instead of dispatching to the action.
Switched to `?as=markdown|json` so the content selector and DRF's renderer
negotiation don't collide.

### Past-tense rejection in claim extractor

A sentence with a normative verb but past-tense markers ("walls were REI60
historically", "had been at least 7 l/s in 2010") is descriptive, not
normative. The extractor rejects on a separate regex
`\b(?:was|were|had been|has been|var|hadde|tidligere)\b` BEFORE testing the
normative-verb anchor. Tests assert this branch on bilingual examples.

## Next

- **Verification engine promotion** is the recommended next move (Decision
  Point #1 from the plan). Wire rule-as-data into
  `processing_orchestrator._finalize_extraction_run` so promoted claim-
  derived rules become live verification rules on the next IFC upload. This
  is what closes the loop: PDF spec → Claim → ProjectConfig rule → enforced
  on every IFC. Without it, promoted claims sit inert and Phase 6's strategic
  payoff is only half-delivered.
- **Sprint 6.3 (LLM claim extraction) is PINNED.** Explicitly deferred at end
  of session. Plan-doc condition for unpinning: real inbox-quality data from
  uploaded specs showing heuristics under-extract enough to justify token
  spend, *plus* explicit cost/policy approval. Hooks are in place — adding
  the LLM pass later is a one-file change to `claim_extractor.py` plus a
  per-project flag. No schema migration, no API redesign. Pinning costs
  nothing.
- **Agent-first hardening** (Decision Point #4): `dry_run` on the other
  mutation endpoints (claims already have it; documents/drawings/types
  don't), idempotency keys, webhooks (`model.processed`,
  `types.classified`, `verification.complete`, `claim.extracted`),
  capability manifest endpoint, machine-readable error codes. Can run
  parallel to verification-engine work.
- **Frontend bridge (minimum):** claim inbox is the cheapest start (API-only
  today, just a list + promote/reject buttons), then drawings list page,
  then verification result panel. Pressure-test on Layer 1; "shallow, throw
  away later."
- **TypeBank empirical validation:** still outstanding, two real projects
  through the reuse loop. Not Phase 6 territory but flagged as the highest-
  information experiment available.

## Notes

- **Test count:** 45 unit + 5 e2e (start of session) → 55 + 10 (after 6.1) →
  **80 + 12 (after 6.2).** Zero regressions on Phase 5 tests.
- **Strategic plan file** at `~/.claude/plans/whats-next-jiggly-rainbow.md`
  has the full review + reframe + Sprint 6.1/6.2 design history. Worth
  reading at the start of next session for context, especially the Reframe
  block that sharpened thesis from "type intelligence is the moat" to
  "Layer 1 (no dead docs) is the moat; type-first is the lens."
- **Phase 6 is functionally complete on the kill-dead-docs slice.** Sprint 6.3
  is purely a recall lift — the substrate + ownership layer + dry-run agent
  surface all ship green. **Sprint 6.3 is explicitly pinned** (see Next
  block) — do not start without real inbox-quality data + cost approval.
- **`run.quality_report['claim_count']`** is the single dashboard signal
  exposing inbox loudness per upload. Future inbox UI can drive directly off
  this without join queries.
- The user explicitly approved Auto Mode for the implementation phases —
  worklog/handoff is the natural pause point.
