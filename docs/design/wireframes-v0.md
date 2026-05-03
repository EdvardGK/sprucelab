# Wireframes — Sprucelab/Skiplum gated dashboards

Goal: settle on layout + hierarchy before code. ASCII wireframes are intentional — fast to mark up.

> **Status**: v0 draft. Iterate inline.

---

## 1. Hierarchy

```
Company   →   Project        →   Scope                →   Data
─────────     ──────────────     ──────────────────       ────────────────
Magna         Grønland 55        "Yttervegger og           Models
                                  fasade"                  Types
              Henrik Ibsens 90    "Bygningsstruktur"       Materials
                                                           Requirements
              Palehaven           "Fellesarealer"          (within scope)
              ...                 (or no scopes →
                                   project = scope)
```

- **Company** = the customer entity (Magna, Vedal, Fokus Rådgivning, Skiplum-internal)
- **Project** = a single building/site (Grønland 55, Kistefos, …)
- **Scope** = a curated subset of a project's models + types — defined in `ProjectConfig.config.scopes`. Optional: a project with no scopes shows Data tabs directly under the project.
- **Data** = the existing rendering targets: Models, Types, Materials, Requirements. All filterable by scope when scope is active.

### URL structure

```
/                                                 home (post-auth) — list of companies user can see
/companies/<co>/                                  company landing — list of projects
/companies/<co>/<proj>/                           project dashboard
/companies/<co>/<proj>/scopes/<scope>/            scope dashboard
/companies/<co>/<proj>/scopes/<scope>/types/      types within scope
/companies/<co>/<proj>/scopes/<scope>/materials/  materials within scope
/companies/<co>/<proj>/models/<model>/            model workspace (with inline viewer)
/companies/<co>/<proj>/types/                     all types (no scope filter)
/companies/<co>/<proj>/materials/                 all materials
/companies/<co>/<proj>/requirements/              BIM-krav matrix
```

Auth-adjacent:
```
/login                                            magic-link form
/auth/sent                                        "check your email"
/auth/callback?code=...&next=...                  one-shot exchange, redirects
/403                                              forbidden landing (rare; usually redirect to /)
```

Embed (third parties iframe these):
```
/embed/dashboard/<token>                          chromeless project (or scope) dashboard
/embed/viewer/<token>                             chromeless 3D model viewer
```

### Scope semantics

A scope is a JSON entry in `ProjectConfig.config.scopes`:

```json
{
  "scopes": [
    {
      "id": "exterior",
      "name": "Yttervegger og fasade",
      "description": "Klimaskall og fasade, ekskl. tak",
      "model_ids": ["g55-ark", "g55-ark-eksisterende-mmi750"],
      "type_filter": ["IfcWall", "IfcCurtainWall", "IfcWindow", "IfcDoor"],
      "building_ids": ["A", "B"]
    }
  ]
}
```

When a scope is active, every Data view (types, materials) is filtered to that scope's models + type_filter. Models tab lists only the scope's models. Requirements tab can also scope (if useful).

Projects with no `scopes` array render exactly as today (legacy behavior preserved).

---

## 2. Universal sidebar

Same shell across all gated pages. Sidebar collapses to icons on narrow widths (mobile = bottom drawer).

```
┌─────────────────────────┐
│ ▣ Skiplum               │  ← brand (clickable → /)
├─────────────────────────┤
│                         │
│ FIRMA              ▾    │  ← collapsible; only one company unless user has *
│   Magna                 │     active company has a checkmark/highlight
│   ──────────            │
│ PROSJEKT           ▾    │  ← list of projects user can see in active company
│   Grønland 55  ●        │     ● = currently viewing
│   Henrik Ibsens 90      │
│   Palehaven             │
│ ─────────────────────── │
│ OMFANG  (Scopes)        │  ← only shown when project is selected AND has scopes
│   ▢ Hele prosjektet     │     "All scopes" reset
│   ▣ Yttervegger ●       │     active scope highlighted
│   ▢ Bygningsstruktur    │
│   ▢ Fellesarealer       │
│ ─────────────────────── │
│ DATA                    │  ← scoped to active project + active scope
│   ▣ Dashboard           │
│   📦 Modeller (4)       │     count reflects scope filter
│   📋 Typer (87)         │
│   🧱 Materialer (23)    │
│   ✓  BIM-krav           │
│                         │
├─────────────────────────┤
│ ed.kjorstad@…    ↗ Logg │  ← user, sign-out
│ NO | EN                 │
└─────────────────────────┘
```

