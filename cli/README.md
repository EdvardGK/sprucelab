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
