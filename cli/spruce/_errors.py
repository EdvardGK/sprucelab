"""
Verbatim "Try: ..." next-command hints for CLI errors.

Design rule (`feedback-agent-first-or-die`): error messages should suggest
the next command verbatim. Agents learn faster from
``Try: spruce auth register --token <KEY>`` than from a bare
``401 Unauthorized``.

Each command module passes a short ``command_context`` string (e.g.
``"models list"``, ``"types classify"``, ``"webhooks deliveries"``) so we can
tailor the suggestion to the noun the user was working with.
"""
from __future__ import annotations

import json
import sys
from typing import Optional

import httpx
import typer


# Map (command_context_prefix -> noun used in `spruce <noun> list` hints).
# The first key whose prefix matches command_context wins. Fall back to the
# raw context string for the 5xx/network case where the hint isn't about a
# specific noun.
_NOUN_FOR_404 = {
    'models': 'models list',
    'types': 'types list --model <MODEL_UUID>',
    'verify': 'models list',
    'scripts run': 'scripts list',
    'scripts': 'scripts list',
    'webhooks deliveries': 'webhooks deliveries',
    'webhooks redeliver': 'webhooks deliveries',
    'webhooks test': 'webhooks list',
    'webhooks': 'webhooks list',
    'embed pass revoke': 'embed pass list',
    'embed pass refresh': 'embed pass list',
    'embed': 'embed pass list',
    'files show': 'files list',
    'files download': 'files list',
    'files reprocess': 'files list',
    'files versions': 'files list',
    'files upload': 'files list  # confirm the project id',
    'files': 'files list',
    'log': 'log list',
}


def format_http_error_hint(status: int, command_context: str) -> Optional[str]:
    """
    Return a verbatim ``Try: ...`` suggestion for ``status`` in ``command_context``.

    Returns ``None`` when no useful hint applies (e.g. unrecognized status).
    The returned string does NOT include the ``Try: `` prefix or trailing
    newline — caller decides framing (Rich vs JSON).
    """
    if status in (401, 403):
        return (
            'spruce auth register --token <KEY>  '
            '# or: spruce auth status'
        )

    if status == 404:
        for prefix, suggestion in _NOUN_FOR_404.items():
            if command_context.startswith(prefix):
                return f'spruce {suggestion}  # confirm the ID exists'
        return 'spruce capabilities  # confirm the endpoint exists on this backend'

    if status == 400 or status == 422:
        # Validation errors. Echo the field error then nudge to re-read help.
        return (
            f'spruce {command_context} --help  '
            '# field error in payload above; check required flags'
        )

    if status >= 500:
        return (
            f'spruce {command_context} --json | jq .body  '
            '# inspect the server response in full'
        )

    if status == 405:
        return 'spruce capabilities  # this action may not be implemented on this backend yet'

    return None


def format_request_error_hint() -> str:
    """
    Hint for connection / DNS / timeout errors (httpx.RequestError).

    Always returns a non-empty string. Agents/users can't recover without
    pointing at the URL config, so we always offer the same two breadcrumbs.
    """
    return (
        'spruce config show  '
        '# verify api_url; override with $SPRUCE_API_URL or `spruce auth register --url <URL>`'
    )


def print_http_error(
    console,
    err: httpx.HTTPStatusError,
    *,
    json_out: bool,
    command_context: str,
) -> None:
    """
    Pretty-print an httpx.HTTPStatusError with a verbatim next-command hint.

    Always raises ``typer.Exit(1)``. Caller supplies a Rich Console for human
    output and a short ``command_context`` (e.g. ``"models list"``) so the
    hint can be scoped.

    JSON shape (preserved from the previous unstructured handlers, plus
    ``hint`` and ``body`` keys):

        {
            "error": "HTTP <status>",
            "status": <status>,
            "body": <parsed JSON body or raw text>,
            "hint": "<verbatim next command>" | null
        }
    """
    body_text = err.response.text
    parsed = None
    try:
        parsed = err.response.json()
    except Exception:
        pass

    hint = format_http_error_hint(err.response.status_code, command_context)
    body_payload = parsed if parsed is not None else body_text

    if json_out:
        payload = {
            'error': f'HTTP {err.response.status_code}',
            'status': err.response.status_code,
            'body': body_payload,
            'hint': hint,
        }
        sys.stdout.write(json.dumps(payload) + '\n')
    else:
        body_pretty = json.dumps(parsed, indent=2) if parsed is not None else body_text
        console.print(f'[red]HTTP {err.response.status_code}[/red]\n{body_pretty}')
        if hint:
            console.print(f'[yellow]Try:[/yellow] [cyan]{hint}[/cyan]')
    raise typer.Exit(1)


def print_request_error(
    console,
    err: httpx.RequestError,
    *,
    json_out: bool,
    command_context: str,
) -> None:
    """
    Pretty-print a connection / DNS / timeout error with a config hint.

    Always raises ``typer.Exit(1)``.
    """
    hint = format_request_error_hint()
    if json_out:
        sys.stdout.write(json.dumps({
            'error': 'request_failed',
            'detail': str(err),
            'hint': hint,
        }) + '\n')
    else:
        console.print(f'[red]Request failed:[/red] {err}')
        console.print(f'[yellow]Try:[/yellow] [cyan]{hint}[/cyan]')
    raise typer.Exit(1)
