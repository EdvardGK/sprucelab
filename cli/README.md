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

# Run tests
pytest
```

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
