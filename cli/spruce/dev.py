"""
Dev subcommand group for the spruce CLI.

Local-only operations that bypass the sprucelab API and go directly to the
Django ORM / management commands. Intended for developer and agent workflows
during feature development — not for production operators.

Design principles:
- Dry-run by default where it makes sense
- Reversible mutations (tagged rows, --clear flags)
- Structured output (tables for humans, --json for agents)
- Shell out to `python manage.py` for Django ops — simple and robust
- Never require network access for read commands
- Fail loudly on any unexpected state

Usage:
    spruce dev db stats
    spruce dev db projects
    spruce dev seed materials --project <id> --dry-run
    spruce dev seed materials --project <id>
    spruce dev seed materials --project <id> --clear
    spruce dev test e2e [filter]
    spruce dev reprocess <model-id>
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table
from rich.panel import Panel


dev_app = typer.Typer(
    help="Local dev + agent workflows (bypasses the API, uses Django directly)",
    no_args_is_help=True,
)
console = Console()


# =============================================================================
# HELPERS
# =============================================================================


def _repo_root() -> Path:
    """Find the sprucelab repo root by walking up from this file."""
    here = Path(__file__).resolve()
    for parent in [here, *here.parents]:
        if (parent / "backend" / "manage.py").exists() and (parent / "frontend" / "package.json").exists():
            return parent
    raise RuntimeError(
        "Could not find sprucelab repo root (expected backend/manage.py and frontend/package.json)"
    )


def _backend_dir() -> Path:
    return _repo_root() / "backend"


def _frontend_dir() -> Path:
    return _repo_root() / "frontend"


def _run_manage(args: list[str], capture: bool = False) -> subprocess.CompletedProcess:
    """Run a Django management command in the backend directory."""
    cmd = [sys.executable, "manage.py", *args]
    return subprocess.run(
        cmd,
        cwd=_backend_dir(),
        capture_output=capture,
        text=True,
    )


def _run_yarn(args: list[str]) -> subprocess.CompletedProcess:
    """Run a yarn command in the frontend directory."""
    return subprocess.run(
        ["yarn", *args],
        cwd=_frontend_dir(),
    )


def _django_shell(code: str) -> str:
    """Execute a Django shell snippet and return stdout."""
    result = subprocess.run(
        [sys.executable, "manage.py", "shell", "-c", code],
        cwd=_backend_dir(),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        console.print(f"[red]Django shell failed:[/red]\n{result.stderr}")
        raise typer.Exit(1)
    return result.stdout


# =============================================================================
# DB SUBCOMMANDS
# =============================================================================

db_app = typer.Typer(help="Database inspection (read-only)")
dev_app.add_typer(db_app, name="db")


@db_app.command("stats")
def db_stats(
    as_json: bool = typer.Option(False, "--json", help="Emit JSON instead of a table"),
):
    """Print counts for key tables."""
    code = """
import json
from apps.projects.models import Project
from apps.models.models import Model
from apps.entities.models import IFCType, TypeMapping, TypeDefinitionLayer, Material, MaterialLibrary
from apps.accounts.models import UserProfile

stats = {
    "projects": Project.objects.count(),
    "models": Model.objects.count(),
    "models_ready": Model.objects.filter(status='ready').count(),
    "ifc_types": IFCType.objects.count(),
    "type_mappings": TypeMapping.objects.count(),
    "type_definition_layers": TypeDefinitionLayer.objects.count(),
    "materials": Material.objects.count(),
    "material_library": MaterialLibrary.objects.count(),
    "user_profiles": UserProfile.objects.count(),
    "user_profiles_approved": UserProfile.objects.filter(approval_status='approved').count(),
    "seeded_layers": TypeDefinitionLayer.objects.filter(notes='__claude_seed__').count(),
}
print(json.dumps(stats))
"""
    output = _django_shell(code).strip()
    # Extract the last JSON line (Django startup may print env loading)
    json_line = [line for line in output.split("\n") if line.startswith("{")][-1]
    data = json.loads(json_line)

    if as_json:
        print(json.dumps(data, indent=2))
        return

    table = Table(title="Sprucelab DB stats")
    table.add_column("Table", style="cyan")
    table.add_column("Count", justify="right", style="bold")
    for key, value in data.items():
        table.add_row(key, str(value))
    console.print(table)


@db_app.command("projects")
def db_projects(
    as_json: bool = typer.Option(False, "--json", help="Emit JSON instead of a table"),
):
    """List projects with type + model + layer counts."""
    code = """
