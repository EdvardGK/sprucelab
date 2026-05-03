# Wireframes — Sprucelab dashboards subsystem (Skiplum first consumer)

ASCII wireframes for the gated dashboards subsystem proposed in #1. Designed to be marked
up inline — quote-and-replace any block, push edits to this branch, or comment in PR #2.

> **Status**: v0.1 — rewritten after a systematic review of the sprucelab codebase. Earlier
> v0 made incorrect assumptions about scope schema, Company existence, and what was already
> shipped. This draft maps every wireframe to actual files and flags net-new work.

---

## 0. Reality check — what's already shipped vs. what this proposal adds

Reviewed against `main` at `85f9212` (F-3 merged 2026-05-01).

| Concern | Existing in sprucelab | Net-new for this proposal |
|---|---|---|
| **Auth (Supabase magic link)** | ✅ `frontend/src/contexts/AuthContext.tsx`, `pages/Login.tsx`, `pages/AuthCallback.tsx`. Works. | Skiplum-flavor branding on login/sent screens; copy in NB. |
| **Sidebar shell** | ✅ `frontend/src/components/Layout/Sidebar.tsx` (project-context aware, glassmorphic, lucide icons) | Add Firma section above Project; render `ProjectScope` subtree under "Omfang" when project has scopes. |
| **Project dashboard** | ✅ `pages/ProjectDashboard.tsx` with 4 tabs: Overview, Models, **Floors** (F-3), Types/Warehouse | Skiplum-flavor Overview tab (discipline cards, NS3451/TFM/MMI coverage bars, requirements matrix). |
| **Models index + workspace** | ✅ `pages/ProjectModels.tsx`, `pages/ModelWorkspace.tsx`, `UnifiedBIMViewer` with floor_code + alias filtering | No structural changes; existing workspace covers Skiplum's model-page needs. |
| **Type browser** | ✅ `pages/ProjectTypeLibrary.tsx`, `components/features/warehouse/{TypeDashboard,TypeBrowser,TypeMappingWorkspace}` | Bring Skiplum's per-type classification rendering (per-`type_coverage` config, not hardcoded NS3451). |
| **Materials browser** | ✅ `pages/ProjectMaterialLibrary.tsx`, `components/features/{warehouse,materials}/MaterialBrowserView` | Wire `EPDMapping` + `ProductComposition` into existing browser. |
| **ProjectScope tree** | ✅ `apps/projects/models.py:314` `ProjectScope` (parent FK, scope_type, canonical_floors). `useProjectScopes` hook. | Render the tree in the sidebar; allow scope-level drill into Models/Types/Materials. |
| **Federated viewer** | ✅ `pages/FederatedViewer.tsx` consumes `useScopeFloors`; `floorAliases` resolves canonical→names | No changes needed; scope dashboards link into this. |
| **Claim inbox** | ✅ `components/features/claims/{ClaimInbox,ClaimDetail,StoreyListClaimPanel}` | Out of scope here — used by authoring, not by client portal. |
| **Field checklists** | ✅ `pages/ProjectField.tsx` + `apps/field/` | Out of scope. |
| **Company concept** | ❌ Not modeled. UserProfile has `signup_metadata.company` (string in JSON). | **NEW**: `apps/companies/` with `Company` model; `Project` gets nullable `company` FK; existing UserProfile carries optional `Company` FK. |
| **Per-project / per-scope ACL** | ❌ Only global `UserProfile.approval_status`. | **NEW**: `ProjectUser` M2M with role; or `ScopeAccess` for finer granularity. Middleware filters `Project`/`ProjectScope`/`Model` querysets by current user's allowed set. |
| **Embed routes** | ❌ Not present. | **NEW**: `/embed/dashboard/<token>` and `/embed/viewer/<token>` chromeless. HMAC-signed tokens with TTL + per-domain frame-ancestors. |
| **Static HTML export** | ❌ Sprucelab is live-only (SPA). Skiplum has it via `skiplum-automation/scripts/python/acc/html_reports.py`. | **NEW (Track A.5)**: `spruce dashboards build --project <slug> --out <dir>` writes static tree. Backend Django app `apps.dashboards` renders Jinja2 to disk; CLI is the trigger. |
| **GitHub Pages / S3 push** | ❌ | **NEW**: Output adapters in the CLI (`--push-gh-pages`, `--push-s3`). |
| **Skiplum data sources** | ❌ Skiplum's 8 projects live in `dalux-ifc-copy.json` (skiplum-automation). | **ETL**: One-off importer mapping Skiplum projects → sprucelab `Project` rows. |

