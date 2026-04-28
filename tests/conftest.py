"""
Pytest harness for Sprucelab.

What's here:
- A SAFETY check that aborts the test run if DATABASE_URL points anywhere
  but localhost — production Postgres must never see test writes.
- pytest-django configures the test DB (`test_<dbname>`) automatically.
- A session-scoped FastAPI subprocess fixture (`fastapi_service`) that boots
  ifc-service on a free port pointed at the same test DB Django uses.
- A sample IFC fixture generated programmatically (no committed binaries).
"""
from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Iterator
from urllib.parse import urlparse

import pytest

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
IFC_SERVICE = BACKEND / "ifc-service"

# Make backend importable for Django settings before pytest-django loads it.
sys.path.insert(0, str(BACKEND))


# ---------------------------------------------------------------------------
# SAFETY: refuse to run against a non-localhost DB.
# ---------------------------------------------------------------------------

def _db_host(url: str) -> str:
    if not url:
        return ""
    try:
        return urlparse(url).hostname or ""
    except Exception:
        return ""


def pytest_configure(config: pytest.Config) -> None:
    """Block the run early if DATABASE_URL is suspicious."""
    db_url = os.environ.get("DATABASE_URL", "")
    host = _db_host(db_url)
    safe_hosts = {"localhost", "127.0.0.1", "sprucelab-dev-db", ""}
    if host not in safe_hosts:
        raise pytest.UsageError(
            f"\n[safety] DATABASE_URL points to {host!r}, refusing to run tests.\n"
            f"[safety] Source .env.dev (local Postgres) or unset DATABASE_URL.\n"
            f"[safety] Tests must NEVER run against a remote / production DB.\n"
        )


# ---------------------------------------------------------------------------
# FastAPI subprocess fixture
# ---------------------------------------------------------------------------

def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _wait_for_http(url: str, timeout_s: float = 30.0) -> None:
    """Poll a URL until it returns < 500, or raise TimeoutError."""
    import urllib.request
    deadline = time.time() + timeout_s
    last_err: Exception | None = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.0) as r:
                if r.status < 500:
                    return
        except Exception as e:
            last_err = e
        time.sleep(0.25)
    raise TimeoutError(f"FastAPI not ready at {url} after {timeout_s}s: {last_err}")


@pytest.fixture(scope="session")
def fastapi_service(django_db_setup, django_db_blocker) -> Iterator[dict]:
    """
    Boot ifc-service in a subprocess on a free port, pointed at the test DB.

    Yields:
        dict with `base_url`, `port`, `pid`. Subprocess is killed at session end.
    """
    from django.db import connection
    # `connection.settings_dict` reflects the active connection (the test DB
    # pytest-django created). NAME is already swapped to the test name here.
    db = connection.settings_dict
    db_url = (
        f"postgresql://{db['USER']}:{db['PASSWORD']}"
        f"@{db['HOST']}:{db['PORT']}/{db['NAME']}"
    )

    port = _free_port()
    env = os.environ.copy()
    env.update({
        "DATABASE_URL": db_url,
        "PORT": str(port),
        "HOST": "127.0.0.1",
        "DEBUG": "True",
        "IFC_SERVICE_API_KEY": "test-key",
        # Don't load any .env file — pydantic-settings would clobber DATABASE_URL.
        "PYDANTIC_SETTINGS_FROZEN": "1",
    })

    log_path = ROOT / "tests" / ".fastapi.test.log"
    log = open(log_path, "w")
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app",
         "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
        cwd=str(IFC_SERVICE),
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
    )

    base_url = f"http://127.0.0.1:{port}"
    try:
        _wait_for_http(f"{base_url}/docs", timeout_s=30.0)
    except TimeoutError:
        proc.kill()
        log.close()
        sys.stderr.write(f"\n[fastapi] failed to start. Log: {log_path}\n")
        sys.stderr.write(log_path.read_text())
        raise

    yield {"base_url": base_url, "port": port, "pid": proc.pid}

    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
    log.close()


# ---------------------------------------------------------------------------
# Domain fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _open_permissions(settings):
    """
    Tests bypass auth by default — the data-foundation pipeline is what's
    under test, not authn. Real auth gets covered in dedicated tests.
    """
    settings.REST_FRAMEWORK = {
        **getattr(settings, 'REST_FRAMEWORK', {}),
        'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.AllowAny'],
        'DEFAULT_AUTHENTICATION_CLASSES': [],
    }


@pytest.fixture(autouse=True)
def _wire_service_urls(request, settings, fastapi_service):
    """
    Auto-wire DJANGO_URL + IFC_SERVICE_URL when a test pulls in `live_server`.

    FastAPI downloads the uploaded file from DJANGO_URL; without this it'd
    hit production:8000 by default.
    """
    if 'live_server' in request.fixturenames:
        settings.DJANGO_URL = request.getfixturevalue('live_server').url
    settings.IFC_SERVICE_URL = fastapi_service['base_url']
    settings.IFC_SERVICE_API_KEY = 'test-key'
    # The legacy upload guard refuses localhost file URLs unless DEBUG is on.
    settings.DEBUG = True


@pytest.fixture
def project(db):
    """A fresh Project for each test."""
    from apps.projects.models import Project
    return Project.objects.create(name="e2e-test", description="pytest")


@pytest.fixture(scope="session")
def sample_ifc_path(tmp_path_factory) -> Path:
    """
    Generate a tiny synthetic IFC file once per session.

    Built with ifcopenshell so it's a real, parseable IFC4 file with a single
    wall + storey + project. ~5 KB. Cached per session.
    """
    from .fixtures.ifc_factory import build_minimal_ifc
    out = tmp_path_factory.mktemp("ifc") / "minimal.ifc"
    build_minimal_ifc(out)
    return out


@pytest.fixture
def api_client(client, live_server):
    """
    Returns (django_test_client, live_server_url).

    `client` is fast for ORM-level assertions. `live_server` is needed when
    FastAPI calls back into Django over HTTP. Tests pick whichever they need.
    """
    return client, live_server.url