Notes:
- Scope section is the new primitive. Above Data, below Project.
- "Hele prosjektet" (All scopes) is the unscoped view; `model_ids = union of all`, `type_filter = none`.
- Scope click updates the URL (`/companies/.../scopes/<id>/...`) and the Data section's link targets.
- Counts (e.g. "Typer (87)") reflect the active scope.
- Company section is collapsed by default for clients (one company); expanded for Skiplum-internal users with `*`.

---

## 3. Auth flow

### 3a. Login

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│                                                          │
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
│         ║  │       Send påloggingslenke    │    ║         │
│         ║  └──────────────────────────────┘    ║         │
│         ║                                       ║         │
│         ║  Mangler tilgang? Kontakt              ║         │
│         ║  post@skiplum.no                       ║         │
│         ╚══════════════════════════════════════╝         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

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

### 3c. Callback (transient — never user-facing for >1s)

Spinner with "Logger inn …" while `/auth/callback` exchanges the code for a session, then redirects to `?next=` or `/`.

### 3d. 403 / no access (rare)

If user is authenticated but their email isn't in `access.json`:

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

## 4. Home (post-auth root `/`)

For a single-company user (e.g. Magna): immediately redirect to `/companies/magna/`. No reason to show this page.

For Skiplum-internal (`*` access) and multi-company users:

```
┌─────────────────────────┬───────────────────────────────────────────┐
│ [SIDEBAR]               │  Dine selskap                              │
│  Skiplum                │  ─────────────────────────────────────────│
│                         │                                            │
│  FIRMA           ▾      │  ┌─────────────────┐  ┌─────────────────┐ │
│   Magna                 │  │ Magna           │  │ Vedal           │ │
│   Vedal                 │  │ 3 prosjekter    │  │ 4 prosjekter    │ │
│   Fokus Rådgivning      │  │ ●●● ●●●         │  │ ●●●●            │ │
│                         │  └─────────────────┘  └─────────────────┘ │
│                         │  ┌─────────────────┐  ┌─────────────────┐ │
│                         │  │ Fokus Rådg.     │  │ Skiplum-intern  │ │
│                         │  │ 1 prosjekt      │  │ 0 prosjekter    │ │
│                         │  │ ●               │  │                 │ │
│                         │  └─────────────────┘  └─────────────────┘ │
│ ed@…  ↗ Logg            │                                            │
└─────────────────────────┴───────────────────────────────────────────┘
```

---

## 5. Company landing (`/companies/<co>/`)

```
┌─────────────────────────┬───────────────────────────────────────────┐
│ [SIDEBAR]               │  Magna                                     │
│  Skiplum                │  3 prosjekter                              │
│                         │  ─────────────────────────────────────────│
│  FIRMA           ▾      │                                            │
│   Magna ●               │  ┌─────────────────────────────────────┐ │
│                         │  │ Grønland 55                          │ │
│  PROSJEKT        ▾      │  │ ARK · RIB · RIE · RIV · BIMK         │ │
│   Grønland 55           │  │ ▰▰▰▰▰▰▰▰▱▱  82 % BIM-krav            │ │
│   Henrik Ibsens 90      │  │ 14 modeller · 87 typer · 23 mat.     │ │
│   Palehaven             │  └─────────────────────────────────────┘ │
│                         │                                            │
│                         │  ┌─────────────────────────────────────┐ │
│                         │  │ Henrik Ibsens gate 90                │ │
│                         │  │ ARK · RIB · RIE · RIV                │ │
│                         │  │ ▰▰▰▰▰▰▱▱▱▱  61 % BIM-krav            │ │
│                         │  │ 6 modeller · 42 typer · 12 mat.      │ │
│                         │  └─────────────────────────────────────┘ │
│ ed@…  ↗ Logg            │                                            │
└─────────────────────────┴───────────────────────────────────────────┘
```

