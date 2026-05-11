"""
`spruce log list` — drill the Layer-1 observation stream.

Wraps ``GET /api/types/observations/``. Filters mirror the backend's query
parameters one-to-one so agents who learned the API surface immediately
know the CLI flags.
"""
from __future__ import annotations

import json
import sys
from typing import Optional

import httpx
import typer
from rich.console import Console
from rich.table import Table

from .config import get_api_url
from ._auth import auth_headers as _admin_headers


log_app = typer.Typer(help="Drill the observation log (raw extracted facts).")
console = Console()


CATEGORIES = (
    'text_block', 'layer', 'annotation', 'title_block_field',
    'sheet_metadata', 'file_metadata', 'extraction_event', 'other',
)


def _handle_http(err: httpx.HTTPStatusError, *, json_out: bool) -> None:
    body_text = err.response.text
    parsed = None
    try:
        parsed = err.response.json()
    except Exception:
        pass
    if json_out:
        payload = parsed if parsed is not None else {'detail': body_text[:500]}
        sys.stdout.write(json.dumps({
            'error': 'http_error',
            'status': err.response.status_code,
            'body': payload,
        }, indent=2))
        sys.stdout.write('\n')
    else:
        console.print(f'[red]HTTP {err.response.status_code}[/red]')
        console.print(body_text[:500])
    raise typer.Exit(1)


@log_app.command('list')
def list_observations(
    source_file: Optional[str] = typer.Option(None, '--source-file', help='Filter to one SourceFile (UUID).'),
    sheet: Optional[str] = typer.Option(None, '--sheet', help='Filter to one DrawingSheet (UUID).'),
    extraction_run: Optional[str] = typer.Option(None, '--extraction-run', help='Filter to one ExtractionRun (UUID).'),
    project: Optional[str] = typer.Option(None, '--project', help='Filter to one Project (UUID) — spans all files in the project.'),
    category: Optional[str] = typer.Option(
        None, '--category', '-c',
        help=f'Filter by category (comma-separated). One of: {", ".join(CATEGORIES)}.',
    ),
    search: Optional[str] = typer.Option(None, '--search', '-s', help='Case-insensitive substring match across key + content.'),
    page_index: Optional[int] = typer.Option(None, '--page-index', help='Filter to a specific page (for multi-page PDFs).'),
    limit: int = typer.Option(50, '--limit', '-n', help='Max rows to fetch from the first page (DRF default page size is 100).'),
    json_out: bool = typer.Option(False, '--json', help='Emit raw JSON for piping.'),
    admin_token: Optional[str] = typer.Option(None, '--token', help='Override token resolution (env / keyring).'),
):
    """List observations from the log with filters."""
    if category:
        for c in [c.strip() for c in category.split(',') if c.strip()]:
            if c not in CATEGORIES:
                console.print(f'[red]Unknown category:[/red] {c}')
                console.print(f'  Allowed: {", ".join(CATEGORIES)}')
                raise typer.Exit(2)

    url = f"{get_api_url().rstrip('/')}/api/types/observations/"
    params: dict = {}
    if source_file:
        params['source_file'] = source_file
    if sheet:
        params['sheet'] = sheet
    if extraction_run:
        params['extraction_run'] = extraction_run
    if project:
        params['project'] = project
    if category:
        params['category'] = category
    if search:
        params['search'] = search
    if page_index is not None:
        params['page_index'] = page_index

    try:
        resp = httpx.get(url, headers=_admin_headers(admin_token), params=params, timeout=30)
        resp.raise_for_status()
    except httpx.HTTPStatusError as err:
        _handle_http(err, json_out=json_out)
        return
    except httpx.RequestError as err:
        if json_out:
            sys.stdout.write(json.dumps({'error': 'request_failed', 'detail': str(err)}, indent=2) + '\n')
        else:
            console.print(f'[red]Request failed:[/red] {err}')
        raise typer.Exit(1)

    body = resp.json()
    results = body.get('results', body) if isinstance(body, dict) else body
    if not isinstance(results, list):
        results = []

    truncated = results[:limit]

    if json_out:
        sys.stdout.write(json.dumps({
            'count': body.get('count') if isinstance(body, dict) else len(results),
            'returned': len(truncated),
            'results': truncated,
        }, indent=2) + '\n')
        return

    total = body.get('count') if isinstance(body, dict) else len(results)
    if not truncated:
        console.print(f'[dim]No observations matched (total in scope: {total or 0}).[/dim]')
        return

    table = Table(
        title=f'Observations  ·  showing {len(truncated)} of {total or len(truncated)}',
        show_lines=False,
    )
    table.add_column('Category', style='cyan', no_wrap=True)
    table.add_column('Key', style='magenta', no_wrap=False, max_width=24)
    table.add_column('Content', no_wrap=False, max_width=60)
    table.add_column('Sheet', style='dim', no_wrap=True, max_width=12)
    table.add_column('Page', style='dim', justify='right', no_wrap=True)
    table.add_column('File', style='dim', no_wrap=False, max_width=24)

    for obs in truncated:
        content = obs.get('content') or ''
        if len(content) > 200:
            content = content[:197] + '…'
        sheet_id = obs.get('sheet') or ''
        if sheet_id:
            sheet_id = sheet_id[:8] + '…'
        page = obs.get('page_index')
        page_text = '' if page is None else str(page)
        filename = obs.get('original_filename') or ''
        table.add_row(
            obs.get('category') or '',
            obs.get('key') or '',
            content,
            sheet_id,
            page_text,
            filename,
        )

    console.print(table)
    if total and total > len(truncated):
        console.print(f'[dim]+{total - len(truncated)} more — increase --limit or filter further.[/dim]')