---

## 1. Hierarchy

The Skiplum framing the user articulated — **Company → Project → Scope → Data** — maps onto
existing sprucelab models with two additions:

```
Company           Project           Scope (tree)               Data
NEW               EXISTS            EXISTS (ProjectScope)      EXISTS + 1 NEW
                                    apps/projects/models.py:314
─────────         ──────────────    ────────────────────       ─────────────────
Magna             Grønland 55       Grønland 55 (root)         Models   ← apps/models
                                                                Types    ← apps/entities
Vedal             Landbrukskvartalet  ├ Bygg ABD (building)    Materials ← apps/entities
                                       ├ Bygg C  (building)    Floors   ← F-3 just shipped
Fokus Rådg.        Henrik Ibsens 90    │  ├ Etg 1 (floor)      BIM-krav (req matrix, NEW)
                                       │  ├ Etg 2 (floor)
Skiplum (intern.)  Kistefos             │  └ Etg 3 (floor)
                                        ├ Bygg E  (building)
                                        ├ Bygg F1 (building)
                                        ├ Bygg F2 (building)
                                        ├ Bygg H5/H7 (building)
                                        └ Felles  (building)
```

- **Company** — new model. `apps/companies/Company`: `id`, `name`, `slug`, `description`. `Project` gets a nullable `company` FK. `UserProfile` gets an optional `company` FK so a magic-link user is auto-scoped to one company unless they're staff.
- **Project** — existing `apps.projects.Project`. No schema changes for the wireframes layer (only `company` FK).
- **Scope** — existing `ProjectScope` tree. Skiplum's per-building dashboards (Landbrukskvartalet's 7 buildings, Kystbyen's 6) become a populated tree of `scope_type='building'` rows under the project root.
- **Data** — Models, Types, Materials, **Floors** (F-3), and a new "BIM-krav" requirements matrix (probably re-using the Claim model with `claim_type='requirement'`).

### URL structure

```
/                                              ProjectsGallery (existing) — filtered by user's company
/companies/<co>/                               NEW — company landing
/projects/<id>/                                EXISTS — ProjectDashboard tabs
/projects/<id>/scopes/<scope-id>/              NEW — scope-level drill (filtered tabs)
/projects/<id>/models/<model-id>/              EXISTS — ModelWorkspace
/projects/<id>/viewer/<group-id>               EXISTS — FederatedViewer
/projects/<id>/types/                          EXISTS — ProjectTypeLibrary
/projects/<id>/material-library                EXISTS — ProjectMaterialLibrary
/projects/<id>/field                           EXISTS — ProjectField (out of scope here)
/embed/dashboard/<token>                       NEW — chromeless project/scope dashboard
/embed/viewer/<token>                          NEW — chromeless viewer
```

The `<co>` segment is only present where company context is meaningful (the company landing).
Project-level URLs stay flat; the company is recovered from `Project.company` and shown in
breadcrumbs/sidebar. This avoids a giant URL refactor and matches the existing route shape.

### Scope semantics

What `ProjectScope` already provides (`apps/projects/models.py:314–410`):
- Tree of `{project, building, wing, floor, zone, custom}` rows
- `canonical_floors` JSON list (populated from `storey_list` claims)
- `storey_merge_tolerance_m` per scope
- Spatial fields (`axis_grid_bounds`, `footprint_polygon`, `storey_elevation_min/max`)
- Endpoint `GET /api/projects/scopes/<id>/floors/` returns canonical + per-model proposed + issues

What "scope" gets used for in the dashboards UI:
- **Navigation**: sidebar tree, scope picker
- **Filtering**: scope-level Models/Types/Materials views (querysets filtered by `Model.scope` ancestry)
- **Federated viewer scoping**: existing pattern, no changes

