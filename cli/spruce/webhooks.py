"""
`spruce webhooks` — agent-first surface over the webhook subscription /
delivery endpoints exposed by the automation app.

Wraps:
    GET    /api/automation/webhook-subscriptions/
    POST   /api/automation/webhook-subscriptions/            (+ ?dry_run=true)
    PATCH  /api/automation/webhook-subscriptions/<id>/
    DELETE /api/automation/webhook-subscriptions/<id>/
    POST   /api/automation/webhook-subscriptions/<id>/test/
    GET    /api/automation/webhook-deliveries/
    POST   /api/automation/webhook-deliveries/<id>/redeliver/

Field naming follows the backend (`is_active`, `consecutive_failures`,
`last_fired_at`, `attempt_count`, `response_status_code`). The Round 6
spec uses friendlier names (`enabled`, `failure_count`, etc.) — this
module exposes both: CLI flag names mirror the spec, but the wire
payloads carry the actual model field names.
"""
from __future__ import annotations

import json
import os
import stat
import sys
from typing import Optional

import httpx
import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from .config import get_api_url


app = typer.Typer(help='Webhook subscriptions and delivery logs')

console = Console()


# ---------------------------------------------------------------------------
# Helpers (mirrors verify.py / models.py)
# ---------------------------------------------------------------------------

from ._auth import resolve_token as _admin_token, auth_headers as _admin_headers  # noqa: F401
from ._errors import print_http_error, print_request_error


def _handle_http(
    err: httpx.HTTPStatusError, *, json_out: bool, command_context: str = 'webhooks list',
) -> None:
    print_http_error(console, err, json_out=json_out, command_context=command_context)


def _shorten(value: Optional[str], n: int = 8) -> str:
    if not value:
        return '-'
    return value[:n] + '…' if len(value) > n else value


def _truncate(value: Optional[str], n: int = 40) -> str:
    if not value:
        return '-'
    return value if len(value) <= n else value[: n - 1] + '…'


# ---------------------------------------------------------------------------
# spruce webhooks list
# ---------------------------------------------------------------------------

@app.command('list')
def webhooks_list(
    project: Optional[str] = typer.Option(
        None, '--project', help='Filter to one Project UUID (?project=<id>)',
    ),
    page_size: int = typer.Option(100, '--page-size', help='DRF page size'),
    admin_token: Optional[str] = typer.Option(None, '--admin-token'),
    json_out: bool = typer.Option(False, '--json', help='JSON output (raw page payload)'),
) -> None:
    """List webhook subscriptions."""
    params: dict = {'page_size': page_size}
    if project:
        params['project'] = project

    url = f'{get_api_url()}/api/automation/webhook-subscriptions/'
    try:
        resp = httpx.get(url, headers=_admin_headers(admin_token), params=params, timeout=30)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        _handle_http(e, json_out=json_out, command_context='webhooks list')
    except httpx.RequestError as e:
        print_request_error(console, e, json_out=json_out, command_context='webhooks list')

    body = resp.json()
    if json_out:
        sys.stdout.write(json.dumps(body) + '\n')
        return

    rows = body.get('results', body) if isinstance(body, dict) else body
    if not rows:
        console.print('[dim]no webhook subscriptions[/dim]')
        return

    count = body.get('count', len(rows)) if isinstance(body, dict) else len(rows)
    table = Table(title=f'Webhook subscriptions ({count})')
    table.add_column('ID', style='cyan')
    table.add_column('URL')
    table.add_column('Event', style='green')
    table.add_column('Enabled', justify='center')
    table.add_column('Failures', justify='right')
    table.add_column('Last fired', style='dim')
    for row in rows:
        table.add_row(
            _shorten(row.get('id'), 8),
            _truncate(row.get('target_url'), 40),
            row.get('event_type') or '-',
            'yes' if row.get('is_active') else 'no',
            str(row.get('consecutive_failures', 0)),
            (row.get('last_fired_at') or '-')[:19] if row.get('last_fired_at') else '-',
        )
    console.print(table)


# ---------------------------------------------------------------------------
# spruce webhooks create
# ---------------------------------------------------------------------------

