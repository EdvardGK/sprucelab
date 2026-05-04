# Agent Workflows for Sprucelab

**Purpose:** This document is loaded into every Claude session working on sprucelab.
It describes how to interact with the project effectively, what tooling is available,
what's safe to do, what's dangerous, and what patterns to follow when building new
features.

**Sprucelab is being built as an agent-first platform.** Every user operation should
have a CLI/API equivalent. Every mutation should be dry-runnable and reversible.
Every change should leave a trace. This document is the operating manual for that
philosophy.

---

## Core principles

1. **Fail loudly, never silently.** If something is wrong, surface it. Don't mock
   data, don't return empty defaults, don't hide errors.
2. **Dry-run is the default.** Every new mutating operation (command, endpoint, CLI)
   ships with `--dry-run`. Commit only after confirming the plan.
3. **Reversible by default.** Mutations leave a trace. Tag rows, record operations,
   make undo trivial. The seed command's `notes='__claude_seed__'` + `--clear` flag
   is the reference pattern.
4. **Intent is declared.** Before a write, the agent (or user) declares the purpose.
   That intent is part of the audit trail.
5. **Local dev shares production data today.** `.env.local` points at the Supabase
   production pooler. Every write affects real users. Future sessions should help
   migrate to an isolated local Postgres — until then, treat all mutations as
   production mutations.

---

## Environment map

```
/home/edkjo/dev/sidehustles/sprucelab/
├── backend/                       # Django (+ FastAPI microservice)
│   ├── manage.py                  # Django entry
│   ├── .env.local                 # DB + Supabase config (local=prod)
│   ├── apps/
│   │   ├── accounts/              # User profiles, approval
│   │   ├── projects/              # Projects (2 in prod: G55, test)
│   │   ├── models/                # IFC Model management + upload
│   │   ├── entities/              # IFCType, TypeMapping, TypeDefinitionLayer, Material
│   │   ├── warehouse/             # Type classification
│   │   ├── field/                 # TEK17 / NS compliance checklists (NOT install tracking)
│   │   ├── bep/                   # BEP / EIR configs
│   │   └── ...
│   └── ifc-service/               # FastAPI microservice for IFC parsing
│       ├── services/
│       │   ├── ifc_parser.py      # Type + material extraction
│       │   ├── processing_orchestrator.py  # Drives the parse pipeline
│       │   └── ...
│       └── repositories/
│           └── ifc_repository.py  # Direct asyncpg writes to Postgres
├── frontend/                      # Vite + React + TypeScript + shadcn
│   ├── src/
│   │   ├── components/features/   # Feature-scoped components
│   │   ├── hooks/                 # React Query hooks for API
│   │   ├── lib/                   # Shared utilities (material-families.ts, api-client.ts)
│   │   ├── pages/                 # Route-level components
│   │   └── i18n/locales/          # en.json + nb.json (Norwegian primary)
│   ├── tests/e2e/                 # Playwright E2E tests
│   ├── playwright.config.ts
│   └── package.json
└── docs/
    ├── plans/                     # Timestamped planning docs
    ├── worklog/                   # Session logs
    ├── knowledge/                 # Long-lived reference material (this doc)
    ├── research/                  # Investigation notes
    └── todos/                     # Task lists
```

---

## Common operations

### Query the database (read-only, safe)

```bash
cd backend
python manage.py shell -c "
from apps.entities.models import IFCType, TypeDefinitionLayer
print(IFCType.objects.count())
print(TypeDefinitionLayer.objects.count())
"
```

Or `python manage.py dbshell` for raw psql against the Supabase pooler.

### List projects / models / type counts

```bash
python manage.py shell -c "
from apps.projects.models import Project
from django.db.models import Count
for p in Project.objects.annotate(
    type_count=Count('models__types', distinct=True),
).order_by('-type_count'):
    print(f'{p.id} {p.name} — {p.type_count} types')
"
```

### Start local dev servers

