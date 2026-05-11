"""Live-API smoke harness for ``spruce {scripts,models,types,verify}``.

Opt-in: every test is skipped unless ``SPRUCE_LIVE_API_URL`` is set in the
environment. Never runs in CI by default.

Required env vars:
    SPRUCE_LIVE_API_URL    Base URL of a running Sprucelab Django API
                           (e.g. ``http://localhost:8000`` or a deployed host)

Optional env vars:
    SPRUCELAB_ADMIN_TOKEN  Bearer Supabase staff token. Required for any
                           endpoint that doesn't have ``DEV_AUTH_BYPASS=1``
                           on the backend.
    SPRUCE_LIVE_MODEL_ID   UUID of an existing model in the target project.
                           When unset, ``_require_model_id`` falls back to
                           ``spruce models list --json`` and uses the first
                           model returned. Skips only when the live server
                           reports zero models.

Run:
    cd cli && \\
        SPRUCE_LIVE_API_URL=https://your-server \\
        SPRUCELAB_ADMIN_TOKEN=... \\
        python -m pytest tests/integration -m live -v

The ``verify`` smoke now runs with ``--dry-run`` by default so it never
mutates ``TypeMapping.verification_status`` rows on a live model.

These tests deliberately do NOT swallow API errors. Per the project's
"fail loudly" rule, an unexpected status code or shape will surface as a
test failure with the raw payload, not a green pass with a warning.
"""
from __future__ import annotations

import json
import os

import pytest

from spruce.cli import app

# Module-level skip: if the live URL isn't set, the entire module is skipped
# before any fixture runs. Means CI (and the worktree environment) sees these
# as "skipped, not failed" without ever attempting a network call.
pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(
        not os.environ.get('SPRUCE_LIVE_API_URL'),
        reason='SPRUCE_LIVE_API_URL not set; live smoke tests are opt-in',
    ),
]


def _discover_model_id_via_cli(runner) -> str | None:
    """Fallback: ask the live API via ``spruce models list --json``.

    Returns the first model's UUID, or ``None`` if discovery fails or the
    project has zero models. The caller decides whether to skip or fail.
    """
    result = runner.invoke(app, ['models', 'list', '--json'])
    if result.exit_code != 0:
        return None
    try:
        body = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None
    rows = body.get('results', body) if isinstance(body, dict) else body
    if not isinstance(rows, list) or not rows:
        return None
    first = rows[0]
    if not isinstance(first, dict):
        return None
    model_id = first.get('id')
    return model_id if isinstance(model_id, str) and model_id else None


def _require_model_id(runner) -> str:
    """Pull the model UUID from env or auto-discover via the CLI."""
    model_id = os.environ.get('SPRUCE_LIVE_MODEL_ID')
    if model_id:
        return model_id
    discovered = _discover_model_id_via_cli(runner)
    if discovered:
        return discovered
    pytest.skip(
        'SPRUCE_LIVE_MODEL_ID not set and `spruce models list` returned no '
        'models on the live server. Upload a model or set the env var.'
    )


def _parse_json_or_fail(stdout: str, *, command: str) -> object:
    """Parse stdout as JSON. Fail loudly if it isn't valid JSON."""
    try:
        return json.loads(stdout)
    except json.JSONDecodeError as e:
        pytest.fail(
            f'`{command}` did not emit valid JSON on stdout.\n'
            f'JSONDecodeError: {e}\n'
            f'--- stdout ---\n{stdout}\n--- end stdout ---'
        )


# ---------------------------------------------------------------------------
# spruce scripts list
# ---------------------------------------------------------------------------


def test_live_scripts_list_json(runner):
    """`spruce scripts list --json` returns 0 and a paginated/list payload."""
    result = runner.invoke(app, ['scripts', 'list', '--json'])

    assert result.exit_code == 0, (
        f'`spruce scripts list --json` exited {result.exit_code}.\n'
        f'stdout:\n{result.stdout}'
    )
    payload = _parse_json_or_fail(result.stdout, command='spruce scripts list --json')

    # Accept either a DRF-paginated dict ({count, results: [...]}) or a bare list.
    if isinstance(payload, dict):
        assert 'results' in payload, (
            f'expected DRF-paginated payload with "results" key, got keys: '
            f'{sorted(payload.keys())}'
        )
        assert isinstance(payload['results'], list), (
            f'"results" should be a list, got {type(payload["results"]).__name__}'
        )
    else:
        assert isinstance(payload, list), (
            f'expected list or paginated dict, got {type(payload).__name__}'
        )


