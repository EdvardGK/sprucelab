# Session: Verification engine consumes claim-derived rules

## Summary

Closed the Phase 6 strategic loop: promoted Claims now act as enforced
verification rules on the next `/verify/` call. Before this session, claim
promotion wrote entries into `ProjectConfig.config['claim_derived_rules']`
that **nothing read** — the strategic payoff of "no dead documents" was only
half-delivered. This session added a pure-Python translator from Claim's
`normalized` form to engine-shape rules, wired it into `promote_claim`, and
extended `VerificationEngine._load_rules` + `_check_rule` to consume the
result. Test count went 92 → 117 (105 unit + 12 e2e), zero regressions.

## Changes

### NEW `backend/apps/entities/services/claim_rule_translator.py`

Pure module, no Django imports. One public function
`translate_claim_to_rule(claim_id, normalized, statement) -> dict | None`.
Maps four predicates to engine-shape rules: `fire_resistance_class`,
`acoustic_db`, `u_value`, `dimension`. `flow_rate` and `pressure` are
deferred (would need project-scoped one-emit-per-model plumbing). Unknown
predicates and missing/`(unspecified)` subjects return `None` — the
promotion still succeeds, but writes a no-`check` entry that the engine
skips silently. Subject regex is `re.escape`d and word-bounded.

### EDIT `backend/apps/entities/services/claim_promotion.py:126`

When `rule_payload` is None, calls the translator on `claim.normalized` +
`claim.statement`. Empty translation falls through to an empty payload —
the audit metadata (`_claim_id`, `_normalized`, `_statement`,
`_promoted_at`) still attaches via `_build_rule_entry`, so a future
translator can revisit the claim without losing data. Explicit
`rule_payload` continues to bypass the translator (operator overrides).

### EDIT `backend/apps/entities/services/verification_engine.py`

`_load_rules` now merges three sources in order:
`DEFAULT_RULES` → `config['claim_derived_rules']` → `config['verification']['rules']`.
Last merge wins on `id` collision — operator-authored rules beat both
defaults and claim rules. Entries in `claim_derived_rules` without a
`check` key are skipped silently with no log noise. A new helper
`_merge_rules` extracts the last-wins logic.

`_check_rule` got a fifth check type `claim_subject_match`. Compiles
`subject_pattern`, runs `re.search` against `getattr(target, subject_field, '')`
(default `type_name`), emits a `VerificationIssue` with severity from
the rule and message `"Claim applies: <value> <units> — <statement>"`.
Statement gets truncated to 120 chars to keep issue payloads bounded.
Bad regex returns `None` (no engine crash on malformed promoted data).

### Tests

- **NEW** `tests/unit/test_claim_rule_translator.py` (12) — happy path per
  predicate, deferred predicates → None, unknown predicate → None, empty
  subject → None, escaped-special-char subject regex compiles and matches.
- **NEW** `tests/unit/test_verification_engine.py` (11) — `_load_rules`
  merges claim rules, strips `_`-prefixed audit keys, skips no-`check`
  entries, operator override wins on collision; `_check_rule`
  `claim_subject_match` hits/misses, case-insensitive, truncates long
  statements, handles bad regex gracefully.
- **EDIT** `tests/unit/test_claim_promotion.py` — two existing assertions
  updated to reflect that no-payload promotions now write engine-shape
  entries (`check`, `claim_value`) instead of raw normalized form
  (`predicate`, `value`). The raw form survives in `_normalized`. New
  tests for unknown-predicate fallback and explicit `rule_payload` override.
- **EDIT** `tests/e2e/test_claim_pipeline.py` — Step 8 added: synthesizes
  a `Model` + two `IFCType`s programmatically (one matching the claim
  subject, one not), POSTs to `/api/types/types/verify/?model=<id>`,
  asserts `claim:<id>` is in `rules_applied` and an info-severity issue
  surfaces only on the matching type.

## Technical Details

### Three design calls

1. **Pre-translate at promotion, not at load time.** Putting the
   translator inside `promote_claim` means errors are visible to the
   user at decision time. Doing it at `_load_rules` would silently
   re-translate every promoted claim on every `/verify/` call and
   swallow malformed predicates inside the engine's blanket try/except —
   the worst possible failure mode for a rule loop.

2. **Unknown predicates promote successfully.** The plan agent
   recommended raising `ClaimStateError` (HTTP 422) for predicates
   outside the translator table. Softened to "write entry without
   `check` key, engine skips" so Sprint 6.3 (LLM extraction) doesn't
   need API surgery — the LLM may emit predicates we haven't hand-coded
   yet, and forcing a 422 would block experimentation.

3. **Operator override wins.** Merge order is defaults → claim → custom.
   Last-wins means an operator can author a rule with id `claim:<uuid>`
   in `verification.rules` to fully override what the translator wrote.
   This keeps the human in control without requiring claim
   re-promotion.

### Subject regex caveat

`re.escape("fire walls")` returns `'fire\\ walls'` in Python 3.11 — the
space gets escaped despite `re.escape` docs implying only special chars
get escaped. Doesn't affect matching (escaped space matches literal
space), but the test assertion that string-searched the pattern had to
be flipped to compile-and-match instead.

### Verify endpoint URL gotcha

`/api/types/verify/` returns 404. Correct URL is
`/api/types/types/verify/?model=<id>`. Double-`types` is because
`IFCTypeViewSet` is registered at basename `r'types'` under app mount
`/api/types/`. Discovered via the e2e test on the first run. Logged in
project memory.

### Test count math

Pre-session: 80 unit + 12 e2e = 92. Added 12 (translator) + 11
(verification engine) + 2 (promotion edits) = 25 new unit tests. 92 +
25 = 117 ✓.

## Next

- **Frontend bridge — claim inbox** is the cheapest visible move now
  that the loop is closed. List unresolved claims, expose
  promote/reject/supersede + the verify result panel. Replaces the
  `ProjectDocuments.tsx` placeholder. Greenfield: zero claim hooks
  today, no inbox idiom in the frontend yet.
- **Agent-first hardening** is still on the table for parallel work:
  `dry_run` on documents/types/files, idempotency keys, webhooks
  (`model.processed`, `claim.extracted`, `verification.complete`),
  capability manifest endpoint, machine-readable error codes.
- **TypeBank empirical validation** still outstanding — two real
  projects through the reuse loop, highest-information experiment
  available.
- **Sprint 6.3 (LLM claim extraction) stays PINNED.** Hooks are now
  fully in place: translator skips unknown predicates without error,
  so dropping in an LLM pass that emits new predicate types won't
  break anything.

## Notes

- **Plan file**: `~/.claude/plans/lets-pick-up-from-curried-pancake.md`
  has the full design walk-through and risk callouts. Worth a re-read
  if returning to this area.
- **Project memory** updated: `data-foundation-status.md` now records
  the verification wiring + verify endpoint URL gotcha;
  `MEMORY.md` index bumped to 105 unit + 12 e2e green.
- **Test count milestone**: 117 tests in ~40s. The unit suite alone
  finishes in ~10s — fast enough to run on save in a watch mode if we
  ever want one.
- **Health score semantics unchanged**: claim rules emit info severity
  only, so a type with a claim issue but no errors/warnings still
  passes. This was the right call — claims surface obligations, they
  don't fail types until the operator has a chance to author a real
  enforcement rule.
- The user explicitly chose "read-only at verify-time" as the trigger
  model — we do NOT auto-fire verification on IFC upload. Smallest
  blast radius, easiest to reason about. An auto-fire flag remains a
  later option (configurable per-project).
