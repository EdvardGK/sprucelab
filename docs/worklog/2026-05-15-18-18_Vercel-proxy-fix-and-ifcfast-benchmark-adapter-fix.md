# Session: Vercel proxy fix + ifcfast benchmark + adapter fix

## Summary
Two production bugs from the agent-first marketing pivot diagnosed and fixed: (1) `www.sprucelab.io/api/*` was serving the SPA shell instead of proxying to Railway, root-caused to Vercel's `:path*` syntax silently not matching trailing-slash paths PLUS the SPA catch-all polluting Vercel's static-asset cache; (2) the `SPRUCELAB_PARSER=ifcfast` opt-in was a no-op in prod because the adapter targeted a DataFrame-shaped API that ifcfast 0.1.0 doesn't have. Both fixed and verified live. Also produced the first end-to-end benchmark of ifcfast vs ifcopenshell through sprucelab's integration path (3 production IFCs, 4-22× cold parse, 69-377× warm cache), and wrote a gap analysis covering what ifcfast needs to add to make ifcopenshell redundant in sprucelab.

## Changes

**Vercel proxy fix (commits ab176d8, 19dde72)** — `frontend/vercel.json`:
- SPA catch-all `/(.*)` → `/((?!api/|llms\.txt|\.well-known/).*)` (negative-lookahead excludes proxied prefixes so `/api/*` can never resolve to static `/index.html` and pollute the edge cache).
- `/api/:path*` → `/api/(.*)` with `$1` substitution (regex captures trailing slash; `:path*` silently fails to match `/api/foo/`).

**ifcfast adapter rewrite (commit a372d0c)** — `backend/ifc-service/services/ifc_parser_ifcfast.py`:
- Replaced `model.products`/`.iterrows()`/`.get("ifc_class")` (the DataFrame API the adapter assumed) with `model.type_counts` (pre-aggregated dict) for total_elements + top5, and `model.storeys` iterated as `list[StoreyRow]` for the spatial.
- `type_count` and `material_count` zeroed in the ifcfast path — tier-1 doesn't extract IfcTypeObject definitions or unique IfcMaterial entities (its layers have different semantics).
- Docstring updated with the real 0.1.0 contract + measured speedup numbers.

**Memory updates** (`~/.claude/projects/-home-edkjo-workspace-sidehustles-sprucelab/memory/`):
- `deploy-pipeline-gotchas.md` — two new entries: Vercel `:path*` vs `(.*)` trailing-slash trap, and the SPA catch-all static-cache pollution pattern.
- `api-domain-vercel-proxy.md` — updated to reference the negative-lookahead + regex-source fixes by commit.
- `ifcfast-adoption-pattern.md` — adapter bug + fix narrative, measured speedup table, cold vs warm explanation, persistent-cache note.
- `feedback-github-sign-scope-machine.md` — new feedback memory: sign GitHub comments `— sprucelab @ Omarchy` so cross-repo threads (both authored by EdvardGK) stay disambiguatable.

**Bench scripts (not committed; in /tmp)** — `/tmp/sprucelab_bench.py` (integration path), `/tmp/sprucelab_bench_v2.py` (direct ifcfast API, wrong column), `/tmp/sprucelab_bench_v3.py` (direct API, correct). Results in `/tmp/sprucelab_bench_v3_results.json`.

## Technical Details

