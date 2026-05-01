/**
 * Sync the viewer filter store to the URL `?f=<base64>` so views are shareable.
 *
 * On mount: parse `?f=`, hydrate the store.
 * On state change: replace the search param via `history.replaceState` (no nav).
 *
 * Only encoded facets — scope is per-project. Decoded on the receiving end and
 * applied via the store's setters so a stale schema with extra/missing fields
 * is non-fatal.
 */

import { useEffect, useRef } from 'react';
import { useViewerFilterStore } from '@/stores/useViewerFilterStore';
import type { VerificationStatus } from '@/stores/useViewerFilterStore';

interface EncodedFilters {
  h?: string[];       // hiddenIfcClasses
  fc?: string | null; // floor_code (was `s` for storey, pre-F-3)
  n?: string[];       // ns3451
  v?: VerificationStatus[];
  sy?: string[];      // systems
  hm?: string[];      // hiddenModels
}

function encode(state: EncodedFilters): string {
  // Compact JSON → utf-8 → base64 (URL-safe).
  const json = JSON.stringify(state);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decode(encoded: string): EncodedFilters | null {
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(padded)));
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function isEmpty(s: EncodedFilters): boolean {
  return (
    !s.h?.length &&
    !s.fc &&
    !s.n?.length &&
    !s.v?.length &&
    !s.sy?.length &&
    !s.hm?.length
  );
}

export function useViewerFilterUrl(): void {
  const hydratedRef = useRef(false);

  // Hydrate from URL on mount (once).
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (typeof window === 'undefined') return;

    const sp = new URLSearchParams(window.location.search);
    const encoded = sp.get('f');
    if (!encoded) return;

    const decoded = decode(encoded);
    if (!decoded) return;

    const state = useViewerFilterStore.getState();
    if (decoded.h) state.setHiddenIfcClasses(decoded.h);
    if (decoded.fc !== undefined) state.setFloorCode(decoded.fc);
    if (decoded.n) state.setNs3451(decoded.n);
    if (decoded.v) state.setVerification(decoded.v);
    if (decoded.sy) state.setSystems(decoded.sy);
    if (decoded.hm) state.setHiddenModels(decoded.hm);
  }, []);

  // Push to URL on state change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const unsubscribe = useViewerFilterStore.subscribe((s) => {
      const payload: EncodedFilters = {
        h: s.hiddenIfcClasses,
        fc: s.floor_code,
        n: s.ns3451,
        v: s.verification,
        sy: s.systems,
        hm: s.hiddenModels,
      };
      const sp = new URLSearchParams(window.location.search);
      if (isEmpty(payload)) {
        sp.delete('f');
      } else {
        sp.set('f', encode(payload));
      }
      const next = sp.toString();
      const url = next ? `${window.location.pathname}?${next}` : window.location.pathname;
      window.history.replaceState(null, '', url);
    });
    return unsubscribe;
  }, []);
}
