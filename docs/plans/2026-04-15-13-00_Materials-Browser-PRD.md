# Materials Browser PRD

**Status:** Draft, v1 in build
**Date:** 2026-04-15
**Owner:** Edvard
**Priority:** MVP — needed for LCA + procurement workflows, blocks ProjectMaterialLibrary page

---

## Vision

A project-level browser that surfaces every material in use, normalized into a navigable taxonomy, with two lenses: **LCA** (embodied carbon, EPDs, sustainability decisions) and **Procurement** (supply chain, cost, lead time). The browser exists to answer "what's in this project and what needs attention" — not to edit composition (that happens in the Type Browser).

**Core thesis:** Types group objects, materials group *everything*. A platform that understands a project only through types is blind to 40% of the decisions that actually matter — carbon, cost, supply chain, substitution.

---

## Product principles

1. **Materials relate to types, they don't belong to them.** Many-to-many. A material lives independently; types reference it.
2. **Quantity is the floor, not the ceiling.** Total kg of concrete is obvious. Hotspots, coverage gaps, change detection, proliferation alerts, and trade-off surfacing are what drive action.
3. **Normalization enables navigation without obscuring detail.** A family tree (L1: Concrete, Steel, Insulation…) is the default view; raw IFC names are always one click away.
4. **One table, two lenses.** LCA and procurement share most columns. A view switcher toggles the diverging columns — no separate pages.
5. **Honest coverage.** Empty columns are the spec, not a failure. "60 of 200 materials missing EPD" is more useful than hiding the gap.
6. **Types-first architecture is preserved.** The browser is a projection over existing `TypeDefinitionLayer → TypeMapping → IFCType` data. No new entity table.

---

## Personas

### LCA team
Needs embodied carbon, environmental impact, decision support *at concept stage*.

| Need | Signal |
|------|--------|
| Project carbon footprint | Σ(qty × GWP factor), with confidence |
| Hotspots | Pareto ranking — 5 materials, 80% of impact |
| EPD coverage | Count with product EPD vs generic vs nominal vs unknown |
| Substitution candidates | "Swap X for Y, save N kgCO₂e" |
| Change since version | What's new/swapped/removed, net carbon delta |
| Reused status | Reused materials carry ~0 carbon, massively swings totals |
| Benchmarking | vs NS3720 reference, vs peer projects |

### Procurement team
Needs to buy the stuff. Fields: manufacturer, product code, supplier, unit price, lead time, total qty in purchase units.

| Need | Signal |
|------|--------|
| Total demand | Qty in purchase units (pcs, m, m², m³) |
| Consolidation leverage | 12 concrete grades where 2 would do → volume discount |
| Supplier risk | Single-source material = supply chain risk |
| Critical path | Lead time > time-to-need → flag |
| Approval status | Product approved by client/arch? |
| Substitutability | Rule-based: structural locked, finish swappable |
| Reused/salvage | Take-back, reuse sourcing |

### Overlap
name, total qty, where used, manufacturer link, reused status, readiness.

### Divergence
LCA: EPD + GWP + confidence. Procurement: supplier + price + lead time + approval.

---

## Normalization taxonomy

**Sprucelab-native L1 families, crosswalked outward to five secondary codes.** Research finding (see `/tmp/materials-taxonomy-research.md` 2026-04-15): no existing standard fits the way designers browse materials. CPV is procurement-oriented, EN 15804/NPCR is EPD-oriented, NS 9431 is waste-stream-oriented, NACE/PRODCOM are supply-side. None of them carve the space the way an architect or engineer thinks about it. KBOB (Swiss) is the closest real-world reference to what we want but isn't a formal standard.

**Decision:** invent the L1 taxonomy. Crosswalk *outward* to the standards that matter for interop.

### L1 families (navigation default, sprucelab-native)

1. **Concrete**
2. **Masonry** (brick, block, stone)
3. **Metal** — with L2 split into Steel / Aluminium / Copper / Zinc
4. **Wood**
5. **Boards** (gypsum, OSB, plywood, particleboard, cement board)
6. **Insulation**
7. **Glass**
8. **Membrane / Waterproofing**
9. **Polymer / Plastic**
10. **Finish** (paint, tile, flooring)
11. **Composite** (windows, doors, curtain walls — assembled products)
12. **Technical** (sealant, adhesive, mortar, grout) — new category from research
13. **Other / Unclassified**

### L2 subtypes (designer-native, not the existing Enova leaves)

The existing `MATERIAL_CATEGORY_CHOICES` leaves (`concrete_cast`, `mineral_wool_inner`, etc.) are too granular in some places and too vague in others. Redefined designer-native L2:

- **Concrete** → In-situ / Precast / Lightweight / Fibre-reinforced / Low-carbon
- **Metal → Steel** → Structural / Rebar / Cold-formed / Stainless
- **Wood** → Solid / Glulam / CLT / LVL / Engineered / Treated
- **Insulation** → Mineral wool / Glass wool / EPS / XPS / PIR / Cellulose / Wood fibre / Aerogel
- **Boards** → Gypsum (standard/wetroom/fire) / OSB / Plywood / Particleboard / Cement board
- **Glass** → Float / Laminated / Insulated unit / Tempered
- **Membrane** → Vapor barrier / Wetroom / Roof / Geotextile

Existing leaves are mapped to new L1/L2 via `LEGACY_LEAF_TO_L2` table. No data migration — just a projection map in Python.

