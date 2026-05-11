"""
`spruce capabilities` — read the public capability manifest.

This is the elevator pitch for agents discovering Sprucelab. The endpoint
itself (`GET /api/capabilities/`) is unauthenticated by design so an agent
can decide whether to use the platform before registering. Human-readable
output is scannable; `--json` is the machine consumer.
"""
from __future__ import annotations

import json
from typing import Optional

import httpx
import typer
from rich.console import Console
from rich.panel import Panel

from .config import get_api_url

app = typer.Typer(help="Read what the Sprucelab API can do (no auth required).")
console = Console()


# Worked examples printed under the manifest in human mode. Each one is
# a copy-paste command sequence agents can try immediately.
WORKED_EXAMPLES = [
    (
        "Authenticate this CLI with a pre-minted token",
        [
            "spruce auth register --url <URL> --token <KEY>",
            "spruce auth status",
        ],
    ),
    (
        "Discover what's on the platform",
        [
            "spruce models list --json",
            "spruce types list --model <MODEL_UUID> --json",
        ],
    ),
    (
        "Walk the universal file substrate",
        [
            "spruce files list --project <PROJECT_UUID> --json",
            "spruce files show <FILE_UUID>",
            "spruce files upload ./drawings/A101.pdf --project <PROJECT_UUID>",
            "spruce files reprocess <FILE_UUID>  # re-run extraction on the same blob",
        ],
    ),
    (
        "Run verification (dry-run is safe — no DB writes)",
        [
            "spruce verify --model <MODEL_UUID> --dry-run",
        ],
    ),
    (
        "Manage webhook subscriptions",
        [
            "spruce webhooks list --json",
            "spruce webhooks create --url https://my-listener.example/hook \\",
            "  --events model.processed,verification.complete --dry-run",
        ],
    ),
]


@app.callback(invoke_without_command=True)
def capabilities(
    url: Optional[str] = typer.Option(None, "--url", "-u", help="Override the configured API URL."),
    json_out: bool = typer.Option(False, "--json", help="Emit raw JSON for piping."),
):
    """
    Print the platform manifest. The first thing any agent should run.
    """
    base = (url or get_api_url()).rstrip("/")
    try:
        resp = httpx.get(f"{base}/api/capabilities/", timeout=10.0)
        resp.raise_for_status()
    except httpx.RequestError as e:
        console.print(f"[red]Connection failed:[/red] {e}")
        console.print(f"  Tried: [dim]{base}/api/capabilities/[/dim]")
        console.print("  Override with [cyan]--url[/cyan] or [cyan]spruce auth register --url ...[/cyan]")
        raise typer.Exit(1)
    except httpx.HTTPStatusError as e:
        console.print(f"[red]HTTP {e.response.status_code}[/red]: {e.response.text[:200]}")
        raise typer.Exit(1)

    data = resp.json()

    if json_out:
        # Machine consumers want pure JSON, no decoration.
        console.print(json.dumps(data, indent=2))
        return

    # Human-readable elevator pitch.
    console.print(Panel.fit(
        f"[bold]{data.get('service', 'Sprucelab')}[/bold]  "
        f"[dim]API v{data.get('api_version', '?')}[/dim]\n"
        f"[dim]{base}[/dim]",
        border_style="cyan",
    ))

    _print_section("File formats accepted (upload to /api/files/)",
                   ", ".join(data.get("file_formats", [])))

    dry_run = data.get("mutations_supporting_dry_run", [])
    if dry_run:
        _print_section(
            f"Mutations that support ?dry_run=true ({len(dry_run)})",
            "\n".join(f"  • {m}" for m in dry_run),
        )

    events = data.get("events", {})
    wired = events.get("wired") or []
    if wired:
        _print_section(
            f"Events emitted via webhooks ({len(wired)})",
            "\n".join(f"  • {e}" for e in wired) +
            f"\n  [dim]subscribe at: {events.get('subscription_endpoint', '/api/automation/webhook-subscriptions/')}[/dim]",
        )

    verification = data.get("verification") or {}
    if verification.get("engine_endpoint"):
        _print_section(
            "Verification engine",
            f"  Endpoint: {verification['engine_endpoint']}\n"
            f"  Rule sources: {', '.join(verification.get('rule_sources') or [])}",
        )

    embed = data.get("embed") or {}
    if embed:
        _print_section(
            "Embeddable dashboards (3rd-party iframes)",
            f"  Capabilities: {embed.get('capabilities_endpoint', '/api/embed/capabilities/')}\n"
            f"  Instances:    {embed.get('instances_endpoint', '/api/embed/instances/')}",
        )

    console.print()
    console.print("[bold]Worked examples:[/bold]")
    console.print()
    for title, cmds in WORKED_EXAMPLES:
        console.print(f"  [bold green]›[/bold green] {title}")
        for cmd in cmds:
            if cmd.startswith("#"):
                console.print(f"    [dim]{cmd}[/dim]")
            else:
                console.print(f"    [cyan]$ {cmd}[/cyan]")
        console.print()

    console.print("[dim]Full manifest as JSON:[/dim] [cyan]spruce capabilities --json[/cyan]")


def _print_section(title: str, body: str):
    console.print()
    console.print(f"[bold]{title}[/bold]")
    console.print(body)
