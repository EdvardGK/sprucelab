"""
`spruce claims` — agent-first surface over the claim inbox
(/api/types/claims/) exposed by the entities app.

Endpoints wrapped:
    GET    /api/types/claims/                     (list)
    GET    /api/types/claims/<id>/                (show)
    POST   /api/types/claims/<id>/promote/        (promote; supports ?dry_run=true)
    POST   /api/types/claims/<id>/reject/         (reject with reason; supports ?dry_run=true)

Claims are normative statements extracted from documents. The lifecycle is:
    unresolved → promoted  (POST /promote/)
    unresolved → rejected  (POST /reject/  with reason)
    unresolved → superseded

All mutations support ``?dry_run=true`` per the agent-first design contract.
"""
from __future__ import annotations

import json
import sys
from typing import Optional

import httpx
import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from .config import get_api_url


claims_app = typer.Typer(help='Claim inbox — list, show, promote, reject')

console = Console()


# ---------------------------------------------------------------------------
# Helpers (mirrors webhooks.py / types.py)
# ---------------------------------------------------------------------------

from ._auth import resolve_token as _admin_token  # noqa: F401
from ._errors import print_http_error, print_request_error


def _auth_headers(override: Optional[str] = None) -> dict:
    headers: dict = {'Content-Type': 'application/json', 'Accept': 'application/json'}
    token = _admin_token(override)
    if token:
        headers['Authorization'] = f'Bearer {token}'
    return headers


def _handle_http(
    err: httpx.HTTPStatusError, *, json_out: bool, command_context: str = 'claims list',
) -> None:
    print_http_error(console, err, json_out=json_out, command_context=command_context)


def _shorten(value: Optional[str], n: int = 8) -> str:
    if not value:
        return '-'
    return value[:n] + '…' if len(value) > n else value


def _truncate(value: Optional[str], n: int = 80) -> str:
    if not value:
        return ''
    return value if len(value) <= n else value[: n - 1] + '…'


# ---------------------------------------------------------------------------
# spruce claims list
# ---------------------------------------------------------------------------

@claims_app.command('list')
def claims_list(
    model: Optional[str] = typer.Option(None, '--model', help='Filter by model UUID (source_file)'),
    project: Optional[str] = typer.Option(None, '--project', help='Filter by project UUID'),
    status_filter: Optional[str] = typer.Option(
        None, '--status',
        help='Filter by status: unresolved|promoted|rejected|superseded',
    ),
    claim_type: Optional[str] = typer.Option(
        None, '--claim-type',
        help='Filter by claim type: rule|spec|requirement|constraint|fact',
    ),
    min_confidence: Optional[float] = typer.Option(
        None, '--min-confidence',
        help='Drop claims below this confidence (0.0–1.0, e.g. 0.7)',
    ),
    limit: int = typer.Option(50, '--limit', help='Maximum rows to display'),
    admin_token: Optional[str] = typer.Option(None, '--admin-token'),
    json_out: bool = typer.Option(False, '--json', help='JSON output (raw page payload)'),
) -> None:
    """List claims from the extraction inbox."""
    params: dict = {'page_size': limit}
    if model:
        params['source_file'] = model
    if project:
        params['project'] = project
    if status_filter:
        params['status'] = status_filter
    if claim_type:
        params['claim_type'] = claim_type
    if min_confidence is not None:
        params['min_confidence'] = str(min_confidence)

    url = f'{get_api_url()}/api/types/claims/'
    try:
        resp = httpx.get(url, headers=_auth_headers(admin_token), params=params, timeout=30)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        _handle_http(e, json_out=json_out, command_context='claims list')
    except httpx.RequestError as e:
        print_request_error(console, e, json_out=json_out, command_context='claims list')

    body = resp.json()
    if json_out:
        sys.stdout.write(json.dumps(body) + '\n')
        return

    rows = body.get('results', body) if isinstance(body, dict) else body
    if not rows:
        console.print('[dim]no claims[/dim]')
        return

    count = body.get('count', len(rows)) if isinstance(body, dict) else len(rows)
    table = Table(title=f'Claims ({min(len(rows), limit)}/{count})')
    table.add_column('ID', style='cyan')
    table.add_column('Type', style='green')
    table.add_column('Status', style='bold')
    table.add_column('Conf', justify='right')
    table.add_column('Statement')
    table.add_column('Source', style='dim')

    for row in rows[:limit]:
        claim_id = row.get('id') or ''
        claim_type_val = row.get('claim_type') or '-'
        st = row.get('status') or '-'
        conf = row.get('confidence')
        conf_str = f'{conf:.2f}' if conf is not None else '-'
        statement = _truncate(row.get('statement') or '', 80)
        # source: prefer source_file_name, then source_file id
        source = (
            row.get('source_file_name')
            or _shorten(row.get('source_file') or '', 8)
        )

        # Colour-code status
        status_markup = {
            'unresolved': f'[yellow]{st}[/yellow]',
            'promoted': f'[green]{st}[/green]',
            'rejected': f'[red]{st}[/red]',
            'superseded': f'[dim]{st}[/dim]',
        }.get(st, st)

        table.add_row(
            _shorten(claim_id, 8),
            claim_type_val,
            status_markup,
            conf_str,
            statement,
            source,
        )

    console.print(table)


# ---------------------------------------------------------------------------
# spruce claims show
# ---------------------------------------------------------------------------

