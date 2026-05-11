"""
`spruce files` — agent-first vertical over the universal file substrate.

Mirrors the platform's data model: every file dropped into Sprucelab is a
``SourceFile`` (Layer 0). This command group wraps the
``GET/POST /api/files/`` surface so agents can list, inspect, upload,
download, reprocess, and walk the version chain of source files without
clicking through the UI.

Endpoints used:
    GET    /api/files/                       list (filters: project, scope, format, is_current)
    GET    /api/files/<id>/                  detail (embeds extraction_runs)
    POST   /api/files/                       universal multipart upload
    POST   /api/files/<id>/reprocess/        re-run extraction over the same blob
    (download streams the blob from the SourceFile's ``file_url``)
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
from ._auth import auth_headers as _admin_headers, resolve_token as _admin_token
from ._errors import print_http_error, print_request_error


files_app = typer.Typer(help='Universal file substrate — upload, list, inspect, reprocess SourceFiles.')
console = Console()


# Format choices mirror SourceFile.FORMAT_CHOICES on the backend. Kept here
# so the CLI can validate before issuing a request the server would 400.
FORMATS = (
    'ifc', 'las', 'laz', 'e57',
    'dwg', 'dxf', 'pdf',
    'docx', 'xlsx', 'pptx',
    'csv', 'json', 'xml', 'svg',
    'other',
)

ON_DUPLICATE_CHOICES = ('ask', 'use_existing', 'replace')


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _handle_http(
    err: httpx.HTTPStatusError,
    *, json_out: bool, command_context: str = 'files list',
) -> None:
    print_http_error(console, err, json_out=json_out, command_context=command_context)


def _short(uuid_str: Optional[str], n: int = 8) -> str:
    if not uuid_str:
        return ''
    return uuid_str[:n] + '…' if len(uuid_str) > n else uuid_str


def _human_size(num_bytes: int) -> str:
    """Tiny human-readable byte formatter (KB/MB/GB)."""
    if num_bytes is None:
        return ''
    size = float(num_bytes)
    for unit in ('B', 'KB', 'MB', 'GB', 'TB'):
        if size < 1024.0 or unit == 'TB':
            if unit == 'B':
                return f'{int(size)} {unit}'
            return f'{size:.1f} {unit}'
        size /= 1024.0
    return f'{num_bytes} B'


# ---------------------------------------------------------------------------
# spruce files list
# ---------------------------------------------------------------------------

@files_app.command('list')
def files_list(
    project: Optional[str] = typer.Option(None, '--project', help='Filter to one Project (UUID).'),
    scope: Optional[str] = typer.Option(None, '--scope', help='Filter to one ProjectScope (UUID).'),
    fmt: Optional[str] = typer.Option(
        None, '--format', '-f',
        help=f'Filter by format. One of: {", ".join(FORMATS)}.',
    ),
    current_only: bool = typer.Option(
        False, '--current-only',
        help='Only show is_current=true rows (latest version per filename chain).',
    ),
    limit: int = typer.Option(50, '--limit', '-n', help='Max rows to print (DRF page size is 100).'),
    page_size: int = typer.Option(100, '--page-size', help='DRF page_size to request from the server.'),
    json_out: bool = typer.Option(False, '--json', help='Emit raw JSON for piping.'),
    admin_token: Optional[str] = typer.Option(None, '--token', help='Override token resolution (env / keyring).'),
):
    """List SourceFiles with optional filters."""
    if fmt and fmt not in FORMATS:
        console.print(f'[red]Unknown format:[/red] {fmt}')
        console.print(f'  Allowed: {", ".join(FORMATS)}')
        console.print('  [dim]Try:[/dim] [cyan]spruce files list --format ifc[/cyan]')
        raise typer.Exit(2)

    url = f"{get_api_url().rstrip('/')}/api/files/"
    params: dict = {'page_size': page_size}
    if project:
        params['project'] = project
    if scope:
        params['scope'] = scope
    if fmt:
        params['format'] = fmt
    if current_only:
        params['is_current'] = 'true'

    try:
        resp = httpx.get(url, headers=_admin_headers(admin_token), params=params, timeout=30)
        resp.raise_for_status()
    except httpx.HTTPStatusError as err:
        _handle_http(err, json_out=json_out, command_context='files list')
        return
    except httpx.RequestError as err:
        print_request_error(console, err, json_out=json_out, command_context='files list')
        return

    body = resp.json()
    results = body.get('results', body) if isinstance(body, dict) else body
    if not isinstance(results, list):
        results = []
    truncated = results[:limit]
    total = body.get('count') if isinstance(body, dict) else len(results)

    if json_out:
        sys.stdout.write(json.dumps({
            'count': total,
            'returned': len(truncated),
            'results': truncated,
        }, indent=2) + '\n')
        return

    if not truncated:
        console.print(f'[dim]No files matched (total in scope: {total or 0}).[/dim]')
        console.print('  [dim]Try:[/dim] [cyan]spruce files list --json  # widen the filter[/cyan]')
        return

    table = Table(
        title=f'SourceFiles  ·  showing {len(truncated)} of {total or len(truncated)}',
        show_lines=False,
    )
    table.add_column('ID', style='cyan', no_wrap=True)
    table.add_column('Filename', no_wrap=False, max_width=40)
    table.add_column('Format', style='green', no_wrap=True)
    table.add_column('Size', justify='right', no_wrap=True)
    table.add_column('Ver', justify='right', no_wrap=True)
    table.add_column('Cur', justify='center', no_wrap=True)
    table.add_column('Extraction', style='magenta', no_wrap=True)
    table.add_column('Project', style='dim', no_wrap=True)

    for row in truncated:
        project_label = row.get('project_name') or _short(row.get('project') or '')
        table.add_row(
            _short(row.get('id') or ''),
            row.get('original_filename') or '',
            row.get('format') or '',
            _human_size(row.get('file_size') or 0),
            str(row.get('version_number') or ''),
            '✓' if row.get('is_current') else '',
            row.get('latest_extraction_status') or '-',
            project_label or '-',
        )

    console.print(table)
    if total and total > len(truncated):
        console.print(f'[dim]+{total - len(truncated)} more — increase --limit or filter further.[/dim]')
        console.print('  [dim]Try:[/dim] [cyan]spruce files list --limit 200[/cyan]')


# ---------------------------------------------------------------------------
# spruce files show <id>
# ---------------------------------------------------------------------------

@files_app.command('show')
def files_show(
    file_id: str = typer.Argument(..., help='SourceFile UUID.'),
    json_out: bool = typer.Option(False, '--json', help='Emit raw JSON for piping.'),
    admin_token: Optional[str] = typer.Option(None, '--token', help='Override token resolution (env / keyring).'),
):
    """Show one SourceFile with its extraction-run history."""
    url = f"{get_api_url().rstrip('/')}/api/files/{file_id}/"
    try:
        resp = httpx.get(url, headers=_admin_headers(admin_token), timeout=30)
        resp.raise_for_status()
    except httpx.HTTPStatusError as err:
        _handle_http(err, json_out=json_out, command_context='files show')
        return
    except httpx.RequestError as err:
        print_request_error(console, err, json_out=json_out, command_context='files show')
        return

    body = resp.json()

    if json_out:
        sys.stdout.write(json.dumps(body, indent=2) + '\n')
        return

    # Header
    console.print()
    console.print(f"[bold cyan]{body.get('original_filename', '<unnamed>')}[/bold cyan]  "
                  f"[dim]{body.get('id')}[/dim]")
    console.print(
        f"  format: [green]{body.get('format') or '-'}[/green]  "
        f"size: {_human_size(body.get('file_size') or 0)}  "
        f"version: v{body.get('version_number') or '?'}  "
        f"current: {'✓' if body.get('is_current') else '✗'}"
    )
    project_label = body.get('project_name') or _short(body.get('project') or '')
    console.print(f"  project: [dim]{project_label or '-'}[/dim]")
    if body.get('checksum_sha256'):
        console.print(f"  sha256:  [dim]{body['checksum_sha256'][:16]}…[/dim]")
    if body.get('uploaded_at'):
        console.print(f"  uploaded_at: [dim]{body['uploaded_at']}[/dim]")
    if body.get('file_url'):
        console.print(f"  file_url: [dim]{body['file_url']}[/dim]")

    runs = body.get('extraction_runs') or []
    console.print()
    if not runs:
        console.print('[dim]No extraction runs yet.[/dim]')
        console.print(f'  [dim]Try:[/dim] [cyan]spruce files reprocess {file_id}[/cyan]')
        return

    table = Table(title=f'Extraction runs ({len(runs)})', show_lines=False)
    table.add_column('Run ID', style='cyan', no_wrap=True)
    table.add_column('Status', style='bold', no_wrap=True)
    table.add_column('Started', style='dim', no_wrap=True)
    table.add_column('Duration', justify='right', no_wrap=True)
    table.add_column('Extractor', style='dim', no_wrap=True)
    table.add_column('Error', no_wrap=False, max_width=40)

    for run in runs:
        duration = run.get('duration_seconds')
        duration_str = f'{duration:.1f}s' if isinstance(duration, (int, float)) else '-'
        started = (run.get('started_at') or '')[:19]
        status = run.get('status') or ''
        status_color = {
            'completed': 'green', 'failed': 'red',
            'running': 'yellow', 'pending': 'blue',
        }.get(status, 'white')
        table.add_row(
            _short(run.get('id') or ''),
            f'[{status_color}]{status}[/{status_color}]',
            started,
            duration_str,
            run.get('extractor_version') or '-',
            (run.get('error_message') or '')[:200],
        )

    console.print(table)
    console.print()
    console.print('  [dim]Try:[/dim] '
                  f'[cyan]spruce log list --source-file {file_id}[/cyan]'
                  '  # drill into observations from this file')


# ---------------------------------------------------------------------------
# spruce files upload <path>
# ---------------------------------------------------------------------------

@files_app.command('upload')
def files_upload(
    path: str = typer.Argument(..., help='Local file path to upload.'),
    project: str = typer.Option(..., '--project', help='Target Project UUID (required).'),
    on_duplicate: str = typer.Option(
        'use_existing', '--on-duplicate',
        help=f'Duplicate handling. One of: {", ".join(ON_DUPLICATE_CHOICES)}. Default use_existing (idempotent).',
    ),
    json_out: bool = typer.Option(False, '--json', help='Emit raw JSON for piping.'),
    admin_token: Optional[str] = typer.Option(None, '--token', help='Override token resolution (env / keyring).'),
):
    """Upload a local file to a project (multipart POST /api/files/)."""
    if on_duplicate not in ON_DUPLICATE_CHOICES:
        console.print(f'[red]Unknown --on-duplicate:[/red] {on_duplicate}')
        console.print(f'  Allowed: {", ".join(ON_DUPLICATE_CHOICES)}')
        raise typer.Exit(2)

    src = Path(path).expanduser()
    if not src.exists() or not src.is_file():
        msg = f'File not found or not a regular file: {src}'
        if json_out:
            sys.stdout.write(json.dumps({'error': 'file_not_found', 'path': str(src)}, indent=2) + '\n')
        else:
            console.print(f'[red]{msg}[/red]')
            console.print('  [dim]Try:[/dim] [cyan]ls -la <path>[/cyan]')
        raise typer.Exit(1)

    url = f"{get_api_url().rstrip('/')}/api/files/?on_duplicate={on_duplicate}"

    # Multipart upload — strip Content-Type from the JSON helper headers so
    # httpx can set its own multipart boundary. _admin_headers() yields a
    # dict with 'Content-Type: application/json' for the JSON path.
    headers = _admin_headers(admin_token)
    headers.pop('Content-Type', None)

    try:
        with src.open('rb') as fh:
            files_payload = {'file': (src.name, fh, 'application/octet-stream')}
            data_payload = {'project_id': project}
            resp = httpx.post(
                url,
                headers=headers,
                files=files_payload,
                data=data_payload,
                timeout=300,  # large IFCs may take a while to upload
            )
        resp.raise_for_status()
    except httpx.HTTPStatusError as err:
        _handle_http(err, json_out=json_out, command_context='files upload')
        return
    except httpx.RequestError as err:
        print_request_error(console, err, json_out=json_out, command_context='files upload')
        return

    body = resp.json()

    if json_out:
        sys.stdout.write(json.dumps(body, indent=2) + '\n')
        return

    if body.get('duplicate'):
        existing = body.get('existing_file') or {}
        console.print(f'[yellow]Duplicate detected (on_duplicate=ask).[/yellow]')
        console.print(f'  existing: [cyan]{existing.get("id")}[/cyan]  '
                      f'{existing.get("original_filename")}')
        console.print('  [dim]Try:[/dim] '
                      f'[cyan]spruce files upload {src} --project {project} --on-duplicate replace[/cyan]'
                      '  # store as a new version')
        return

    sf_id = body.get('id') or '?'
    console.print(f'[green]✓ Uploaded:[/green] {src.name}')
    console.print(f'  id:       [cyan]{sf_id}[/cyan]')
    console.print(f'  format:   [green]{body.get("format") or "-"}[/green]')
    console.print(f'  version:  v{body.get("version_number") or "?"}')
    run = body.get('extraction_run') or {}
    if run:
        console.print(f'  extraction: [magenta]{run.get("status") or "?"}[/magenta]  '
                      f'(run {_short(run.get("id"))})')
    console.print()
    console.print(f'  [dim]Try:[/dim] [cyan]spruce files show {sf_id}[/cyan]')


# ---------------------------------------------------------------------------
# spruce files download <id>
# ---------------------------------------------------------------------------

@files_app.command('download')
def files_download(
    file_id: str = typer.Argument(..., help='SourceFile UUID.'),
    out: Optional[str] = typer.Option(None, '--out', '-o', help='Output path (default: ./<original_filename>).'),
    overwrite: bool = typer.Option(False, '--overwrite', help='Overwrite the destination if it already exists.'),
    json_out: bool = typer.Option(False, '--json', help='Emit raw JSON manifest instead of streaming.'),
    admin_token: Optional[str] = typer.Option(None, '--token', help='Override token resolution (env / keyring).'),
):
    """Download a SourceFile's blob from its ``file_url``."""
    # Step 1: fetch the SourceFile detail to learn ``file_url`` + filename.
    detail_url = f"{get_api_url().rstrip('/')}/api/files/{file_id}/"
    try:
        resp = httpx.get(detail_url, headers=_admin_headers(admin_token), timeout=30)
        resp.raise_for_status()
    except httpx.HTTPStatusError as err:
        _handle_http(err, json_out=json_out, command_context='files download')
        return
    except httpx.RequestError as err:
        print_request_error(console, err, json_out=json_out, command_context='files download')
        return

    body = resp.json()
    file_url = body.get('file_url')
    original_name = body.get('original_filename') or file_id

    if not file_url:
        msg = 'SourceFile has no file_url; nothing to download.'
        if json_out:
            sys.stdout.write(json.dumps({
                'error': 'no_file_url', 'detail': msg, 'file_id': file_id,
            }, indent=2) + '\n')
        else:
            console.print(f'[red]{msg}[/red]')
        raise typer.Exit(1)

    dest = Path(out).expanduser() if out else Path(original_name)
    if dest.exists() and not overwrite:
        msg = f'Destination already exists: {dest} (use --overwrite to replace).'
        if json_out:
            sys.stdout.write(json.dumps({
                'error': 'destination_exists', 'detail': msg, 'path': str(dest),
            }, indent=2) + '\n')
        else:
            console.print(f'[red]{msg}[/red]')
            console.print('  [dim]Try:[/dim] '
                          f'[cyan]spruce files download {file_id} --out {dest} --overwrite[/cyan]')
        raise typer.Exit(1)

    # Step 2: stream the blob. Auth header isn't generally needed for the
    # public Supabase URL the API hands back, but we include the token if we
    # have one in case the storage backend ever moves behind the same auth.
    download_headers = {}
    token = _admin_token(admin_token)
    if token:
        download_headers['Authorization'] = f'Bearer {token}'

    bytes_written = 0
    try:
        with httpx.stream('GET', file_url, headers=download_headers, timeout=300) as stream:
            stream.raise_for_status()
            with dest.open('wb') as fh:
                for chunk in stream.iter_bytes():
                    fh.write(chunk)
                    bytes_written += len(chunk)
    except httpx.HTTPStatusError as err:
        _handle_http(err, json_out=json_out, command_context='files download')
        return
    except httpx.RequestError as err:
        print_request_error(console, err, json_out=json_out, command_context='files download')
        return

    result = {
        'file_id': file_id,
        'path': str(dest.resolve()),
        'bytes_written': bytes_written,
        'original_filename': original_name,
    }
    if json_out:
        sys.stdout.write(json.dumps(result, indent=2) + '\n')
        return

    console.print(f'[green]✓ Downloaded:[/green] {dest}')
    console.print(f'  size: {_human_size(bytes_written)}')


