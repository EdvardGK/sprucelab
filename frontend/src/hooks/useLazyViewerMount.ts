import { useEffect, useRef, useState } from 'react';

/**
 * Module-level mount counter — every visible mini viewer increments it, and
 * decrements when unmounted. We cap concurrent viewers at MAX_CONCURRENT to
 * stay below WebGL context limits (~16 on most browsers). Subscribers are
 * notified when the counter changes so queued viewers can claim a slot the
 * moment one frees up.
 */
const subscribers = new Set<() => void>();
let activeMounts = 0;

function notify() {
  subscribers.forEach((cb) => cb());
}

function claimSlot(): boolean {
  if (activeMounts >= MAX_DEFAULT_CONCURRENT) return false;
  activeMounts += 1;
  notify();
  return true;
}

function releaseSlot() {
  if (activeMounts > 0) {
    activeMounts -= 1;
    notify();
  }
}

const MAX_DEFAULT_CONCURRENT = 8;

export interface UseLazyViewerMountOptions {
  /** Margin around viewport that counts as "in view" for early loading. */
  rootMargin?: string;
  /**
   * Cap on simultaneously mounted viewers. WebGL contexts are a finite
   * resource (~16 across the page), so we keep this conservative.
   */
  maxConcurrent?: number;
}

export interface UseLazyViewerMountResult {
  /** Attach to the card root. Observed for viewport intersection. */
  ref: React.MutableRefObject<HTMLDivElement | null>;
  /**
   * True once the card has entered the viewport AND a concurrency slot is
   * available. Once true, stays true — we keep mounted viewers around so
   * a quick back-scroll doesn't trigger an expensive re-load.
   */
  shouldMount: boolean;
}

/**
 * Lazy-mount a heavy 3D viewer when its host card scrolls into view, with
 * a hard cap on concurrent live viewers so the WebGL context budget isn't
 * blown on a long list. Once mounted, the viewer stays mounted for the
 * lifetime of the card.
 *
 * Pattern:
 *   const { ref, shouldMount } = useLazyViewerMount();
 *   return <div ref={ref}>{shouldMount ? <Viewer /> : <Placeholder />}</div>;
 */
export function useLazyViewerMount(
  options: UseLazyViewerMountOptions = {}
): UseLazyViewerMountResult {
  const { rootMargin = '200px', maxConcurrent } = options;
  const ref = useRef<HTMLDivElement | null>(null);
  const [shouldMount, setShouldMount] = useState(false);
  const inViewRef = useRef(false);
  const claimedRef = useRef(false);

  // Track viewport intersection — the gate that unlocks slot-claim attempts.
  useEffect(() => {
    if (shouldMount) return; // Once mounted, no more observation work.
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      // SSR / very old browser fallback — mount eagerly.
      inViewRef.current = true;
      setShouldMount(true);
      claimedRef.current = true;
      activeMounts += 1;
      notify();
      return;
    }

    // Synchronous initial-viewport check.
    //
    // Previous behavior: rely entirely on IntersectionObserver to fire its
    // first callback. Those callbacks are scheduled asynchronously after
    // layout, and N cards in the viewport on initial paint did not all
    // fire in the same microtask — the eye perceived viewers mounting one
    // by one. By probing `getBoundingClientRect()` here, every card whose
    // ref is already inside the (expanded) viewport claims a slot on its
    // very first effect run, so the first N cards mount in parallel.
    if (isElementInViewport(el, rootMargin)) {
      inViewRef.current = true;
      tryClaim();
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            inViewRef.current = true;
            tryClaim();
          }
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();

    function tryClaim() {
      if (claimedRef.current || shouldMount) return;
      // Honor a per-instance maxConcurrent override by clamping the
      // module-level check. The default cap is enforced via the module
      // constant; we only allow a hook caller to LOWER it, not raise.
      const cap =
        typeof maxConcurrent === 'number'
          ? Math.min(MAX_DEFAULT_CONCURRENT, maxConcurrent)
          : MAX_DEFAULT_CONCURRENT;
      if (activeMounts >= cap) return;
      // claimSlot uses the module-level cap (MAX_DEFAULT_CONCURRENT).
      // The local `cap` clamp above mirrors that check so callers can opt
      // for a tighter limit without raising the module ceiling.
      if (claimSlot()) {
        claimedRef.current = true;
        setShouldMount(true);
      }
    }
  }, [rootMargin, maxConcurrent, shouldMount]);

  // Subscribe to global slot changes so a waiting card can claim a slot
  // as soon as another card unmounts.
  useEffect(() => {
    if (shouldMount) return;
    const tryAgain = () => {
      if (!inViewRef.current || claimedRef.current) return;
      const cap =
        typeof maxConcurrent === 'number'
          ? Math.min(MAX_DEFAULT_CONCURRENT, maxConcurrent)
          : MAX_DEFAULT_CONCURRENT;
      if (activeMounts >= cap) return;
      if (claimSlot()) {
        claimedRef.current = true;
        setShouldMount(true);
      }
    };
    subscribers.add(tryAgain);
    return () => {
      subscribers.delete(tryAgain);
    };
  }, [maxConcurrent, shouldMount]);

  // Release the slot on unmount so queued cards can take it.
  useEffect(() => {
    return () => {
      if (claimedRef.current) {
        claimedRef.current = false;
        releaseSlot();
      }
    };
  }, []);

  return { ref, shouldMount };
}

