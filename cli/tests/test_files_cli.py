"""
`spruce files` CLI tests.

Mirrors the mocked-httpx pattern used by test_log_cli / test_models_cli.
Subcommands covered:

  - list      (--project, --format, --current-only, --limit, --json)
  - show      (table + JSON; HTTP error path; "next-step" hint)
  - upload    (multipart POST; duplicate flag; --on-duplicate validation; missing path)
  - download  (streaming GET on file_url; --out / --overwrite; no-file_url path)
  - reprocess (POST /reprocess/; JSON output)
  - versions  (detail + list filter; client-side filename match)
"""
from __future__ import annotations

import json as _json
from pathlib import Path

import httpx
import pytest
import respx

from spruce.cli import app
from tests.conftest import TEST_API_URL, TEST_TOKEN


PROJECT_ID = "11111111-2222-3333-4444-555555555555"
FILE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
FILE_ID_V2 = "11112222-3333-4444-5555-666677778888"
RUN_ID = "99998888-7777-6666-5555-444433332222"


def _list_payload() -> dict:
    return {
        "count": 2,
        "next": None,
        "previous": None,
        "results": [
            {
                "id": FILE_ID,
                "project": PROJECT_ID,
                "project_name": "Test Project",
                "scope": None,
                "original_filename": "Arkitekt.ifc",
                "format": "ifc",
                "file_size": 12345678,
                "checksum_sha256": "abc123" * 5,
                "mime_type": "application/octet-stream",
                "version_number": 1,
                "parent_file": None,
                "is_current": True,
                "uploaded_by": None,
                "uploaded_at": "2026-05-11T10:30:00Z",
                "latest_extraction_status": "completed",
            },
            {
                "id": FILE_ID_V2,
                "project": PROJECT_ID,
                "project_name": "Test Project",
                "scope": None,
                "original_filename": "Plan.pdf",
                "format": "pdf",
                "file_size": 245678,
                "checksum_sha256": "def456" * 5,
                "mime_type": "application/pdf",
                "version_number": 2,
                "parent_file": FILE_ID,
                "is_current": True,
                "uploaded_by": None,
                "uploaded_at": "2026-05-11T11:00:00Z",
                "latest_extraction_status": "running",
            },
        ],
    }


def _detail_payload(file_id: str = FILE_ID, with_runs: bool = True) -> dict:
    base = {
        "id": file_id,
        "project": PROJECT_ID,
        "project_name": "Test Project",
        "scope": None,
        "original_filename": "Arkitekt.ifc",
        "file_url": "https://storage.example/source_files/Arkitekt.ifc",
        "file_size": 12345678,
        "checksum_sha256": "abc123" * 5,
        "format": "ifc",
        "mime_type": "application/octet-stream",
        "version_number": 1,
        "parent_file": None,
        "is_current": True,
        "uploaded_by": None,
        "uploaded_at": "2026-05-11T10:30:00Z",
        "extraction_runs": [],
    }
    if with_runs:
        base["extraction_runs"] = [
            {
                "id": RUN_ID,
                "source_file": file_id,
                "status": "completed",
                "started_at": "2026-05-11T10:30:05Z",
                "completed_at": "2026-05-11T10:30:08Z",
                "duration_seconds": 2.7,
                "discovered_crs": "EPSG:25832",
                "extractor_version": "ifc:0.8.4",
                "error_message": "",
            },
        ]
    return base


# ---------------------------------------------------------------------------
# spruce files list
# ---------------------------------------------------------------------------


@respx.mock
def test_files_list_table_mode(runner, admin_token_env):
    route = respx.get(f"{TEST_API_URL}/api/files/").mock(
        return_value=httpx.Response(200, json=_list_payload())
    )
    result = runner.invoke(app, ["files", "list"])
    assert result.exit_code == 0, result.stdout
    assert route.called
    assert "Arkitekt.ifc" in result.stdout
    assert "Plan.pdf" in result.stdout
    assert "ifc" in result.stdout
    assert "completed" in result.stdout
    # Auth header forwarded
    assert route.calls.last.request.headers["Authorization"] == f"Bearer {TEST_TOKEN}"


