# Sprucelab dev kit — agent-first command surface
#
# Every recipe is non-interactive, fast, and machine-parseable where it makes
# sense. Recipes that touch a DB refuse to run against a non-localhost host.
#
# Install just (Arch):  sudo pacman -S just
# Install just (other): cargo install just  |  brew install just
#
# Run `just` with no args to see the recipe list.

set shell := ["bash", "-cu"]
set positional-arguments

ROOT := justfile_directory()
# Default PY auto-activates the `sprucelab` conda env so recipes work from any
# shell. Override with PYTHON=/path/to/python if you have a different setup.
PY   := env_var_or_default("PYTHON", justfile_directory() + "/tools/python")

# Default: list recipes
default:
    @just --list --unsorted

# ──────────────────────────────────────────────────────────────────────────
# Local services
# ──────────────────────────────────────────────────────────────────────────

# Start PostgreSQL + Redis (Docker), apply migrations, leave containers up
up:
    docker compose -f docker-compose.dev.yml up -d
    @just _wait-pg
    @just migrate

# Stop PostgreSQL + Redis containers (data preserved)
down:
    docker compose -f docker-compose.dev.yml down

# Stop containers AND wipe volumes (destructive — local data only)
nuke:
    docker compose -f docker-compose.dev.yml down -v

# Start full stack (Postgres, Redis, Django, FastAPI, Vite). Foreground.
dev:
    bash dev.sh

# Stop the full stack started by `just dev`
dev-stop:
    bash dev.sh --stop

# ──────────────────────────────────────────────────────────────────────────
# Database
# ──────────────────────────────────────────────────────────────────────────

# Run Django migrations against the dev DB
migrate:
    @just _safety-check
    cd backend && {{PY}} manage.py migrate

# Show pending / applied migrations as JSON-ish (one per line)
migrations:
    @just _safety-check
    cd backend && {{PY}} manage.py showmigrations --plan

# Open a psql shell on the dev DB
psql:
    @just _safety-check
    docker exec -it sprucelab-dev-db psql -U postgres -d sprucelab_dev

# Seed deterministic dev data (a project + a sample IFC pre-uploaded)
seed:
    @just _safety-check
    cd backend && {{PY}} manage.py seed_dev_data

# Drop and recreate the dev DB (destructive — local only)
reset-db:
    @just _safety-check
    docker exec sprucelab-dev-db psql -U postgres -c "DROP DATABASE IF EXISTS sprucelab_dev;"
    docker exec sprucelab-dev-db psql -U postgres -c "CREATE DATABASE sprucelab_dev;"
    @just migrate

# ──────────────────────────────────────────────────────────────────────────
# Tests
# ──────────────────────────────────────────────────────────────────────────

# Fast unit tests (Django, no live FastAPI)
test *args:
    @just _safety-check
    cd {{ROOT}} && {{PY}} -m pytest tests/unit "$@" -v

# End-to-end tests (boots FastAPI subprocess, hits real HTTP)
test-e2e *args:
    @just _safety-check
    cd {{ROOT}} && {{PY}} -m pytest tests/e2e "$@" -v

# All tests
test-all *args:
    @just _safety-check
    cd {{ROOT}} && {{PY}} -m pytest tests "$@" -v

# ──────────────────────────────────────────────────────────────────────────
# API helpers
# ──────────────────────────────────────────────────────────────────────────

# Hit the Django API: `just api GET /models/` or `just api POST /files/ < body.json`
api method path *args:
    @bash tools/api {{method}} {{path}} "$@"

# Pretty-print the Django URL conf (agent-friendly endpoint inventory)
routes *args:
    @just _safety-check
    @{{PY}} tools/routes.py "$@"

# Tail Django + FastAPI logs (requires services running via `just dev`)
logs:
    tail -f backend/django.log backend/ifc-service/fastapi.log 2>/dev/null || \
        echo "No log files yet — run 'just dev' first"

# Print active env (versions, DB host, ports). Machine-parseable JSON.
status:
    @{{PY}} -c "import os, json, socket, sys; \
db=os.environ.get('DATABASE_URL','(unset)'); \
host=db.split('@')[-1].split('/')[0].split(':')[0] if '@' in db else 'n/a'; \
print(json.dumps({ \
    'python': sys.version.split()[0], \
    'db_host': host, \
    'db_safe': host in ('localhost','127.0.0.1','sprucelab-dev-db'), \
    'django_url': os.environ.get('DJANGO_URL','http://localhost:8000'), \
    'ifc_service_url': os.environ.get('IFC_SERVICE_URL','http://localhost:8001'), \
}, indent=2))"

# Django shell (with autoreload-friendly imports)
shell:
    @just _safety-check
    cd backend && {{PY}} manage.py shell

# ──────────────────────────────────────────────────────────────────────────
# Internal helpers (underscore-prefixed = hidden from `just --list`)
# ──────────────────────────────────────────────────────────────────────────

_wait-pg:
    @for i in $(seq 1 30); do \
        docker exec sprucelab-dev-db pg_isready -U postgres > /dev/null 2>&1 && exit 0; \
        sleep 1; \
    done; echo "postgres timeout" >&2; exit 1

# Refuse to run if DATABASE_URL points at a remote / production host.
_safety-check:
    @{{PY}} -c "import os, sys; \
db=os.environ.get('DATABASE_URL',''); \
host=db.split('@')[-1].split('/')[0].split(':')[0] if '@' in db else ''; \
ok=host in ('localhost','127.0.0.1','sprucelab-dev-db','') or db.startswith('postgresql://postgres:postgres@localhost'); \
sys.exit(0 if ok else (sys.stderr.write(f'\\n[safety] Refusing to run: DATABASE_URL points to {host!r}, not localhost.\\n[safety] Source .env.dev or unset DATABASE_URL first.\\n\\n') or 1))"
