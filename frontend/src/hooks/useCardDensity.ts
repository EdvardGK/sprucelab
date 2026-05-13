import { useEffect, useState } from 'react';

/**
 * Card density preference for galleries (Models, Projects, etc.).
 * Persisted to localStorage so the choice sticks across navigations
 * and tabs.
 *
 *   - 'big'   = card with top-banner thumbnail
 *   - 'small' = compact card, banner hidden
 */
export type CardDensity = 'big' | 'small';

const STORAGE_KEY = 'sprucelab.cards.density';
const DEFAULT: CardDensity = 'big';

function readInitial(): CardDensity {
  if (typeof window === 'undefined') return DEFAULT;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'big' || v === 'small' ? v : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function useCardDensity(): [CardDensity, (next: CardDensity) => void] {
  const [density, setDensityState] = useState<CardDensity>(readInitial);

  const setDensity = (next: CardDensity) => {
    setDensityState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage may be disabled (private browsing, quota); the in-memory
      // state still updates so the toggle works for the current session.
    }
  };

  // Cross-tab + cross-page sync so a toggle on Models reflects on Projects.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue === 'big' || e.newValue === 'small') {
        setDensityState(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return [density, setDensity];
}