@respx.mock
def test_files_list_json_mode(runner, admin_token_env):
    respx.get(f"{TEST_API_URL}/api/files/").mock(
        return_value=httpx.Response(200, json=_list_payload())
    )
    result = runner.invoke(app, ["files", "list", "--json"])
    assert result.exit_code == 0, result.stdout
    parsed = _json.loads(result.stdout)
    assert parsed["count"] == 2
    assert parsed["returned"] == 2
    assert parsed["results"][0]["id"] == FILE_ID


@respx.mock
def test_files_list_filters_pushed_to_query(runner, admin_token_env):
    route = respx.get(f"{TEST_API_URL}/api/files/").mock(
        return_value=httpx.Response(200, json={"count": 0, "results": []})
    )
    result = runner.invoke(app, [
        "files", "list",
        "--project", PROJECT_ID,
        "--format", "ifc",
        "--current-only",
        "--json",
    ])
    assert result.exit_code == 0, result.stdout
    params = route.calls.last.request.url.params
    assert params["project"] == PROJECT_ID
    assert params["format"] == "ifc"
    assert params["is_current"] == "true"


def test_files_list_rejects_unknown_format(runner, admin_token_env):
    result = runner.invoke(app, ["files", "list", "--format", "stl"])
    assert result.exit_code == 2
    assert "Unknown format" in result.stdout


@respx.mock
def test_files_list_empty_emits_hint(runner, admin_token_env):
    respx.get(f"{TEST_API_URL}/api/files/").mock(
        return_value=httpx.Response(200, json={"count": 0, "results": []})
    )
    result = runner.invoke(app, ["files", "list"])
    assert result.exit_code == 0, result.stdout
    assert "No files matched" in result.stdout
    assert "Try:" in result.stdout


@respx.mock
def test_files_list_limit_truncates(runner, admin_token_env):
    big = {
        "count": 50,
        "results": [
            {
                "id": f"{i:08d}-0000-0000-0000-000000000000",
                "project": PROJECT_ID,
                "project_name": "P",
                "original_filename": f"file_{i}.ifc",
                "format": "ifc",
                "file_size": 100,
                "version_number": 1,
                "is_current": True,
                "latest_extraction_status": "completed",
            }
            for i in range(50)
        ],
    }
    respx.get(f"{TEST_API_URL}/api/files/").mock(
        return_value=httpx.Response(200, json=big)
    )
    result = runner.invoke(app, ["files", "list", "--limit", "5", "--json"])
    assert result.exit_code == 0, result.stdout
    parsed = _json.loads(result.stdout)
    assert parsed["returned"] == 5
    assert parsed["count"] == 50


@respx.mock
def test_files_list_http_error_json(runner, admin_token_env):
    respx.get(f"{TEST_API_URL}/api/files/").mock(
        return_value=httpx.Response(401, json={"detail": "bad token"})
    )
    result = runner.invoke(app, ["files", "list", "--json"])
    assert result.exit_code == 1
    parsed = _json.loads(result.stdout)
    assert parsed["error"] == "HTTP 401"
    assert parsed["status"] == 401
    assert "spruce auth register" in parsed["hint"]


@respx.mock
def test_files_list_without_token_omits_auth_header(runner):
    route = respx.get(f"{TEST_API_URL}/api/files/").mock(
        return_value=httpx.Response(200, json={"count": 0, "results": []})
    )
    result = runner.invoke(app, ["files", "list", "--json"])
    assert result.exit_code == 0, result.stdout
    assert "Authorization" not in route.calls.last.request.headers


# ---------------------------------------------------------------------------
# spruce files show
# ---------------------------------------------------------------------------


@respx.mock
def test_files_show_table(runner, admin_token_env):
    respx.get(f"{TEST_API_URL}/api/files/{FILE_ID}/").mock(
        return_value=httpx.Response(200, json=_detail_payload())
    )
    result = runner.invoke(app, ["files", "show", FILE_ID])
    assert result.exit_code == 0, result.stdout
    assert "Arkitekt.ifc" in result.stdout
    assert "Extraction runs" in result.stdout
    assert "completed" in result.stdout
    # Next-step hint surfaces
    assert "spruce log list --source-file" in result.stdout


