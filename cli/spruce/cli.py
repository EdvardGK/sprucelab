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

app = typer.Typer(
    name="spruce",
    help="Sprucelab automation pipeline CLI",
    no_args_is_help=True
)
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
    """Check authentication status."""
    client = SprucelabClient()

    if not client.api_key:
        console.print("[red]Not authenticated. Run 'spruce config init' first.[/red]")
        raise typer.Exit(1)

    if client.heartbeat():
        console.print("[green]Authenticated and connected![/green]")
    else:
        console.print("[yellow]API key set but heartbeat failed. Check your connection.[/yellow]")


@auth_app.command("register")
def auth_register(name: Optional[str] = typer.Option(None, help="Agent name")):
    """Register this machine as an agent."""
    client = SprucelabClient()

    if not name:
        import socket
        name = socket.gethostname()

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