# ---------------------------------------------------------------------------
# spruce types list
# ---------------------------------------------------------------------------


def test_live_types_list_json(runner):
    """`spruce types list --model <id> --json` returns 0 and a list payload."""
    model_id = _require_model_id(runner)

    result = runner.invoke(app, ['types', 'list', '--model', model_id, '--json'])

    assert result.exit_code == 0, (
        f'`spruce types list --model {model_id} --json` exited {result.exit_code}.\n'
        f'stdout:\n{result.stdout}'
    )
    payload = _parse_json_or_fail(
        result.stdout, command=f'spruce types list --model {model_id} --json'
    )

    # IFCTypeViewSet returns a paginated dict; allow bare list as a fallback.
    if isinstance(payload, dict):
        assert 'results' in payload, (
            f'expected DRF-paginated payload with "results" key, got keys: '
            f'{sorted(payload.keys())}'
        )
        rows = payload['results']
    else:
        rows = payload

    assert isinstance(rows, list), (
        f'expected list of types, got {type(rows).__name__}'
    )

    # Spot-check shape if the model has any types
    if rows:
        first = rows[0]
        assert isinstance(first, dict), f'expected dict rows, got {type(first).__name__}'
        # IFCType serializer always exposes `id` and `ifc_type`
        for required in ('id', 'ifc_type'):
            assert required in first, (
                f'type row missing required field "{required}"; row keys: '
                f'{sorted(first.keys())}'
            )


# ---------------------------------------------------------------------------
# spruce models list
# ---------------------------------------------------------------------------


def test_live_models_list_json(runner):
    """`spruce models list --json` returns 0 and a list/paginated payload."""
    result = runner.invoke(app, ['models', 'list', '--json'])

    assert result.exit_code == 0, (
        f'`spruce models list --json` exited {result.exit_code}.\n'
        f'stdout:\n{result.stdout}'
    )
    payload = _parse_json_or_fail(result.stdout, command='spruce models list --json')

    if isinstance(payload, dict):
        assert 'results' in payload, (
            f'expected DRF-paginated payload with "results" key, got keys: '
            f'{sorted(payload.keys())}'
        )
        assert isinstance(payload['results'], list), (
            f'"results" should be a list, got {type(payload["results"]).__name__}'
        )
    else:
        assert isinstance(payload, list), (
            f'expected list or paginated dict, got {type(payload).__name__}'
        )


# ---------------------------------------------------------------------------
# spruce verify --dry-run
# ---------------------------------------------------------------------------


def test_live_verify_dry_run_json(runner):
    """`spruce verify --model <id> --dry-run --json` confirms POST + JSON round-trip.

    Uses ``--dry-run`` so it never mutates ``TypeMapping.verification_status``
    on the live model. Backend rolls back inside a savepoint; the engine
    itself is idempotent on re-run so a rollback is safe.
    """
    model_id = _require_model_id(runner)

    result = runner.invoke(
        app, ['verify', '--model', model_id, '--dry-run', '--json']
    )

    assert result.exit_code == 0, (
        f'`spruce verify --model {model_id} --dry-run --json` exited '
        f'{result.exit_code}.\nstdout:\n{result.stdout}'
    )
    payload = _parse_json_or_fail(
        result.stdout,
        command=f'spruce verify --model {model_id} --dry-run --json',
    )

    assert isinstance(payload, dict), (
        f'expected verify result dict, got {type(payload).__name__}'
    )
    # Engine result.to_dict() always includes a model_id (or project_id) anchor.
    # Don't over-constrain — schema is "result.to_dict()", which evolves —
    # but at minimum we expect a dict with at least one of these keys present.
    expected_any = {
        'model_id', 'project_id', 'health_score', 'passed', 'failed',
        'rules_applied', 'total_types', 'types', 'per_type',
    }
    assert expected_any & set(payload.keys()), (
        f'verify payload had no expected keys. Got keys: {sorted(payload.keys())}\n'
        f'Expected at least one of: {sorted(expected_any)}'
    )
    # New: backend must echo ``dry_run: true`` so callers can audit
    # that no persistence happened.
    assert payload.get('dry_run') is True, (
        f'expected dry_run=true in payload, got {payload.get("dry_run")!r}.\n'
        f'Full keys: {sorted(payload.keys())}'
    )