What scopes do NOT do in this proposal:
- They are NOT used as "type filters" (e.g. "only walls"). That's a separate `view`/`preset` concept and is out of v0.
- They are NOT a free-form curation layer. The taxonomy (project/building/wing/floor/zone/custom) reflects spatial/organizational reality.

---

## 2. Universal sidebar

Existing `Sidebar.tsx` is already 270-ish lines: glassmorphic, lucide icons, project-context
detection, language selector at bottom. Two additions for the dashboards subsystem:

```
┌─────────────────────────┐
│ [SF] Spruce Forge   🏠  │  ← existing brand (Skiplum-flavor: swap brand label/logo when host = site.skiplum.no)
├─────────────────────────┤
│ 🔍  Søk         [+]     │  ← existing search + create
├─────────────────────────┤
│ FIRMA              ▾    │  ← NEW section, only renders when user has a Company FK
│   Magna              ●  │     ● = active company (multi-co users only)
├─────────────────────────┤
│ 👤 Min side             │  ← existing /my-page (only when not in project)
│                         │
│ — or, when in project: —│
│                         │
│ Grønland 55             │  ← existing project label
│                         │
│ ▾ Omfang                │  ← NEW scope tree, expandable
│   ▢ Hele prosjektet     │     "All scopes" reset
│   ▾ Bygg ABD            │     scope_type=building
│   ▾ Bygg C              │
│      ▢ Etg 1            │     scope_type=floor (children)
│      ▢ Etg 2            │
│   ▢ Bygg E              │
│   ▢ Felles              │
│                         │
│ DATA                    │
│ 📊 Dashboard            │  ← existing ProjectDashboard
│ 📦 Modeller             │  ← existing ProjectModels
│ 📋 Typer                │  ← existing ProjectTypeLibrary
│ 🧱 Materialer           │  ← existing ProjectMaterialLibrary
│ 🏢 Etasjer              │  ← F-3 Floors tab (currently nested in Dashboard; promote to top?)
│ ✓  BIM-krav             │  ← NEW requirements matrix tab
│ 📐 Tegninger            │  ← existing ProjectDrawings (Phase 5)
│ 🔍 Workbench            │  ← existing BIMWorkbench (authoring; staff-only)
│ ✅ Felt                 │  ← existing ProjectField (staff-only)
│                         │
├─────────────────────────┤
│ NO | EN                 │  ← existing LanguageSelector
│ user@…    ↗ Logg ut     │  ← existing user dropdown
└─────────────────────────┘
```

Implementation notes:
- Firma section: pulls from new `useCurrentCompany()` hook; collapses for single-company users.
- Omfang section: pulls `useProjectScopes(projectId)` (already exists, F-3) and renders the tree. Active scope from URL `?scope=<id>` or path `/projects/<id>/scopes/<id>/`.
- Workbench / Felt sections hidden for client-tenant users (gated by role on `ProjectUser`).
- The "Skiplum-flavor branding" (label, logo, primary color) is theme-driven; one CSS-vars switch keyed off domain or company.

---

## 3. Auth flow

Existing pages already render this flow (`Login.tsx`, `AuthCallback.tsx`). The wireframes
below are Skiplum-flavor copy adjustments, not new screens.

### 3a. Login (Skiplum-tenant flavor)

```
┌──────────────────────────────────────────────────────────┐
│         ╔══════════════════════════════════════╗         │
│         ║  ▣ Skiplum                            ║         │
│         ║                                       ║         │
│         ║  Logg inn på rapportportalen          ║         │
│         ║                                       ║         │
│         ║  Vi sender en lenke til e-posten      ║         │
│         ║  som er registrert hos Skiplum.       ║         │
│         ║                                       ║         │
│         ║  ┌──────────────────────────────┐    ║         │
│         ║  │ navn@firma.no                │    ║         │
│         ║  └──────────────────────────────┘    ║         │
│         ║                                       ║         │
│         ║  ┌──────────────────────────────┐    ║         │
│         ║  │     Send påloggingslenke      │    ║         │
│         ║  └──────────────────────────────┘    ║         │
│         ║                                       ║         │
│         ║  Mangler tilgang? Kontakt              ║         │
│         ║  post@skiplum.no                       ║         │
│         ╚══════════════════════════════════════╝         │
└──────────────────────────────────────────────────────────┘
```

