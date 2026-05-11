# Session continuation: agent-first hinge + observation log CLI

Continues from `2026-05-11-12-23_Observation-Log-PR1-Plus-409-Cleanup.md`.
That worklog covered the duplicate-upload 409→200 fix and Observation
Log PR 1. This continuation covers the agent-first reframe that
followed and the CLI plumbing it produced.

## What shipped

| Commit | Title | Visible? |
|--------|-------|----------|
| `b8b95dd` | agent-first PR A: agent tokens unlock the full REST surface | Agents reach the broad REST surface; `spruce capabilities` prints the elevator pitch |
| `d1136f8` | agent-first PR A.1: unify CLI token resolution; trim aspirational examples | Single source of truth for token resolution; `spruce capabilities` no longer advertises commands that don't exist |
| `5dec6cd` | agent-first PR C: spruce log list — drill the observation log from the CLI | Agents can drill 3,138 prod observations from the terminal |

PR B (`spruce files`) was scoped but explicitly deferred to a focused
agent-surface session.

## Strategic reframe (the reason the work shape changed)

User pushed three sharpening framings, each commiting to a sharper
mental model. Memory captured in
`feedback-agent-first-or-die.md` (indexed in MEMORY.md).

1. **"We have to plan for agentic use. Any app today that is human
   only will get killed by agentic developments."**
2. **"Sprucelab needs to be both a platform and a tool for agents."**
3. **"Agents need to find it easier to just go to sprucelab than to
   write manual scripts or use other platforms. The ideal outcome is
   that agents become our marketing channel and product discovery
   happens organically through being the best agentic tool. Agents
   drift to us no matter what the human knows about sprucelab."**

The shift from "agent-first" to "platform AND tool for agents"
changes design implications:
- **Platform mode** optimizes for stable typed contracts, plugin
  points, OpenAPI export, webhooks, embed-token surface.
- **Tool mode** optimizes for low-ceremony composable verbs, good
  defaults, structured output for piping, copy-paste recipes.
- Both must be optimized at once. The browser UI is one consumer of
  the same primitives — not the canonical surface.

The commercial thesis: agents recommend Sprucelab to other agents;
the user adopts it because their agent already does. So the agent
experience IS the marketing. `spruce capabilities` becomes the
elevator pitch, not just a manifest.

## PR A — agent tokens unlock the broad REST surface

The hinge. Before this, the only agent token in the system (`AgentRegistration.api_key_hash`)
was scoped to `/api/automation/agent/*`. Everything else (the
observations endpoint we just shipped, types, files, scopes, configs,
verification) required Django session auth. Net: an agent with a
token would 401 on every interesting endpoint.

### Backend
- `AgentRegistration.scope` enum (`read_only` | `operator` | `admin`,
  default `operator`). Migration `0003_agentregistration_scope`.
- New `config.authentication.AgentTokenAuthentication`: reads
  `Authorization: Bearer <key>`, hashes with SHA-256, looks up
  `AgentRegistration`, returns `(synthetic_user, agent_registration)`.
  JWT-shaped tokens (starting `eyJ`) are skipped so
  `SupabaseAuthentication` still gets a chance.
- Synthetic Django user per agent
  (`agent-<uuid>@sprucelab.local`) with an auto-approved
  `UserProfile`. Keeps framework features (audit fields, admin)
  working without special-casing agent requests.
- `IsApprovedUser` permission extended: when `request.auth` is an
  `AgentRegistration`, gate by scope vs HTTP method + path.
  - `read_only` → GET/HEAD/OPTIONS only.
  - `operator` → read + write on data resources; blocked from
    admin-only paths (`/api/auth/*`, `/api/automation/agent/register/`).
  - `admin` → everything.
  Browser sessions retain the original `UserProfile.approval_status`
  check unchanged.
- Wired into `DEFAULT_AUTHENTICATION_CLASSES` ahead of
  `SupabaseAuthentication`. JWT-shaped tokens still fall through
  cleanly.

### Bootstrap
- `python manage.py create_agent --name X --scope admin [--json]`
  mints a one-time-shown API key. Bootstrap path while the in-app
  token management UI doesn't exist yet.

### CLI
- `spruce capabilities` — wraps the public
  `/api/capabilities/` endpoint. Human mode prints a scannable
  pitch (file formats, dry_run-supporting mutations, events,
  verification, embed surface) PLUS worked-example command
  sequences. `--json` for machine consumption.
- `spruce auth register --token <KEY> --url <URL>` — manual config
  path that saves a pre-minted token. Backward-compat with the
  existing register-mints-new-token flow.
- `spruce auth status` — verifies the token works by hitting
  `/api/types/observations/`, reports the precise next step on
  failure.

### Tests
- 9 backend tests covering the bearer-token path:
  authentication, scope gating, fall-through behavior, JWT
  skipping, inactive tokens, last_seen_at bumping, management
  command.
- 4 CLI tests for `spruce capabilities`: human mode shows pitch
  + worked examples, JSON mode is pure JSON, connection error
  surfaces actionable hint, HTTP error shows status + body.

Net: backend 320 → 329, CLI 49 → 53.

## PR A.1 — auth-unification (dogfooding fix)

