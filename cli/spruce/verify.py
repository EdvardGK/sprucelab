"""
`spruce verify` — run the verification engine for a model.

Wraps ``POST /api/types/types/verify/?model=<id>`` (IFCTypeViewSet action).
The endpoint runs the engine synchronously and returns the result dict
(``result.to_dict()``), updating ``TypeMapping.verification_status`` rows as a
side effect.
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


verify_app = typer.Typer(help='Run verification engine on a model')

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


@verify_app.callback(invoke_without_command=True)
def verify(
    model: str = typer.Option(..., '--model', help='Model UUID'),
    project_id: Optional[str] = typer.Option(
        None, '--project-id', help='Project UUID (auto-detected from model if omitted)',
    ),
    dry_run: bool = typer.Option(
        False, '--dry-run', '-n',
        help='Preview verification without writing TypeMapping.verification_status rows.',
    ),
    admin_token: Optional[str] = typer.Option(None, '--admin-token'),
    json_out: bool = typer.Option(False, '--json', help='JSON output'),
) -> None:
    """Run the verification engine and print a per-type health summary."""
    params: dict = {'model': model}
    if project_id:
        params['project_id'] = project_id
    if dry_run:
        params['dry_run'] = 'true'

    url = f'{get_api_url()}/api/types/types/verify/'
    try:
        # verify is POST per backend (apps/entities/views/types.py)
        resp = httpx.post(
            url, headers=_admin_headers(admin_token), params=params, json={}, timeout=120,
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        _handle_http(e, json_out=json_out)

    payload = resp.json()
    if json_out:
        sys.stdout.write(json.dumps(payload) + '\n')
        return

    # Human summary — render a header panel of scalar fields + a per-type table
    if dry_run or payload.get('dry_run') is True:
        console.print('[yellow](dry run — no changes persisted)[/yellow]')

    scalar_keys = [
        'model_id', 'project_id', 'health_score', 'passed', 'warnings',
        'failed', 'skipped', 'rules_applied', 'total_types',
    ]
    for k in scalar_keys:
        if k in payload:
            console.print(f'[cyan]{k}[/cyan]: {payload[k]}')

    # Per-type breakdown (shape: result.types: [{type_id, type_name, status, issues}])
    types_rows = payload.get('types') or payload.get('per_type') or []
    if types_rows:
        table = Table(title=f'Verification ({len(types_rows)} types)')
        table.add_column('Type', style='cyan')
        table.add_column('Status', style='bold')
        table.add_column('Issues', justify='right')
        table.add_column('Top issue')
        for row in types_rows:
            type_name = row.get('type_name') or row.get('name') or (row.get('type_id', '') or '')[:8] + '…'
            verification_status = row.get('status') or row.get('verification_status') or '-'
            issues = row.get('issues') or []
            top = issues[0].get('message', '') if issues and isinstance(issues[0], dict) else ''
            table.add_row(type_name, verification_status, str(len(issues)), top)
        console.print(table)