@respx.mock
def test_files_show_json(runner, admin_token_env):
    respx.get(f"{TEST_API_URL}/api/files/{FILE_ID}/").mock(
        return_value=httpx.Response(200, json=_detail_payload())
    )
    result = runner.invoke(app, ["files", "show", FILE_ID, "--json"])
    assert result.exit_code == 0, result.stdout
    parsed = _json.loads(result.stdout)
    assert parsed["id"] == FILE_ID
    assert parsed["extraction_runs"][0]["status"] == "completed"


@respx.mock
def test_files_show_no_runs_hint(runner, admin_token_env):
    respx.get(f"{TEST_API_URL}/api/files/{FILE_ID}/").mock(
        return_value=httpx.Response(200, json=_detail_payload(with_runs=False))
    )
    result = runner.invoke(app, ["files", "show", FILE_ID])
    assert result.exit_code == 0, result.stdout
    assert "No extraction runs" in result.stdout
    assert "spruce files reprocess" in result.stdout


@respx.mock
def test_files_show_404(runner, admin_token_env):
    respx.get(f"{TEST_API_URL}/api/files/{FILE_ID}/").mock(
        return_value=httpx.Response(404, json={"detail": "Not found."})
    )
    result = runner.invoke(app, ["files", "show", FILE_ID, "--json"])
    assert result.exit_code == 1
    parsed = _json.loads(result.stdout)
    assert parsed["error"] == "HTTP 404"
    assert parsed["status"] == 404
    assert "spruce files list" in parsed["hint"]


# ---------------------------------------------------------------------------
# spruce files upload
# ---------------------------------------------------------------------------


@respx.mock
def test_files_upload_success(runner, admin_token_env, tmp_path):
    src = tmp_path / "demo.ifc"
    src.write_bytes(b"FAKE-IFC-CONTENT")

    response_body = {
        "id": FILE_ID,
        "project": PROJECT_ID,
        "original_filename": "demo.ifc",
        "format": "ifc",
        "version_number": 1,
        "is_current": True,
        "extraction_run": {"id": RUN_ID, "status": "pending"},
    }
    route = respx.post(f"{TEST_API_URL}/api/files/").mock(
        return_value=httpx.Response(201, json=response_body)
    )
    result = runner.invoke(app, [
        "files", "upload", str(src),
        "--project", PROJECT_ID,
    ])
    assert result.exit_code == 0, result.stdout
    assert route.called
    request = route.calls.last.request
    # Default on_duplicate=use_existing (idempotent)
    assert request.url.params["on_duplicate"] == "use_existing"
    assert request.headers["Authorization"] == f"Bearer {TEST_TOKEN}"
    # Multipart, not JSON
    ct = request.headers.get("content-type", "")
    assert ct.startswith("multipart/form-data")
    assert "✓ Uploaded" in result.stdout
    assert FILE_ID in result.stdout


@respx.mock
def test_files_upload_duplicate_response(runner, admin_token_env, tmp_path):
    src = tmp_path / "demo.ifc"
    src.write_bytes(b"FAKE-IFC")
    respx.post(f"{TEST_API_URL}/api/files/").mock(
        return_value=httpx.Response(200, json={
            "duplicate": True,
            "detail": "A file with identical contents already exists.",
            "existing_file": {
                "id": FILE_ID,
                "original_filename": "demo.ifc",
                "format": "ifc",
            },
        })
    )
    result = runner.invoke(app, [
        "files", "upload", str(src),
        "--project", PROJECT_ID,
        "--on-duplicate", "ask",
    ])
    assert result.exit_code == 0, result.stdout
    assert "Duplicate detected" in result.stdout
    assert "--on-duplicate replace" in result.stdout