import json
from apps.projects.models import Project
from apps.models.models import Model
from apps.entities.models import IFCType, TypeDefinitionLayer
from django.db.models import Count

results = []
for p in Project.objects.all().order_by('name'):
    models = Model.objects.filter(project=p)
    ready = models.filter(status='ready').count()
    types = IFCType.objects.filter(model__in=models).count()
    layers = TypeDefinitionLayer.objects.filter(type_mapping__ifc_type__model__in=models).count()
    seeded = TypeDefinitionLayer.objects.filter(
        type_mapping__ifc_type__model__in=models,
        notes='__claude_seed__',
    ).count()
    results.append({
        "id": str(p.id),
        "name": p.name,
        "models": models.count(),
        "models_ready": ready,
        "types": types,
        "layers": layers,
        "seeded_layers": seeded,
    })
print(json.dumps(results))
"""
    output = _django_shell(code).strip()
    json_line = [line for line in output.split("\n") if line.startswith("[")][-1]
    data = json.loads(json_line)

    if as_json:
        print(json.dumps(data, indent=2))
        return

    table = Table(title="Projects")
    table.add_column("ID", style="dim")
    table.add_column("Name", style="cyan")
    table.add_column("Models", justify="right")
    table.add_column("Ready", justify="right")
    table.add_column("Types", justify="right")
    table.add_column("Layers", justify="right")
    table.add_column("Seeded", justify="right", style="yellow")

    for row in data:
        table.add_row(
            row["id"][:8] + "…",
            row["name"],
            str(row["models"]),
            str(row["models_ready"]),
            str(row["types"]),
            str(row["layers"]),
            str(row["seeded_layers"]),
        )
    console.print(table)


@db_app.command("materials")
def db_materials(
    project: Optional[str] = typer.Option(None, "--project", help="Filter to one project ID"),
    as_json: bool = typer.Option(False, "--json", help="Emit JSON instead of a table"),
    top: int = typer.Option(15, "--top", help="Max rows"),
):
    """Show top TypeDefinitionLayer material names by count."""
    filter_clause = (
        f"type_mapping__ifc_type__model__project__id='{project}'" if project else ""
    )
    code = f"""
import json
from apps.entities.models import TypeDefinitionLayer
from django.db.models import Count

qs = TypeDefinitionLayer.objects.all()
{f"qs = qs.filter({filter_clause})" if filter_clause else ""}