@app.command('create')
def webhooks_create(
    url: str = typer.Option(..., '--url', help='Target URL to POST events to'),
    events: str = typer.Option(
        ..., '--events',
        help='Comma-separated event types (one subscription is created per event)',
    ),
    project: Optional[str] = typer.Option(None, '--project', help='Project UUID (omit for cross-project)'),
    description: Optional[str] = typer.Option(None, '--description'),
    secret_out: Optional[str] = typer.Option(
        None, '--secret-out',
        help='Write generated HMAC secret to FILE (0600) and suppress stdout echo',
    ),
    dry_run: bool = typer.Option(
        False, '--dry-run', '-n',
        help='Append ?dry_run=true; preview without persisting (no secret generated)',
    ),
    admin_token: Optional[str] = typer.Option(None, '--admin-token'),
    json_out: bool = typer.Option(False, '--json', help='JSON output (raw responses)'),
) -> None:
    """Create one or more webhook subscriptions.

    Multi-event support: ``--events a,b,c`` creates three subscriptions
    (the backend keys uniquely on ``(project, event_type, target_url)``).
    """
    event_types = [e.strip() for e in events.split(',') if e.strip()]
    if not event_types:
        if json_out:
            sys.stdout.write(json.dumps({'error': 'no event types parsed from --events'}) + '\n')
        else:
            console.print('[red]--events must contain at least one event type[/red]')
        raise typer.Exit(1)

    base_url = f'{get_api_url()}/api/automation/webhook-subscriptions/'
    params: dict = {}
    if dry_run:
        params['dry_run'] = 'true'

    if dry_run and not json_out:
        console.print('[yellow](dry run — no subscriptions created, no secret generated)[/yellow]')

    responses: list[dict] = []
    for event_type in event_types:
        payload: dict = {
            'event_type': event_type,
            'target_url': url,
        }
        if project:
            payload['project'] = project
        if description:
            payload['description'] = description

        try:
            resp = httpx.post(
                base_url,
                headers=_admin_headers(admin_token),
                params=params,
                json=payload,
                timeout=30,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            _handle_http(e, json_out=json_out, command_context='webhooks create')
        except httpx.RequestError as e:
            print_request_error(console, e, json_out=json_out, command_context='webhooks create')

        body = resp.json()
        responses.append(body)

        if json_out:
            continue

        if dry_run or body.get('dry_run') is True:
            would = body.get('would_create', {})
            console.print(Panel(
                f"event_type: {would.get('event_type', event_type)}\n"
                f"target_url: {would.get('target_url', url)}\n"
                f"project:    {would.get('project', project) or '(cross-project)'}\n"
                f"\n[dim]{body.get('note', '')}[/dim]",
                title=f'[yellow]Would create[/yellow] {event_type}',
            ))
        else:
            secret = body.get('secret')
            sub_id = body.get('id')
            console.print(
                f'[green]Created[/green] subscription {sub_id} '
                f'for [cyan]{event_type}[/cyan] → {url}'
            )
            if secret:
                if secret_out:
                    path = os.path.expanduser(secret_out)
                    # Append per-event marker if multiple events into one file
                    if len(event_types) == 1:
                        contents = secret
                    else:
                        contents = f'# {event_type}\n{secret}\n'
                    mode = 'w' if len(event_types) == 1 else 'a'
                    with open(path, mode) as f:
                        f.write(contents)
                    os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)  # 0600
                    console.print(
                        f'[dim]Secret written to {path} (mode 0600). '
                        'Not echoed to stdout.[/dim]'
                    )
                else:
                    console.print(Panel(
                        f'[bold]{secret}[/bold]\n\n'
                        '[yellow]Save this secret now — it will not be shown again.[/yellow]',
                        title='HMAC secret',
                    ))

    if json_out:
        # Single object for single event; list for multi-event for consistency
        if len(responses) == 1:
            sys.stdout.write(json.dumps(responses[0]) + '\n')
        else:
            sys.stdout.write(json.dumps(responses) + '\n')


# ---------------------------------------------------------------------------
# spruce webhooks disable / enable
# ---------------------------------------------------------------------------