Each project card is clickable → project dashboard. Same KPI grammar Skiplum's current cards use; nothing new on this page.

---

## 6. Project dashboard (`/companies/<co>/<proj>/`)

Default view when a project has scopes: lands on the project overview, scope sidebar shows "Hele prosjektet" active.

```
┌─────────────────────────┬───────────────────────────────────────────┐
│ [SIDEBAR]               │  Magna  ›  Grønland 55                    │
│  Skiplum                │  Prosjektoversikt                          │
│                         │  ─────────────────────────────────────────│
│  Magna                  │                                            │
│  Grønland 55 ●          │  ┌──────────┬──────────┬──────────┬─────┐│
│                         │  │ Modeller │ Typer    │ Mat.     │ MMI ││
│  OMFANG          ▾      │  │  14      │  87      │  23      │ 750 ││
│   ▢ Hele prosjektet ●   │  └──────────┴──────────┴──────────┴─────┘│
│   ▢ Yttervegger          │                                            │
│   ▢ Bygningsstruktur     │  BIM-krav                       82 % ▰▰▰▰▱│
│   ▢ Fellesarealer        │  ──────────────────────────────────────── │
│   ▢ Tekniske fag         │  ✓ Schema       ✓ Authoring     ⚠ CRS    │
│                         │  ✓ Units mm     ✓ Storeys       ✓ Spatial│
│  DATA            ▾      │  ✓ Typed prod.  ✗ Orphan typ.   ⚠ Proxy  │
│   ▣ Dashboard           │  ✓ GUID unique                            │
│   📦 Modeller (14)      │                                            │
│   📋 Typer (87)         │  Modeller          Etter fag              │
│   🧱 Materialer (23)    │  ──────────────                            │
│   ✓ BIM-krav            │  ●●●●●  ARK     ●●  RIB                   │
│                         │  ●●●●  RIE     ●  RIV   ●  BIMK            │
│                         │                                            │
│                         │  Klassifiseringer (NS3451 / TFM / MMI)     │
│                         │  ──────────────────────────────────────── │
│                         │  NS3451  ▰▰▰▰▰▰▰▰▱▱  78 % dekning        │
│                         │  TFM     ▰▰▰▰▰▰▱▱▱▱  62 % dekning        │
│                         │  MMI     ▰▰▰▰▰▰▰▰▰▱  91 % dekning        │
│                         │                                            │
└─────────────────────────┴───────────────────────────────────────────┘
```

Same data shape as today's Skiplum dashboard. The only structural change: scope sidebar above Data.

---

## 7. Scope dashboard (`/companies/<co>/<proj>/scopes/<scope>/`)

When a scope is active, the page is the same shape as the project dashboard, but every count / chart is filtered. Header shows the scope name + breadcrumb.