def test_files_upload_rejects_invalid_on_duplicate(runner, admin_token_env, tmp_path):
    src = tmp_path / "demo.ifc"
    src.write_bytes(b"X")
    result = runner.invoke(app, [
        "files", "upload", str(src),
        "--project", PROJECT_ID,
        "--on-duplicate", "merge",
    ])
    assert result.exit_code == 2
    assert "Unknown --on-duplicate" in result.stdout


def test_files_upload_missing_path(runner, admin_token_env):
    result = runner.invoke(app, [
        "files", "upload", "/nonexistent/path/file.ifc",
        "--project", PROJECT_ID,
    ])
    assert result.exit_code == 1
    assert "File not found" in result.stdout


@respx.mock
def test_files_upload_json_output(runner, admin_token_env, tmp_path):
    src = tmp_path / "demo.ifc"
    src.write_bytes(b"FAKE-IFC")
    body = {
        "id": FILE_ID,
        "format": "ifc",
        "version_number": 1,
        "extraction_run": {"id": RUN_ID, "status": "pending"},
    }
    respx.post(f"{TEST_API_URL}/api/files/").mock(
        return_value=httpx.Response(201, json=body)
    )
    result = runner.invoke(app, [
        "files", "upload", str(src),
        "--project", PROJECT_ID,
        "--json",
    ])
    assert result.exit_code == 0, result.stdout
    parsed = _json.loads(result.stdout)
    assert parsed["id"] == FILE_ID


# ---------------------------------------------------------------------------
# spruce files download
# ---------------------------------------------------------------------------


@respx.mock
def test_files_download_streams_to_disk(runner, admin_token_env, tmp_path):
    storage_url = "https://storage.example/source_files/Arkitekt.ifc"
    respx.get(f"{TEST_API_URL}/api/files/{FILE_ID}/").mock(
        return_value=httpx.Response(200, json=_detail_payload())
    )
    blob = b"BINARY-IFC-PAYLOAD"
    respx.get(storage_url).mock(
        return_value=httpx.Response(200, content=blob)
    )
    out = tmp_path / "out.ifc"
    result = runner.invoke(app, [
        "files", "download", FILE_ID,
        "--out", str(out),
    ])
    assert result.exit_code == 0, result.stdout
    assert out.exists()
    assert out.read_bytes() == blob
    assert "Downloaded" in result.stdout


@respx.mock
def test_files_download_refuses_overwrite_by_default(runner, admin_token_env, tmp_path):
    respx.get(f"{TEST_API_URL}/api/files/{FILE_ID}/").mock(
        return_value=httpx.Response(200, json=_detail_payload())
    )
    out = tmp_path / "out.ifc"
    out.write_bytes(b"already-here")
    result = runner.invoke(app, [
        "files", "download", FILE_ID,
        "--out", str(out),
    ])
    assert result.exit_code == 1
    assert "already exists" in result.stdout
    assert "--overwrite" in result.stdout


@respx.mock
def test_files_download_overwrite_replaces(runner, admin_token_env, tmp_path):
    storage_url = "https://storage.example/source_files/Arkitekt.ifc"
    respx.get(f"{TEST_API_URL}/api/files/{FILE_ID}/").mock(
        return_value=httpx.Response(200, json=_detail_payload())
    )
    new_blob = b"NEW-CONTENT"
    respx.get(storage_url).mock(
        return_value=httpx.Response(200, content=new_blob)
    )
    out = tmp_path / "out.ifc"
    out.write_bytes(b"old-content")
    result = runner.invoke(app, [
        "files", "download", FILE_ID,
        "--out", str(out),
        "--overwrite",
    ])
    assert result.exit_code == 0, result.stdout
    assert out.read_bytes() == new_blob


@respx.mock
def test_files_download_no_file_url_fails(runner, admin_token_env, tmp_path):
    detail = _detail_payload()
    detail["file_url"] = None
    respx.get(f"{TEST_API_URL}/api/files/{FILE_ID}/").mock(
        return_value=httpx.Response(200, json=detail)
    )
    out = tmp_path / "out.ifc"
    result = runner.invoke(app, [
        "files", "download", FILE_ID,
        "--out", str(out),
        "--json",
    ])
    assert result.exit_code == 1
    parsed = _json.loads(result.stdout)
    assert parsed["error"] == "no_file_url"