```bash
# Terminal 1 — Django
cd backend && python manage.py runserver 8000

# Terminal 2 — FastAPI IFC service
cd backend/ifc-service && conda run -n sprucelab uvicorn main:app --port 8100

# Terminal 3 — Vite
cd frontend && yarn dev
```

Or run Playwright tests, which auto-starts Vite via the `webServer` config.

### Seed test data for the Materials Browser

```bash
cd backend
python manage.py seed_type_definition_layers --project 4d9eb7fe-852f-4722-9202-9039bfbfb0d9 --dry-run
python manage.py seed_type_definition_layers --project 4d9eb7fe-852f-4722-9202-9039bfbfb0d9           # commit
python manage.py seed_type_definition_layers --project 4d9eb7fe-852f-4722-9202-9039bfbfb0d9 --clear   # reversal
```

Writes 3033 TypeDefinitionLayer rows + 2214 TypeMappings into G55, all tagged
`notes='__claude_seed__'`. Reference implementation for dry-runnable, reversible,
tagged mutations.

### Reprocess a model

```bash
curl -X POST -H "Authorization: Bearer <jwt>" \
  http://localhost:8000/api/models/<model-id>/reprocess/
```

Triggers FastAPI `/api/v1/ifc/reprocess`. Deletes existing parsed data + re-runs
the parser. **Reprocessing does NOT currently populate TypeDefinitionLayer** —
see "Known gaps" below.

### Run E2E tests

```bash
cd frontend

# One-time machine setup (creates .env.playwright.local from template)
cp .env.playwright.example .env.playwright.local
# Edit with your real sprucelab credentials

# Capture auth state (one-time per browser session)
yarn test:e2e:setup

# Run tests
yarn test:e2e                  # all
yarn test:e2e smoke            # public smoke only (no auth needed)
yarn test:e2e materials        # materials browser (auth + seeded data required)
yarn test:e2e --headed         # watch it work
yarn test:e2e --ui             # interactive UI mode
yarn test:e2e:report           # open HTML report
```

Smoke tests are always runnable. Authenticated tests skip gracefully if
`.auth/user.json` is missing.

### Check the git state

```bash
git branch --show-current       # should be 'dev' during development
git status --short
git log --oneline -10
```

**Branching:** `dev` for daily work, `main` for production. Auto-sync commits to
`dev` on every Edit/Write. `main` deploys to Railway (Django + FastAPI) and
Vercel (frontend) on push. Promotion: `git checkout main && git merge dev &&
git push origin main`.

---

## Reference patterns

### Mutation command template

Every management command that writes data should follow this shape
(`backend/apps/entities/management/commands/seed_type_definition_layers.py`
is the canonical example):

```python
class Command(BaseCommand):
    help = "..."

    def add_arguments(self, parser):
        parser.add_argument("--project", required=True)
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--clear", action="store_true")
        parser.add_argument("--limit", type=int, default=None)

    def handle(self, *args, **options):
        if options["clear"]:
            self._handle_clear(...)
            return
        self._handle_seed(...)

    def _handle_seed(self, ...):
        # 1. Fetch data
        # 2. Build plan
        # 3. Print plan
        if options["dry_run"]:
            print("[dry-run] No changes written.")
            return
        # 4. Commit inside transaction.atomic()
        #    - Tag every row with a distinctive marker (notes='__claude_seed__')
        # 5. Print summary
```

**Required properties:**
- `--dry-run` — prints the plan, writes nothing
- `--clear` — removes all rows matching the tag
- **Transaction-wrapped writes** — atomic commit or full rollback
- **Distinctive tag** on every created row so `--clear` is unambiguous
- **Printed plan before writes** — user sees the blast radius

### New API endpoint checklist

For Django REST endpoints:
- Permission class is `IsApprovedUser` by default (in `config.authentication`)
- Paginated list responses use DRF's default pagination (`{count, next, previous, results}`)
- Frontend consumers must use `response.data.results`, not `response.data`
- For mutating endpoints: consider if `?dry_run=true` makes sense
- Return translation keys (not translated strings) in error messages; frontend does the translation

