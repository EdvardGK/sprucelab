# Session 030: Automation Workbench

**Date**: 2025-12-26

## Summary

Created the foundation for an Automation Workbench - a lightweight n8n/Make.com alternative for BIM workflows. This enables multi-step pipelines that sync files from CDEs (Dalux, BIM360), run scripts, and distribute outputs.

## Changes

### Backend: New `automation` Django App

**Location**: `backend/apps/automation/`

**Models created**:
- `Pipeline` - Multi-step workflow templates (single/multi-project scope)
- `PipelineStep` - Individual actions (cde_sync, script, file_transform, distribution)
- `CDEConnection` - CDE credentials per project (Dalux, BIM360)
- `ProjectPipelineConfig` - Project opt-in/out + parameter overrides
- `PipelineRun` - Execution records with status tracking
- `PipelineStepRun` - Per-step logs and results
- `AgentRegistration` - CLI agents that can pick up jobs

**Files**:
- `models.py` - All 7 models with proper indexes
- `serializers.py` - DRF serializers for API
- `views.py` - ViewSets + Agent API endpoints
- `urls.py` - Full URL routing
- `admin.py` - Admin interface with inlines

### CLI: `spruce` Package

**Location**: `cli/`

**Commands**:
- `spruce config init/show/set` - Configuration management
- `spruce auth status/register` - Agent authentication
- `spruce pipelines list` - List available pipelines
- `spruce runs list/show/logs` - View run history
- `spruce run <pipeline>` - Execute a pipeline

**Architecture**:
- `cli.py` - Typer CLI with subcommands
- `config.py` - Config storage (~/.spruce/, keyring for secrets)
- `api_client.py` - HTTP client for Sprucelab API
- `executor.py` - Pipeline execution engine with step executors

## API Endpoints

```
/api/automation/pipelines/           - Pipeline CRUD
/api/automation/pipelines/{id}/run/  - Trigger run
/api/automation/cde-connections/     - CDE connection management
/api/automation/project-configs/     - Project pipeline configs
/api/automation/runs/                - Run history
/api/automation/agent/*              - Agent registration & job polling
```

## Next Steps

1. Install missing dependency: `pip install django-filter`
2. Run migrations: `python manage.py makemigrations automation && python manage.py migrate`
3. Install CLI: `cd cli && pip install -e .`
4. Phase 2: Implement Dalux API client (`cli/spruce/cde/dalux.py`)
5. Phase 3: Frontend UI for automation dashboard

## Architecture Decisions

- **Supabase Vault** for CDE credentials (server-side)
- **Python keyring** for CLI credentials (client-side)
- **React Flow** planned for visual pipeline editor (Phase 5)
- **Local-first execution** - CLI runs on user machines, reports back to server

## Plan File

Full implementation plan saved at: `~/.claude/plans/iridescent-tinkering-lantern.md`
