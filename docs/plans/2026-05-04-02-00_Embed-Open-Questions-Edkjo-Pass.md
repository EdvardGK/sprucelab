# Edkjo pass — Forward-Deployed-Embed open questions

**Track:** 2026-Q2 mission (responds to `2026-05-03-21-15_Forward-Deployed-Embed.md` §Open questions)
**Status:** First pass for omarchy review. Treat as input, not commitments.
**Authors:** edkjo session — skiplum-pages context to hand

---

## Method

Took the 10 open questions in order. For each: position, justification grounded
in skiplum-pages where relevant, and any required follow-up. Where I'm
guessing rather than informed by skiplum context, I say so explicitly.

skiplum-pages source-of-truth on edkjo: `c:\workspace\skiplum\skiplum-reports`
(GitHub Pages output) + `c:\workspace\toolkit\skiplum-automation\scripts\python\acc\templates\`
(the Jinja layer that produces it). Reviewed both for this pass.

---

## 1. Skiplum-pages layout primitives — contribute back, or stay external?

**Position: contribute back, as `frontend/src/components/dashboard-primitives/`.**

skiplum-pages is the only place in the fleet where dashboard layout has been iterated
on against real client deliverables, so the visual idioms are battle-tested. What
generalizes cleanly:

- **Sidebar section grammar** — `_sidebar.html.j2` already groups nav by `Bygg`,
  `Filer`, `Verifikasjon`, `Data`. The grouping pattern (label → indented nav-items
  with active state + count) generalizes to `Firma → Prosjekt → Omfang → Data` from
  the wireframes. Lift as `Sidebar.NavSection` + `Sidebar.NavItem`.
- **Traffic-light grammar** — `_base.html.j2` defines `--tl-{green,yellow,red}-{bg,text}`
  CSS vars plus the `.bar-fill` percentage-bar. Same idiom should drive every
  `MetricCard` + `CoverageBar` tile. Already CSS-only; lift verbatim.
- **Discipline color tokens** — `apps/core/disciplines.py` enumerates
  ARK/RIB/RIE/RIV/BIMK/etc. on the backend; skiplum-pages has matching CSS-var
  colors. Centralize as `frontend/src/lib/discipline-tokens.ts` consumed by both
  the existing `Sidebar.tsx` and any new `DisciplineRow` tile.
- **Coverage-bar pattern** — the `NS3451 ▰▰▰▰▰▰▰▱▱ 78 %  234 / 892` row is one
  visual atom that recurs across project dashboard, type browser, scope dashboard.
  Lift as `CoverageBar` (props: label, percent, count, total, color-by-percent).
- **Card primitives** — Skiplum's `.project-card` (KPI grid, status pill, fag-row,
  click-through) generalizes to a `MetricCard` that any tile builds on.

What does **not** lift:

- The Jinja templates themselves. skiplum-pages renders to static HTML; sprucelab
  composes React tiles. Templates inform the visual language but aren't a
  component contract.
- Skiplum-specific data assumptions (`type_coverage` config shape, `dalux-ifc-copy.json`
  project list). Those are inputs, not primitives.

Consequence for PR 2 (`DashboardFilterProvider + filter context types`): the
provider lands without UI changes per the plan, but PR 2 should ALSO scaffold
the `dashboard-primitives/` directory empty with one example component
(`MetricCard`) so PR 6's `TypeBrowser` tile has a place to import from. Avoids
a directory-shape negotiation in a later PR.

---

## 2. Truncation threshold for the resolver — is 5000 right?

**Position: 5000 is probably high. Default to 2500, configurable per-project.**

skiplum-pages observation: G55_ARK_main has 2421 elements; the federated viewer
with 4 such models (~10k aggregate) starts feeling sluggish on isolation toggles
on a mid-range Mac. 5000 simultaneously highlighted instances would likely tank
frame rate on anything but a workstation.

Worst case for Skiplum: Landbrukskvartalet has 51 models split across 7 buildings.
A query like "show all walls in Bygg ABD" could realistically cross 5000 instances.

Suggested smoke test (lives at `tests/perf/test_resolver_truncation.py` — new file,
runs locally only, not CI):

- Fixture: 4 models, ~10k aggregate elements (use the existing test models)
- Measurements at N ∈ {100, 500, 1000, 2500, 5000}:
  - Time to isolated render
  - Sustained frame rate (5-second average, mouse orbit)
  - GPU memory delta
- Acceptance: 95th-percentile machine (assume M-series MacBook Air) holds 30 fps.

Ship the threshold as `EMBED_RESOLVER_TRUNCATION_DEFAULT = 2500` in settings,
override per-project via `ProjectConfig.config.embed.resolver_truncation`.
Truncation rule remains: above the threshold, return `truncated: true` and fall
back to highlight-by-type instead of per-instance isolation.

Run this experiment before PR 7a so the constant is real, not guessed.

---

## 3. Token issuance UX — admin UI vs. CLI?

**Position: CLI-only for v1, plus default Django admin registration.**

For Skiplum's actual workflow (3 client companies, ~8 projects, tokens issued
infrequently by technical staff), self-service issuance UX isn't worth the
build cost. The existing CLI shape (`spruce` subcommands + `httpx` to the
Django backend) extends naturally:

```
spruce embed pass create \
  --project g55 \
  --origin https://site.skiplum.no \
  --ttl 720h \
  --capabilities read:dashboards,read:types,read:instances