Existing `Login.tsx` has password+magic-link toggle. Skiplum tenant disables password (passwordless only).

### 3b. Magic-link sent

```
┌──────────────────────────────────────────────────────────┐
│         ╔══════════════════════════════════════╗         │
│         ║  ✉  Sjekk e-posten din                ║         │
│         ║                                       ║         │
│         ║  Vi har sendt en lenke til             ║         │
│         ║  navn@firma.no.                        ║         │
│         ║                                       ║         │
│         ║  Klikk lenken for å logge inn.        ║         │
│         ║  Lenken er gyldig i 60 minutter.       ║         │
│         ║                                       ║         │
│         ║  Ikke fått e-posten? Sjekk søppelpost  ║         │
│         ║  eller ‹send på nytt›.                 ║         │
│         ╚══════════════════════════════════════╝         │
└──────────────────────────────────────────────────────────┘
```

### 3c. Callback (existing — `AuthCallback.tsx`)

Spinner while Supabase exchanges code for session, then redirect. Already works.

### 3d. 403 / no access

Renders when Supabase user is authenticated but has no `Company`/`ProjectUser` rows binding them to anything visible. New page; reuses login-card styling.

```
┌──────────────────────────────────────────────────────────┐
│         ╔══════════════════════════════════════╗         │
│         ║  Ingen tilgang                        ║         │
│         ║                                       ║         │
│         ║  Du er logget inn som                  ║         │
│         ║  navn@firma.no, men har ikke tilgang  ║         │
│         ║  til denne rapporten.                  ║         │
│         ║                                       ║         │
│         ║  Kontakt post@skiplum.no for å få      ║         │
│         ║  tilgang.                              ║         │
│         ║                                       ║         │
│         ║  ‹Logg ut›                             ║         │
│         ╚══════════════════════════════════════╝         │
└──────────────────────────────────────────────────────────┘
```

---

## 4. Home / projects gallery

Existing `pages/ProjectsGallery.tsx`. Tenant filter on top of the existing query: when the
current user has a `company` FK and is not staff, list only `Project.objects.filter(company=user.company)`.

For staff (`*` access via `is_staff` or membership in a Skiplum-internal company): show
projects grouped by company (current grouping or a new card-grid wrapper).

```
┌─────────────────────────┬───────────────────────────────────────────┐
│ [SIDEBAR]               │  Dine prosjekter                           │
│  Spruce Forge           │  ─────────────────────────────────────────│
│                         │                                            │
│  FIRMA           ▾      │  Magna                                     │
│   Magna ●               │  ┌────────────────┐  ┌────────────────┐  │
│                         │  │ Grønland 55    │  │ Henrik Ibsens  │  │
│  Min side               │  │ ▰▰▰▰▰▰▰▰▱▱   │  │ ▰▰▰▰▰▰▱▱▱▱   │  │
│                         │  │ 14 modeller    │  │ 6 modeller     │  │
│                         │  └────────────────┘  └────────────────┘  │
│                         │  ┌────────────────┐                       │
│                         │  │ Palehaven      │                       │
│                         │  │ ▰▰▰▰▰▰▰▱▱▱   │                       │
│                         │  │ 6 modeller     │                       │
│                         │  └────────────────┘                       │
│                         │                                            │
└─────────────────────────┴───────────────────────────────────────────┘
```

Cards are clickable → existing project dashboard route.

---

## 5. Company landing — NEW page

`/companies/<co>/`. Shows the active company plus its full project list — separate from the
projects gallery so company-level metadata (contact, logo, billing) can grow here later.

