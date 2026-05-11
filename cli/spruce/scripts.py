"""
`spruce scripts {list,run}` — wrappers for `/api/scripts/` (apps/scripting).

- ``GET  /api/scripts/``                — list scripts (ScriptListSerializer)
- ``POST /api/scripts/{id}/execute/``    — execute a script on a model
"""
from __future__ import annotations

import json
import os
import sys
from typing import Optional

import httpx
import typer
from rich.console import Console
from rich.table import Table

from .config import get_api_url


scripts_app = typer.Typer(help='Manage and run scripts')

console = Console()


def _admin_token(override: Optional[str]) -> Optional[str]:
    if override:
        return override
    return os.environ.get('SPRUCELAB_ADMIN_TOKEN') or None


def _admin_headers(override: Optional[str]) -> dict:
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json'}
    token = _admin_token(override)
    if token:
        headers['Authorization'] = f'Bearer {token}'
    return headers


def _handle_http(err: httpx.HTTPStatusError, *, json_out: bool) -> None:
    body_text = err.response.text
    parsed = None
    try:
        parsed = err.response.json()
    except Exception:
        pass
    if json_out:
        payload = {
            'error': f'HTTP {err.response.status_code}',
            'detail': parsed if parsed is not None else body_text,
        }
        sys.stdout.write(json.dumps(payload) + '\n')
    else:
        body_pretty = json.dumps(parsed, indent=2) if parsed is not None else body_text
        console.print(f'[red]HTTP {err.response.status_code}[/red]\n{body_pretty}')
    raise typer.Exit(1)


# ---------------------------------------------------------------------------
# spruce scripts list
# ---------------------------------------------------------------------------

@scripts_app.command('list')
def scripts_list(
    category: Optional[str] = typer.Option(None, '--category', help='Filter by category'),
    page_size: int = typer.Option(100, '--page-size'),
    admin_token: Optional[str] = typer.Option(None, '--admin-token'),
    json_out: bool = typer.Option(False, '--json'),
) -> None:
    """List available scripts."""
    params: dict = {'page_size': page_size}
    if category:
        params['category'] = category

    url = f'{get_api_url()}/api/scripts/'
    try:
        resp = httpx.get(url, headers=_admin_headers(admin_token), params=params, timeout=30)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        _handle_http(e, json_out=json_out)

    body = resp.json()
    if json_out:
        sys.stdout.write(json.dumps(body) + '\n')
        return

    rows = body.get('results', body) if isinstance(body, dict) else body
    if not rows:
        console.print('[dim]no scripts[/dim]')
        return

    table = Table(title=f"Scripts ({body.get('count', len(rows)) if isinstance(body, dict) else len(rows)})")
    table.add_column('ID', style='cyan')
    table.add_column('Name')
    table.add_column('Category', style='green')
    table.add_column('Type', style='dim')
    table.add_column('Runs', justify='right')
    for row in rows:
        script_id = row.get('id', '') or ''
        table.add_row(
            (script_id[:8] + '…') if script_id else '',
            row.get('name', '') or '',
            row.get('category', '') or '-',
            row.get('script_type', '') or '-',
            str(row.get('execution_count', '')) if row.get('execution_count') is not None else '-',
        )
    console.print(table)


# ---------------------------------------------------------------------------
# spruce scripts run
# ---------------------------------------------------------------------------

@scripts_app.command('run')
def scripts_run(
    script: str = typer.Option(..., '--script', help='Script UUID'),
    model: str = typer.Option(..., '--model', help='Model UUID to run the script against'),
    parameters: Optional[str] = typer.Option(
        None, '--parameters',
        help='JSON object string of parameters matching the script parameters_schema',
    ),
    admin_token: Optional[str] = typer.Option(None, '--admin-token'),
    json_out: bool = typer.Option(False, '--json'),
) -> None:
    """Execute a script on a model. Returns the ScriptExecution record."""
    body: dict = {'model_id': model}
    if parameters is not None:
        try:
            parsed_params = json.loads(parameters)
        except json.JSONDecodeError as e:
            msg = f'--parameters must be a JSON object string: {e}'
            if json_out:
                sys.stdout.write(json.dumps({'error': 'invalid_args', 'detail': msg}) + '\n')
            else:
                console.print(f'[red]{msg}[/red]')
            raise typer.Exit(2)
        body['parameters'] = parsed_params

    url = f'{get_api_url()}/api/scripts/{script}/execute/'
    try:
        # Long timeout — execute_script runs synchronously
        resp = httpx.post(url, headers=_admin_headers(admin_token), json=body, timeout=600)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        _handle_http(e, json_out=json_out)

    payload = resp.json()
    if json_out:
        sys.stdout.write(json.dumps(payload) + '\n')
        return

    # Human summary
    status_str = payload.get('status', '?')
    color = {'success': 'green', 'error': 'red', 'running': 'yellow'}.get(status_str, 'white')
    console.print(
        f'[{color}]{status_str}[/{color}] '
        f"script=[cyan]{(payload.get('script_name') or script)}[/cyan] "
        f"model=[cyan]{(payload.get('model_name') or model)}[/cyan] "
        f"duration={payload.get('duration_ms', '-')}ms"
    )
    if payload.get('error_message'):
        console.print(f"[red]error_message[/red]: {payload['error_message']}")
    out_log = payload.get('output_log')
    if out_log:
        console.print('[dim]--- output_log ---[/dim]')
        console.print(out_log)
