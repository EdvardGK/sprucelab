"""Live-API smoke harness for ``spruce {scripts,types,verify}``.

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
                           Required for the ``types list`` and ``verify``
                           tests because the CLI does not (yet) ship a
                           ``spruce models list`` discovery command.

Run:
    cd cli && \\
        SPRUCE_LIVE_API_URL=https://your-server \\
        SPRUCELAB_ADMIN_TOKEN=... \\
        SPRUCE_LIVE_MODEL_ID=<uuid> \\
        python -m pytest tests/integration -m live -v

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


def _require_model_id() -> str:
    """Pull the model UUID from env or skip the individual test."""
    model_id = os.environ.get('SPRUCE_LIVE_MODEL_ID')
    if not model_id:
        pytest.skip(
            'SPRUCE_LIVE_MODEL_ID not set; the CLI has no `spruce models list` '
            'discovery command yet, so a model UUID must be provided explicitly.'
        )
    return model_id


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
    model_id = _require_model_id()

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
# spruce verify --dry-run
# ---------------------------------------------------------------------------


def test_live_verify_dry_run_json(runner):
    """`spruce verify --model <id> --json` confirms POST + JSON round-trip.

    Note: the CLI does NOT currently expose ``--dry-run`` on ``verify``
    (see ``cli/spruce/verify.py``), so this test runs the full verification.
    The endpoint is idempotent — it recomputes verification status — so this
    is safe to run against a live model.
    """
    model_id = _require_model_id()

    result = runner.invoke(app, ['verify', '--model', model_id, '--json'])

    assert result.exit_code == 0, (
        f'`spruce verify --model {model_id} --json` exited {result.exit_code}.\n'
        f'stdout:\n{result.stdout}'
    )
    payload = _parse_json_or_fail(
        result.stdout, command=f'spruce verify --model {model_id} --json'
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