```
┌─────────────────────────┬───────────────────────────────────────────┐
│ [SIDEBAR]               │  Magna                                     │
│  Spruce Forge           │  3 prosjekter                              │
│                         │  Kontakt: kontakt@magna.no                 │
│  FIRMA           ▾      │  ─────────────────────────────────────────│
│   Magna ●               │                                            │
│                         │  ┌─────────────────────────────────────┐ │
│                         │  │ Grønland 55                          │ │
│                         │  │ ARK · RIB · RIE · RIV · BIMK         │ │
│                         │  │ ▰▰▰▰▰▰▰▰▱▱  82 % BIM-krav            │ │
│                         │  │ 14 modeller · 87 typer · 23 mat.     │ │
│                         │  └─────────────────────────────────────┘ │
│                         │  ┌─────────────────────────────────────┐ │
│                         │  │ Henrik Ibsens gate 90                │ │
│                         │  │ ARK · RIB · RIE · RIV                │ │
│                         │  │ ▰▰▰▰▰▰▱▱▱▱  61 % BIM-krav            │ │
│                         │  └─────────────────────────────────────┘ │
└─────────────────────────┴───────────────────────────────────────────┘
```

Net-new: `apps/companies/views.py CompanyViewSet`, `apps/companies/serializers.py`, frontend
`pages/CompanyLanding.tsx`, hook `use-company.ts`.

---

## 6. Project dashboard

Existing `pages/ProjectDashboard.tsx` has 4 tabs (Overview, Models, Floors, Types/Warehouse).
Skiplum's flavor wants the Overview tab fleshed out and a new BIM-krav tab.

```
┌─────────────────────────┬───────────────────────────────────────────┐
│ [SIDEBAR]               │  Magna  ›  Grønland 55                    │
│  Spruce Forge           │                                            │
│                         │  [Oversikt] [Modeller] [Etasjer] [Typer]  │
│  Magna                  │           [Materialer] [BIM-krav]  ← +new │
│  Grønland 55 ●          │  ─────────────────────────────────────────│
│                         │                                            │
│  ▾ Omfang               │  ┌──────────┬──────────┬──────────┬─────┐│
│   ▢ Hele prosjektet     │  │ Modeller │ Typer    │ Mat.     │ MMI ││
│   ▢ Bygg ABD            │  │  14      │  87      │  23      │ 750 ││
│   ▢ Bygg C              │  └──────────┴──────────┴──────────┴─────┘│
│   ...                   │                                            │
│                         │  Etter fag                                 │
│  📊 Dashboard ●         │  ┌─────┬─────┬─────┬─────┬─────┐         │
│  📦 Modeller            │  │ ARK │ RIB │ RIE │ RIV │ BIMK│         │
│  📋 Typer               │  │  5  │  2  │  4  │  1  │  1  │         │
│  🧱 Materialer          │  │ ●●● │ ●●  │ ●●● │  ●  │  ●  │         │
│  🏢 Etasjer             │  └─────┴─────┴─────┴─────┴─────┘         │
│  ✓  BIM-krav            │                                            │
│                         │  Klassifiseringer                          │
│                         │  ──────────────────                        │
│                         │  NS3451  ▰▰▰▰▰▰▰▰▱▱  78 %  234 / 892     │
│                         │  TFM     ▰▰▰▰▰▰▱▱▱▱  62 %  195 / 892     │
│                         │  MMI     ▰▰▰▰▰▰▰▰▰▱  91 %  811 / 892     │
│                         │                                            │
│                         │  BIM-krav                       82 %      │
│                         │  ──────────────────                        │
│                         │  ✓ Schema       ✓ Authoring     ⚠ CRS    │
│                         │  ✓ Units mm     ✓ Storeys       ✓ Spatial│
│                         │  ✓ Typed prod.  ✗ Orphan typ.   ⚠ Proxy  │
│                         │  ✓ GUID unique                            │
└─────────────────────────┴───────────────────────────────────────────┘
```

What's added on top of existing ProjectDashboard:
- Discipline cards row (`apps/core/disciplines.py` already enumerates ARK/RIB/RIE/RIV/BIMK/etc.)
- Classifications coverage block — driven by `ProjectConfig.config.type_coverage`
- BIM-krav block — surfaces `Claim` records of `claim_type='requirement'` (or similar) with traffic-light status
- New BIM-krav tab — full requirements matrix

What's preserved:
- Floors tab (F-3) stays where it is
- Models, Types tabs — unchanged

Skiplum's existing `requirements_page.html.j2` and `project_dashboard.html.j2` content fields
(model_count, type_count, material_count, NS3451/TFM/MMI percentages, requirements with severity)
all map to existing `/api/projects/<id>/statistics/` (`apps/projects/views.py:135`) — which
already returns most of these numbers.