spruce embed pass list [--project g55]
spruce embed pass revoke <token-id>
spruce embed pass refresh <token-id>          # rotate without reissuing
```

`EmbedPass` registered in Django admin gives free list/revoke UI for back-office
review. Audit log fields (`created_by`, `created_at`, `revoked_at`,
`last_seen_at`) on the model.

Defer dedicated admin UI until external customers need to issue their own
tokens to vendors — a v2 concern.

---

## 4. Filter context schema versioning — bump or extend?

**Position: extend openly with backwards-compatible additions; bump only on breaking changes.**

Rules:

- **Additive change** (new optional filter dimension, e.g. `epd_class?: string[]`)
  → no version bump.
- **Renaming a key** → version bump.
- **Type narrowing** (e.g. `mmi: number[]` → `mmi: { min: number, max: number }`)
  → version bump.
- **`mode`, `selected_express_id`, `project_id`** → protocol invariants. Never
  rename without a major bump.

Implementation:

- postMessage envelope carries `protocol_version: 1`. Embed advertises supported
  versions in the `ready` handshake; host shim uses the highest one both sides
  speak.
- Embed page reads version on handshake. If the host shim sends a `set_filter`
  for a known-old version that uses a renamed key, embed translates if possible,
  silently drops if not.
- New keys default to absent (=== unset === no constraint). Old hosts continue
  working; new hosts get the new dimension.

URL serialization: stable, alphabetized-key JSON encoding so deeplinks stay
diffable across versions. `JSON.stringify(obj, Object.keys(obj).sort())` style.

**Risk to call out before PR 2 lands**: the `quality.*` namespace introduces a
nested object that future filter dimensions might want too. If we add another
nested namespace later (`audit.*`, `lca.*`), we should define the namespace
shape now so each one looks alike. Pure-flat would be simpler but loses the
clarifying structure. Lean toward keeping nested.

---

## 5. Highlight rendering mode — ghost mesh, transparency, or tinted dim?

**Position: ghost mesh is my prior, but this needs the spike before commit.**

Three.js transparency in batched-Fragments scenes is known-bad: depth-sort
invariants break across draw calls, edges flicker, overlapping translucent meshes
moiré. The F-3 worklog had `OBC.Hider` doing hide/show with `set(true, …)` —
that's the well-trodden path; transparency would force changes in the
ThatOpen pipeline that the F-3 work explicitly avoided.

Suggested spike (`feat/highlight-mode-spike`, one day):

- 3 models, ~6000 aggregate elements
- Mode A: **ghost via duplicated material** — clone the existing material with
  `opacity: 0.15`, swap on non-selected. Selected keep original. Trade-off:
  doubles material count.
- Mode B: **transparency on existing material** — set `transparent: true,
  opacity: 0.15` directly. Cheapest, but expected artifacts.
- Mode C: **tinted dim** — replace non-selected material color with a tinted
  toward-grey version, no transparency. Visual-clarity-wise the worst, but
  zero pipeline changes.
- Mode D: **outline-only on selected** — selected get an additive outline pass;
  non-selected unchanged (no dim). Used by Solibri. Visually busy but stable.

Compare on: visual clarity, frame rate (sustained 60fps target), flicker on
overlapping geometry, behavior on opening doors / nested elements.

skiplum-pages has no equivalent UX (it's static HTML), so no prior art to lift.

If the spike says A wins, ship A. If A is too slow on real-world models, fall
back to D (outline-only) — less PowerBI-like but stable. C is the floor.

---

## 6. Embed dev-loop — local skiplum-pages clone to iframe against?

**Position: yes, already doable on edkjo with no new infra.**

skiplum-pages is cloned at `c:\workspace\skiplum\skiplum-reports` (per the
edkjo workspace layout). Simplest dev-loop:

1. Add `dev/embed-host.html` to skiplum-reports (one-line change, committed):
   ```html
   <!DOCTYPE html><html><body>
   <iframe id="e" src="http://localhost:5173/embed/dashboards/test?token=dev"
     style="width:100%;height:80vh;border:0"></iframe>
   <script>
   const f = document.getElementById('e');
   window.addEventListener('message', e => {
     if (e.source !== f.contentWindow) return;
     console.log('embed →', e.data);
   });
   // host shim button: setFilter to IfcWall
   document.body.addEventListener('keydown', ev => {
     if (ev.key === 'w') f.contentWindow.postMessage(
       {type: 'set_filter', payload: {ifc_class: ['IfcWall']}, protocol_version: 1},
       'http://localhost:5173');
   });
   </script>
   </body></html>
   ```
2. Serve it: `python -m http.server 8765 --directory dev/` (already a known
   idiom in this fleet — used it earlier this week for the staticrypt smoke).
3. Run sprucelab's Vite dev server on `:5173` per usual.

This gives the cross-machine dev pattern: omarchy iframes Vercel previews of the
sprucelab branch (`https://sprucelab-git-feat-...vercel.app/embed/...`); edkjo
iframes either Vercel previews or `localhost:5173`. No second compose service.

