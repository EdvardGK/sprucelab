"""Main CLI application for Spruce."""
from typing import Optional
import typer
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

from . import __version__
from .config import (
    get_api_url, set_api_url,
    get_api_key, set_api_key,
    get_agent_id, set_agent_id,
    load_config
)
from .api_client import SprucelabClient
from .dev import dev_app
from .embed import embed_app
from .files import files_app
from .models import models_app
from .types import types_app
from .verify import verify_app
from .scripts import scripts_app
from .webhooks import app as webhooks_app
from .capabilities import app as capabilities_app
from .log import log_app
from .claims import claims_app

app = typer.Typer(
    name="spruce",
    help="Sprucelab automation pipeline CLI",
    no_args_is_help=True
)
app.add_typer(dev_app, name="dev")
app.add_typer(embed_app, name="embed")
app.add_typer(files_app, name="files")
app.add_typer(models_app, name="models")
app.add_typer(types_app, name="types")
app.add_typer(verify_app, name="verify")
app.add_typer(scripts_app, name="scripts")
app.add_typer(webhooks_app, name="webhooks")
app.add_typer(capabilities_app, name="capabilities")
app.add_typer(log_app, name="log")
app.add_typer(claims_app, name="claims")
console = Console()

# Config subcommand
config_app = typer.Typer(help="Manage configuration")
app.add_typer(config_app, name="config")


@config_app.command("init")
def config_init():
    """Initialize configuration interactively."""
    console.print("[bold]Spruce CLI Configuration[/bold]\n")

    # API URL
    current_url = get_api_url()
    url = typer.prompt("Sprucelab API URL", default=current_url)
    set_api_url(url)

    # API Key
    api_key = typer.prompt("API Key (from agent registration)", hide_input=True)
    if api_key:
        set_api_key(api_key)

    console.print("\n[green]Configuration saved![/green]")


@config_app.command("show")
def config_show():
    """Show current configuration."""
    config = load_config()
    api_key = get_api_key()

    table = Table(title="Spruce Configuration")
    table.add_column("Setting", style="cyan")
    table.add_column("Value", style="green")

    table.add_row("API URL", config.get("api_url", "http://localhost:8000"))
    table.add_row("API Key", "***" if api_key else "[red]Not set[/red]")
    table.add_row("Agent ID", config.get("agent_id", "[red]Not registered[/red]"))

    console.print(table)


@config_app.command("set")
def config_set(key: str, value: str):
    """Set a configuration value."""
    if key == "api-url":
        set_api_url(value)
        console.print(f"[green]Set api_url to {value}[/green]")
    elif key == "api-key":
        set_api_key(value)
        console.print("[green]API key saved[/green]")
    else:
        console.print(f"[red]Unknown config key: {key}[/red]")
        raise typer.Exit(1)


# Auth subcommand
auth_app = typer.Typer(help="Authentication management")
app.add_typer(auth_app, name="auth")


@auth_app.command("status")
def auth_status():
    """Show current CLI config + verify the token actually works."""
    from .config import get_api_url
    api_url = get_api_url()
    client = SprucelabClient()

    console.print(f"  api_url:  [cyan]{api_url}[/cyan]")
    if not client.api_key:
        console.print("  api_key:  [yellow]not configured[/yellow]")
        console.print()
        console.print("  Next:  [dim]spruce auth register --token <KEY> --url <URL>[/dim]")
        console.print("         [dim]Mint a token on the server:  python manage.py create_agent --name my-cli[/dim]")
        raise typer.Exit(1)

    masked = client.api_key[:6] + "…" + client.api_key[-4:]
    console.print(f"  api_key:  [cyan]{masked}[/cyan] (in keyring)")

    # Verify the token by hitting an auth-required endpoint. We pick
    # /api/types/observations/ since /api/capabilities/ is AllowAny and
    # would say "OK" even with a bogus token.
    import httpx
    try:
        resp = httpx.get(
            f"{api_url.rstrip('/')}/api/types/observations/?limit=1",
            headers={"Authorization": f"Bearer {client.api_key}"},
            timeout=10.0,
        )
        if resp.status_code == 200:
            console.print("  status:   [green]token works[/green]")
        elif resp.status_code == 401:
            console.print("  status:   [red]token rejected (expired or unknown)[/red]")
            console.print("  Next:     [dim]Re-register with a fresh token from `manage.py create_agent`[/dim]")
            raise typer.Exit(1)
        elif resp.status_code == 403:
            console.print("  status:   [yellow]token works but lacks read scope on this endpoint[/yellow]")
        else:
            console.print(f"  status:   [yellow]unexpected {resp.status_code}: {resp.text[:120]}[/yellow]")
            raise typer.Exit(1)
    except httpx.RequestError as e:
        console.print(f"  status:   [red]connection failed: {e}[/red]")
        console.print("  [yellow]Try:[/yellow] [cyan]spruce config show[/cyan]  # verify api_url; override with `spruce auth register --url <URL>`")
        raise typer.Exit(1)