```
┌─────────────────────────┬───────────────────────────────────────────┐
│ [SIDEBAR]               │  Magna › Grønland 55 › Yttervegger         │
│  Skiplum                │  Omfang: Yttervegger og fasade             │
│                         │  Klimaskall og fasade, ekskl. tak          │
│  Magna                  │  ─────────────────────────────────────────│
│  Grønland 55            │                                            │
│                         │  ┌──────────┬──────────┬──────────┐       │
│  OMFANG          ▾      │  │ Modeller │ Typer    │ Mat.     │       │
│   ▢ Hele prosjektet     │  │  4       │  18      │  9       │       │
│   ▣ Yttervegger ●       │  └──────────┴──────────┴──────────┘       │
│   ▢ Bygningsstruktur     │                                            │
│   ▢ Fellesarealer        │  Modeller i omfang                         │
│   ▢ Tekniske fag         │  ────────────────────                      │
│                         │  ▰  G55_ARK_main.ifc       2 421 elem.     │
│  DATA  (filtrert)  ▾    │  ▰  G55_ARK_eksister.ifc     974 elem.     │
│   ▣ Dashboard           │  ▰  G55_BIMK_fasade.ifc      318 elem.     │
│   📦 Modeller (4)       │  ▰  G55_RIB_main.ifc       1 105 elem.     │
│   📋 Typer (18)         │                                            │
│   🧱 Materialer (9)     │  Typer i omfang (filter aktivt)            │
│                         │  ────────────────────────────────          │
│                         │  IfcWall          892    →                  │
│                         │  IfcCurtainWall   116    →                  │
│                         │  IfcWindow        281    →                  │
│                         │  IfcDoor          148    →                  │
│                         │                                            │
└─────────────────────────┴───────────────────────────────────────────┘
```

Scope context is sticky as the user navigates into Modeller / Typer / Materialer — they stay scoped until they click "Hele prosjektet" or another scope.

---

## 8. Model workspace (`/companies/<co>/<proj>/models/<model>/`)

THE model page. Hosts the inline viewer (loaded via iframe from `app.sprucelab.io/embed/viewer/...` to keep the WASM off the static deploy).

Two layouts depending on viewport. Default desktop layout: viewer right, data left.

```
┌──────────────────┬─────────────────────────────────────────────────┐
│ [SIDEBAR]        │  Magna › Grønland 55 › G55_ARK_main.ifc          │
│  ...             │  ─────────────────────────────────────────────── │
│                  │                                                  │
│  Magna           │  ┌─ Sammendrag ──────┐  ┌──────────────────────┐│
│  Grønland 55     │  │ 2 421 elementer   │  │                      ││
│                  │  │ 87 typer          │  │   [3D VIEWER]        ││
│  OMFANG  ▾       │  │ 23 materialer     │  │                      ││
│  Yttervegger ●   │  │ Schema IFC4       │  │   iframe →           ││
│                  │  │ Revit 2025        │  │   /embed/viewer/<t>  ││
│  DATA  ▾         │  │ NS3451: 81 %      │  │                      ││
│  📦 Modeller (4) │  │ MMI: 91 %         │  │   loads thatopen     ││
│   ▣ G55_ARK_main │  │ TFM: 67 %         │  │   web-ifc lazily     ││
│   ▢ G55_ARK_eks. │  └───────────────────┘  │                      ││
│   ▢ G55_BIMK_fas │                         │   [▣ fit] [✂ section]││
│   ▢ G55_RIB_main │  Typer i denne modellen │   [👁 isolate] [🎨]  ││
│  📋 Typer (18)   │  ─────────────────────  │                      ││
│  🧱 Mater. (9)   │  IfcWall    412   →     │                      ││
│  ✓ BIM-krav      │  IfcSlab    188   →     │                      ││
│                  │  IfcWindow  281   →     └──────────────────────┘│
│                  │  IfcDoor    148   →                              │
│                  │  ...                                             │
│                  │                                                  │
│  ed@…  ↗ Logg    │                                                  │
└──────────────────┴─────────────────────────────────────────────────┘
```

Mobile / narrow: viewer collapses below summary, full width. Stacks vertically.

Viewer interactions are owned by the iframed sprucelab embed: fit, section plane, isolate by GUID/type, color by classification. Static page passes initial state via querystring (`?model_id=…&isolate=<guids>`).

When user clicks a type in the left "Typer i denne modellen" list → `postMessage` to iframe to isolate that type's instances. Viewer responds. URL reflects selection so links are shareable.

---

## 9. Type browser (within scope)

`/companies/<co>/<proj>/scopes/<scope>/types/` (or `/types/` when no scope active)