For PR 4's test plan: the embed page handshake test runs against the local
host page; CI test runs the Vite build with a synthetic mock host (jsdom +
manual postMessage emit).

The `dev/embed-host.html` lives in skiplum-reports, not sprucelab, because
skiplum-reports IS the canonical first consumer per omarchy's own framing.
Adding it elsewhere would be wrong placement.

---

## 7. Mobile / responsive — design accommodation now?

**Position: design for it now, ship for it later.**

Three concrete decisions in PR 2 that either let us ship mobile later or block us:

1. **Tile widths are flex/grid-driven**, not pixel-fixed. CSS Grid with
   `grid-template-columns: repeat(auto-fill, minmax(<min-px>, 1fr))` is the
   right primitive. Tiles declare their `min_width` via CSS custom prop; grid
   collapses below.
2. **Filter-context UI** in the embed needs a chip-collapse pattern. Active
   filters render as removable chips; on narrow widths, "+3 more" chip drawer.
3. **postMessage handshake** carries a `viewport_width` hint from the host
   shim, so the embed can pick a layout (`compact` / `default` / `wide`).

Skiplum-pages observation: real Skiplum clients view dashboards on desktops in
coordination meetings. Mobile is for the "I got an email link, glance at it"
use case — fine if the dashboard works (even degraded), bad if it breaks.

