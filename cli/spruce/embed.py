"""
`spruce embed pass {create,list,revoke,refresh}` — operator surface for the
forward-deployed embed token system.

Auth model:
- The token CRUD endpoints (`/api/embed/tokens/`) require a staff user.
  The CLI authenticates by sending ``Authorization: Bearer <token>`` where
  the token is a Supabase access token for a staff account.
- Source the token from ``$SPRUCELAB_ADMIN_TOKEN`` or pass ``--admin-token``.
- In local dev with ``DEV_AUTH_BYPASS=1`` set on the backend, no token is
  required — the bypass auth class auto-creates the dev staff user.

The refresh subcommand is the exception: it authenticates with the OLD raw
embed token directly (``Authorization: Embed <raw>``) since the operator
won't have a Supabase session for the iframe-side caller.
"""
from __future__ import annotations

import json
import os
from typing import Optional

import httpx
import typer
from rich.console import Console
from rich.table import Table

from .config import get_api_url


embed_app = typer.Typer(help='Embed-token management (forward-deployed dashboards)')
pass_app = typer.Typer(help='Embed pass (scoped capability token) lifecycle')
embed_app.add_typer(pass_app, name='pass')

console = Console()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _admin_token(override: Optional[str]) -> Optional[str]:
    """Resolve the admin Supabase token from the override, then env."""
    if override:
        return override
    return os.environ.get('SPRUCELAB_ADMIN_TOKEN') or None


def _admin_headers(override: Optional[str]) -> dict:
    headers = {'Content-Type': 'application/json'}
    token = _admin_token(override)
    if token:
        headers['Authorization'] = f'Bearer {token}'
    return headers


def _emit(payload: dict, *, json_out: bool, raw_field: Optional[str] = None) -> None:
    if json_out:
        console.print_json(json.dumps(payload))
        return
    for k, v in payload.items():
        if k == raw_field:
            continue
        console.print(f'[cyan]{k}[/cyan]: {v}')
    if raw_field and raw_field in payload:
        console.print()
        console.print(f'[bold yellow]{raw_field} (shown once):[/bold yellow] {payload[raw_field]}')


def _handle_http(err: httpx.HTTPStatusError) -> None:
    """Pretty-print HTTP failures and exit non-zero."""
    body = err.response.text
    try:
        body = json.dumps(err.response.json(), indent=2)
    except Exception:
        pass
    console.print(f'[red]HTTP {err.response.status_code}[/red]\n{body}')
    raise typer.Exit(1)


# ---------------------------------------------------------------------------
# spruce embed pass create
# ---------------------------------------------------------------------------

@pass_app.command('create')
def pass_create(
    project: str = typer.Option(..., '--project', help='Project UUID'),
    name: str = typer.Option(..., '--name', help='Operator-facing label'),
    origin: list[str] = typer.Option(
        ..., '--origin', help='Allowed parent origin (repeatable, at least one required)',
    ),
    capability: Optional[list[str]] = typer.Option(
        None, '--capability',
        help='Capability string (repeatable). Defaults to read:instances + read:capabilities + read:dashboards.',
    ),
    ttl: int = typer.Option(3600, '--ttl', help='Token TTL in seconds (default 3600)'),
    admin_token: Optional[str] = typer.Option(
        None, '--admin-token', help='Override $SPRUCELAB_ADMIN_TOKEN (Supabase staff access token)',
    ),
    json_out: bool = typer.Option(False, '--json', help='JSON output'),
) -> None:
    """Mint a new embed pass for one project + allowed parent origin set."""
    body: dict = {
        'name': name,
        'project_id': project,
        'allowed_origins': list(origin),
        'ttl_seconds': ttl,
    }
    if capability:
        body['capabilities'] = list(capability)

    url = f'{get_api_url()}/api/embed/tokens/'
    try:
        resp = httpx.post(url, headers=_admin_headers(admin_token), json=body, timeout=10)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        _handle_http(e)
    payload = resp.json()
    _emit(payload, json_out=json_out, raw_field='raw_token')


# ---------------------------------------------------------------------------
# spruce embed pass list
# ---------------------------------------------------------------------------

@pass_app.command('list')
def pass_list(
    project: Optional[str] = typer.Option(None, '--project', help='Filter by project UUID'),
    include_revoked: bool = typer.Option(False, '--include-revoked'),
    admin_token: Optional[str] = typer.Option(None, '--admin-token'),
    json_out: bool = typer.Option(False, '--json'),
) -> None:
    """List embed passes (no raw values returned)."""
    params = {}
    if project:
        params['project_id'] = project
    if include_revoked:
        params['include_revoked'] = 'true'

    url = f'{get_api_url()}/api/embed/tokens/'
    try:
        resp = httpx.get(url, headers=_admin_headers(admin_token), params=params, timeout=10)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        _handle_http(e)

    body = resp.json()
    if json_out:
        console.print_json(json.dumps(body))
        return
    rows = body.get('results', [])
    if not rows:
        console.print('[dim]no tokens[/dim]')
        return
    table = Table(title=f"Embed passes ({body.get('count', len(rows))})")
    table.add_column('Prefix', style='cyan')
    table.add_column('Name')
    table.add_column('Project', style='dim')
    table.add_column('Capabilities', style='green')
    table.add_column('Expires')
    table.add_column('Revoked')
    for row in rows:
        table.add_row(
            row.get('prefix', '') + '…',
            row.get('name', ''),
            (row.get('project_id') or '')[:8] + '…',
            ','.join(row.get('capabilities') or []),
            row.get('expires_at') or '-',
            row.get('revoked_at') or '-',
        )
    console.print(table)


# ---------------------------------------------------------------------------
# spruce embed pass revoke
# ---------------------------------------------------------------------------

@pass_app.command('revoke')
def pass_revoke(
    id_or_prefix: str = typer.Argument(..., help='Full UUID or 8-char prefix'),
    reason: str = typer.Option('', '--reason', help='Audit note'),
    admin_token: Optional[str] = typer.Option(None, '--admin-token'),
    json_out: bool = typer.Option(False, '--json'),
) -> None:
    """Revoke an embed pass. Idempotent."""
    params = {'reason': reason} if reason else None
    url = f'{get_api_url()}/api/embed/tokens/{id_or_prefix}/'
    try:
        resp = httpx.delete(url, headers=_admin_headers(admin_token), params=params, timeout=10)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        _handle_http(e)
    _emit(resp.json(), json_out=json_out)


# ---------------------------------------------------------------------------
# spruce embed pass refresh
# ---------------------------------------------------------------------------

@pass_app.command('refresh')
def pass_refresh(
    raw_token: str = typer.Argument(..., help='The current raw embed token (rotates → new)'),
    json_out: bool = typer.Option(False, '--json'),
) -> None:
    """
    Rotate an embed pass: revoke the old raw token and mint a new one with
    the same scope. Authenticates with the OLD token directly — no admin
    Supabase session required.
    """
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Embed {raw_token}',
    }
    url = f'{get_api_url()}/api/embed/tokens/refresh/'
    try:
        resp = httpx.post(url, headers=headers, json={}, timeout=10)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        _handle_http(e)
    _emit(resp.json(), json_out=json_out, raw_field='raw_token')