**Vercel diagnosis** (took several iterations):
- First hypothesis (matched the prior worklog's framing): stale edge cache from before rewrites landed. Disproved when `/api/zzznever-cached-before/` — a brand-new path that couldn't possibly have a cache entry — also returned the 3376-byte SPA shell.
- Real cause split in two: (a) the SPA catch-all `/(.*)` matched `/api/*` paths and Vercel served the static `/index.html` for them. Static-asset responses cache aggressively (`accept-ranges: bytes`, long TTL) and `no-store` response headers can't retroactively evict them — the static-cache layer fires BEFORE rewrites. (b) `/api/:path*` rewrites only matched non-trailing-slash paths; `/api/foo` proxied correctly while `/api/foo/` returned Vercel's own 404. Every endpoint the curl-sticker advertises has a trailing slash (Django APPEND_SLASH canonical form: `/api/capabilities/`, `/api/projects/`, etc.).
- Verification: `curl -i https://www.sprucelab.io/api/capabilities/` now returns 200 JSON, ~3.5 KB, `x-railway-edge` header set, `x-vercel-cache: MISS`. `/llms.txt` and `/.well-known/agent-tools.json` unchanged.

**ifcfast adapter diagnosis**:
- Initial bench (v1, through `IFCParserService.quick_stats()` with `SPRUCELAB_PARSER=ifcfast` set): every run stamped `parser_used=ifcopenshell` with similar wall times to the no-flag run. The dispatcher's `try/except + reset + fallback` path was firing on every call.
- Direct ifcfast probe revealed: `model.products` is `list[ProductRow]` on cold parse, **empty list** on cache hit; the always-populated DataFrame is `model.products_df`. The DataFrame column for the IFC class is `entity`, not `ifc_class`. Both adapter assumptions (`products.get(...)`, `products.iterrows()`, `products.str.endswith(...)`) raised AttributeError.
- Pre-aggregated `model.type_counts` (dict[class_name, count]) gives the same answer as `ifcopenshell.by_type("IfcProduct")` walk WITHOUT touching the DataFrame at all — faster, works on cache hits, no shape-mismatch failure modes.

**Benchmark results** (end-to-end through `quick_stats()`, fixed adapter, 2026-05-15):

| File | MB | ifcopenshell_ms | ifcfast_ms | speedup |
|---|---:|---:|---:|---:|
| Sannergata_RIE.ifc | 40 | 3535 | 49 | 72× |
| 3D modell_HI90.ifc | 39 | 3458 | 50 | 69× |
| Sannergata_bygg_ARK_I.ifc | 380 | 27146 | 72 | 377× |

Cold-parse speedups (separate v3 bench, no ifcfast cache): **4.8× / 3.9× / 21.5×**. The 21.5× on 380 MB matches the prior audit's 21–34× range. Warm numbers reflect ifcfast's persistent per-file index in `~/.cache/ifcfast/`; once any process has parsed a file, subsequent reads in any process drop to 45–72 ms regardless of size.

`Sannergata_RIV.ifc` (128 MB local copy) fails on BOTH parsers with "Unable to parse IFC SPF header" — corrupt/non-standard file, not adapter-related.

**Gap analysis (delivered as inline answer)**:
- For ifcfast to make ifcopenshell redundant in sprucelab: (1) geometry layer with `create_shape`-equivalent + batch iterator — blocking everything in the rendering path, (2) generic entity API with inverse-relationship accessors (`IsTypedBy`, `IsDefinedBy`, `HasAssociations`, etc.) for all the health checkers + validation, (3) IDS execution (either native or making `ifctester` pluggable), (4) `util.placement` equivalents, (5) write/mutation API (`create_entity`, `wrap_value`).
- ThatOpen: don't try to replace it. Push perf + spatial-tree-normalization + Vercel-Yarn1 worker bundling + entity_ifc_type tagging through the existing fragments-v3 pipeline.

## Next
- Optional: re-comment on `EdvardGK/ifcfast#5` with the IFC-class → representation-type mapping for the next coverage wins (drafted to `docs/drafts/` first, signed `— sprucelab @ Omarchy`, then posted with explicit auth).
- Optional: file a fifth ifcfast issue as the parent epic "make ifcopenshell redundant in sprucelab" laddering to #3/#4/#5 and the new geometry/inverse/IDS/placement items.
- Default-flip `SPRUCELAB_PARSER=ifcfast` to production stays queued; need two clean weeks of opt-in data first per the existing rule.

## Notes
- `frontend/dist/` is local from before the marketing pivot and references the dead `api.sprucelab.io`. Vercel builds its own dist, so prod is fine — but a local `yarn build` would help if anyone wants to verify the prod HTML structure offline.
- The other agent (ifcfast side, also authoring as `EdvardGK`) shipped commit `36af047` on ifcfast today: tier-1 dispatch 22-30% faster, spatial-relationship graph (`.contained_in` / `.aggregates`), agent-first surface (`Model.summary()`, `.schemas`, `.by_type()` for ifcopenshell-compat, `.type_summary()` / `.type_bank()`, `Model.diff()`), MCP server with 18 tools, `AGENTS.md`. That partially answers item 2 in the gap list (a `by_type()` shim).
- New convention: GitHub comments authored from sprucelab side sign `— sprucelab @ Omarchy` (memory saved). Commit messages don't need it — `Co-Authored-By` trailer already records the agent.
