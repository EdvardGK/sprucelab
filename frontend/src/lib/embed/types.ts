/**
 * Embed filter context — the schema sprucelab dashboards (and their
 * downstream embed consumers) project from. Every tile (charts, tables,
 * the 3D viewer) reads from the same context and reprojects when it
 * changes; cross-tile clicks merge into it.
 *
 * Schema versioning rules (settled in PR #2 review, edkjo Q4):
 *   - Additive change (new optional dimension)        → no version bump
 *   - Renaming a key                                  → version bump
 *   - Type narrowing on an existing key               → version bump
 *   - The four invariants below                       → never rename
 *
 * URL serialization stability lives in `./url-serialization.ts`.
 * Resolver semantics (semantic→concrete express_id list) lands in PR #3.
 * postMessage envelope wiring lands in PR #4.
 */

export type ProtocolVersion = 1;
export const CURRENT_PROTOCOL_VERSION: ProtocolVersion = 1;

/**
 * Two-mode dashboard interaction:
 *   - 'filter'    — non-matching elements are removed from view (intersection)
 *   - 'highlight' — non-matching elements are dimmed/ghosted; nothing removed
 *
 * The active mode rides in the context so postMessage handshakes and URL
 * deeplinks both round-trip the choice.
 */
export type Mode = 'filter' | 'highlight';

/**
 * Range filter for numeric dimensions (MMI, LCA stages, etc.).
 * Both bounds are inclusive. `null` on either side = unbounded.
 */
export interface NumericRange {
  min: number | null;
  max: number | null;
}

/**
 * Quality issue sub-namespace. Each key is an opt-in toggle that means
 * "include elements with this quality issue" when filtering, or "highlight
 * elements with this quality issue" when in highlight mode. Absent key =
 * no constraint on that issue type.
 *
 * The MVP set is the four edkjo Q10 confirmed (untyped, orphan,
 * empty_container, missing_pset). Three more (invalid_geometry,
 * missing_relations, missing_material) are placed here so the namespace
 * shape is stable when they ship in a later PR.
 */
export interface QualityFilter {
  untyped?: boolean;
  orphan?: boolean;
  empty_container?: boolean;
  missing_pset?: boolean;
  invalid_geometry?: boolean;
  missing_relations?: boolean;
  missing_material?: boolean;
}

/**
 * The single shared filter context every tile (and the embed iframe)
 * projects from.
 *
 * Invariants (fields that must never be renamed without a protocol bump):
 *   - mode
 *   - project_id
 *   - protocol_version
 *   - selected_express_id
 *
 * Dimensions extend openly. New optional keys are an additive change.
 * Nested namespaces (`quality`, future `audit`, future `lca`) follow the
 * shape of `QualityFilter` — partial-record of boolean toggles or simple
 * scalars.
 */
export interface FilterContext {
  // ── Invariants ────────────────────────────────────────────────────
  mode: Mode;
  project_id: string;
  protocol_version: ProtocolVersion;
  /** Currently focused element. `null` = no selection. */
  selected_express_id: number | null;

  // ── Open-ended dimensions ─────────────────────────────────────────
  ifc_class?: string[];
  /** Canonical floor codes (matches Scope.canonical_floors[].code). */
  floor_code?: string[];
  discipline?: string[];
  /** MMI score range; both bounds inclusive. */
  mmi?: NumericRange;
  materials?: string[];
  /** TypeBank / per-project type ids. */
  type_id?: string[];

  // ── Nested namespaces ─────────────────────────────────────────────
  quality?: QualityFilter;
}

/**
 * The minimum context required at construction time. Everything else is
 * optional and absence-means-no-constraint.
 */
export type FilterContextSeed = Pick<FilterContext, 'project_id'> &
  Partial<Omit<FilterContext, 'project_id'>>;

/**
 * postMessage handshake envelope. Defined here so PR #4 (iframe page
 * route) imports the type from one place. Wiring is not in this PR.
 *
 * `kind: 'ready'` is the embed→host advertisement of supported protocol
 * versions; the host shim picks the highest version both sides speak.
 *
 * `kind: 'set_filter'` is the host→embed update. The embed may emit
 * `kind: 'filter_changed'` back when an in-tile click reprojects the
 * context (PR #6 work).
 */
export type EmbedHandshake =
  | {
      kind: 'ready';
      protocol_versions: ProtocolVersion[];
    }
  | {
      kind: 'set_filter';
      protocol_version: ProtocolVersion;
      payload: Partial<Omit<FilterContext, 'protocol_version'>>;
    }
  | {
      kind: 'filter_changed';
      protocol_version: ProtocolVersion;
      payload: FilterContext;
    };

/**
 * Build a FilterContext with safe defaults (mode='filter', no selection,
 * no dimension constraints).
 */
export function createFilterContext(seed: FilterContextSeed): FilterContext {
  return {
    mode: seed.mode ?? 'filter',
    project_id: seed.project_id,
    protocol_version: seed.protocol_version ?? CURRENT_PROTOCOL_VERSION,
    selected_express_id: seed.selected_express_id ?? null,
    ...(seed.ifc_class !== undefined ? { ifc_class: seed.ifc_class } : {}),
    ...(seed.floor_code !== undefined ? { floor_code: seed.floor_code } : {}),
    ...(seed.discipline !== undefined ? { discipline: seed.discipline } : {}),
    ...(seed.mmi !== undefined ? { mmi: seed.mmi } : {}),
    ...(seed.materials !== undefined ? { materials: seed.materials } : {}),
    ...(seed.type_id !== undefined ? { type_id: seed.type_id } : {}),
    ...(seed.quality !== undefined ? { quality: seed.quality } : {}),
  };
}
