# Session: Embed PR 3/10 built — `/api/embed/instances` resolver + capabilities

## Summary

Shipped PR 3 of the forward-deployed embed track: a new `apps/embed` Django
app with two read-only endpoints (`/api/embed/instances/` and
`/api/embed/capabilities/`) that turn semantic filter context into the
type-level data the embed viewer and tiles need. Two architectural
discoveries during planning forced the response shape away from the plan as
written; both calls were confirmed with the user before implementation.

## Changes

### New: `backend/apps/embed/`
- `__init__.py`, `apps.py` (`EmbedConfig`), `urls.py`
- `views.py` — `embed_capabilities` + `embed_instances` (function-based DRF views, AllowAny, throttling exempt to match the root capability endpoint)

### Wiring
- `backend/config/settings.py` — added `'apps.embed'` after `'apps.field'`
- `backend/config/urls.py` — `path('api/embed/', include('apps.embed.urls'))`
- `backend/config/views.py` — root `/api/capabilities/` now advertises an `embed` block pointing at the new endpoints

### Tests (16 new, all green)
- `tests/unit/test_embed_resolver.py` — capability envelope + 12 resolver behaviors covering: required `project_id`, unfiltered project listing, unknown project, ifc_class filter, single+csv `type_id`, floor_code via canonical floor + alias, floor_code skipped when unknown, floor_code skipped when no analysis, truncation above threshold, edge case at exactly threshold
- Full unit suite: **210/210 pass** (was 194 before; +16 new = 210, no regressions)

## Technical Details

### Two design pivots from the plan as written

**1. `instance_express_ids` dropped from the response.** The plan called
for `{type_ids, instance_express_ids, count, truncated}`. Investigation
showed `IFCEntity.express_id` is a model field but the modern bulk-create
path (`apps/models/views.py:775`) doesn't populate it — and CLAUDE.md is
explicit that we don't store individual entities. User confirmed:
viewer derives express IDs locally from ThatOpen fragment data using the
returned `type_ids`. Response shape is now `{type_ids, type_count,
instance_count, truncated, threshold_instances, applied_filters,
skipped_filters}`. `applied_filters`/`skipped_filters` is the agent-first
pattern that lets callers detect when a filter wasn't honored.

**2. `floor_code` resolves through the analysis tables, not
IFCEntity.storey_id.** First draft used `IFCEntity.storey_id` + a
non-existent `properties.elevation` field on the storey entity. The
correct path was already in the codebase: `AnalysisStorey.elevation`
(populated by `apps.entities.services.analysis_ingestion`) →
`AnalysisTypeStorey` → `AnalysisType.ifc_type` (FK to `IFCType`). This
makes floor_code "requires-analysis-ingested" rather than
"partial-data-coverage" — a stronger guarantee. Tolerance comes from
`ProjectScope.storey_merge_tolerance_m` (default 0.2m), the same band
canonical-floor promotion uses, so the lookup is symmetric.

### Truncation semantics
Threshold = 2500 instances (per edkjo Q2 in the embed plan). When
`sum(IFCType.instance_count)` over matched types exceeds 2500,
`truncated: true` is returned but `type_ids` is still complete — the
viewer needs the full type list to drive the highlight-by-class fallback
mode. The threshold is a viewer-perf tuning knob; revisit when the
highlight-mode spike numbers land.

### Resolver query is one Django queryset
ifc_class + type_id filter directly on `IFCType` columns. floor_code
prefilters to a list of IFCType UUIDs via the analysis tables, then
re-applies as `qs.filter(id__in=...)` so the final aggregation
(`Sum('instance_count')`) is a single SQL query.

### What I did NOT touch
- No frontend hook (`useEmbedInstances`) — lands in PR 5 with the viewer wiring, per the user's scope answer
- No scoped-token middleware (PR 4)
- No `quality.*` filter dimension (PR 7a)
- No express_id population pipeline rework

## Next

1. **Branch + commit + open PR 6.** Currently uncommitted on
   `feat/embed-filter-context` (PR 2's branch). Branch off as
   `feat/embed-instances-resolver`, commit the 5 changes (3 modifies + 2
   new), push as PR 6.
2. **PR 5 (DashboardFilterProvider) is still open** — unrelated to PR 3
   but should be merged independently before PR 6's review burden stacks.
3. **Embed PR 4** — scoped token middleware + iframe page route
   (`/embed/:dashboard`, postMessage handshake). Different surface
   (auth/middleware), independent of PR 3.
4. **Embed PR 5** — ViewerTile + filter→isolation wiring. First real
   consumer of `/api/embed/instances/`; will exercise the contract
   end-to-end including the highlight-by-class fallback.
5. **Tactical sweep still pending** from the prior worklog: merge PRs
   3/4/5, push the IFC_SERVICE_URL `.env.dev.example` `:8001` → `:8100`
   one-liner, commit the still-untracked May-3 worklog.

## Notes

- `tools/python` is the canonical Python invocation for non-`just`
  contexts (the conda env shim). `just` isn't installed everywhere; use
  `./tools/python -m pytest tests/unit -q` directly.
- The `_open_permissions` autouse fixture in `tests/conftest.py:152`
  turns off all auth + throttling globally for unit tests, so resolver
  endpoints work as `AllowAny` in tests without per-test setup.
- `AnalysisType.ifc_type` is nullable (untyped/proxy/empty groups have
  no `IFCType`). The floor_code resolver filters those out with
  `tid for tid in type_ids if tid is not None`.
- Full plan file kept at `~/.claude/plans/whats-next-deep-mitten.md`.
- Did NOT use `gh pr create` this session — branch needs to be cut and
  commit made first, and that's a "next session decides scope" call.