The "much more sophisticated" view EdvardGK called out. Lifted as-is from current Skiplum templates; scope filter just narrows the rows.

```
┌──────────────────┬─────────────────────────────────────────────────┐
│ [SIDEBAR]        │  Magna › Grønland 55 › Yttervegger › Typer       │
│  ...             │  18 typer i omfang                                │
│                  │  ──────────────────────────────────────────────  │
│  OMFANG  ▾       │                                                  │
│  Yttervegger ●   │  Filter:  [Alle fag ▾]  [Alle disipliner ▾]      │
│                  │           [☐ kun typer med dekning < 80 %]       │
│  DATA  ▾         │                                                  │
│   📋 Typer (18)● │  ┌──────────────────────────────────────────────┐│
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
│                  │                                                  │
│                  │  ┌──────────────────────────────────────────────┐│
│                  │  │ IfcCurtainWall                     (116 inst)││
│                  │  │ ...                                            ││
│                  │  └──────────────────────────────────────────────┘│
│                  │                                                  │
└──────────────────┴─────────────────────────────────────────────────┘
```

Crucially: classifications shown are those configured in `type_coverage` for the project — not hardcoded NS3451. If a project only configures MMI + TFM, only those rows render. This is the flexibility EdvardGK called out (vs. sprucelab's "manual NS3451 mapping" assumption).

---

## 10. Embed: viewer (`/embed/viewer/<token>`)

Chromeless. Iframed by skiplum-reports model pages and by any third-party allowed by token.

```
┌─────────────────────────────────────────────┐
│                                             │
│                                             │
│                [3D VIEWER]                  │
│                                             │
│              full window                    │
│                                             │
│                                             │
│  [⛶] [▣ fit] [✂ section] [👁 isolate] [🎨] │
└─────────────────────────────────────────────┘
```

No sidebar, no breadcrumb. Token determines: model_id, default isolation, color-by, frame-ancestors. Token expires → 410 page with "Lenken er utløpt". Domain check fails → 403 with no body.

---

## 11. Embed: dashboard (`/embed/dashboard/<token>`)

Chromeless project (or scope) dashboard, iframed by external sites that want to surface a single Skiplum project view in their own page.

```
┌─────────────────────────────────────────────┐
│ Grønland 55                                 │  ← minimal header (project name)
│ ─────────────────────────────────────────── │
│                                             │
│ [Same content as §6 Project dashboard,      │
│  but no sidebar, no auth chrome]            │
│                                             │
│ "Powered by Sprucelab" footer (small)       │
└─────────────────────────────────────────────┘
```

Token can scope to: full project, single scope, or single tab (e.g. only Types). Allowed domains in token control where it can be iframed. Frame-ancestors CSP enforced server-side.

---

## Open questions (for iteration)

1. **Scope toggle**: radio (one scope at a time, "All" resets) vs. multi-select (combine scopes). Wireframes show radio. Multi-select is more expressive but UX-heavier.
2. **Where does the company belong in the URL?** Wireframes show `/companies/<co>/<proj>/...` for explicit context. Alternative: keep current `/projects/<proj>/...` and surface company only in breadcrumb/sidebar. Trade-off: URL clarity vs. shorter paths.
3. **Mobile**: sidebar → bottom drawer? Hamburger? Defer to phase B.
4. **Embed dashboard color/branding**: customizable via token (`?theme=skiplum` vs. neutral default)?
5. **Inline viewer in scope page**: also show a viewer at the top of a Scope page, with all scope models loaded? Or keep viewer to the dedicated Model workspace? Wireframes currently keep it on Model only.

---

## Out of scope (this wireframe set)

- Authoring UI for scopes (defining `ProjectConfig.config.scopes` is config work, not UI work yet)
- Notifications / activity feeds
- Comments / collaboration
- Per-element annotation (Speckle has it; we don't yet)
- Dark mode (single light theme matching current Skiplum)
