import type { FamilyKey } from '@/lib/material-families';

/**
 * Canonical material family colors. Used by the family tree, treemap,
 * KPI sparklines, layer stacked-bars, and set composition strips so the
 * macro vocabulary stays consistent across the page.
 */
export const FAMILY_COLORS: Record<FamilyKey, string> = {
  concrete: '#94a3b8',
  masonry: '#b45309',
  metal: '#64748b',
  wood: '#a16207',
  boards: '#f59e0b',
  insulation: '#fbbf24',
  glass: '#0ea5e9',
  membrane: '#6366f1',
  polymer: '#c026d3',
  finish: '#e879f9',
  composite: '#8b5cf6',
  technical: '#14b8a6',
  other: '#9ca3af',
};

export function familyColor(key: FamilyKey): string {
  return FAMILY_COLORS[key] ?? '#9ca3af';
}
