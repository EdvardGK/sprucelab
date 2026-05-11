"""
`spruce types {list,classify,export}` — agent-first surface over the
`/api/types/` (Django `entities` app) endpoints.

Auth model: same as ``spruce embed`` — Bearer Supabase staff token from
``$SPRUCELAB_ADMIN_TOKEN`` or ``--admin-token`` override.  In local dev with
``DEV_AUTH_BYPASS=1`` on the backend no token is required.

Endpoints wrapped:
- ``GET  /api/types/types/?model=<id>``                       (list)
- ``POST /api/types/type-mappings/bulk-update/``               (classify; supports ``?dry_run=true``)
- ``GET  /api/types/types/export-excel/?model=<id>``           (export ``--format excel``)
- ``GET  /api/types/types/export-reduzer/?model=<id>``         (export ``--format reduzer``)
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Optional

import httpx
import typer
from rich.console import Console
from rich.table import Table

from .config import get_api_url


types_app = typer.Typer(help='Type management (list, classify, export)')

console = Console()


# ---------------------------------------------------------------------------
# Helpers (mirrors embed.py)
# ---------------------------------------------------------------------------

from ._auth import resolve_token as _admin_token  # noqa: F401
from ._errors import print_http_error, print_request_error


def _admin_headers(override: Optional[str], *, accept_json: bool = True) -> dict:
    headers: dict = {}
    if accept_json:
        headers['Content-Type'] = 'application/json'
        headers['Accept'] = 'application/json'
    token = _admin_token(override)
    if token:
        headers['Authorization'] = f'Bearer {token}'
    return headers


def _handle_http(err: httpx.HTTPStatusError, *, json_out: bool, command_context: str = 'types list') -> None:
    print_http_error(console, err, json_out=json_out, command_context=command_context)


# ---------------------------------------------------------------------------
# spruce types list
# ---------------------------------------------------------------------------

@types_app.command('list')
def types_list(
    model: str = typer.Option(..., '--model', help='Model UUID'),
    include_unused: bool = typer.Option(
        False, '--include-unused', help='Include types with 0 instances (template/library types)',
    ),
    page_size: int = typer.Option(100, '--page-size', help='DRF page size (max enforced by server)'),
    admin_token: Optional[str] = typer.Option(None, '--admin-token'),
    json_out: bool = typer.Option(False, '--json', help='JSON output (single page payload)'),
) -> None:
    """List types extracted from a model."""
    params: dict = {'model': model, 'page_size': page_size}
    if include_unused:
        params['include_unused'] = 'true'

    url = f'{get_api_url()}/api/types/types/'
    try:
        resp = httpx.get(url, headers=_admin_headers(admin_token), params=params, timeout=30)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        _handle_http(e, json_out=json_out, command_context='types list')
    except httpx.RequestError as e:
        print_request_error(console, e, json_out=json_out, command_context='types list')

    body = resp.json()
    if json_out:
        sys.stdout.write(json.dumps(body) + '\n')
        return

    rows = body.get('results', body) if isinstance(body, dict) else body
    if not rows:
        console.print('[dim]no types[/dim]')
        return

    table = Table(title=f"Types ({body.get('count', len(rows)) if isinstance(body, dict) else len(rows)})")
    table.add_column('Type ID', style='cyan')
    table.add_column('IFC class', style='green')
    table.add_column('Type name')
    table.add_column('Instances', justify='right')
    for row in rows:
        type_id = (row.get('id') or '')
        type_id_short = (type_id[:8] + '…') if type_id else ''
        props = row.get('properties') or {}
        instance_count = props.get('instance_count')
        if instance_count is None:
            instance_count = row.get('instance_count', '')
        table.add_row(
            type_id_short,
            row.get('ifc_type', '') or '',
            row.get('type_name', '') or '',
            str(instance_count) if instance_count != '' else '-',
        )
    console.print(table)


# ---------------------------------------------------------------------------
# spruce types classify
# ---------------------------------------------------------------------------

@types_app.command('classify')
def types_classify(
    model: str = typer.Option(..., '--model', help='Model UUID (used for context; required by API surface)'),
    type_id: str = typer.Option(..., '--type', help='IFC type UUID to classify'),
    ns3451: Optional[str] = typer.Option(None, '--ns3451', help='NS3451 code (e.g. "222")'),
    unit: Optional[str] = typer.Option(
        None, '--unit', help='Representative unit: m2, m, m3, pcs',
    ),
    notes: Optional[str] = typer.Option(None, '--notes', help='Free-text notes'),
    discipline: Optional[str] = typer.Option(None, '--discipline', help='Discipline (e.g. ARK, RIB)'),
    mapping_status: Optional[str] = typer.Option(
        None, '--mapping-status',
        help='Status: mapped, pending, ignored, review (auto-set to "mapped" when --ns3451 provided)',
    ),
    dry_run: bool = typer.Option(False, '--dry-run', help='Preview without writing'),
    admin_token: Optional[str] = typer.Option(None, '--admin-token'),
    json_out: bool = typer.Option(False, '--json'),
) -> None:
    """Classify a single type via the bulk-update endpoint (single-item array)."""
    if ns3451 is None and unit is None and notes is None and discipline is None and mapping_status is None:
        msg = 'at least one of --ns3451, --unit, --notes, --discipline, --mapping-status must be provided'
        if json_out:
            sys.stdout.write(json.dumps({'error': 'invalid_args', 'detail': msg}) + '\n')
        else:
            console.print(f'[red]{msg}[/red]')
        raise typer.Exit(2)

    item: dict = {'ifc_type_id': type_id}
    if ns3451 is not None:
        item['ns3451_code'] = ns3451
    if unit is not None:
        item['representative_unit'] = unit
    if notes is not None:
        item['notes'] = notes
    if discipline is not None:
        item['discipline'] = discipline
    if mapping_status is not None:
        item['mapping_status'] = mapping_status

    body = {'mappings': [item]}
    params = {'dry_run': 'true'} if dry_run else None

    url = f'{get_api_url()}/api/types/type-mappings/bulk-update/'
    try:
        resp = httpx.post(
            url,
            headers=_admin_headers(admin_token),
            params=params,
            json=body,
            timeout=30,
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        _handle_http(e, json_out=json_out, command_context='types classify')
    except httpx.RequestError as e:
        print_request_error(console, e, json_out=json_out, command_context='types classify')

    payload = resp.json()
    if json_out:
        sys.stdout.write(json.dumps(payload) + '\n')
        return

    console.print(
        f"[green]classify[/green] model=[cyan]{model[:8]}…[/cyan] "
        f"type=[cyan]{type_id[:8]}…[/cyan]"
    )
    for k, v in payload.items():
        console.print(f'  [cyan]{k}[/cyan]: {v}')


# ---------------------------------------------------------------------------
# spruce types export
# ---------------------------------------------------------------------------

@types_app.command('export')
def types_export(
    model: str = typer.Option(..., '--model', help='Model UUID'),
    format: str = typer.Option(  # noqa: A002 — matches CLI surface
        ..., '--format', help='Export format: excel | reduzer',
    ),
    out: Optional[Path] = typer.Option(
        None, '--out', help='Output path. Defaults to stdout (binary).',
    ),
    include_unmapped: bool = typer.Option(
        False, '--include-unmapped',
        help='(reduzer only) include types without NS3451 mapping',
    ),
    admin_token: Optional[str] = typer.Option(None, '--admin-token'),
    json_out: bool = typer.Option(
        False, '--json',
        help='JSON metadata mode (does NOT stream the file; emits {bytes,content_type,filename}).',
    ),
) -> None:
    """Stream the model's Excel or Reduzer export to a file or stdout."""
    fmt = format.lower()
    if fmt == 'excel':
        path = '/api/types/types/export-excel/'
    elif fmt == 'reduzer':
        path = '/api/types/types/export-reduzer/'
    else:
        msg = f"unknown --format '{format}', expected 'excel' or 'reduzer'"
        if json_out:
            sys.stdout.write(json.dumps({'error': 'invalid_args', 'detail': msg}) + '\n')
        else:
            console.print(f'[red]{msg}[/red]')
        raise typer.Exit(2)

    params: dict = {'model': model}
    if fmt == 'reduzer' and include_unmapped:
        params['include_unmapped'] = 'true'

    url = f'{get_api_url()}{path}'
    # accept_json=False — we want the raw binary body, not "Accept: application/json"
    headers = _admin_headers(admin_token, accept_json=False)
    try:
        resp = httpx.get(url, headers=headers, params=params, timeout=120)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        _handle_http(e, json_out=json_out, command_context='types export')
    except httpx.RequestError as e:
        print_request_error(console, e, json_out=json_out, command_context='types export')

    content = resp.content
    content_type = resp.headers.get('content-type', 'application/octet-stream')
    # Extract filename from Content-Disposition if present
    disposition = resp.headers.get('content-disposition', '')
    filename = None
    if 'filename=' in disposition:
        filename = disposition.split('filename=', 1)[1].strip().strip('"')

    if out:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(content)
        if json_out:
            sys.stdout.write(json.dumps({
                'status': 'ok',
                'bytes': len(content),
                'content_type': content_type,
                'filename': filename,
                'out': str(out),
            }) + '\n')
        else:
            console.print(
                f'[green]wrote {len(content)} bytes[/green] -> {out} '
                f'(content-type: {content_type})'
            )
        return

    # stdout mode
    if json_out:
        sys.stdout.write(json.dumps({
            'status': 'ok',
            'bytes': len(content),
            'content_type': content_type,
            'filename': filename,
            'note': 'binary body suppressed in --json metadata mode; rerun with --out to save',
        }) + '\n')
        return

    # Binary to stdout. Status/messages to stderr so they don't corrupt the file.
    sys.stderr.write(
        f'streaming {len(content)} bytes to stdout '
        f'(content-type: {content_type}, filename: {filename or "-"})\n'
    )
    sys.stdout.buffer.write(content)
    sys.stdout.buffer.flush()