Viewer tile on mobile: degraded mode (Robustness #8). Below ~600px wide, hide
the viewer tile entirely, show "Open in Sprucelab" button + the non-3D tiles.
The `quality.*` filter dimensions and EIR fulfillment surface are still
useful on a phone.

---

## 8. Post-MVP triage

| Item | Priority | Rationale |
|---|---|---|
| Dry-run mutations through the embed | **Defer** | No clear Skiplum workflow needs it pre-MVP. Add when operators are using the embed and the data shape tells us what mutations recur. |
| "Save filter as view" / shareable URLs | **Immediately post-MVP** | High client-conversation ROI — Skiplum staff will absolutely send "look at this view" links. Implementation: server-stored views, content-addressed by filter-context hash, URL carries view ID + fresh token. Small build, big leverage. |
| Multi-project dashboards | **Wait for first ask** | Magna across 3 projects is plausible; designs for it shouldn't drive primitives now. `project_id?: string[]` is a one-line filter-context extension when needed. |
| Custom-tile DSL | **Hard no for v1+v2** | Tiles as React components is correct. A DSL would freeze the tile-render shape before we know what tiles operators actually want. |

The "save filter as view" item deserves to graduate from "post-MVP" to "first
PR after MVP" — it's the difference between a nice dashboard and one that gets
embedded everywhere.

---

## 9. Quality dimension storage — extend `ExtractionRun.processing_log` or add `ModelQualityIssue`?

**Position: new `ModelQualityIssue` table.**

Reasons:

1. **Queryability**: filtering by `quality.untyped + ifc_class + floor_code`
   requires JOINs that are awkward against a JSONField log stream. Real columns
   with indexes are normal Django ORM work.
2. **Cardinality**: a 10k-element model with quality issues at 5–15% rate
   yields ~500–1500 rows. Manageable. Skiplum's largest project
   (Landbrukskvartalet, 51 models) tops out around ~50k issue rows total —
   bounded.
3. **Inspectability**: Django admin gives you list/filter/search per model
   for free. Useful for triage when onboarding a project.
4. The `processing_log` stays as the parser's narrative log (what happened
   during extraction); `ModelQualityIssue` is the structured derivative for
   querying.

Migration sketch:

```python
class ModelQualityIssue(models.Model):
    id = UUIDField(primary_key=True, default=uuid.uuid4)

    # FKs (project denormalized for fast multi-tenant filter)
    project = ForeignKey(Project, on_delete=CASCADE, related_name="quality_issues")
    model = ForeignKey(Model, on_delete=CASCADE, related_name="quality_issues")
    extraction_run = ForeignKey(ExtractionRun, null=True, blank=True, on_delete=SET_NULL)

    # The element
    ifc_class = CharField(max_length=64, db_index=True)
    express_id = IntegerField()
    ifc_guid = CharField(max_length=22, db_index=True)

    # The issue
    issue_type = CharField(max_length=32, choices=[
        ("untyped", "Untyped"),
        ("orphan", "Orphan geometry"),
        ("empty_container", "Empty container"),
        ("missing_relations", "Missing relations"),
        ("missing_pset", "Missing pset"),
        ("missing_material", "Missing material"),
        ("invalid_geometry", "Invalid geometry"),
    ])
    severity = CharField(max_length=16, choices=[
        ("info", "Info"), ("warning", "Warning"), ("error", "Error"),
    ])

    # Issue-specific extras (e.g. missing pset name, relationship name)
    details = JSONField(default=dict, blank=True)

    detected_at = DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "model_quality_issues"
        indexes = [
            Index(fields=["project", "issue_type"]),
            Index(fields=["model", "ifc_class"]),
            Index(fields=["model", "express_id"]),  # viewer isolation lookups
        ]
```