For FastAPI endpoints:
- Protected by `IFC_SERVICE_API_KEY` for internal calls; protected by Supabase JWT
  for browser calls (via the same auth middleware as Django once that lands)
- Direct asyncpg writes via `repositories/ifc_repository.py`

### New frontend component checklist

- Uses `useTranslation()` — never hardcode user-facing strings
- Add keys to BOTH `en.json` AND `nb.json` (Norwegian is primary)
- Uses `clamp()` for text/spacing/icons (dashboard convention)
- `useQuery` for reads, `useMutation` for writes (React Query)
- Error states render inline, never log-and-continue
- Loading states for every async resource
- Typed props + typed hook returns

---

## Known gaps and architectural notes

These are important context that will surprise you if you don't know them.

### 1. `TypeDefinitionLayer` is not populated by the parser

Despite the parser having logic to read `IfcMaterialLayerSet`/`IfcMaterialLayerSetUsage`
(`ifc_parser.py:836-847`), it only extracts the *first material name* as a string.
It never writes per-type layer rows. This means:

- The Materials Browser shows empty state for every real project
- The Type Browser's material layer editor only shows manually-entered data
- Any feature that depends on layer data (LCA, waste, balance sheet, passports)
  has no data to work from

**Workaround:** `python manage.py seed_type_definition_layers` creates synthetic
layers for testing. Real fix: extend the parser to write `TypeLayerData` →
`TypeDefinitionLayer` during parse. Planning details in task #18 of the current
TaskList.

### 2. Field module is NOT install tracking

`backend/apps/field/models.py` is a TEK17 / NS compliance checklist system
(CheckItem, Checklist, ChecklistTemplate). It verifies handover documents against
regulations. It does NOT track which types have been installed on site. Balance
Sheet v1.5 "installed" state needs its own `MaterialTransaction` log.

### 3. `backend/.env.local` still points at production Supabase

The maintainer's checkout has `backend/.env.local` configured against
`aws-1-eu-north-1.pooler.supabase.com:6543`. Sourcing that file from a Django
shell will write to production.

**Resolved for contributors and tests** (2026-05-03): `docker-compose.dev.yml`
+ `.env.dev.example` give a Docker-local Postgres (`sprucelab_dev`). `just up`
brings it online and applies migrations. The Justfile's `_safety-check` and
`tests/conftest.py` both abort if `DATABASE_URL` is non-localhost. PR
contributors should `cp .env.dev.example .env.dev` and never source
`backend/.env.local`.

Still on the roadmap: `skl db pull-prod` to snapshot production into local for
realistic-data experimentation.

### 4. Supabase JWT verification is delegated

Sprucelab's Supabase project uses HS256 tokens signed with rotating opaque keys
that aren't exposed through any API. We cannot verify JWTs locally. Instead,
`backend/config/authentication.py::SupabaseAuthentication` delegates to
`GET <supabase_url>/auth/v1/user` with a 60-second cache keyed on the token hash.

Do not try to verify JWTs locally. The ES256 key at `/auth/v1/.well-known/jwks.json`
is unrelated to session tokens and will not work.

### 5. Railway has two projects in skiplum team

`frontend` is the abandoned stub. `sprucelab` is the real one. For Vercel CLI:
`yarn vercel link --project sprucelab`, not auto-detect. The `.vercel/` directory
belongs at repo root (not `frontend/.vercel/`).

### 6. CORS_ORIGINS is set as a Railway env var

Despite being defined in `backend/ifc-service/config.py`, the live FastAPI
service uses the `CORS_ORIGINS` env var from Railway (set to a JSON list).
Adding a new frontend origin requires updating that env var, not just the code.

See worklog `2026-04-15-03-39_Auth-Diagnosis-Viewer-Panels-Scale-Audit.md` and
the earlier CORS diagnosis this session.

### 7. FastAPI + Django write path is split

The parser is in FastAPI (`backend/ifc-service/`), but the ORM is in Django
(`backend/apps/`). FastAPI writes directly to Postgres via asyncpg
(`repositories/ifc_repository.py`), bypassing Django. This means:
- Parser schema changes need SQL that matches the Django model, but no Django
  migration is triggered