Pure dogfooding outcome. After PR A landed I configured the CLI
against prod with the new token, ran `spruce models list`, got 403.
The CLI had two auth paths in production:
- `spruce auth register` saves to **keyring**.
- `spruce models`, `verify`, `types`, `scripts`, `embed`, `webhooks`
  read **`$SPRUCELAB_ADMIN_TOKEN`**.

So the token was saved but unreachable. Fix:
- New `cli/spruce/_auth.py` with single `resolve_token(override)`
  helper. Resolution order: `--token` flag > env var > keyring > None.
  Backward-compat with CI flows that set the env var.
- Six command modules delegated to the shared resolver via one-line
  re-exports.
- CLI test conftest pins `spruce.config.get_api_key` to None so
  tests behave identically regardless of whether the developer's
  keyring holds a real token.

Same commit trimmed `WORKED_EXAMPLES` in `spruce capabilities` to
commands that actually exist. The elevator pitch can never promise
unshipped commands.

## PR C — `spruce log list`

Closes the observation log surface. Endpoint + backfill + per-drawing
UI tab landed earlier; this is the missing CLI verb. Without it the
`spruce capabilities` pitch referenced a command that didn't exist.

- `cli/spruce/log.py` — Typer app wrapping
  `GET /api/types/observations/`. Filters mirror backend query
  params one-to-one: `--source-file`, `--sheet`, `--extraction-run`,
  `--project`, `--category` (CSV), `--search`, `--page-index`,
  `--limit`. Default Rich table, `--json` for piping, "+N more"
  hint when the server has more than we showed.
- Category validation matches the backend
  `OBSERVATION_CATEGORY_CHOICES` list; unknown values exit 2 with
  the allowed set printed.
- Wired in `cli/spruce/cli.py` as `spruce log`.

Verified against production:
- 3,138 observations queryable end-to-end.
- 1,487 layer observations in the G55 project's DXF.
- **0 title_block_field observations** across the dataset —
  confirms drawings need either a `TitleBlockTemplate` per project
  or the heuristic title-block scan discussed earlier in the
  session. Logged as follow-up.

Tests: +10 (53 → 63).

## Verification (end-to-end on `5dec6cd`)

| Surface | Status |
|---------|--------|
| Backend pytest | 329/329 passed (no backend changes in PR A.1/C) |
| CLI pytest | 63/63 passed + 4 skipped (live) |
| Frontend `tsc --noEmit` | clean (no FE changes in this batch) |

## Verification (post-push, all on `5dec6cd`)

(Poll in progress; final state appended once deploys settle.)

## Dogfooding signal

The PR A → PR A.1 → PR C arc happened because the user said "set me
up with the same CLI access agents will use, so you can test more
directly." Within minutes of configuring the CLI:
- Surfaced the dual-auth-path defect (PR A.1).
- Surfaced that the `spruce capabilities` pitch referenced
  unshipped commands (PR A.1).
- Surfaced that 0 title-block-field observations exist in the
  current data (next-PR follow-up).

None of these were caught by tests. The agent dogfooding loop
caught all of them in five minutes. This validates the framing:
when the assistant is also a CLI consumer, the agent surface
improves by feedback, not by guesswork.

## Open follow-ups for next session

1. **Phase 3 — Type page v2.** Deferred FIVE consecutive sessions
   now. Needs a dedicated session, not a parallel track. Memory
   `feedback-frontend-first-until-app-feels-real` plus
   `feedback-coordinator-rounds-ship-invisible-work` both point
   here.
2. **Heuristic title-block scan** for PDF drawings. User confirmed
   "PDF is the working-drawing standard, DWG/DXF are design-phase."
   PyMuPDF (already in deps) can pull title-block region text,
   page metadata, OCG layers, annotations. Scope: backend
   extractor extension, no API surface change. Would 10× the
   observation count on real drawings.
3. **PR B — `spruce files`**: upload/download/show/reprocess/
   versions. Removes the "open the browser to upload a model"
   friction.
4. **PR A.2 — dogfooding nits**:
   - `spruce models list` (no `--json`) returned raw JSON — table
     should be default.
   - `spruce verify` output looks human-prose-ish; should clean up
     under `--json`.
   - `health_score: 0.0` reporting should reframe per memory
     `feedback-iso19650-requirement-fulfillment` ("0/N
     requirements fulfilled" instead of a 0-1 score).
5. **`spruce files diff <id1> <id2>`** — cross-version diff over
   metadata + observations. Depends on PR B.
6. **Observation Log PR 2** — drawing extractor invokes
   `claim_extractor` over text blocks; emitted Claims carry an
   `origin_observation` FK back to the log row. Inbox shows
   drawing-derived claims.
7. **`/.well-known/agent-tools.json` + `llms.txt`** — agent
   discovery surface beyond `/api/capabilities/`. Tiny PR; per
   memory `feedback-agent-first-or-die`. Could ride alongside any
   of the above.

## Tone note

User explicitly delegated prioritization for this batch ("you
prioritize and coordinate") after the session-long pattern of
back-and-forth proposals. The assistant picked PR C as the smallest
loop-closer for today's work and called the session there rather
than extending further. This honors the memory rule:
*one focused visible PR per session, then wrap up cleanly.* The
arc PR A → PR A.1 → PR C is three commits but a single coherent
chunk of work with one clean stopping point.
