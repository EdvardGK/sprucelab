"""
`spruce log list` CLI tests.

Mirrors the mocked-httpx pattern used by test_models_cli / test_webhooks_cli.
"""
from __future__ import annotations

import httpx
import pytest
import respx

from spruce.cli import app
from tests.conftest import TEST_API_URL, TEST_TOKEN


@pytest.fixture(autouse=True)
def _pin_log_api_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("spruce.log.get_api_url", lambda: TEST_API_URL)


SAMPLE = {
    'count': 3,
    'results': [
        {
            'id': '11111111-1111-1111-1111-111111111111',
            'source_file': '22222222-2222-2222-2222-222222222222',
            'extraction_run': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'sheet': '33333333-3333-3333-3333-333333333333',
            'project': '44444444-4444-4444-4444-444444444444',
            'original_filename': 'A101.pdf',
            'category': 'title_block_field',
            'key': 'sheet_number',
            'content': 'A101',
            'page_index': 0,
            'bbox': {},
        },
        {
            'id': '55555555-5555-5555-5555-555555555555',
            'source_file': '22222222-2222-2222-2222-222222222222',
            'extraction_run': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'sheet': '33333333-3333-3333-3333-333333333333',
            'project': '44444444-4444-4444-4444-444444444444',
            'original_filename': 'A101.pdf',
            'category': 'layer',
            'key': 'A-WALL',
            'content': '',
            'page_index': 0,
            'bbox': {},
        },
        {
            'id': '66666666-6666-6666-6666-666666666666',
            'source_file': '22222222-2222-2222-2222-222222222222',
            'extraction_run': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'sheet': '33333333-3333-3333-3333-333333333333',
            'project': '44444444-4444-4444-4444-444444444444',
            'original_filename': 'A101.pdf',
            'category': 'text_block',
            'key': '',
            'content': 'GENERAL NOTES',
            'page_index': 0,
            'bbox': {'x_mm': 10, 'y_mm': 50, 'w_mm': 80, 'h_mm': 10},
        },
    ],
}


@respx.mock
def test_log_list_table_mode(runner, admin_token_env):
    respx.get(f"{TEST_API_URL}/api/types/observations/").mock(
        return_value=httpx.Response(200, json=SAMPLE)
    )
    result = runner.invoke(app, ["log", "list"])
    assert result.exit_code == 0, result.stdout
    assert "Observations" in result.stdout
    assert "title_block_field" in result.stdout
    assert "A101" in result.stdout
    assert "A-WALL" in result.stdout
    assert "GENERAL NOTES" in result.stdout


@respx.mock
def test_log_list_json_mode(runner, admin_token_env):
    respx.get(f"{TEST_API_URL}/api/types/observations/").mock(
        return_value=httpx.Response(200, json=SAMPLE)
    )
    result = runner.invoke(app, ["log", "list", "--json"])
    assert result.exit_code == 0, result.stdout
    import json as _json
    parsed = _json.loads(result.stdout)
    assert parsed['count'] == 3
    assert parsed['returned'] == 3
    assert len(parsed['results']) == 3


@respx.mock
def test_log_list_source_file_filter_pushes_query_param(runner, admin_token_env):
    route = respx.get(f"{TEST_API_URL}/api/types/observations/").mock(
        return_value=httpx.Response(200, json={'count': 0, 'results': []})
    )
    result = runner.invoke(app, ["log", "list", "--source-file", "abc-uuid"])
    assert result.exit_code == 0, result.stdout
    assert route.calls.last.request.url.params.get('source_file') == 'abc-uuid'


@respx.mock
def test_log_list_category_filter_pushes_csv(runner, admin_token_env):
    route = respx.get(f"{TEST_API_URL}/api/types/observations/").mock(
        return_value=httpx.Response(200, json={'count': 0, 'results': []})
    )
    result = runner.invoke(app, ["log", "list", "--category", "layer,text_block"])
    assert result.exit_code == 0, result.stdout
    assert route.calls.last.request.url.params.get('category') == 'layer,text_block'


def test_log_list_rejects_unknown_category(runner, admin_token_env):
    result = runner.invoke(app, ["log", "list", "--category", "nope"])
    assert result.exit_code == 2
    assert "Unknown category" in result.stdout


@respx.mock
def test_log_list_search_and_page_index(runner, admin_token_env):
    route = respx.get(f"{TEST_API_URL}/api/types/observations/").mock(
        return_value=httpx.Response(200, json={'count': 0, 'results': []})
    )
    result = runner.invoke(app, ["log", "list", "--search", "STRUCTURAL", "--page-index", "2"])
    assert result.exit_code == 0, result.stdout
    params = route.calls.last.request.url.params
    assert params.get('search') == 'STRUCTURAL'
    assert params.get('page_index') == '2'


@respx.mock
def test_log_list_limit_truncates_results(runner, admin_token_env):
    big = {'count': 100, 'results': [
        {
            'id': f'{i:08d}-0000-0000-0000-000000000000',
            'source_file': '22222222-2222-2222-2222-222222222222',
            'extraction_run': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'sheet': None,
            'project': '44444444-4444-4444-4444-444444444444',
            'original_filename': 'x.pdf',
            'category': 'text_block',
            'key': '',
            'content': f'row {i}',
            'page_index': 0,
            'bbox': {},
        } for i in range(100)
    ]}
    respx.get(f"{TEST_API_URL}/api/types/observations/").mock(
        return_value=httpx.Response(200, json=big)
    )
    result = runner.invoke(app, ["log", "list", "--limit", "3", "--json"])
    assert result.exit_code == 0, result.stdout
    import json as _json
    parsed = _json.loads(result.stdout)
    assert parsed['returned'] == 3
    assert parsed['count'] == 100


@respx.mock
def test_log_list_http_error_json_output(runner, admin_token_env):
    respx.get(f"{TEST_API_URL}/api/types/observations/").mock(
        return_value=httpx.Response(401, json={"detail": "bad token"})
    )
    result = runner.invoke(app, ["log", "list", "--json"])
    assert result.exit_code == 1
    assert "http_error" in result.stdout
    assert "401" in result.stdout


@respx.mock
def test_log_list_without_token_omits_auth_header(runner):
    route = respx.get(f"{TEST_API_URL}/api/types/observations/").mock(
        return_value=httpx.Response(200, json={"count": 0, "results": []})
    )
    result = runner.invoke(app, ["log", "list", "--json"])
    assert result.exit_code == 0, result.stdout
    assert "Authorization" not in route.calls.last.request.headers


@respx.mock
def test_log_list_with_token_sets_bearer(runner, admin_token_env):
    route = respx.get(f"{TEST_API_URL}/api/types/observations/").mock(
        return_value=httpx.Response(200, json={"count": 0, "results": []})
    )
    result = runner.invoke(app, ["log", "list", "--json"])
    assert result.exit_code == 0, result.stdout
    assert route.calls.last.request.headers["Authorization"] == f"Bearer {TEST_TOKEN}"