### Crosswalk: standards-agnostic classification

**Design principle:** Sprucelab ships with **Norwegian defaults** (NS 9431, NPCR, NS 3451, CPV, HS) because most of the target users are Norwegian, but the schema and the UI are **standards-agnostic**. Every project can load its own selection of standards (v1.3 feature — see Standards Workspace below). Hardcoding Norwegian into the schema would be an immediate regret the moment we want a Swedish, British, or Dutch project.

**The schema is NOT: one column per standard.** ❌ `ns9431_fraksjon, npcr_code, cpv_code, ns3451_code, hs_chapter` — this is Norwegian-hardcoded and doesn't scale.

**The schema IS: a many-to-many between materials and standards.** ✅

```
Standard:
  id UUID
  identifier: char(50)        # 'ns-9431', 'npcr', 'cpv', 'uniclass-2015', 'omniclass'
  name: char(255)             # 'NS 9431:2011 Classification of waste'
  provider: char(255)         # 'Standard Norge', 'buildingSMART', 'EU Commission'
  version: char(50)           # '2011', '2014/24', '2015', etc.
  language: char(10)          # 'no', 'en', 'sv', etc.
  scope: enum(materials, parts, waste, procurement, lca, verification, custom)
  source_type: enum(bsdd, seeded, custom, imported)
  source_uri: text            # bsDD URI, API endpoint, or null for seeded
  last_synced_at: timestamp

ClassificationCode:
  id UUID
  standard_id FK
  code: char(50)              # '1611', 'NPCR 013', '44111200', 'Pr_20_93_52'
  parent_id FK nullable       # hierarchy
  label: char(255)            # 'Betong', 'Concrete', 'Concrete products'
  description: text nullable
  data: jsonb                 # extra attributes from source (bsDD, etc.)

MaterialClassification:
  id UUID
  material_library_id FK
  classification_code_id FK   # which code in which standard
  confidence: enum(suggested, confirmed, expert_verified)
  confirmed_by FK user nullable
  confirmed_at timestamp nullable
  source: enum(heuristic, bsdd_lookup, user_assigned, imported)

ProjectStandard:
  project_id FK
  standard_id FK
  enabled: bool
  priority: int               # tie-breaker when multiple standards cover same concept
  is_default: bool            # loaded from the Norwegian default set
```

One material can have many classifications across many standards. Adding a new standard is data, not schema. Uniclass 2015, CoClass (Swedish), NL-SfB, OmniClass — all treated uniformly.

### Norwegian default standards (seeded at install)

Every new project gets this loadout by default:

| Standard | Scope | Use |
|---|---|---|
| NS 9431:2011 | waste | Waste reporting to DiBK |
| NPCR (EPD Norge) | lca | EPD linkage, LCA export |
| NS 3451:2009 | parts | Building part classification |
| NS 3457 | materials | Material classification |
| NS 3720 | lca | LCA methodology |
| CPV 2014/24 | procurement | Public procurement (EU alignment) |
| HS / CN | procurement | Imports (optional) |

Loaded as seed data. Not hardcoded in code.

### V1 crosswalk implementation (Norwegian defaults hardcoded)

For v1 ship speed: the classifier writes classifications against the seeded Norwegian standards only. The Standards Workspace (v1.3) is what unlocks per-project selection + bsDD integration + custom standards. But the **schema is standards-agnostic from day one**, so v1.3 is a UI + API build-out, not a data migration.

**Auto-suggestion rules** (v1, Norwegian-only, heuristic):
- L1 family → default NS 9431 fraksjon, NPCR code, CPV code
- Raw IFC name keywords → L1/L2 suggestion
- TypeBank enrichment: classify once, reuse cross-project

### Implementation

- **`backend/apps/entities/services/material_families.py`** — L1 family definitions, L2 subtypes, `LEGACY_LEAF_TO_L2` map for backwards compat with existing `MATERIAL_CATEGORY_CHOICES` data
- **`backend/apps/entities/services/material_classifier.py`** — heuristic classifier: raw IFC name → suggested L1/L2 + NS9431 + NPCR
- **`backend/apps/entities/services/material_crosswalks.py`** — seed data: L1/L2 → default NS9431, NPCR, CPV codes. Loaded from YAML in `backend/data/material-crosswalks.yaml`.
- **`MaterialLibrary`** schema comment fixed: replace "aligned with Enova classification" (misleading — no canonical Enova taxonomy exists, only a GWP reference table) with "sprucelab-native, crosswalked to NS 9431 / NPCR / CPV via MaterialClassification"

### Unclassified materials
Per-model `Material` records without a `material_library` FK get a **suggested L1 family** from the classifier over the raw IFC name (`betong`/`concrete` → Concrete, `stål`/`steel` → Metal → Steel, `gips` → Boards, `stein/rockwool/glava/isover` → Insulation, etc.). Browser shows them under their suggested family with an "unverified" badge. User clicks to confirm — confirmation writes a `MaterialLibrary` link and promotes the row.

### Seed reference data
Download **KBOB Ökobilanzdaten Baubereich** Excel (`.xlsx`) as seed reference for L1/L2 structure. Licence permits reference use. Stash under `backend/data/reference/kbob-baubereich.xlsx`. Not a runtime dependency — just the seed for initial L1/L2 definitions + auto-suggestion dictionaries.

---

## V1 scope — the browser