@respx.mock
def test_files_download_json_output(runner, admin_token_env, tmp_path):
    storage_url = "https://storage.example/source_files/Arkitekt.ifc"
    respx.get(f"{TEST_API_URL}/api/files/{FILE_ID}/").mock(
        return_value=httpx.Response(200, json=_detail_payload())
    )
    respx.get(storage_url).mock(
        return_value=httpx.Response(200, content=b"abc")
    )
    out = tmp_path / "out.ifc"
    result = runner.invoke(app, [
        "files", "download", FILE_ID,
        "--out", str(out),
        "--json",
    ])
    assert result.exit_code == 0, result.stdout
    parsed = _json.loads(result.stdout)
    assert parsed["bytes_written"] == 3
    assert parsed["file_id"] == FILE_ID


# ---------------------------------------------------------------------------
# spruce files reprocess
# ---------------------------------------------------------------------------


@respx.mock
def test_files_reprocess_table(runner, admin_token_env):
    respx.post(f"{TEST_API_URL}/api/files/{FILE_ID}/reprocess/").mock(
        return_value=httpx.Response(202, json={
            "id": RUN_ID,
            "status": "pending",
            "source_file": FILE_ID,
            "started_at": "2026-05-11T12:00:00Z",
        })
    )
    result = runner.invoke(app, ["files", "reprocess", FILE_ID])
    assert result.exit_code == 0, result.stdout
    assert "Reprocess queued" in result.stdout
    assert RUN_ID in result.stdout
    assert "pending" in result.stdout


@respx.mock
def test_files_reprocess_json(runner, admin_token_env):
    respx.post(f"{TEST_API_URL}/api/files/{FILE_ID}/reprocess/").mock(
        return_value=httpx.Response(202, json={
            "id": RUN_ID,
            "status": "pending",
        })
    )
    result = runner.invoke(app, ["files", "reprocess", FILE_ID, "--json"])
    assert result.exit_code == 0, result.stdout
    parsed = _json.loads(result.stdout)
    assert parsed["id"] == RUN_ID
    assert parsed["status"] == "pending"


@respx.mock
def test_files_reprocess_400_no_file_url(runner, admin_token_env):
    respx.post(f"{TEST_API_URL}/api/files/{FILE_ID}/reprocess/").mock(
        return_value=httpx.Response(400, json={"error": "no_file_url"})
    )
    result = runner.invoke(app, ["files", "reprocess", FILE_ID, "--json"])
    assert result.exit_code == 1
    parsed = _json.loads(result.stdout)
    assert parsed["status"] == 400
    assert "spruce files reprocess --help" in parsed["hint"]


# ---------------------------------------------------------------------------
# spruce files versions
# ---------------------------------------------------------------------------


@respx.mock
def test_files_versions_table(runner, admin_token_env):
    # Detail of the current file
    respx.get(f"{TEST_API_URL}/api/files/{FILE_ID}/").mock(
        return_value=httpx.Response(200, json=_detail_payload())
    )
    # List in same project — has Arkitekt.ifc x2 + an unrelated file
    payload = {
        "count": 3,
        "results": [
            {
                "id": FILE_ID,
                "project": PROJECT_ID,
                "original_filename": "Arkitekt.ifc",
                "format": "ifc",
                "file_size": 100,
                "version_number": 1,
                "is_current": False,
                "uploaded_at": "2026-05-10T09:00:00Z",
                "latest_extraction_status": "completed",
            },
            {
                "id": FILE_ID_V2,
                "project": PROJECT_ID,
                "original_filename": "Arkitekt.ifc",
                "format": "ifc",
                "file_size": 200,
                "version_number": 2,
                "is_current": True,
                "uploaded_at": "2026-05-11T09:00:00Z",
                "latest_extraction_status": "completed",
            },
            {
                "id": "ffffffff-ffff-ffff-ffff-ffffffffffff",
                "project": PROJECT_ID,
                "original_filename": "Other.ifc",
                "format": "ifc",
                "file_size": 50,
                "version_number": 1,
                "is_current": True,
                "uploaded_at": "2026-05-09T09:00:00Z",
                "latest_extraction_status": "completed",
            },
        ],
    }
    respx.get(f"{TEST_API_URL}/api/files/").mock(
        return_value=httpx.Response(200, json=payload)
    )
    result = runner.invoke(app, ["files", "versions", FILE_ID])
    assert result.exit_code == 0, result.stdout
    assert "Arkitekt.ifc" in result.stdout
    assert "2 total" in result.stdout
    # Unrelated file does NOT appear
    assert "Other.ifc" not in result.stdout


