# Sprucelab

Data-first BIM intelligence platform. Files in → data streams out. For BIM
professionals who *use* models, not create them: dashboards, verification, and
change detection are the product; the 3D viewer serves insights, not the other
way around.

> "Types are the unit of coordination in BIM. A building has 50,000 entities
> but only 300–500 unique types."

---

## Stack

- **Backend** — Django 5.0 + DRF (auth, CRUD, metadata) + FastAPI (file
  extraction, IFC parsing). Postgres via Supabase in prod, Docker locally.
- **Frontend** — React 18 + TypeScript + Vite, Tailwind v4 + shadcn/ui,
  ThatOpen + Three.js for the viewer.
- **CLI** — `cli/spruce` (Typer). Local dev mode bypasses the API; remote mode
  hits a deployed instance.
- **Workers** — Celery + Redis for file processing.

---

## Quick start (local dev — docker Postgres + native code)

Prereqs: `docker`, `just` (`pacman -S just` / `brew install just`), Python 3.11
with conda env `sprucelab`, Node 20 + Yarn classic.

```bash
git clone https://github.com/EdvardGK/sprucelab.git
cd sprucelab

# Local Postgres + Redis containers, applies migrations
just up

# Full stack (Django, FastAPI, Vite) — foreground
just dev
```

`just up` brings up `sprucelab-dev-db` (Postgres 16) and Redis on the standard
ports, then runs Django migrations against `sprucelab_dev`. **Local dev never
touches production data** — `tests/conftest.py` and the Justfile both refuse to
run against a non-localhost host.

Env config: copy `.env.dev.example` → `.env.dev` and `frontend/.env.example` →
`frontend/.env.local`. The `backend/.env.local` file you may see in maintainers'
checkouts points at the production Supabase pooler — **do not use it for
contributing**.

More recipes: `just` (lists everything).

---

## Running tests

```bash
just test               # backend unit tests (tests/unit)
just test-e2e           # backend + FastAPI subprocess (tests/e2e)
cd frontend && yarn tsc --noEmit
cd frontend && yarn test:e2e smoke    # Playwright public smoke (no auth)
```

CI runs unit + tsc on every PR.

---

## Where to look

| You want to... | Read |
|---|---|
| Contribute a PR | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Understand the agent-first philosophy | [`docs/knowledge/2026-04-15-16-30_Agent-Workflows.md`](docs/knowledge/2026-04-15-16-30_Agent-Workflows.md) |
| Know the API surface | [`docs/knowledge/API_SURFACE.md`](docs/knowledge/API_SURFACE.md) |
| Read the product north star | [`docs/plans/PRD_v2.md`](docs/plans/PRD_v2.md) |
| See what just shipped | [`docs/worklog/`](docs/worklog/) |
| Find rules for agents working in this repo | [`CLAUDE.md`](CLAUDE.md) |

---

## Project layout

```
sprucelab/
├── backend/
│   ├── apps/              # Django apps (projects, models, entities, ...)
│   ├── ifc-service/       # FastAPI microservice (IFC + future formats)
│   └── config/            # Django settings, URLs, Celery
├── cli/                   # spruce CLI (Typer)
├── frontend/              # Vite + React + TS
├── tests/                 # Unit + e2e (pytest)
├── docs/                  # Plans, worklogs, knowledge, todos
└── Justfile               # Agent-first command surface
```

---

## License

Proprietary, owner-only (`@EdvardGK`). The repo is public for visibility, not
for outside contribution. A `LICENSE` file may follow.