### Route
`/projects/:id/material-library` (already in `App.tsx`)

### Layout
3 columns, desktop-first, `clamp()` sizing.

- **Left (280px):** Family tree
  - L1 families with count + total instance rollup
  - Expandable to L2 subtypes
  - "Unclassified" bucket pinned at bottom with count
- **Center (1fr):** Material table / Sets table via tab toggle
  - **Materials tab** (default): one row per distinct material (dedupe by name + library link). Columns: name, family, NS3457, total qty, used-in (types), coverage lights.
  - **Sets tab:** one row per distinct layered recipe. Columns: set name (derived), layer count, total thickness, types using.
- **Right (320px):** Detail panel
  - Material name + raw IFC names (the aliases)
  - Suggested family / confirmed family
  - Where used: list of types + models + instance counts
  - LCA readiness box (density, EPD link, GWP — or gap)
  - Procurement readiness box (manufacturer, product code, supplier — or gap)
  - "Open in Type Browser" action for each referenced type

### Header bar
- Coverage summary: `200 materials · 60% classified · 0% EPD-linked · 0% procurement-linked`
- View toggle: **All** / **LCA** / **Procurement** (reorders and filters columns)
- Search
- Family filter (L1)
- Status filter (classified / unclassified / missing-epd / missing-supplier)

### Hotspots panel (collapsed by default)
Pareto chart: top 10 materials by instance count × qty_per_unit. When GWP data lands in v1.1, it becomes top 10 by carbon.

### What ships in v1 with today's schema
- Family tree navigation ✅
- Materials list with dedup + rollup ✅
- Sets list ✅
- Where-used per material ✅
- Classification coverage light ✅
- "LCA ready" light → red for everything (nothing has EPD data yet) ✅
- "Procurement ready" light → red for everything (no supplier/price/lead time yet) ✅
- Proliferation count per family ✅

### What is deliberately deferred
- GWP totals and carbon hotspots — blocked on EPDLibrary/EPDMapping schema
- Supplier, price, lead time — no schema today
- Change-since-version — blocked on version diff engine
- Cross-project material bank — follow-up (MaterialBank equivalent to TypeBank)
- Substitution candidates — follow-up, needs ML/heuristics
- Edit composition — lives in Type Browser, not here

---

## V1.1+ — Early-stage screening LCA

**Separate feature. Builds on the normalization layer.**

The real carbon decisions happen at concept stage, before product-specific EPDs exist. Existing tools (OneClickLCA, Reduzer, EC3) assume late-stage detail. Sprucelab's differentiator: give defensible carbon numbers from day one, and improve them as the design matures.

### Resolution chain (per material)
Priority-ordered lookup:

1. **Product-specific EPD** — manufacturer datasheet linked. Confidence: high. UI: green dot.
2. **Category-specific EPD** — NEPD industry-average for that L2 subtype. Confidence: medium. UI: amber.
3. **Family nominal** — Enova / EN 15804 default factor for the L1 family. Confidence: low. UI: grey.
4. **Unknown** — no data at any level. Excluded from total, counted toward coverage gap. UI: red.

Each material and the project total carry a **confidence badge** showing which level was used.

### Killer view
Header banner on the browser:

> **Project carbon: 1,240 tCO₂e**
> _38% product-specific · 47% category-generic · 15% family-nominal · 0% unknown_
> Target 980 tCO₂e — **26% over** → see hotspots

The confidence breakdown is the differentiator. Competitors give you a number; sprucelab gives you a number you can defend at a design review.

### Schema additions needed
- **EPDLibrary table:** `id, name, source (nepd/oneclick/manual), gwp_a1a3, gwp_a4, gwp_a5, biogenic_c, declared_unit, valid_from, valid_to, product_specific, reference_material_library`
- **EPDMapping table:** `(material_library OR type_definition_layer) → epd_library`, project-scoped so different projects can pick different EPDs for the same material.
- Optional: **NominalFactorLibrary** — one row per family/subtype with a default factor, seeded from Enova reference data. Could also just be special rows in EPDLibrary with `product_specific=False`.