@auth_app.command("register")
def auth_register(
    name: Optional[str] = typer.Option(None, help="Agent name (used when minting via the server)."),
    token: Optional[str] = typer.Option(None, "--token", "-t", help="Pre-minted API key to save (skips the mint call)."),
    url: Optional[str] = typer.Option(None, "--url", "-u", help="API base URL (e.g. https://sprucelab-production.up.railway.app)."),
):
    """
    Configure CLI auth.

    Two paths:
      --token <KEY>           Save a pre-minted token (from `manage.py create_agent`).
                              No server call; works offline. This is the default
                              path while in-app token management isn't built yet.

      (no --token)            POST /api/automation/agent/register/ to mint a new
                              token. Requires admin-scoped auth on the server side
                              (existing browser session OR an admin token).
    """
    from .config import set_api_url

    if url:
        set_api_url(url)
        console.print(f"[green]Saved api_url:[/green] {url}")

    if token:
        # Manual path — pre-minted token from `manage.py create_agent`.
        set_api_key(token)
        console.print("[green]Saved API key to keyring.[/green]")
        console.print()
        console.print("Try: [cyan]spruce auth status[/cyan]")
        console.print("     [cyan]spruce capabilities[/cyan]")
        return

    # Mint path — call /agent/register/ on the server (requires admin auth).
    if not name:
        import socket
        name = socket.gethostname()

    client = SprucelabClient()
    try:
        result = client.register_agent(name)
        set_agent_id(result["id"])
        set_api_key(result["api_key"])

        console.print(Panel(
            f"[green]Agent registered successfully![/green]\n\n"
            f"Agent ID: {result['id']}\n"
            f"API Key: {result['api_key']}\n\n"
            f"[yellow]Save this API key - it will not be shown again![/yellow]",
            title="Agent Registration"
        ))
    except Exception as e:
        console.print(f"[red]Registration failed: {e}[/red]")
        console.print()
        console.print("If you have a pre-minted token, use [cyan]--token[/cyan]:")
        console.print("  [dim]spruce auth register --token <KEY> --url <URL>[/dim]")
        raise typer.Exit(1)


# Pipelines subcommand
pipelines_app = typer.Typer(help="Pipeline management")
app.add_typer(pipelines_app, name="pipelines")


@pipelines_app.command("list")
def pipelines_list():
    """List available pipelines."""
    client = SprucelabClient()

    try:
        pipelines = client.list_pipelines()

        if not pipelines:
            console.print("[yellow]No pipelines found.[/yellow]")
            return

        table = Table(title="Available Pipelines")
        table.add_column("ID", style="dim")
        table.add_column("Name", style="cyan")
        table.add_column("Scope", style="green")
        table.add_column("Steps", justify="right")
        table.add_column("Active", justify="center")

        for p in pipelines:
            table.add_row(
                p["id"][:8] + "...",
                p["name"],
                p["scope"],
                str(p.get("step_count", 0)),
                "✓" if p["is_active"] else "✗"
            )

        console.print(table)
    except Exception as e:
        console.print(f"[red]Failed to list pipelines: {e}[/red]")
        raise typer.Exit(1)


# Runs subcommand
runs_app = typer.Typer(help="Pipeline run management")
app.add_typer(runs_app, name="runs")