# ---------------------------------------------------------------------------
# spruce files reprocess <id>
# ---------------------------------------------------------------------------

@files_app.command('reprocess')
def files_reprocess(
    file_id: str = typer.Argument(..., help='SourceFile UUID.'),
    json_out: bool = typer.Option(False, '--json', help='Emit raw JSON for piping.'),
    admin_token: Optional[str] = typer.Option(None, '--token', help='Override token resolution (env / keyring).'),
):
    """Trigger a fresh ExtractionRun over a SourceFile."""
    url = f"{get_api_url().rstrip('/')}/api/files/{file_id}/reprocess/"
    headers = _admin_headers(admin_token)
    try:
        resp = httpx.post(url, headers=headers, timeout=60)
        resp.raise_for_status()
    except httpx.HTTPStatusError as err:
        _handle_http(err, json_out=json_out, command_context='files reprocess')
        return
    except httpx.RequestError as err:
        print_request_error(console, err, json_out=json_out, command_context='files reprocess')
        return

    body = resp.json()
    if json_out:
        sys.stdout.write(json.dumps(body, indent=2) + '\n')
        return

    status = body.get('status') or '?'
    run_id = body.get('id') or ''
    console.print(f'[green]✓ Reprocess queued.[/green]')
    if run_id:
        console.print(f'  run id: [cyan]{run_id}[/cyan]')
    console.print(f'  status: [magenta]{status}[/magenta]')
    console.print()
    console.print(f'  [dim]Try:[/dim] [cyan]spruce files show {file_id}[/cyan]'
                  '  # poll for the new run to land in extraction_runs')