### Out of scope for v1.1
- A4 transport module, A5 install, B replacement, C end-of-life (C2G only first)
- Recycled content %, toxicity, REACH, Red List
- Biogenic carbon storage net calculation (show the number, don't net it)

---

## V1.2+ — Change detection, proliferation, hotspots

Once v1.1 ships GWP, the following become headline features of the browser:

- **Hotspot Pareto** ordered by carbon, not just quantity
- **Proliferation alerts** ("14 mineral wool variants, 3 effective subtypes — standardize?")
- **Change-since-version** diff panel (new materials, swapped, removed, net carbon delta)
- **Peer benchmarking** (requires TypeBank-style cross-project material stats)
- **Substitution suggestions** ("swap Concrete C30 for Concrete C25 where structurally possible: save N tCO₂e")

---

## V1.3 — Standards Workspace (project-configurable standards)

**Problem:** Sprucelab is currently Norwegian-hardcoded. NS 3451, NS 3457, NS 9431, NPCR — these are baked into TypeMapping, the Enova comment, the verification engine. That's fine for the Norwegian market. It's a hard wall the moment a Swedish firm, a British firm, or a Norwegian firm with a Dutch project tries to use the platform.

**Vision:** Every project loads its own standards. Default loadout per country. bsDD integration for on-demand standards import. User-created custom classifications for firm-internal codes. Materials browser, type browser, verification engine, and LCA export all read from the project's selected standards — they don't hardcode anything.

### Where it lives

New page: **Project Config → Standards**. Sits alongside the existing BEP/EIR config and verification rules configuration. URL: `/projects/:id/config/standards`.

This is one of the most foundational project config pages. It gates what classifications, codes, and rules apply everywhere else.

### What it does

- **Browse standards**: list of all available standards (seeded Norwegian defaults + any imported from bsDD + custom)
- **Toggle per project**: which standards are active for this project, with priority ordering
- **bsDD integration**: search and import classifications directly from the buildingSMART Data Dictionary API (`api.bsdd.buildingsmart.org`). Adds the standard as a new row in `Standard` + `ClassificationCode`, refreshable on demand.
- **Custom classifications**: user can create a custom `Standard` (e.g., "Skiplum Internal Part Codes", "Client X Material Spec 2026") and define codes through the UI. Stored in the same schema as imported standards.
- **Import from file**: upload a spreadsheet of codes (CSV/XLSX), map columns, create as a custom standard
- **Priority resolution**: when multiple standards cover the same concept ("is this material a structural element?"), the priority order decides which one is consulted first

### Default loadouts

Per-country seeded templates, loaded when a project is created:

- **Norway (default)**: NS 9431, NPCR, NS 3451, NS 3457, NS 3720, CPV (+ optionally HS/CN)
- **Sweden**: CoClass, BSAB 96, CEEQUAL, ... (via bsDD)
- **UK**: Uniclass 2015, NRM1-3, BREEAM, ... (via bsDD)
- **Netherlands**: NL-SfB, STABU, ... (via bsDD)
- **US**: OmniClass, MasterFormat, LEED, ... (via bsDD)
- **Custom**: empty loadout, user picks everything

Switching country loadout on an existing project requires a confirmation + shows which existing classifications will be unmapped.

### bsDD integration

[buildingSMART Data Dictionary](https://bsdd.buildingsmart.org/) is the international registry of construction classification systems. Offers a public REST API at `api.bsdd.buildingsmart.org` with:

- **Dictionaries** — the standards themselves (Uniclass 2015, OmniClass, NL-SfB, ...)
- **Classes** — the codes within each dictionary
- **Properties** — attributes attached to classes
- **Relations** — mappings between classes across dictionaries

Sprucelab's bsDD client:

- On standard search → call bsDD `/Dictionary` endpoint, filter by country/domain, present results
- On standard import → call bsDD `/Dictionary/{uri}/Classes` (paginated), persist as `ClassificationCode` rows under a new `Standard` with `source_type='bsdd'`
- On refresh → re-fetch changed classes by `modifiedAt` timestamp
- Cache aggressively — bsDD data is slow-moving

Sprucelab doesn't need to replicate the entire bsDD contents — only the standards the user actually imports.

### Custom classifications workflow

1. User creates a new Standard (name, provider, scope: waste/materials/parts/custom, language)
2. Adds codes manually or by CSV upload
3. Optionally defines a hierarchy (parent → child codes)
4. Optionally defines crosswalks to other standards ("this custom code = NS 3451 234")
5. Enables for the project
6. Classifier starts suggesting codes from the custom standard alongside the seeded ones

Custom standards are **org-scoped by default** (shared across all projects in the org) but can be project-scoped for client-specific codes.

### Export to bsDD

If the org wants to publish a custom classification to bsDD for broader use, sprucelab exports it in bsDD import format. One-click publish to bsDD as a new Dictionary (requires bsDD API credentials from the user).

### Cross-cutting impact

The Standards Workspace is not just for the Materials Browser. It feeds:

- **Materials browser** — NS 9431, NPCR, CPV codes become configurable
- **Type browser** — NS 3451 part codes become configurable (supports Uniclass, OmniClass, etc.)
- **Verification engine** — rules can reference "any material classified as Insulation in the project's primary classification standard" without hardcoding NS 3451 codes
- **LCA export** — NPCR codes for Reduzer, but also Uniclass codes for UK equivalents
- **Waste module** — NS 9431 is the default, but a UK project would use the HMRC waste classification or List of Waste (LoW) codes
- **Field/compliance** — checklists can reference the project's active standards

### Schema additions

Already defined above under the standards-agnostic crosswalk schema (`Standard`, `ClassificationCode`, `ProjectStandard`, `MaterialClassification`). V1.3 adds:

- **`StandardImport`** — tracks bsDD sync jobs (status, timestamps, error logs)
- **`CustomStandardBuilder`** — UI state for in-progress custom standards
- **`StandardCrosswalk`** — cross-references between codes in different standards (e.g., NS 3451 234 = Uniclass Pr_20_93_52)

### V1.3 honest ship

- Standards list + toggle per project
- Seeded Norwegian default loadout (no schema refactor — just seed data)
- bsDD search + import (read-only, no publishing)
- Custom standard creation via CSV import
- Retrofit the v1 Materials Browser crosswalks to read from `ProjectStandard` + `MaterialClassification` instead of hardcoded NS codes
- Country loadout templates (Norway + one other — probably UK or Sweden for proof of concept)

### Deferred to v1.4+

- Full bsDD publishing workflow (upload custom standards to bsDD)
- Per-user standard preferences
- Standard version upgrade handling (NS 9431:2011 → NS 9431:2025)
- ML-assisted code suggestion from raw text
- Multi-language UI switching based on project primary standard language

---

## V1.5 — Material Balance Sheet (fungible flows)

**Thesis:** the browser stops being a static library and becomes a balance sheet. For every material, every project — where is it in the supply chain right now?

This is the **fungible** view: quantities, totals, flows. No per-unit identity yet.

### State machine

```
NOT ORDERED  →  ORDERED  →  IN TRANSIT  →  ON SITE  →  INSTALLED
                                                  ↘
                                                   WASTE
```

Each state holds a quantity. The deltas between states are the actionable signal:

| Delta | Meaning | Persona |
|---|---|---|
| `demand − estimated` | Planned waste factor | QS, procurement |
| `estimated − ordered` | Under-ordering risk | Procurement |
| `ordered − delivered` | Outstanding deliveries | Site manager, logistics |
| `delivered − installed` | On-site stock (cash + space tied up) | Site manager, CFO |
| `demand − (installed + waste + stock)` | Reconciliation gap → missing materials? | Everyone |

### Schema additions

- **`MaterialDemand`** — per (project, material_key), required quantity derived from types. Auto-computed from IFC — no manual entry.
- **`MaterialTransaction`** — immutable event log: `(project, material_key, state_from, state_to, quantity, unit, timestamp, actor, reference_doc)`. Current state = fold over transactions.
- **`MaterialStockLocation`** — optional: where the material is physically sitting (supplier, warehouse, container, site zone).
- **`SupplierOrder`** — optional lightweight PO reference (vendor, order number, expected delivery).

**Why an event log, not a state column:** history is load-bearing. Site audits, insurance claims, and waste reconciliation all require provenance. Current state is derivable; event truth is not.

### Browser UI additions

- New **Balance** column on the Materials tab: mini stacked bar showing `ordered | in-transit | on-site | installed | waste` against demand
- **Status traffic light** per row: on-track / behind / over-ordered / missing
- New **Balance Sheet tab** (next to Materials / Sets): full table view — one row per material, quantities in each state, deltas, variance from plan
- **Site view filter**: materials delivered but not installed → daily site manager report

### V1.5 honest ship

Not the whole state machine at once. V1.5 ships:
- `MaterialDemand` (auto-computed) + `MaterialTransaction` schema
- Manual entry UI for `delivered` and `installed` events
- Balance column + Balance Sheet tab
- Reconciliation view showing gaps

Ordered/in-transit split-out + integrations come in v1.6/v2.

### Inputs — where does the data come from?

- **Demand**: already in the model (types × instance_count × layer recipes). Auto.
- **Ordered / delivered**: manual at first. CSV import in v1.6. Direct procurement integration (ACC, Cobuilder, WebBBM, SG Armaturen) in v2.
- **Installed**: ties into the **Field module** — checklist completion updates installed quantity. Spec'd in wireframe 07. Needs verification that the Field schema can feed here.
- **Waste**: weekly site log entries (v2 waste subsystem).

---

## V2 — Waste Management (the fungible end-state)

### Planned waste factors

Every material carries an industry-standard waste factor that gets applied during procurement. Defaults per L1/L2 family (Norwegian construction averages):

| Material family | Typical waste factor |
|---|---|
| Concrete (cast-in-place) | 3–5% |
| Concrete (precast) | 1–2% |
| Rebar | 5–10% |
| Structural steel | 2–5% |
| Structural timber | 10–15% |
| Gypsum board | 10–15% |
| Ceramic tile | 10–20% |
| Paint | 5–10% |
| Insulation (mineral wool) | 5–10% |
| Membrane | 10–15% |
| Cut-to-size wood finishes | 15–20% |

These are **defaults per family**, overridable per project or per material. Flow: `estimated = demand × (1 + waste_factor)`.

### Actual waste tracking (NS 9431 anchored)

Norwegian regulation (`avfallsforskriften`) requires projects >300 m² to file a waste management plan (`avfallsplan`) and report actual waste against NS 9431 fraksjoner. This is non-negotiable — projects lose their `ferdigattest` (certificate of completion) if they can't file the `sluttrapport med avfallsplan`.

**Every material in the browser already carries an NS 9431 code** (from the crosswalk table). Waste entries auto-route to the correct fraksjon based on the material.

Data sources for actual waste:
- Weekly waste bin logs (weight per NS 9431 category, per container)
- Waybills (waybill reconciliation from waste handler — Ragn-Sells, Norsk Gjenvinning, Retura)
- Site manager manual entry
- Photos + notes (v2.5+)

### Schema additions

- **`WasteFactor`** — default factor per L1/L2 family, overridable per project
- **`WasteEvent`** — `(project, ns9431_fraksjon, quantity_kg, timestamp, handler, waybill_ref, material_origin)`. Links back to the source material when known.

### Waste dashboard

A dedicated **Waste tab** on the browser (plus a waste dashboard on the project page) showing:

- **Planned waste total**: Σ across materials of `demand × waste_factor`, in kg and CO₂e
- **Actual waste total**: Σ of reported `WasteEvent`s
- **Variance**: actual vs plan, per NS 9431 category
- **Source-sorting rate**: % of waste routed to specific fraksjoner vs residual (1299 restavfall). Norwegian KPI, mandatory reporting.
- **Carbon from waste**: EN 15804 A5 module — embodied carbon being thrown away. Feeds the LCA total.
- **Cost of waste**: wasted material cost + disposal fees
- **NS 9431 export**: generates DiBK `sluttrapport med avfallsplan` PDF/XML (v2.5)

### Cross-connects

- Waste variance feeds **procurement learning** — "we over-ordered gypsum by 8% for three projects, reduce the factor"
- Waste carbon feeds the **LCA total** (A5 module becomes real numbers, not assumed factors)
- Waste events can trigger **passport lookups** — when reusable material is waste-flagged, offer "send to material bank instead"

---

## V2.5 — Material Passports (fungible → non-fungible)

**The conceptual shift:** materials begin life as fungible quantities ("200 m³ concrete") and become non-fungible assets the moment they're installed ("batch B-2026-04-15-001 poured into foundation F.A.01 on 2026-04-16 by crew Z"). The passport is what captures the transition.

Before installation: a material is a number. Interchangeable. Flows through the Balance Sheet.
After installation: a material is a thing. Unique. Has history, location, condition, reusability class.

This distinction matters because circular economy — and increasingly EU regulation — can only reuse what can be identified. A random chunk from a demolition pile is fungible waste worth nothing. A documented structural element with known provenance is a non-fungible asset worth sourcing.

### The passport

A `MaterialPassport` is a non-fungible record attached to a specific installed quantity. Each passport tracks:

- **Identity**: passport ID, batch reference, origin (virgin / reclaimed / recycled)
- **Composition**: material L1/L2, NPCR code, grade, spec
- **Provenance chain**: supplier → delivery batch → installation event → location in building
- **Location in building**: which type, which model element, which storey, which grid position (`IfcBuildingStorey` + local placement)
- **Condition at install**: photos, inspection report, structural load history (for structural members)
- **Reusability class**: can it be deconstructed? Under what conditions? Certified to what standard?
- **End-of-life plan**: documented intent — reuse / recycle / downcycle / landfill
- **Chain of custody**: every state transition event log (reuses `MaterialTransaction` from Balance Sheet)

### Schema additions

- **`MaterialPassport`** — non-fungible record; one per installed batch/unit
- **`MaterialInstance`** — optional: each physical element with a unique identity (for steel beams, windows, doors — anything discretely countable and tracked individually)
- **`PassportEvent`** — chain-of-custody events (check-in, check-out, inspection, condition update, reuse certification). Same event log as `MaterialTransaction` but with passport FK.
- **`ReusabilityAssessment`** — structured inspection record against a reusability standard

### Check-in / check-out workflow

The user's framing — "checking materials in/out of sites and buildings and whatever stage they're in" — is the passport event model:

| Event | Meaning | Trigger |
|---|---|---|
| **Check in to site** | Material delivered to site, verified against PO | Site receiving |
| **Check in to building** | Material installed in a specific location | Field module install completion |
| **Condition update** | Inspection during service life | O&M inspection, scheduled or ad-hoc |
| **Check out of building** | Material removed during renovation/demolition | Demolition log |
| **Check out of site** | Material leaves site (reuse bank, recycling, landfill) | Disposal / transfer log |
| **Check in to another site** | Material reused in a new project | Receiving at new project |

Each event creates an immutable log entry. The current state of a passport is the fold over its events.

### Browser UI additions

- **Fungible view** (default, from v1) shows materials as aggregated quantities
- **Non-fungible view** (new in v2.5) shows materials as a list of passports, filterable by state, location, reusability class
- **Toggle** at the top: "Quantities" / "Passports" — same data, different projection
- **Passport detail panel**: full chain of custody, location on model, photos, reusability certification, end-of-life plan
- **Reusability dashboard**: what % of the project's installed mass has a reuse plan? What's the certified-for-reuse tonnage? Feeds circular-economy KPIs and EU Taxonomy DNSH compliance.

### Cross-connects

- **EU Taxonomy**: Article 9 circular economy DNSH criteria require reuse/recyclability documentation — passport is the evidence
- **Madaster**: Dutch material passport registry, commercially operational. Sprucelab passports should export to Madaster format as a reuse destination.
- **BAMB** (Buildings As Material Banks): EU research framework; passport structure should be BAMB-compatible
- **Byggherreforskriften**: Norwegian law increasingly pushing reuse planning; passports are the audit trail
- **Material bank (v3)**: cross-project passports — a material check-out from Project A becomes a check-in to Project B. Sprucelab becomes the registry.

### V2.5 honest ship

- `MaterialPassport` + `PassportEvent` schema
- Check-in/check-out events for site and building states
- Passport detail panel in the browser
- Link from installed quantity → passport list
- Export to Madaster format

### Deferred to v3

- Live sensor integration (RFID tags, structural health monitoring)
- Automatic condition updates from inspection apps
- Cross-project material bank (passport portability)
- Reusability certification workflow integration (SINTEF, DiBK)

---

## Technical architecture

### Backend

**New module:** `backend/apps/entities/services/material_families.py`
- `LEAF_TO_FAMILY: dict[str, str]` — maps every `MATERIAL_CATEGORY_CHOICES` leaf to its L1 family
- `FAMILY_ORDER: list[str]` — canonical L1 display order
- `classify_raw_name(name: str) -> str | None` — heuristic string-match classifier for unlinked materials
- `family_for_material(material: Material) -> str` — resolves via library link first, falls back to classifier

**New endpoint:** `GET /api/entities/projects/{project_id}/materials/`
- Implemented as a custom action on `MaterialViewSet`: `@action(detail=False, methods=['get'], url_path='project')`
- Query params: `project_id` (required)
- Response shape:
  ```json
  {
    "summary": {
      "total_materials": 200,
      "total_sets": 45,
      "classified_percent": 60,
      "epd_linked_percent": 0,
      "procurement_linked_percent": 0,
      "unclassified_count": 80
    },
    "families": [
      { "key": "concrete", "label": "Concrete", "material_count": 12, "instance_count": 4200, "subtypes": [...] },
      ...
    ],
    "materials": [
      {
        "key": "concrete::Betong B30",
        "name": "Betong B30",
        "family": "concrete",
        "family_confidence": "confirmed" | "suggested",
        "library_id": "...",
        "ns3457_code": null,
        "total_quantity": { "value": 120.5, "unit": "m3" },
        "used_in_types": [ { "type_id": "...", "type_name": "...", "model_id": "...", "instance_count": 34 } ],
        "lca_ready": false,
        "procurement_ready": false,
        "raw_names": ["Betong B30", "Concrete C30/37", "BET-30"]
      }
    ],
    "sets": [
      { "signature_hash": "...", "layers": [...], "types_using": [...], "total_instance_count": 34 }
    ]
  }
  ```
- Walks `Model → IFCType → TypeMapping → TypeDefinitionLayer`
- Dedupes materials by `(library_id, material_name_normalized)` key
- Rolls up `total_quantity = Σ(layer.quantity_per_unit × type.instance_count)`
- Detects sets by hashing `(layer_order, material_key, thickness, unit)` tuples per mapping

### Frontend

**New hook:** `frontend/src/hooks/use-project-materials.ts`
- `useProjectMaterials(projectId)` — React Query wrapper
- Types for `ProjectMaterialsResponse`, `MaterialFamily`, `MaterialEntry`, `MaterialSet`

**New component:** `frontend/src/components/features/materials/MaterialBrowserView.tsx`
- Mirrors `TypeLibraryView` structure
- 3-column grid with family tree left, table center, detail right
- Tab toggle for Materials / Sets
- View toggle for All / LCA / Procurement

**Wire page:** `frontend/src/pages/ProjectMaterialLibrary.tsx` — replace "coming soon" stub with `<MaterialBrowserView projectId={project.id} />`.

**i18n:** new `materialBrowser.*` namespace in `en.json` and `nb.json`. Norwegian primary.

---

## Open questions (blocking decisions before build)

### V1 scope questions

1. **Empty columns in v1** — LCA readiness and Procurement readiness lights go red for everything until v1.1/v2 data exists. Honest but ugly. Alternative: hide those columns entirely until data exists. **Recommendation:** show them red. Coverage gap is the spec, not a failure.
2. **Orphan `Material` records** (per-model, unlinked to `TypeDefinitionLayer`) — include in browser under "Unclassified" bucket, or exclude until someone links them? **Recommendation:** include. They represent IFC-extracted materials that weren't captured in type mapping — useful for coverage audit.
3. **Set naming** — sets have no canonical name. v1 derives `"{top-material} + {layer-count} layers"`. User-editable naming comes later.
4. **Classifier false positives** — "Betong mot bad" matches Concrete and Wetroom. v1 uses first-match-wins; disambiguation rules or ML come later.
5. **Performance** — 20 models × 300 types × 5 layers = 30k rows. `select_related` + `prefetch_related` should be fine for v1; caching in v1.2 if slow.

### Taxonomy / crosswalk questions (from research)

6. **NS 9431 integration depth** — generate DiBK `sluttrapport med avfallsplan` exports, or just use NS 9431 as a tag/filter? If exports are the goal, NS 9431 becomes a hard integration requirement in v2. **Recommendation:** tag/filter in v2, exports in v2.5.
7. **CPV vs NS 3450 for procurement** — Norwegian public procurement uses CPV directly but Statsbygg and large clients also reference NS 3450. Which matters more for sprucelab's target users? **Needs user input.**
8. **NPCR granularity** — full NPCR list (~30 sub-PCRs, frequently updated) or stable subset (concrete, steel, wood, insulation, gypsum, glass)? **Recommendation:** stable subset in v1.1, full list when there's demand.
9. **Composite vs layer-level classification** — for sandwich types, do we classify the assembled type as "Composite" L1, or require each `TypeDefinitionLayer` to have its own L1 family? **Recommendation:** layer-level, with assembled type showing as "Composite (5 layers)". Layer-level is correct for LCA and waste.
10. **KBOB as seed data** — download KBOB Excel as reference for L1/L2 definitions? License permits reference use. **Recommendation:** yes, stash under `backend/data/reference/`.
11. **Blast radius of replacing `MATERIAL_CATEGORY_CHOICES`** — is the existing enum locked by populated data? Need a quick check before finalizing.

### Balance Sheet / Waste / Passport questions

12. **Rollout order** — v1.1 (screening LCA) before v1.5 (balance sheet), or flip? Screening LCA needs EPD schema work; balance sheet needs demand/transaction schema. **Recommendation:** LCA first — higher leverage for early-stage design decisions, and the procurement data needed for the balance sheet requires manual-entry or integration work that takes longer to ship.
13. **Balance Sheet v1.5 scope** — 3 states (on-site / installed / waste) or full 5 states (ordered / in-transit / on-site / installed / waste) from day one? **Recommendation:** 3 states. Ordered/in-transit split comes when integrations exist — manual entry of "ordered" and "in-transit" is friction without value.
14. **Field module reuse** — does the existing Field module (wireframe 07, construction compliance) already track install progress per type? If yes, the Balance Sheet's "installed" state reads from Field instead of duplicating. **Needs code check before v1.5.**
15. **Procurement integration target** — for the first integration (v2), which system? ACC, Cobuilder, WebBBM, Byggweb, SG Armaturen, something else? **Needs user input.**
16. **Madaster compatibility** — design the passport schema now to export cleanly to Madaster format, or build sprucelab-native first and adapt later? **Recommendation:** Madaster-compatible from day one — the schema shape is already published (`madaster.com/en/material-passport-schema`) and diverging later is expensive.
17. **Instance-level vs batch-level passports** — does every physical piece get its own passport (true NFT — every reinforcing bar, every window), or does a batch get one passport (pragmatic — "this batch of 30 m³ concrete")? **Recommendation:** batch-level by default, instance-level opt-in for discrete countable items (windows, doors, structural steel members).
18. **RBAC** — procurement owns ordered/delivered, site manager owns installed/waste, LCA lead owns EPD links. None has authority over the other's data. Real in v2. **Needs design.**

---

## Success metrics

- A user opens `/projects/:id/material-library`, sees all materials grouped by family, in < 2 seconds
- Coverage stats immediately visible in the header
- Unclassified materials are bucketed but not hidden
- A user can drill into any family → subtype → material → see where it's used → jump to that type in the Type Browser
- No console errors, no empty states for a real project

## Non-goals for v1

- Editing material composition (stays in Type Browser)
- Writing EPD data
- Creating new MaterialLibrary entries
- Cross-project queries
- Real-time GWP totals
- Any data entry (balance sheet, waste, passports)

---

## Rollout

| Phase | Name | Scope | Schema additions | Blocked by |
|---|---|---|---|---|
| **v1** | Browser + normalization (Norwegian defaults) | L1 family tree, dedup, where-used, coverage lights, Materials/Sets tabs. Schema is standards-agnostic from day one but seeded with NO defaults. | `Standard`, `ClassificationCode`, `ProjectStandard`, `MaterialClassification` | Nothing — ships over existing data |
| **v1.1** | Screening LCA | Resolution chain, confidence badges, carbon header, nominal factors per family | `EPDLibrary`, `EPDMapping`, `NominalFactorLibrary` | EPD data sourcing |
| **v1.2** | Change + proliferation | Version diff, hotspot Pareto, proliferation alerts, peer benchmarks | None (uses existing) | Version diff engine, cross-project data |
| **v1.3** | Standards Workspace | ProjectConfig/standards page, bsDD integration, custom standards, per-country loadouts. Retrofits v1 to read from ProjectStandard instead of hardcoded Norwegian. | `StandardImport`, `CustomStandardBuilder`, `StandardCrosswalk` | bsDD API auth, country seed templates |
| **v1.5** | Material Balance Sheet | Demand + 3 states (on-site/installed/waste), balance column, reconciliation | `MaterialDemand`, `MaterialTransaction`, `MaterialStockLocation` | Field module integration check |
| **v2** | Waste Management | Planned vs actual, classified against project's active waste standard (NS 9431 for NO projects), A5 carbon, source-sorting rate | `WasteFactor`, `WasteEvent` | v1.3 Standards Workspace, v1.5 transaction log |
| **v2.5** | Material Passports | Fungible → non-fungible, check-in/out events, passport panel, Madaster export | `MaterialPassport`, `PassportEvent`, `ReusabilityAssessment` | v1.5 transaction log |
| **v3** | Cross-project MaterialBank | Material bank (passports moving between projects), substitution engine, peer benchmarks | `MaterialBankEntry`, cross-project queries | TypeBank equivalent for materials |
| **v3+** | Procurement integration (agnostic) | Standards-agnostic procurement ingestion layer (CSV import, generic REST webhook, future connector SDK). No first-party integration target picked — design integration surface as system-neutral. | `SupplierOrder`, `ProcurementIntegration`, `IntegrationConnector` | Integration SDK design |

---

## One-page summary

**Problem:** ProjectMaterialLibrary is a placeholder. We need a real materials subsystem — not just a list, but the organizing spine for LCA (concept-stage carbon), procurement (demand/consolidation/risk), construction (balance sheet), and circular economy (passports, reuse).

**Principle:** Materials relate to types but are first-class. Fungible in flow, non-fungible on install. One taxonomy (sprucelab-native L1 + designer L2) crosswalked to the standards that matter (NS 9431, NPCR, CPV, NS 3451, HS). Types-first architecture preserved — everything is a projection over existing `TypeDefinitionLayer` data until we need event logs.

**Strategy:** Ship the browser (v1) static over current data. Add LCA (v1.1) with resolution chain. Add balance sheet (v1.5) for supply chain visibility. Add waste (v2) for Norwegian compliance. Add passports (v2.5) for circular economy. Each phase is self-contained and shippable.

**Differentiator:** Every LCA tool is late-stage. Sprucelab gives you defensible carbon numbers at concept stage. Every procurement tool is siloed from design. Sprucelab reconciles them on one screen. Nobody is building passports for Norwegian projects. Sprucelab can own that space.
