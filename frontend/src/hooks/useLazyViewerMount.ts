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