@respx.mock
def test_files_versions_json(runner, admin_token_env):
    respx.get(f"{TEST_API_URL}/api/files/{FILE_ID}/").mock(
        return_value=httpx.Response(200, json=_detail_payload())
    )
    payload = {
        "count": 1,
        "results": [
            {
                "id": FILE_ID,
                "project": PROJECT_ID,
                "original_filename": "Arkitekt.ifc",
                "format": "ifc",
                "file_size": 100,
                "version_number": 1,
                "is_current": True,
                "uploaded_at": "2026-05-11T09:00:00Z",
                "latest_extraction_status": "completed",
            },
        ],
    }
    respx.get(f"{TEST_API_URL}/api/files/").mock(
        return_value=httpx.Response(200, json=payload)
    )
    result = runner.invoke(app, ["files", "versions", FILE_ID, "--json"])
    assert result.exit_code == 0, result.stdout
    parsed = _json.loads(result.stdout)
    assert parsed["count"] == 1
    assert parsed["original_filename"] == "Arkitekt.ifc"
    assert parsed["results"][0]["id"] == FILE_ID


@respx.mock
def test_files_versions_404_on_detail(runner, admin_token_env):
    respx.get(f"{TEST_API_URL}/api/files/{FILE_ID}/").mock(
        return_value=httpx.Response(404, json={"detail": "Not found."})
    )
    result = runner.invoke(app, ["files", "versions", FILE_ID, "--json"])
    assert result.exit_code == 1
    parsed = _json.loads(result.stdout)
    assert parsed["status"] == 404
    assert "spruce files list" in parsed["hint"]


@respx.mock
def test_files_list_401_hint(runner, admin_token_env):
    respx.get(f"{TEST_API_URL}/api/files/").mock(
        return_value=httpx.Response(401, json={"detail": "invalid token"})
    )
    result = runner.invoke(app, ["files", "list", "--json"])
    assert result.exit_code == 1
    parsed = _json.loads(result.stdout)
    assert parsed["error"] == "HTTP 401"
    assert "spruce auth register" in parsed["hint"]


@respx.mock
def test_files_upload_403_hint(runner, admin_token_env, tmp_path):
    src = tmp_path / "demo.ifc"
    src.write_bytes(b"X")
    respx.post(f"{TEST_API_URL}/api/files/").mock(
        return_value=httpx.Response(403, json={"detail": "forbidden"})
    )
    result = runner.invoke(app, [
        "files", "upload", str(src),
        "--project", PROJECT_ID,
        "--json",
    ])
    assert result.exit_code == 1
    parsed = _json.loads(result.stdout)
    assert parsed["error"] == "HTTP 403"
    assert parsed["status"] == 403
    assert "spruce auth register" in parsed["hint"]


@respx.mock
def test_files_download_404_hint(runner, admin_token_env, tmp_path):
    respx.get(f"{TEST_API_URL}/api/files/{FILE_ID}/").mock(
        return_value=httpx.Response(404, json={"detail": "Not found."})
    )
    out = tmp_path / "out.ifc"
    result = runner.invoke(app, [
        "files", "download", FILE_ID,
        "--out", str(out),
        "--json",
    ])
    assert result.exit_code == 1
    parsed = _json.loads(result.stdout)
    assert parsed["error"] == "HTTP 404"
    assert parsed["status"] == 404
    assert "spruce files list" in parsed["hint"]