---

## 7. Scope dashboard — drill-down

`/projects/<id>/scopes/<scope-id>/`. Same shape as the project dashboard, but the queryset is
filtered to the scope subtree. Sidebar shows the scope as active.

```
┌─────────────────────────┬───────────────────────────────────────────┐
│ [SIDEBAR]               │  Magna › Landbrukskvartalet › Bygg ABD     │
│  Spruce Forge           │  ─────────────────────────────────────────│
│                         │                                            │
│  Vedal                  │  [Oversikt] [Modeller] [Etasjer] [Typer]  │
│  Landbrukskvartalet     │  Filter aktivt: Bygg ABD                   │
│                         │                                            │
│  ▾ Omfang               │  ┌──────────┬──────────┬──────────┐       │
│   ▢ Hele prosjektet     │  │ Modeller │ Typer    │ Mat.     │       │
│   ▣ Bygg ABD ●          │  │  6       │  31      │  12      │       │
│   ▢ Bygg C              │  └──────────┴──────────┴──────────┘       │
│                         │                                            │
│  📊 Dashboard           │  Modeller i omfang                         │
│  📦 Modeller (6)        │  ──────────────────                        │
│  📋 Typer (31)          │  LBK_ABD_ARK.ifc           2 421 elem.     │
│  🧱 Mat. (12)           │  LBK_ABD_RIB.ifc           1 105 elem.     │
│  🏢 Etasjer (4)         │  LBK_ABD_RIE.ifc             687 elem.     │
│                         │  ...                                       │
│                         │                                            │
│                         │  Etasjer (canonical_floors)                │
│                         │  ──────────────────                        │
│                         │  -1 K  Kjeller                             │
│                         │   1    1. etg                              │
│                         │   2    2. etg                              │
│                         │   3    3. etg                              │
└─────────────────────────┴───────────────────────────────────────────┘
```

The Etasjer block reuses the F-3 Floors tab content (`useScopeFloors(scopeId)`) — it's
already a per-scope endpoint, so a sub-scope just hits a different ID.

Implementation: a new route `/projects/<id>/scopes/<scope-id>/` that mounts ProjectDashboard
with a scope filter prop. Existing tabs respect the prop and apply ancestry-based filtering
on Models/Types/Materials querysets.

---

## 8. Model workspace (existing — `pages/ModelWorkspace.tsx`)

Already shipped. Inline `UnifiedBIMViewer` + properties panel + filter HUD + section planes.
F-3 wired floor_code + alias support. Skiplum's `model_workspace.html.j2` data fields
(element count, type count, material count, schema, authoring tool, NS3451/MMI/TFM coverage)
map cleanly onto what's already rendered.

```
┌──────────────────┬─────────────────────────────────────────────────┐
│ [SIDEBAR]        │  Magna › Grønland 55 › G55_ARK_main.ifc          │
│                  │  ─────────────────────────────────────────────── │
│                  │                                                  │
│  Magna           │  ┌─ Sammendrag ──────┐  ┌──────────────────────┐│
│  Grønland 55     │  │ 2 421 elementer   │  │                      ││
│                  │  │ 87 typer          │  │   UnifiedBIMViewer   ││
│  Omfang          │  │ 23 materialer     │  │   (existing)         ││
│  Bygg ABD ●      │  │ Schema IFC4       │  │                      ││
│                  │  │ Revit 2025        │  │   ThatOpen Fragments ││
│  📦 Modeller     │  │ NS3451: 81 %      │  │                      ││
│   ▣ G55_ARK_main │  │ MMI: 91 %         │  │  [⛶][▣][✂][👁][🎨]  ││
│   ▢ G55_ARK_eks. │  │ TFM: 67 %         │  │  ↑ Tools (existing)  ││
│   ▢ G55_RIB      │  └───────────────────┘  └──────────────────────┘│
│  📋 Typer        │                                                  │
│  🧱 Materialer   │  Typer i denne modellen                          │
│                  │  ────────────────────                            │
│                  │  IfcWall    412   →                              │
│                  │  IfcSlab    188   →                              │
│                  │  IfcWindow  281   →                              │
└──────────────────┴─────────────────────────────────────────────────┘
```