- If you add a Django field that's required, the parser will fail silently on
  insert unless you also update the asyncpg write
- Always check `ifc_repository.py` when changing `models.py`

---

## Tooling inventory

### Available MCPs (as of session 2026-04-15)

- **chrome-devtools** — headless browser control (runs separate chromium; no saved
  Supabase session; use for public pages or after auth setup)
- **notion** (both flavors) — knowledge management, task tracking
- **office365** — email, calendar, OneDrive, Teams
- **acc** — Autodesk Construction Cloud (internal Skiplum tools)
- **blender** — 3D modeling (for diorama work, unrelated to sprucelab core)

### CLI access

- `git` — dev branch by default, session-push Stop hook squashes auto-commits
- `railway` — linked to specific services; `railway logs`, `railway variables`,
  `railway redeploy`. Use `railway service "Fast API"` to switch services within
  the `resilient-hope` project.
- `psql` — via DATABASE_URL from `.env.local`
- `python manage.py shell` / `dbshell` — Django ORM or raw SQL
- `yarn test:e2e` — Playwright E2E
- `yarn tsc --noEmit` — TypeScript type check

### Safety rails

- Don't use `rm` for deletions — use `gio trash`
- Don't skip git hooks (`--no-verify`)
- Don't force push to main
- Don't commit secrets (.env files are gitignored)
- Before reprocessing a model, verify the model ID
- Before clearing seed data, confirm the project ID
- Ask before destructive operations on production data

---

## The agent-first roadmap (what's missing, what's next)

Sprucelab should be navigable end-to-end by an agent. Today it mostly isn't.
The deltas, in rough priority:

1. **`skl` CLI** (sprucelab dev CLI) — single entrypoint for db stats, seeds,
   reprocessing, test runs, log tailing. **Partial start in this session.**
2. **Capability tokens** — scoped, revocable, auditable auth credentials for
   non-user contexts (CI, agents, automation). Separate from Supabase sessions.
3. **Audit log** — append-only `AuditEvent` table recording every mutation:
   actor, intent, params hash, operation ID, result, timestamp.
4. **Dry-run at API level** — HTTP endpoints accept `?dry_run=true` as a convention
   and return the plan without committing.
5. **Operation IDs + rollback** — every mutating call returns an `operation_id`;
   rollback endpoint accepts `operation_id` and undoes it (within a TTL window).
6. **Local Postgres + Docker compose** — eliminate the `.env.local points at prod`
   risk.
7. **Policy layer** — org-level policies defined as data: blast radius limits,
   destructive-op confirmations, cross-project write gates.
8. **Event streams** — async tasks (Celery, FastAPI reprocess) emit structured
   completion events that agents can subscribe to instead of polling.
9. **Structured query language** — richer than REST; GraphQL or a query DSL for
   the "types without EPD in project X with discipline Y" kind of question.

---

## Getting started on a new feature (checklist)

1. **Read the latest worklog** at `docs/worklog/` to understand current state
2. **Check `docs/todos/current.md`** for outstanding work
3. **Query the DB** to validate assumptions: `python manage.py shell` + counts
4. **Write a plan** at `docs/plans/yyyy-mm-dd-hh-mm_<Description>.md` if the
   feature is non-trivial
5. **Add Playwright tests** for any new UI feature (under `tests/e2e/`)
6. **Add i18n keys** in `en.json` and `nb.json` for all user-facing strings
7. **Commit with auto-sync** — no need to manually commit during work
8. **Run `/worklog`** at the end to squash + push + log

---

## When this document gets stale

- Add to it when you discover a new constraint, gotcha, or pattern
- Move entries from "known gaps" to "reference patterns" when they're resolved
- Update the tooling inventory when new MCPs or CLIs come online
- Don't let it grow without pruning — aim for <500 lines forever
- Review quarterly for accuracy

**Last updated:** 2026-04-15 (session: Materials Browser v1 + agent platform bootstrap)
