import { useEffect, useRef, useState } from 'react';

/**
 * Animate a number from 0 (or previous value) to the target on mount /
 * change. Cubic ease-out, 600ms by default. Returns the live value
 * suitable for direct rendering.
 *
 * Honors `prefers-reduced-motion`: snaps to target immediately.
 */
export function useCountUp(
  target: number,
  options: { duration?: number; fraction?: boolean } = {}
): number {
  const { duration = 600, fraction = false } = options;
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      setValue(target);
      fromRef.current = target;
      return;
    }

    const from = fromRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (target - from) * eased;
      setValue(fraction ? next : Math.round(next));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, fraction]);

  return value;
}