@claims_app.command('show')
def claims_show(
    claim_id: str = typer.Argument(..., help='Claim UUID'),
    admin_token: Optional[str] = typer.Option(None, '--admin-token'),
    json_out: bool = typer.Option(False, '--json', help='JSON output (full claim object)'),
) -> None:
    """Show full details of a single claim."""
    url = f'{get_api_url()}/api/types/claims/{claim_id}/'
    try:
        resp = httpx.get(url, headers=_auth_headers(admin_token), timeout=30)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        _handle_http(e, json_out=json_out, command_context='claims show')
    except httpx.RequestError as e:
        print_request_error(console, e, json_out=json_out, command_context='claims show')

    body = resp.json()
    if json_out:
        sys.stdout.write(json.dumps(body) + '\n')
        return

    # Human-friendly render
    st = body.get('status', '-')
    status_color = {
        'unresolved': 'yellow',
        'promoted': 'green',
        'rejected': 'red',
        'superseded': 'dim',
    }.get(st, 'white')

    conf = body.get('confidence')
    conf_str = f'{conf:.3f}' if conf is not None else '-'

    lines = [
        f"[bold]Status:[/bold]      [{status_color}]{st}[/{status_color}]",
        f"[bold]Type:[/bold]        {body.get('claim_type', '-')}",
        f"[bold]Confidence:[/bold]  {conf_str}",
        f"[bold]Extracted:[/bold]   {(body.get('extracted_at') or '')[:19] or '-'}",
    ]

    if body.get('decided_at'):
        lines.append(f"[bold]Decided:[/bold]     {body['decided_at'][:19]}")
    if body.get('rejected_reason'):
        lines.append(f"[bold]Reason:[/bold]      {body['rejected_reason']}")

    statement = body.get('statement') or ''
    lines.append(f"\n[bold]Statement:[/bold]\n{statement}")

    normalized = body.get('normalized')
    if normalized:
        lines.append(f"\n[bold]Normalized:[/bold]\n{json.dumps(normalized, indent=2)}")

    source_location = body.get('source_location')
    if source_location:
        lines.append(f"\n[bold]Source location:[/bold]\n{json.dumps(source_location, indent=2)}")

    console.print(Panel(
        '\n'.join(lines),
        title=f'Claim {_shorten(claim_id, 8)}',
    ))


# ---------------------------------------------------------------------------
# spruce claims promote
# ---------------------------------------------------------------------------

@claims_app.command('promote')
def claims_promote(
    claim_id: str = typer.Argument(..., help='Claim UUID to promote'),
    dry_run: bool = typer.Option(False, '--dry-run', '-n', help='Preview without persisting'),
    admin_token: Optional[str] = typer.Option(None, '--admin-token'),
    json_out: bool = typer.Option(False, '--json', help='JSON output'),
) -> None:
    """Promote a claim into the project's active ProjectConfig."""
    url = f'{get_api_url()}/api/types/claims/{claim_id}/promote/'
    params: dict = {}
    if dry_run:
        params['dry_run'] = 'true'

    try:
        resp = httpx.post(url, headers=_auth_headers(admin_token), params=params, json={}, timeout=30)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        _handle_http(e, json_out=json_out, command_context='claims promote')
    except httpx.RequestError as e:
        print_request_error(console, e, json_out=json_out, command_context='claims promote')

    body = resp.json()
    if json_out:
        sys.stdout.write(json.dumps(body) + '\n')
        return

    status_val = body.get('status') or body.get('claim_status') or '?'
    if dry_run or body.get('dry_run'):
        console.print(
            f'[yellow](dry run)[/yellow] claim [cyan]{_shorten(claim_id, 8)}[/cyan] '
            f'would be promoted → [green]{status_val}[/green]'
        )
    else:
        console.print(
            f'[green]Promoted[/green] claim [cyan]{_shorten(claim_id, 8)}[/cyan] '
            f'→ status=[bold]{status_val}[/bold]'
        )
        if body.get('config_section'):
            console.print(f'  config_section: [cyan]{body["config_section"]}[/cyan]')


# ---------------------------------------------------------------------------
# spruce claims reject
# ---------------------------------------------------------------------------

@claims_app.command('reject')
def claims_reject(
    claim_id: str = typer.Argument(..., help='Claim UUID to reject'),
    reason: str = typer.Option(..., '--reason', help='Reason for rejection (required)'),
    dry_run: bool = typer.Option(False, '--dry-run', '-n', help='Preview without persisting'),
    admin_token: Optional[str] = typer.Option(None, '--admin-token'),
    json_out: bool = typer.Option(False, '--json', help='JSON output'),
) -> None:
    """Reject a claim with an explicit reason."""
    url = f'{get_api_url()}/api/types/claims/{claim_id}/reject/'
    params: dict = {}
    if dry_run:
        params['dry_run'] = 'true'

    try:
        resp = httpx.post(
            url,
            headers=_auth_headers(admin_token),
            params=params,
            json={'reason': reason},
            timeout=30,
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        _handle_http(e, json_out=json_out, command_context='claims reject')
    except httpx.RequestError as e:
        print_request_error(console, e, json_out=json_out, command_context='claims reject')

    body = resp.json()
    if json_out:
        sys.stdout.write(json.dumps(body) + '\n')
        return

    status_val = body.get('status') or body.get('claim_status') or '?'
    if dry_run or body.get('dry_run'):
        console.print(
            f'[yellow](dry run)[/yellow] claim [cyan]{_shorten(claim_id, 8)}[/cyan] '
            f'would be rejected — reason: "{reason}"'
        )
    else:
        console.print(
            f'[red]Rejected[/red] claim [cyan]{_shorten(claim_id, 8)}[/cyan] '
            f'→ status=[bold]{status_val}[/bold]'
        )
        if reason:
            console.print(f'  reason: {reason}')
