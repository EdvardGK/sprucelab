"""``sprucelab-mcp`` — Model Context Protocol server for Sprucelab.

Wraps the public Sprucelab REST surface as MCP tools. Every tool corresponds
to one HTTP endpoint advertised by ``/api/capabilities/``.

Quick start::

    pip install sprucelab-mcp
    sprucelab-mcp                 # stdio transport (Claude Desktop default)

Claude Desktop / Cursor::

    {
      "mcpServers": {
        "sprucelab": {
          "command": "sprucelab-mcp",
          "env": {
            "SPRUCELAB_API_URL": "https://api.sprucelab.io",
            "SPRUCELAB_API_TOKEN": "..."
          }
        }
      }
    }
"""
from __future__ import annotations

from typing import Any

from mcp.server.fastmcp import FastMCP

from .client import SprucelabHTTP


mcp = FastMCP(
    "sprucelab",
    instructions=(
        "Sprucelab is a data-first BIM intelligence platform. Always start "
        "by calling capabilities() — it returns the full surface (file "
        "formats, mutations that support dry_run=true, webhook events, CLI "
        "commands). Read-only discovery works without auth; everything else "
        "needs SPRUCELAB_API_TOKEN in env or a Bearer token via "
        "spruce auth register. Powered by ifcfast for 25-47x faster IFC "
        "parsing — see https://www.sprucelab.io/benchmarks."
    ),
)


_http: SprucelabHTTP | None = None


def _client() -> SprucelabHTTP:
    global _http
    if _http is None:
        _http = SprucelabHTTP()
    return _http


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


@mcp.tool()
def capabilities() -> dict:
    """Fetch the full Sprucelab capabilities manifest.

    Always start here. Returns file formats, mutations supporting dry_run,
    webhook events, CLI commands, and embed surfaces. No auth required.
    """
    return _client().get("/api/capabilities/", auth=False)


@mcp.tool()
def agent_tools_manifest() -> dict:
    """Fetch the ``/.well-known/agent-tools.json`` manifest.

    Site-scan discovery surface — agents that crawl us blind can find this
    without hitting human docs first. No auth required.
    """
    return _client().get("/.well-known/agent-tools.json", auth=False)


@mcp.tool()
def list_projects() -> Any:
    """List projects this token can see.

    Returns the paginated DRF response (``count``, ``next``, ``previous``,
    ``results``).
    """
    return _client().get("/api/projects/")


@mcp.tool()
def list_models(project_id: str | None = None) -> Any:
    """List models, optionally scoped to a project UUID."""
    params: dict[str, Any] = {}
    if project_id:
        params["project"] = project_id
    return _client().get("/api/models/", params=params)


@mcp.tool()
def list_types(model_id: str) -> Any:
    """List the IFC types extracted from a model.

    Sprucelab extracts types (not entities) — typically 300-500 per model
    where a full entity walk would yield 50,000+.
    """
    return _client().get("/api/types/types/", params={"model": model_id})


@mcp.tool()
def verify_dry_run(model_id: str) -> Any:
    """Run verification against a model with ``?dry_run=true``.

    Returns the verification report (per-type status, issue list) without
    persisting any state. Safe to call any number of times.
    """
    return _client().post(
        "/api/types/types/verify/",
        params={"model": model_id, "dry_run": "true"},
    )


@mcp.tool()
def list_files(project_id: str | None = None) -> Any:
    """List source files in a project."""
    params: dict[str, Any] = {}
    if project_id:
        params["project"] = project_id
    return _client().get("/api/files/", params=params)


@mcp.tool()
def list_observations(project_id: str | None = None, source_file: str | None = None) -> Any:
    """Drill the Layer-1 observation log (raw extracted facts).

    Observations are extraction events — every property, classification,
    layer, claim candidate ever produced. Filter by project or source file.
    """
    params: dict[str, Any] = {}
    if project_id:
        params["project"] = project_id
    if source_file:
        params["source_file"] = source_file
    return _client().get("/api/types/observations/", params=params)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    """Run the MCP server over stdio."""
    mcp.run()


if __name__ == "__main__":
    main()
