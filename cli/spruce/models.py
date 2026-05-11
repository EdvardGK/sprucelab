"""
`spruce models list` — agent-first discovery surface over ``GET /api/models/``.

The CLI wraps Django's ``ModelViewSet`` list endpoint. Used as the fallback
discovery path by the live-API smoke harness so the operator no longer has to
hand-pluck a model UUID into ``SPRUCE_LIVE_MODEL_ID``.

Endpoint:
    GET /api/models/                       (all models)
    GET /api/models/?project=<uuid>        (scoped to one project)
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


models_app = typer.Typer(help='Model management (list, discovery)')

console = Console()


# ---------------------------------------------------------------------------
# Helpers (mirrors verify.py / types.py)
# ---------------------------------------------------------------------------

from ._auth import resolve_token as _admin_token, auth_headers as _admin_headers  # noqa: F401
from ._errors import print_http_error, print_request_error


def _handle_http(err: httpx.HTTPStatusError, *, json_out: bool) -> None:
    print_http_error(console, err, json_out=json_out, command_context='models list')


# ---------------------------------------------------------------------------
# spruce models list
# ---------------------------------------------------------------------------

@models_app.command('list')
def models_list(
    project_id: Optional[str] = typer.Option(
        None, '--project-id', help='Filter to one Project UUID (server filter ?project=<id>)',
    ),
    page_size: int = typer.Option(100, '--page-size', help='DRF page size'),
    admin_token: Optional[str] = typer.Option(None, '--admin-token'),
    json_out: bool = typer.Option(False, '--json', help='JSON output (raw page payload)'),
) -> None:
    """List models known to the API (optionally scoped to one project)."""
    params: dict = {'page_size': page_size}
    if project_id:
        params['project'] = project_id

    url = f'{get_api_url()}/api/models/'
    try:
        resp = httpx.get(url, headers=_admin_headers(admin_token), params=params, timeout=30)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        _handle_http(e, json_out=json_out)
    except httpx.RequestError as e:
        print_request_error(console, e, json_out=json_out, command_context='models list')

    body = resp.json()
    if json_out:
        sys.stdout.write(json.dumps(body) + '\n')
        return

    rows = body.get('results', body) if isinstance(body, dict) else body
    if not rows:
        console.print('[dim]no models[/dim]')
        return

    count = body.get('count', len(rows)) if isinstance(body, dict) else len(rows)
    table = Table(title=f'Models ({count})')
    table.add_column('ID', style='cyan')
    table.add_column('Name')
    table.add_column('Project', style='dim')
    table.add_column('Schema', style='green')
    table.add_column('Status', style='bold')
    for row in rows:
        model_id = row.get('id') or ''
        model_id_short = (model_id[:8] + '…') if model_id else ''
        project_label = row.get('project_name') or (row.get('project') or '')
        # Trim long UUID-style project ids in human view; keep names verbatim.
        if project_label and len(project_label) == 36 and project_label.count('-') == 4:
            project_label = project_label[:8] + '…'
        table.add_row(
            model_id_short,
            row.get('name', '') or '',
            project_label or '-',
            row.get('ifc_schema', '') or '-',
            row.get('status', '') or '-',
        )
    console.print(table)