@runs_app.command("list")
def runs_list(
    pipeline: Optional[str] = typer.Option(None, help="Filter by pipeline ID"),
    status: Optional[str] = typer.Option(None, help="Filter by status"),
    limit: int = typer.Option(10, help="Number of runs to show")
):
    """List recent pipeline runs."""
    client = SprucelabClient()

    try:
        runs = client.list_runs(pipeline_id=pipeline, status=status)[:limit]

        if not runs:
            console.print("[yellow]No runs found.[/yellow]")
            return

        table = Table(title="Recent Runs")
        table.add_column("ID", style="dim")
        table.add_column("Pipeline", style="cyan")
        table.add_column("Status", style="bold")
        table.add_column("Progress", justify="right")
        table.add_column("Created", style="dim")

        status_colors = {
            "success": "green",
            "failed": "red",
            "running": "yellow",
            "queued": "blue",
            "cancelled": "dim"
        }

        for r in runs:
            status_color = status_colors.get(r["status"], "white")
            progress = f"{r['steps_completed']}/{r['steps_total']}"
            table.add_row(
                r["id"][:8] + "...",
                r["pipeline_name"],
                f"[{status_color}]{r['status']}[/{status_color}]",
                progress,
                r["created_at"][:19]
            )

        console.print(table)
    except Exception as e:
        console.print(f"[red]Failed to list runs: {e}[/red]")
        raise typer.Exit(1)


@runs_app.command("show")
def runs_show(run_id: str):
    """Show details of a specific run."""
    client = SprucelabClient()

    try:
        run = client.get_run(run_id)

        console.print(Panel(
            f"Pipeline: {run['pipeline_name']}\n"
            f"Status: {run['status']}\n"
            f"Progress: {run['steps_completed']}/{run['steps_total']} steps\n"
            f"Created: {run['created_at']}\n"
            f"Agent: {run.get('agent_hostname', 'N/A')}",
            title=f"Run {run_id[:8]}..."
        ))

        # Show step details
        if run.get("step_runs"):
            table = Table(title="Steps")
            table.add_column("Order", justify="right")
            table.add_column("Name", style="cyan")
            table.add_column("Type", style="dim")
            table.add_column("Status", style="bold")
            table.add_column("Duration", justify="right")

            for step in run["step_runs"]:
                duration = f"{step['duration_ms']}ms" if step.get("duration_ms") else "-"
                table.add_row(
                    str(step["step_order"]),
                    step["step_name"],
                    step["step_type"],
                    step["status"],
                    duration
                )

            console.print(table)

    except Exception as e:
        console.print(f"[red]Failed to get run: {e}[/red]")
        raise typer.Exit(1)


@runs_app.command("logs")
def runs_logs(run_id: str):
    """Show logs for a run."""
    client = SprucelabClient()

    try:
        logs = client.get_run_logs(run_id)

        console.print(f"[bold]Logs for run {run_id[:8]}...[/bold]\n")

        for step in logs.get("steps", []):
            status_color = "green" if step["status"] == "success" else "red"
            console.print(f"[bold cyan]{step['step_name']}[/bold cyan] [{status_color}]{step['status']}[/{status_color}]")

            if step.get("output_log"):
                console.print(Panel(step["output_log"], title="Output", border_style="dim"))

            if step.get("error_message"):
                console.print(Panel(step["error_message"], title="Error", border_style="red"))

            console.print()

    except Exception as e:
        console.print(f"[red]Failed to get logs: {e}[/red]")
        raise typer.Exit(1)


# Main run command
@app.command()
def run(
    pipeline: str = typer.Argument(..., help="Pipeline name or ID"),
    project: Optional[str] = typer.Option(None, "--project", "-p", help="Project ID"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Show what would run without executing")
):
    """Run a pipeline."""
    from .executor import PipelineExecutor

    client = SprucelabClient()

    # Find pipeline by name or ID
    try:
        pipelines = client.list_pipelines()
        matched = None

        for p in pipelines:
            if p["id"] == pipeline or p["name"].lower() == pipeline.lower():
                matched = p
                break

        if not matched:
            console.print(f"[red]Pipeline '{pipeline}' not found.[/red]")
            raise typer.Exit(1)

        if dry_run:
            console.print(f"[yellow]DRY RUN: Would execute pipeline '{matched['name']}'[/yellow]")
            console.print(f"Steps: {matched.get('step_count', 0)}")
            return

        # Trigger the run
        console.print(f"[bold]Running pipeline: {matched['name']}[/bold]")
        run_result = client.trigger_run(matched["id"], project_id=project)

        console.print(f"Run ID: {run_result['id']}")
        console.print(f"Status: {run_result['status']}")

        # Execute locally
        executor = PipelineExecutor(client, run_result["id"])
        executor.execute()

    except Exception as e:
        console.print(f"[red]Failed to run pipeline: {e}[/red]")
        raise typer.Exit(1)


@app.command()
def version():
    """Show version information."""
    console.print(f"Spruce CLI v{__version__}")


if __name__ == "__main__":
    app()
