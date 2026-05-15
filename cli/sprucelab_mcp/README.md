# sprucelab-mcp

> MCP server for Sprucelab. Drop into Claude Desktop, Cursor, or any
> MCP-aware host and get Sprucelab's agent surface as typed tool calls.

```bash
pip install sprucelab-mcp
```

Then in your MCP client config (Claude Desktop, Cursor, Continue, …):

```json
{
  "mcpServers": {
    "sprucelab": {
      "command": "sprucelab-mcp",
      "env": {
        "SPRUCELAB_API_URL": "https://api.sprucelab.io",
        "SPRUCELAB_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

The server is a thin wrapper over Sprucelab's public HTTP surface — the same
one advertised at <https://api.sprucelab.io/api/capabilities/>. No surprises,
no custom protocol. If a tool fails, the error is the literal API response.

## Auth

Read-only discovery (`capabilities`, `agent_tools_manifest`) works without
auth. Everything else needs a token. Either set `SPRUCELAB_API_TOKEN` in the
MCP env block, or get one via:

```bash
spruce auth register --token <YOUR_KEY> --url https://api.sprucelab.io
```

For experimentation, the public sandbox token (read-only) is published on
<https://www.sprucelab.io/agents>.

## Tools

| Tool | Auth | Purpose |
| ---- | ---- | ------- |
| `capabilities()` | — | Fetch the full capabilities manifest. Always start here. |
| `agent_tools_manifest()` | — | Fetch `/.well-known/agent-tools.json`. |
| `list_projects()` | Bearer | List projects the token can see. |
| `list_models(project_id?)` | Bearer | List models in a project. |
| `list_types(model_id)` | Bearer | List IFC types extracted from a model. |
| `verify_dry_run(model_id)` | Bearer | Run verification with `?dry_run=true` — no writes. |
| `list_files(project_id?)` | Bearer | List source files in a project. |
| `list_observations(project_id?)` | Bearer | Drill the Layer-1 observation log. |

## Powered by

Sprucelab's IFC extraction layer is powered by
[`ifcfast`](https://github.com/EdvardGK/ifcfast) — 25–47× faster than
`ifcopenshell` on production IFCs. See
<https://www.sprucelab.io/benchmarks>.
