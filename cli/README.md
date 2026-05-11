# Spruce CLI

CLI for running Sprucelab automation pipelines locally.

## Installation

```bash
# From the cli directory
pip install -e .

# Or using pipx for isolated install
pipx install .
```

## Quick Start

```bash
# Initialize configuration
spruce config init

# Register this machine as an agent
spruce auth register

# List available pipelines
spruce pipelines list

# Run a pipeline
spruce run <pipeline-name>
spruce run <pipeline-name> --project <project-id>
```

## Commands

### Dev (local, agent workflows)

Runs directly against the local Django install (no API, no auth token).
Use for development, testing, seeding, introspection.

```bash
spruce dev env                                            # status of repo + running services
spruce dev db stats                                       # counts for key tables
spruce dev db stats --json                                # agent-friendly output
spruce dev db projects                                    # projects with type/layer counts
spruce dev db materials --project <uuid> --top 15         # top materials by count
spruce dev seed materials --project <uuid> --dry-run      # preview seed plan
spruce dev seed materials --project <uuid>                # seed G55 with synthetic layers
spruce dev seed materials --project <uuid> --clear        # remove seeded layers
spruce dev test tsc                                       # TypeScript type check
spruce dev test smoke                                     # public Playwright smoke tests
spruce dev test e2e materials --headed                    # run materials-browser E2E
spruce dev reprocess <model-uuid>                         # trigger IFC reprocess via local API
```

The `dev` subcommand bypasses the Sprucelab API entirely — it imports Django
directly via `python manage.py`. Intended for agents and developers on the
codebase, not for production operators.

### Configuration

```bash
spruce config init       # Interactive setup
spruce config show       # Show current config
spruce config set api-url https://app.sprucelab.io
```

### Authentication

```bash
spruce auth status       # Check connection
spruce auth register     # Register as agent
```

### Pipelines

```bash
spruce pipelines list    # List all pipelines
```

### Runs

```bash
spruce runs list                    # List recent runs
spruce runs list --status running   # Filter by status
spruce runs show <run-id>           # Show run details
spruce runs logs <run-id>           # Show run logs
```

### Running Pipelines

```bash
spruce run <pipeline>                    # Run by name or ID
spruce run <pipeline> --project <id>     # Run for specific project
spruce run <pipeline> --dry-run          # Preview without executing
```

## Development

```bash
# Install with dev dependencies
pip install -e ".[dev]"

# Run tests (mocked, hermetic — what runs in CI)
pytest
```

### Live API smoke

The `tests/integration/` directory holds an opt-in live-API smoke harness that
hits a real Sprucelab server through the same `Typer` entry points as the
mocked suite. **These tests are NOT run in CI** — they're skipped by default
and only execute when `SPRUCE_LIVE_API_URL` is set in the environment.

Required env var:

| Variable | Purpose |
|---|---|
| `SPRUCE_LIVE_API_URL` | Base URL of the live Sprucelab Django API (e.g. `http://localhost:8000`). Module is skipped when unset. |

Optional env vars:

| Variable | Purpose |
|---|---|
| `SPRUCELAB_ADMIN_TOKEN` | Bearer Supabase staff token. Required unless the backend is running with `DEV_AUTH_BYPASS=1`. |
| `SPRUCE_LIVE_MODEL_ID` | UUID of an existing model in the target project. Optional — when unset, the `types list` and `verify` smoke tests fall back to `spruce models list --json` and pick the first model returned. Set it explicitly to pin a specific model. |

The `verify` smoke now runs with `--dry-run` so it never mutates
`TypeMapping.verification_status` rows on the live model. Backend rolls the
verification write back inside a savepoint; the engine is idempotent on
re-run so the rollback is safe.

Run the harness:

```bash
cd cli && \
  SPRUCE_LIVE_API_URL=https://your-server \
  SPRUCELAB_ADMIN_TOKEN=... \
  python -m pytest tests/integration -m live -v
```

These tests deliberately fail loudly: an unexpected status code or response
shape will surface as a test failure with the raw payload, not a green pass
with a swallowed warning.

## Architecture

```
spruce/
├── cli.py           # Main CLI application (Typer)
├── config.py        # Configuration management
├── api_client.py    # HTTP client for Sprucelab API
├── executor.py      # Pipeline execution engine
├── steps/           # Step executors
│   ├── cde_sync.py
│   ├── script.py
│   └── file_transform.py
└── cde/             # CDE clients
    ├── dalux.py
    └── bim360.py
```
