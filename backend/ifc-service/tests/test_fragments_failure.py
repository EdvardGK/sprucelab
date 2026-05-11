"""
Unit tests for fragment-conversion subprocess failure classification.

Covers the SIGKILL/OOM branch (Railway OOM-killer) vs the generic
non-zero exit branch in `api.fragments._classify_subprocess_failure`.
"""

import logging
import subprocess
import sys
from pathlib import Path

import pytest

# Ensure `ifc-service` root is importable when pytest is invoked from there
# or from elsewhere. The fragments module imports `from config import settings`,
# which requires the ifc-service root on sys.path.
_IFC_SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(_IFC_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(_IFC_SERVICE_ROOT))

from api.fragments import _classify_subprocess_failure  # noqa: E402


def _make_completed_process(returncode: int, stderr: str = "") -> subprocess.CompletedProcess:
    """Build a stand-in CompletedProcess for the classifier under test."""
    return subprocess.CompletedProcess(
        args=["node", "convert-to-fragments.mjs"],
        returncode=returncode,
        stdout="",
        stderr=stderr,
    )


def test_oom_branch_raises_with_oom_reason(caplog):
    """SIGKILL (returncode -9) must surface as an explicit OOM exception
    and emit a structured `fragments_oom` log line."""
    result = _make_completed_process(returncode=-9, stderr="")

    with caplog.at_level(logging.ERROR, logger="api.fragments"):
        exc = _classify_subprocess_failure(
            result,
            model_id="abc-123",
            file_size_mb=512.0,
        )

    assert isinstance(exc, Exception)
    assert "OOM" in str(exc)
    assert "SIGKILL" in str(exc)

    # Structured log: at least one record with the fragments_oom event +
    # the actionable fields the coordinator can pivot on.
    oom_records = [
        r for r in caplog.records
        if getattr(r, "event", None) == "fragments_oom"
    ]
    assert oom_records, "expected a fragments_oom structured log record"
    record = oom_records[0]
    assert record.model_id == "abc-123"
    assert record.file_size_mb == 512.0
    assert record.returncode == -9


def test_oom_branch_handles_shell_layer_returncode_137(caplog):
    """When a shell layer is between us and the killed process,
    returncode surfaces as 137 (128 + SIGKILL=9). Same OOM treatment."""
    result = _make_completed_process(returncode=137, stderr="")

    with caplog.at_level(logging.ERROR, logger="api.fragments"):
        exc = _classify_subprocess_failure(
            result,
            model_id="def-456",
            file_size_mb=None,
        )

    assert "OOM" in str(exc)
    oom_records = [
        r for r in caplog.records
        if getattr(r, "event", None) == "fragments_oom"
    ]
    assert oom_records
    assert oom_records[0].returncode == 137


def test_generic_failure_branch_includes_stderr(caplog):
    """Non-SIGKILL non-zero exits must include the exit code and stderr
    in the exception, plus emit a `fragments_failed` structured log."""
    stderr_text = "something broke: cannot read property 'x' of undefined"
    result = _make_completed_process(returncode=1, stderr=stderr_text)

    with caplog.at_level(logging.ERROR, logger="api.fragments"):
        exc = _classify_subprocess_failure(
            result,
            model_id="ghi-789",
            file_size_mb=42.0,
        )

    assert isinstance(exc, Exception)
    msg = str(exc)
    assert "exit 1" in msg
    assert "something broke" in msg

    failed_records = [
        r for r in caplog.records
        if getattr(r, "event", None) == "fragments_failed"
    ]
    assert failed_records, "expected a fragments_failed structured log record"
    record = failed_records[0]
    assert record.returncode == 1
    assert "something broke" in record.stderr_tail


def test_generic_failure_branch_with_empty_stderr(caplog):
    """Generic failure with empty stderr must still produce a usable message
    rather than `Conversion failed: ` (the bug this track fixes)."""
    result = _make_completed_process(returncode=2, stderr="")

    with caplog.at_level(logging.ERROR, logger="api.fragments"):
        exc = _classify_subprocess_failure(
            result,
            model_id="jkl-000",
            file_size_mb=1.0,
        )

    msg = str(exc)
    assert "exit 2" in msg
    assert "<no stderr>" in msg