The detection logic lives where the existing extraction passes do (entities
service layer); each pass writes ModelQualityIssue rows as it identifies
issues. ProjectConfig rules drive the `missing_pset` and (later)
`missing_material` detections — already wired via F-2/F-3 phase gates.

---

## 10. Quality detection coverage at MVP

**Position: ship 4 issue types at MVP (PR 7a). Defer 3.**

| Issue type | Ship at MVP? | Reason |
|---|---|---|
| `untyped` | **Yes** | Trivial: walk inverse `IsTypedBy` / `IsDefinedBy[ObjectTypeOf]`. Already inferred during type extraction; just write to ModelQualityIssue. |
| `orphan` | **Yes** | Existing `SpatialHierarchy` extraction already detects elements outside `IfcRelContainedInSpatialStructure`. Just write rows. |
| `empty_container` | **Yes** | Walk `IfcSpatialStructureElement` instances, count contents. One pass per model. |
| `missing_pset` | **Yes** | Already wired via F-2/F-3 phase gates. ProjectConfig.config.bep.required_psets[ifc_type] drives detection. Reuses logic that exists. |
| `invalid_geometry` | **Defer** | Needs FastAPI ifc-service to surface tessellation errors structurally. Current parser may already log them but doesn't expose them as structured output. Add when parser instrumentation catches up. |
| `missing_relations` (other than orphan) | **Defer** | Too broad without project-specific rules. Comes when the EIR domain model has acceptance criteria that name specific relationships (e.g. "every wall must have an `IfcRelDefinesByProperties` linking to Pset_WallCommon"). |
| `missing_material` | **Defer** | Requires per-project "material is expected" rule. Useful, but cleaner once BEP rules are richer. |

Audit before PR 7a:
- Does the FastAPI ifc-service currently emit tessellation errors anywhere? If
  yes, `invalid_geometry` becomes ship-at-MVP. If no, defer.
- Does the existing `requirements.py` in skiplum-automation have rule patterns
  worth porting? Yes — the 10 checks (schema, authoring, units_mm, coord_crs,
  storeys, spatial_containment, typed_products, orphan_types, proxy_types,
  guid_unique). `orphan_types` and `typed_products` map directly to `untyped`
  and `orphan`. Other checks are project-config-shaped (units, schema) — those
  go on ProjectConfig, not ModelQualityIssue.

The 4-type MVP set covers ~80% of what Skiplum's static dashboards already
surface today, so parity for the first downstream consumer is realistic.

---

## Summary of asks back to omarchy

Where I'd value confirmation before PRs 2+ commit:

1. **Q1**: Is `frontend/src/components/dashboard-primitives/` the right home for the lifted Skiplum primitives? Or do they live somewhere existing (`components/ui/`?).
2. **Q3**: OK with CLI-only token issuance for v1? Naming convention for the subcommands?
3. **Q5**: Want me to run the highlight-mode spike on edkjo, or is omarchy better-placed since the viewer pipeline lives there?
4. **Q9**: Migration naming + app placement for `ModelQualityIssue` — does it live in `apps/entities/` (where IFCEntity is) or a new `apps/quality/`?

The other questions (2, 4, 6, 7, 8, 10) the answers above should be enough to
unblock PR 2. None of them need confirmation before code starts.

---

## Out-of-band: how this maps to v0.2 wireframes

This response feeds into a wireframes v0.2 rewrite (also pushed to this branch).
Key wireframe changes driven by omarchy's plan:

- Drop "page per data type" (Models / Types / Materials / Floors as separate routes)
- Add "dashboard surface" — single cross-filtering page composed of tiles
- Add ViewerTile placement showing it cross-filters with chart tiles
- Replace "BIM-krav block" with Requirements Fulfillment tiles (per-EIR, with
  quality tiles nested inside the requirements they violate)
- Add filter-context chip strip (active filters as removable chips)
- Add highlight-vs-filter mode toggle to the dashboard header

Wireframes v0.2 lives in the same branch. Review the two together.