@app.command('disable')
def webhooks_disable(
    subscription_id: str = typer.Argument(..., help='Subscription UUID'),
    enable: bool = typer.Option(False, '--enable', help='Set is_active=true instead'),
    admin_token: Optional[str] = typer.Option(None, '--admin-token'),
    json_out: bool = typer.Option(False, '--json', help='JSON output'),
) -> None:
    """Disable (or re-enable with --enable) a webhook subscription.

    PATCH is_active=<false|true>. The Round 6 spec called this field
    `enabled` — backend uses `is_active`; the CLI maps to the real field.
    """
    new_state = bool(enable)
    url = f'{get_api_url()}/api/automation/webhook-subscriptions/{subscription_id}/'
    try:
        resp = httpx.patch(
            url,
            headers=_admin_headers(admin_token),
            json={'is_active': new_state},
            timeout=30,
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        _handle_http(e, json_out=json_out, command_context='webhooks disable')
    except httpx.RequestError as e:
        print_request_error(console, e, json_out=json_out, command_context='webhooks disable')

    body = resp.json()
    if json_out:
        sys.stdout.write(json.dumps(body) + '\n')
        return

    label = 'enabled' if new_state else 'disabled'
    console.print(f'[green]{label.capitalize()}[/green] subscription {_shorten(subscription_id)}')


# ---------------------------------------------------------------------------
# spruce webhooks delete
# ---------------------------------------------------------------------------

@app.command('delete')
def webhooks_delete(
    subscription_id: str = typer.Argument(..., help='Subscription UUID'),
    yes: bool = typer.Option(False, '--yes', '-y', help='Skip interactive confirmation'),
    admin_token: Optional[str] = typer.Option(None, '--admin-token'),
    json_out: bool = typer.Option(False, '--json', help='JSON output'),
) -> None:
    """Delete a webhook subscription. Interactive confirm unless --yes."""
    if not yes:
        confirm = typer.confirm(
            f'Delete subscription {subscription_id}? This cannot be undone.',
            default=False,
        )
        if not confirm:
            if json_out:
                sys.stdout.write(json.dumps({'status': 'aborted'}) + '\n')
            else:
                console.print('[yellow]Aborted.[/yellow]')
            raise typer.Exit(1)

    url = f'{get_api_url()}/api/automation/webhook-subscriptions/{subscription_id}/'
    try:
        resp = httpx.delete(url, headers=_admin_headers(admin_token), timeout=30)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        _handle_http(e, json_out=json_out, command_context='webhooks delete')
    except httpx.RequestError as e:
        print_request_error(console, e, json_out=json_out, command_context='webhooks delete')

    if json_out:
        sys.stdout.write(json.dumps({'status': 'deleted', 'id': subscription_id}) + '\n')
    else:
        console.print(f'[green]Deleted[/green] subscription {_shorten(subscription_id)}')


# ---------------------------------------------------------------------------
# spruce webhooks deliveries
# ---------------------------------------------------------------------------

@app.command('deliveries')
def webhooks_deliveries(
    subscription: Optional[str] = typer.Option(
        None, '--subscription', help='Filter to one subscription UUID',
    ),
    status_filter: Optional[str] = typer.Option(
        None, '--status', help='Filter by delivery status (pending|delivering|success|failed|retrying)',
    ),
    limit: int = typer.Option(50, '--limit', help='Max rows to display'),
    page_size: int = typer.Option(100, '--page-size', help='DRF page size'),
    admin_token: Optional[str] = typer.Option(None, '--admin-token'),
    json_out: bool = typer.Option(False, '--json', help='JSON output (raw page payload)'),
) -> None:
    """List webhook delivery log entries."""
    params: dict = {'page_size': page_size}
    if subscription:
        params['subscription'] = subscription
    if status_filter:
        params['status'] = status_filter

    url = f'{get_api_url()}/api/automation/webhook-deliveries/'
    try:
        resp = httpx.get(url, headers=_admin_headers(admin_token), params=params, timeout=30)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        _handle_http(e, json_out=json_out, command_context='webhooks deliveries')
    except httpx.RequestError as e:
        print_request_error(console, e, json_out=json_out, command_context='webhooks deliveries')

    body = resp.json()
    if json_out:
        sys.stdout.write(json.dumps(body) + '\n')
        return

    rows = body.get('results', body) if isinstance(body, dict) else body
    if not rows:
        console.print('[dim]no deliveries[/dim]')
        return

    rows = rows[:limit]
    count = body.get('count', len(rows)) if isinstance(body, dict) else len(rows)
    table = Table(title=f'Webhook deliveries ({len(rows)}/{count})')
    table.add_column('ID', style='cyan')
    table.add_column('Event', style='green')
    table.add_column('Status', style='bold')
    table.add_column('HTTP', justify='right')
    table.add_column('Attempt', justify='right')
    table.add_column('Created', style='dim')
    table.add_column('Error')
    for row in rows:
        err = row.get('error') or ''
        err_short = (err[:48] + '…') if len(err) > 48 else err
        table.add_row(
            _shorten(row.get('id'), 8),
            row.get('event_type') or '-',
            row.get('status') or '-',
            str(row.get('response_status_code') or '-'),
            str(row.get('attempt_count', 0)),
            (row.get('created_at') or '')[:19] or '-',
            err_short,
        )
    console.print(table)


# ---------------------------------------------------------------------------
# spruce webhooks redeliver
# ---------------------------------------------------------------------------

@app.command('redeliver')
def webhooks_redeliver(
    delivery_id: str = typer.Argument(..., help='Delivery UUID to re-queue'),
    admin_token: Optional[str] = typer.Option(None, '--admin-token'),
    json_out: bool = typer.Option(False, '--json', help='JSON output'),
) -> None:
    """Re-queue a delivery (creates a new delivery row, never mutates history)."""
    url = (
        f'{get_api_url()}/api/automation/webhook-deliveries/'
        f'{delivery_id}/redeliver/'
    )
    try:
        resp = httpx.post(url, headers=_admin_headers(admin_token), json={}, timeout=30)
    except httpx.RequestError as e:
        print_request_error(console, e, json_out=json_out, command_context='webhooks redeliver')

    if resp.status_code == 404:
        # Could be: endpoint not implemented OR delivery_id not found.
        # Both surface the same shape from DRF; treat as exit code 2 with a
        # clear hint to the operator.
        hint = 'spruce webhooks deliveries  # confirm the delivery ID exists'
        msg = (
            'HTTP 404 — delivery not found or redeliver action not implemented '
            'on this backend.'
        )
        if json_out:
            sys.stdout.write(json.dumps({
                'error': 'redeliver endpoint missing or delivery not found',
                'http_status': 404,
                'hint': hint,
            }) + '\n')
        else:
            console.print(f'[red]{msg}[/red]')
            console.print(f'[yellow]Try:[/yellow] [cyan]{hint}[/cyan]')
        raise typer.Exit(2)
    if resp.status_code == 405:
        hint = 'spruce capabilities  # check whether this backend exposes the redeliver action'
        msg = 'HTTP 405 — redeliver endpoint not implemented yet on this backend.'
        if json_out:
            sys.stdout.write(json.dumps({
                'error': 'redeliver endpoint not implemented',
                'http_status': 405,
                'hint': hint,
            }) + '\n')
        else:
            console.print(f'[red]{msg}[/red]')
            console.print(f'[yellow]Try:[/yellow] [cyan]{hint}[/cyan]')
        raise typer.Exit(2)
    try:
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        _handle_http(e, json_out=json_out, command_context='webhooks redeliver')

    body = resp.json()
    if json_out:
        sys.stdout.write(json.dumps(body) + '\n')
        return
    console.print(
        f'[green]Re-queued[/green] as delivery {_shorten(body.get("id"), 8)} '
        f'(status={body.get("status", "?")})'
    )


# ---------------------------------------------------------------------------
# spruce webhooks test
# ---------------------------------------------------------------------------

@app.command('test')
def webhooks_test(
    subscription_id: str = typer.Argument(..., help='Subscription UUID'),
    admin_token: Optional[str] = typer.Option(None, '--admin-token'),
    json_out: bool = typer.Option(False, '--json', help='JSON output'),
) -> None:
    """Send a synthetic webhook.test event to a subscription."""
    url = (
        f'{get_api_url()}/api/automation/webhook-subscriptions/'
        f'{subscription_id}/test/'
    )
    try:
        resp = httpx.post(url, headers=_admin_headers(admin_token), json={}, timeout=30)
    except httpx.RequestError as e:
        print_request_error(console, e, json_out=json_out, command_context='webhooks test')

    if resp.status_code == 404:
        hint = 'spruce webhooks list  # confirm the subscription ID exists'
        msg = (
            'HTTP 404 — subscription not found or test action not implemented '
            'on this backend.'
        )
        if json_out:
            sys.stdout.write(json.dumps({
                'error': 'test endpoint missing or subscription not found',
                'http_status': 404,
                'hint': hint,
            }) + '\n')
        else:
            console.print(f'[red]{msg}[/red]')
            console.print(f'[yellow]Try:[/yellow] [cyan]{hint}[/cyan]')
        raise typer.Exit(2)
    if resp.status_code == 405:
        hint = 'spruce capabilities  # check whether this backend exposes the test action'
        msg = 'HTTP 405 — test endpoint not implemented yet on this backend.'
        if json_out:
            sys.stdout.write(json.dumps({
                'error': 'test endpoint not implemented',
                'http_status': 405,
                'hint': hint,
            }) + '\n')
        else:
            console.print(f'[red]{msg}[/red]')
            console.print(f'[yellow]Try:[/yellow] [cyan]{hint}[/cyan]')
        raise typer.Exit(2)
    try:
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        _handle_http(e, json_out=json_out, command_context='webhooks test')

    body = resp.json()
    if json_out:
        sys.stdout.write(json.dumps(body) + '\n')
        return
    console.print(
        f'[green]Queued[/green] test delivery '
        f'{_shorten(body.get("delivery_id"), 8)} '
        f'(status={body.get("status", "?")})'
    )
