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

**Two-level hierarchy over the existing `MATERIAL_CATEGORY_CHOICES` (40 leaves).**

### L1 families (navigation default)
- Concrete
- Steel
- Wood
- Insulation
- Boards
- Glass
- Membrane
- Masonry
- Metal (non-structural)
- Polymer / Plastic
- Finish
- Composite (windows, doors, facades)
- Other / Unclassified

### L2 subtypes = existing leaf categories
Slotted under their family. Example:

- **Insulation** → `mineral_wool_inner`, `mineral_wool_outer`, `mineral_wool_roof`, `glass_wool`, `insulation_eps`, `insulation_xps`
- **Concrete** → `concrete_cast`, `concrete_hollowcore`
- **Wood** → `wood_glulam`, `wood_clt`, `wood_structural`, `wood_treated`
- **Steel** → `steel_structural`, `rebar`

### Implementation
Hardcoded `LEAF_TO_FAMILY` map in Python. No migration. Pure projection over existing data. Lives at `backend/apps/entities/services/material_families.py`.

### Unclassified materials
Per-model `Material` records without a `material_library` FK get a **suggested family** from a string-match classifier over the raw IFC name (`betong`/`concrete` → Concrete, `stål`/`steel` → Steel, `gips` → Boards, `stein/rockwool/glava/isover` → Insulation, etc.). The browser shows them under their suggested family with an "unverified" badge. User clicks to confirm.

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

## Open questions

1. **Dedup granularity for "distinct material":** Today, the key is `(library_id OR normalized_name)`. If two projects use the MaterialLibrary link vs freestanding name, same material appears twice. Good enough for v1; needs TypeBank-style canonical entries eventually.
2. **Where do raw `Material` records (per-model, unlinked to `TypeDefinitionLayer`) fit?** They exist in the `materials` table but aren't referenced by any type layer. Include them in v1? Decision: **yes**, show them under "Unclassified / Orphan Materials" at the bottom of the family tree. They represent IFC materials that weren't picked up in type mapping — useful for coverage audit.
3. **Set naming:** Sets have no canonical name. v1 derives one from `"{top-material} + {layer-count} layers"`. Needs user-editable name eventually.
4. **Performance on large projects:** 20 models × 300 types × 5 layers = 30k rows to walk. Acceptable for v1 with `select_related` + `prefetch_related`; add caching in v1.2 if slow.
5. **Material classifier false positives:** A wall named "Betong mot bad" matches both Concrete and Wetroom. v1 uses first-match wins. Needs disambiguation rules or ML later.

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

---

## Rollout

1. **v1 (this PR):** Browser, normalization, dedup, where-used, coverage lights
2. **v1.1:** EPDLibrary + EPDMapping schema, resolution chain, confidence badges, carbon header banner
3. **v1.2:** Hotspot Pareto, proliferation alerts, change detection
4. **v2:** Cross-project MaterialBank, substitution suggestions, peer benchmarking
5. **v2+:** Procurement fields (supplier, price, lead time), approval workflow, integration with procurement tools