rows = list(
    qs.values('material_name', 'material_unit')
      .annotate(c=Count('id'))
      .order_by('-c')[:{top}]
)
print(json.dumps(rows))
"""
    output = _django_shell(code).strip()
    json_line = [line for line in output.split("\n") if line.startswith("[")][-1]
    data = json.loads(json_line)

    if as_json:
        print(json.dumps(data, indent=2))
        return

    table = Table(title=f"Top {top} material layers" + (f" in {project[:8]}…" if project else ""))
    table.add_column("Count", justify="right", style="bold")
    table.add_column("Unit", style="dim")
    table.add_column("Material", style="cyan")
    for row in data:
        table.add_row(str(row["c"]), row["material_unit"] or "-", row["material_name"])
    console.print(table)


# =============================================================================
# SEED SUBCOMMANDS
# =============================================================================

seed_app = typer.Typer(help="Seed / clear synthetic test data")
dev_app.add_typer(seed_app, name="seed")


@seed_app.command("materials")
def seed_materials(
    project: str = typer.Option(..., "--project", help="Project ID (UUID) to seed"),
    clear: bool = typer.Option(False, "--clear", help="Remove seeded layers instead of creating"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Preview without writing"),
    limit: Optional[int] = typer.Option(None, "--limit", help="Cap the number of types seeded"),
):
    """Seed or clear synthetic TypeDefinitionLayer rows for a project."""
    args = ["seed_type_definition_layers", "--project", project]
    if clear:
        args.append("--clear")
    if dry_run:
        args.append("--dry-run")
    if limit:
        args.extend(["--limit", str(limit)])

    console.print(f"[dim]$ python manage.py {' '.join(args)}[/dim]")
    result = _run_manage(args)
    if result.returncode != 0:
        console.print(f"[red]seed_type_definition_layers failed (exit {result.returncode})[/red]")
        raise typer.Exit(result.returncode)


# =============================================================================
# TEST SUBCOMMAND
# =============================================================================

test_app = typer.Typer(help="Test runners (tsc, Playwright, etc.)")
dev_app.add_typer(test_app, name="test")


@test_app.command("e2e")
def test_e2e(
    filter: Optional[str] = typer.Argument(None, help="Test file filter (e.g., 'materials')"),
    headed: bool = typer.Option(False, "--headed", help="Show the browser"),
    ui: bool = typer.Option(False, "--ui", help="Interactive UI mode"),
    project: Optional[str] = typer.Option(None, "--project", help="Playwright project name"),
):
    """Run Playwright E2E tests."""
    args = ["test:e2e"]
    if filter:
        args.append(filter)
    if headed:
        args.append("--headed")
    if ui:
        args.append("--ui")
    if project:
        args.extend(["--project", project])

    result = _run_yarn(args)
    raise typer.Exit(result.returncode)


@test_app.command("tsc")
def test_tsc():
    """Run TypeScript type check (yarn tsc --noEmit)."""
    result = subprocess.run(
        ["yarn", "tsc", "--noEmit"],
        cwd=_frontend_dir(),
    )
    raise typer.Exit(result.returncode)


@test_app.command("smoke")
def test_smoke():
    """Run public Playwright smoke tests (no auth required)."""
    result = _run_yarn(["test:e2e", "smoke", "--project=public"])
    raise typer.Exit(result.returncode)


# =============================================================================
# REPROCESS SUBCOMMAND
# =============================================================================


@dev_app.command("reprocess")
def dev_reprocess(
    model_id: str = typer.Argument(..., help="Model UUID to reprocess"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Show plan without triggering"),
):
    """Trigger an IFC model reprocess via the local Django API.

    Requires a running Django dev server on localhost:8000 and a valid JWT
    (read from SPRUCE_DEV_JWT env var or ~/.spruce/jwt).
    """
    import httpx

    if dry_run:
        console.print(
            f"[yellow]DRY RUN:[/yellow] Would POST http://localhost:8000/api/models/{model_id}/reprocess/"
        )
        return

    jwt = os.environ.get("SPRUCE_DEV_JWT")
    if not jwt:
        jwt_path = Path.home() / ".spruce" / "jwt"
        if jwt_path.exists():
            jwt = jwt_path.read_text().strip()

    if not jwt:
        console.print(
            "[red]No JWT available.[/red] Set SPRUCE_DEV_JWT env var or write one to ~/.spruce/jwt."
        )
        raise typer.Exit(1)

    try:
        r = httpx.post(
            f"http://localhost:8000/api/models/{model_id}/reprocess/",
            headers={"Authorization": f"Bearer {jwt}"},
            timeout=30.0,
        )
        if r.status_code >= 400:
            console.print(f"[red]Reprocess failed ({r.status_code}):[/red] {r.text}")
            raise typer.Exit(1)
        data = r.json()
        console.print(Panel(json.dumps(data, indent=2), title=f"Reprocess {model_id[:8]}…"))
    except httpx.RequestError as e:
        console.print(f"[red]Network error:[/red] {e}")
        raise typer.Exit(1)


# =============================================================================
# ENV SUBCOMMAND
# =============================================================================


@dev_app.command("env")
def dev_env():
    """Show the sprucelab dev environment — where things live, what's running."""
    repo = _repo_root()

    # Port scan
    def port_alive(port: int) -> bool:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.2)
        try:
            result = s.connect_ex(("127.0.0.1", port))
            return result == 0
        finally:
            s.close()

    table = Table(title="Sprucelab dev environment")
    table.add_column("Component", style="cyan")
    table.add_column("Value", style="green")

    table.add_row("Repo root", str(repo))
    table.add_row("Backend", str(_backend_dir()))
    table.add_row("Frontend", str(_frontend_dir()))
    table.add_row("Branch", _git_branch(repo))
    table.add_row("Django (localhost:8000)", "[green]up[/green]" if port_alive(8000) else "[dim]down[/dim]")
    table.add_row("Vite (localhost:5173)", "[green]up[/green]" if port_alive(5173) else "[dim]down[/dim]")
    table.add_row("FastAPI (localhost:8100)", "[green]up[/green]" if port_alive(8100) else "[dim]down[/dim]")
    table.add_row(".env.local exists", "[green]yes[/green]" if (_backend_dir() / ".env.local").exists() else "[red]no[/red]")
    table.add_row(
        "Playwright auth captured",
        "[green]yes[/green]" if (_frontend_dir() / "tests/e2e/.auth/user.json").exists() else "[dim]no[/dim]",
    )

    console.print(table)


def _git_branch(repo: Path) -> str:
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            cwd=repo,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip() or "(detached)"
    except Exception:
        return "(unknown)"