No structural change. Skiplum-flavor polish at most: reorder summary fields,
swap icons, ensure Norwegian labels.

---

## 9. Type browser

Existing `pages/ProjectTypeLibrary.tsx` + `components/features/warehouse/{TypeDashboard,TypeBrowser,TypeDetailPanel}` already does this. Skiplum's contribution: per-classification coverage rendering driven by `ProjectConfig.config.type_coverage` instead of hardcoded NS3451 — this matches EdvardGK's note that Skiplum's templates aren't locked into manual NS3451 mapping.

```
┌──────────────────┬─────────────────────────────────────────────────┐
│ [SIDEBAR]        │  Magna › Grønland 55 › Bygg ABD › Typer          │
│                  │  31 typer i omfang                                │
│                  │  ──────────────────────────────────────────────  │
│  Omfang          │                                                  │
│  Bygg ABD ●      │  Filter: [Alle disipliner ▾]  [Søk…         ]   │
│                  │           [☐ kun typer med dekning < 80 %]       │
│  📋 Typer ●      │                                                  │
│                  │  ┌──────────────────────────────────────────────┐│
│                  │  │ IfcWall                            (892 inst)││
│                  │  │ ─────────────────────────────────────────────││
│                  │  │ NS3451  ▰▰▰▰▰▰▰▰▱▱   83 %    234 / 892        ││
│                  │  │ TFM     ▰▰▰▰▰▰▱▱▱▱   62 %    195 / 892        ││
│                  │  │ MMI     ▰▰▰▰▰▰▰▰▰▱   91 %    811 / 892        ││
│                  │  │ FireRating         92 %        Pset_WallCom.. ││
│                  │  │ LoadBearing        78 %        Pset_WallCom.. ││
│                  │  │ IsExternal         100 %       Pset_WallCom.. ││
│                  │  │  ›  G55_Prosjektinfo.G55_MMI                  ││
│                  │  │ Modeller med denne typen:                     ││
│                  │  │   G55_ARK_main (412)  G55_BIMK_fasade (118)  ││
│                  │  └──────────────────────────────────────────────┘│
└──────────────────┴─────────────────────────────────────────────────┘
```

Implementation: extend `TypeDetailPanel.tsx` to read coverage rows from a new
`/api/types/{id}/coverage/?scope=<id>` endpoint that walks `ProjectConfig.config.type_coverage`
to discover which property paths to count for. Falls back gracefully if config has no
`type_coverage` key.

---

## 10. Embed: viewer (`/embed/viewer/<token>`) — NEW

Chromeless. Hosted by sprucelab; iframed by anyone with a valid token. Token carries:
model_id, default isolation, color-by, allowed `frame-ancestors`, expiry. Token revocation
via DB flag.

```
┌─────────────────────────────────────────────┐
│                                             │
│                                             │
│            UnifiedBIMViewer                 │
│            (chromeless mount)               │
│                                             │
│                                             │
│  [⛶] [▣ fit] [✂ section] [👁 isolate] [🎨] │
└─────────────────────────────────────────────┘
```

Net-new files:
- `frontend/src/embed/Viewer.tsx` — strips AppLayout; mounts `UnifiedBIMViewer` only
- Backend `apps/embed/` (or `apps/automation/embed/`): `EmbedToken` model + `EmbedViewSet` with `verify_token()` middleware
- Vite route added at `App.tsx`: `/embed/viewer/:token` → `<EmbedViewer />`
- CSP: `Content-Security-Policy: frame-ancestors <allowed_domains>;` set per request

---

## 11. Embed: dashboard (`/embed/dashboard/<token>`) — NEW

Chromeless project (or scope) dashboard, iframed by external sites. Same data shape as §6 but
no sidebar/header. Footer: "Powered by Sprucelab".

```
┌─────────────────────────────────────────────┐
│ Grønland 55                                 │  ← minimal header
│ ─────────────────────────────────────────── │
│                                             │
│ [Same content as §6, sidebar removed]       │
│                                             │
│ Powered by Sprucelab · sprucelab.io         │
└─────────────────────────────────────────────┘
```