# ---------------------------------------------------------------------------
# spruce files versions <id>
# ---------------------------------------------------------------------------

@files_app.command('versions')
def files_versions(
    file_id: str = typer.Argument(..., help='SourceFile UUID.'),
    json_out: bool = typer.Option(False, '--json', help='Emit raw JSON for piping.'),
    admin_token: Optional[str] = typer.Option(None, '--token', help='Override token resolution (env / keyring).'),
):
    """
    List all versions of a SourceFile's filename chain (same project + filename).

    There is no dedicated /versions/ endpoint yet — we look the file up,
    then list /api/files/?project=<id> and filter client-side by
    ``original_filename``. Cheap because list responses are paginated and
    a single project rarely carries thousands of files.
    """
    headers = _admin_headers(admin_token)

    # Step 1: detail to learn project + filename.
    detail_url = f"{get_api_url().rstrip('/')}/api/files/{file_id}/"
    try:
        detail_resp = httpx.get(detail_url, headers=headers, timeout=30)
        detail_resp.raise_for_status()
    except httpx.HTTPStatusError as err:
        _handle_http(err, json_out=json_out, command_context='files versions')
        return
    except httpx.RequestError as err:
        print_request_error(console, err, json_out=json_out, command_context='files versions')
        return

    detail = detail_resp.json()
    project_id = detail.get('project')
    filename = detail.get('original_filename')
    if not project_id or not filename:
        msg = 'SourceFile is missing project_id or original_filename; cannot resolve version chain.'
        if json_out:
            sys.stdout.write(json.dumps({'error': 'incomplete_record', 'detail': msg}, indent=2) + '\n')
        else:
            console.print(f'[red]{msg}[/red]')
        raise typer.Exit(1)

    # Step 2: list within the project, filter on filename.
    list_url = f"{get_api_url().rstrip('/')}/api/files/"
    try:
        list_resp = httpx.get(
            list_url, headers=headers,
            params={'project': project_id, 'page_size': 200},
            timeout=30,
        )
        list_resp.raise_for_status()
    except httpx.HTTPStatusError as err:
        _handle_http(err, json_out=json_out, command_context='files versions')
        return
    except httpx.RequestError as err:
        print_request_error(console, err, json_out=json_out, command_context='files versions')
        return

    list_body = list_resp.json()
    rows = list_body.get('results', list_body) if isinstance(list_body, dict) else list_body
    if not isinstance(rows, list):
        rows = []
    versions = [r for r in rows if r.get('original_filename') == filename]
    versions.sort(key=lambda r: r.get('version_number') or 0)

    if json_out:
        sys.stdout.write(json.dumps({
            'file_id': file_id,
            'project': project_id,
            'original_filename': filename,
            'count': len(versions),
            'results': versions,
        }, indent=2) + '\n')
        return

    if not versions:
        console.print(f'[dim]No versions found for {filename} in this project.[/dim]')
        return

    console.print()
    console.print(f'[bold]Versions of[/bold] [cyan]{filename}[/cyan]  '
                  f'[dim]({len(versions)} total)[/dim]')
    table = Table(show_lines=False)
    table.add_column('Ver', justify='right', no_wrap=True)
    table.add_column('Cur', justify='center', no_wrap=True)
    table.add_column('ID', style='cyan', no_wrap=True)
    table.add_column('Size', justify='right', no_wrap=True)
    table.add_column('Uploaded', style='dim', no_wrap=True)
    table.add_column('Extraction', style='magenta', no_wrap=True)

    for v in versions:
        marker = '►' if v.get('id') == file_id else ''
        cur = '✓' if v.get('is_current') else ''
        table.add_row(
            f"{marker}{v.get('version_number') or '?'}",
            cur,
            _short(v.get('id') or ''),
            _human_size(v.get('file_size') or 0),
            (v.get('uploaded_at') or '')[:19],
            v.get('latest_extraction_status') or '-',
        )
    console.print(table)