// Test/dev helper: read the current active mount count.
export function __getActiveViewerMounts() {
  return activeMounts;
}

/**
 * Cheap synchronous viewport check matching the IntersectionObserver's
 * `rootMargin` semantics. Used at mount time so the first batch of
 * already-in-viewport cards can claim slots without waiting for the
 * observer's first async callback (the prior bug — viewers appeared to
 * load serially, one per layout pass).
 *
 * `rootMargin` accepts the standard CSS-shorthand string ("200px",
 * "10px 20px", "0px 10% 0px 10%", etc). We tolerate `px` and `%` units;
 * anything else falls back to 0.
 */
function isElementInViewport(el: Element, rootMargin: string): boolean {
  if (typeof window === 'undefined') return false;
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  const [mTop, mRight, mBottom, mLeft] = parseRootMargin(rootMargin, vw, vh);
  // Element overlaps the viewport (expanded by margins) on both axes.
  return (
    rect.bottom + mBottom > 0 &&
    rect.top - mTop < vh &&
    rect.right + mRight > 0 &&
    rect.left - mLeft < vw
  );
}

function parseRootMargin(
  rootMargin: string,
  vw: number,
  vh: number,
): [number, number, number, number] {
  const parts = rootMargin.trim().split(/\s+/);
  if (parts.length === 0) return [0, 0, 0, 0];
  // CSS shorthand: 1 → all, 2 → vert/horiz, 3 → top/horiz/bottom, 4 → t/r/b/l.
  const toPx = (raw: string, axis: 'v' | 'h'): number => {
    if (!raw) return 0;
    if (raw.endsWith('%')) {
      const pct = parseFloat(raw) / 100;
      return Number.isFinite(pct) ? pct * (axis === 'v' ? vh : vw) : 0;
    }
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  };
  const expand = (arr: string[]): [string, string, string, string] => {
    if (arr.length === 1) return [arr[0], arr[0], arr[0], arr[0]];
    if (arr.length === 2) return [arr[0], arr[1], arr[0], arr[1]];
    if (arr.length === 3) return [arr[0], arr[1], arr[2], arr[1]];
    return [arr[0], arr[1], arr[2], arr[3]];
  };
  const [t, r, b, l] = expand(parts);
  return [toPx(t, 'v'), toPx(r, 'h'), toPx(b, 'v'), toPx(l, 'h')];
}