Token can scope to: full project, single scope, or single tab. Allowed-domain restriction
via the same token mechanism as §10.

---

## 12. What's net-new (developer punchlist)

Backend:

- [ ] `apps/companies/`: `Company` model, ViewSet, serializer, admin
- [ ] `Project.company` nullable FK; `UserProfile.company` nullable FK
- [ ] `ProjectUser` M2M (or `CompanyUser` rolled up if simpler) for finer-than-company access. Decide A.4.
- [ ] `apps/embed/`: `EmbedToken` model, `EmbedViewSet`, HMAC token utils, frame-ancestors middleware
- [ ] `apps/dashboards/`: Jinja2 renderer that turns existing data into static HTML matching Skiplum templates. Endpoint or management command produces a tarball.
- [ ] Querysets on `Project`, `ProjectScope`, `Model` filtered by current user's allowed set (use DRF permissions or middleware)
- [ ] `/api/types/{id}/coverage/?scope=<id>` endpoint backing the type browser (reads `ProjectConfig.config.type_coverage`)
- [ ] One-off ETL importer: `dalux-ifc-copy.json` → `Project` + `ProjectScope` rows for Skiplum's 8 projects

Frontend:

- [ ] `pages/CompanyLanding.tsx`
- [ ] `pages/embed/Dashboard.tsx`, `pages/embed/Viewer.tsx` (chromeless variants)
- [ ] `Sidebar.tsx`: Firma section + Omfang scope-tree section
- [ ] `ProjectDashboard.tsx` Overview tab: discipline cards, classifications block, BIM-krav block
- [ ] `ProjectDashboard.tsx`: new BIM-krav tab
- [ ] `TypeDetailPanel.tsx`: per-classification coverage rows
- [ ] Skiplum-flavor theme tokens (CSS vars) keyed to host/company
- [ ] Hooks: `use-company.ts`, `use-embed-tokens.ts`

CLI (for static export, Track A.5):

- [ ] `spruce dashboards build --project <slug> --out <dir>` → calls backend endpoint, untars to `--out`
- [ ] `spruce dashboards build --push-gh-pages <repo>` → push to Ed-Skiplum/skiplum-reports
- [ ] `spruce dashboards build --push-s3 <bucket>` (later)

Infra:

- [ ] Vercel custom domain `site.skiplum.no` on the existing sprucelab project
- [ ] Theme switch (CSS vars) keyed off domain
- [ ] Supabase: ensure email templates work in NB; configure custom SMTP if deliverability is a concern
- [ ] Vercel `frame-ancestors` headers for `/embed/...` (per-request, not project-wide)

---

## Open questions (for omarchy)

1. **Scope-tree expansion**: collapse-all-but-active by default, or remember user's expanded set?
2. **Per-scope ACL granularity**: do clients need to be restricted at scope level (Magna sees only Building ABD of Landbrukskvartalet), or is project-level enough? Project-level is simpler; scope-level matches the data model better.
3. **`apps/companies/` vs. extending `apps/accounts/`**: Company could live in accounts since it's a user-org concept, but a separate app keeps it cleaner if companies grow to have billing/contact data later. Your call.
4. **BIM-krav tab vs. Claim Inbox**: are project-side BIM-krav statuses just promoted-Claims of `claim_type='requirement'`, or do they need a dedicated `Requirement` model? I'd reuse Claim if possible (already has status, severity, model linkage).
5. **Embed token lifecycle**: per-issue tokens (each share generates a new one) vs. long-lived per-domain tokens. Speckle does both.
6. **Static HTML export**: does sprucelab grow this even outside Skiplum? If yes, design it as a generic `apps/dashboards/` endpoint. If only Skiplum, keep it local in skiplum-automation and have it call sprucelab APIs.
7. **CLI command name**: `spruce dashboards build` vs. `spruce export dashboard` vs. `spruce static`?

---

## Out of scope (this wireframe set)

- Authoring UI for scopes (already exists for canonical_floors via Claim Inbox; out of dashboards subsystem)
- Notifications / activity feeds
- Comments / collaboration
- Per-element annotation (Speckle has it; sprucelab might add later)
- Dark mode (single light theme to start)
