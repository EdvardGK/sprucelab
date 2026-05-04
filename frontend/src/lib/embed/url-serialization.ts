/**
 * Stable URL serialization for FilterContext.
 *
 * Why custom: deeplinks need to be diffable across protocol versions, so
 * key order must be deterministic regardless of object construction
 * order. JSON.stringify alone doesn't guarantee stable key order in all
 * engines for arbitrary objects.
 *
 * Strategy:
 *   - Recursively sort keys alphabetically before stringify
 *   - Drop keys whose value is undefined (so absent === no constraint)
 *   - URI-encode the result for safe ?filter= query-string transport
 *   - Decode is the inverse; it does not validate the shape (resolver
 *     responsibility in PR #3)
 *
 * Tests will arrive when a frontend unit-test runner is added (separate
 * infra PR). Until then this module is consumed only at build time and
 * via type-check; round-trip behavior is verified by the resolver in
 * PR #3 against real fixtures.
 */

import type { FilterContext } from './types';

// ── Internal helpers ──────────────────────────────────────────────

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function sortKeysDeep(value: JsonValue): JsonValue {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);

  const sorted: { [key: string]: JsonValue } = {};
  const keys = Object.keys(value).sort();
  for (const key of keys) {
    const v = value[key];
    if (v === undefined) continue;
    sorted[key] = sortKeysDeep(v as JsonValue);
  }
  return sorted;
}

// FilterContext is a known-JSON-safe shape (no Date, no Map, no functions),
// so a cast is appropriate at the JSON-shape boundary.
function toJsonSafe(ctx: FilterContext): JsonValue {
  return ctx as unknown as JsonValue;
}

// ── Public surface ────────────────────────────────────────────────

/**
 * Encode a FilterContext to a stable URL-safe string.
 *
 * Output is deterministic for any equivalent context, regardless of
 * key insertion order. Suitable for `?filter=<encoded>` deeplinks and
 * for content-addressing a saved view (future "save filter as view"
 * work, edkjo Q8).
 */
export function encodeFilterContext(ctx: FilterContext): string {
  const sorted = sortKeysDeep(toJsonSafe(ctx));
  return encodeURIComponent(JSON.stringify(sorted));
}

/**
 * Decode a URL-encoded FilterContext string. Returns `null` if the
 * input is not valid JSON; does NOT validate field shapes — that
 * happens at the resolver boundary (PR #3).
 */
export function decodeFilterContext(encoded: string): FilterContext | null {
  try {
    const decoded = decodeURIComponent(encoded);
    const parsed = JSON.parse(decoded);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as FilterContext;
  } catch {
    return null;
  }
}

/**
 * Read the current filter context from `?filter=` in the given URL (or
 * window.location). Returns `null` if absent or unparseable.
 */
export function readFilterFromUrl(
  url: string | URL = typeof window !== 'undefined' ? window.location.href : '',
): FilterContext | null {
  if (!url) return null;
  const u = typeof url === 'string' ? new URL(url, 'http://_') : url;
  const raw = u.searchParams.get('filter');
  if (!raw) return null;
  return decodeFilterContext(raw);
}

/**
 * Produce a new URL with `?filter=` set to the encoded context.
 * Existing query params are preserved.
 */
export function writeFilterToUrl(url: string | URL, ctx: FilterContext): string {
  const u = typeof url === 'string' ? new URL(url, 'http://_') : new URL(url.toString());
  u.searchParams.set('filter', encodeFilterContext(ctx));
  return u.toString();
}
