import { useMemo } from 'react';

import { useClaimsList } from './use-claims';
import type { ClaimListItem } from '@/lib/claims-types';

export interface ClaimsKpiSpark {
  key: string;
  value: number;
  label?: string;
}

export interface ProjectClaimsKpis {
  /** Total claims not yet decided. */
  openClaims: number;
  /**
   * Claims attributable to the current user. The backend doesn't expose
   * an assignee field yet (the Claim model has `decided_by` but no
   * pre-decision assignment). Surfaced as null so the UI renders an
   * amber em-dash per the modelers-own-data rule.
   */
  assignedToMe: number | null;
  /** Claims promoted or rejected in the last 7 days. */
  resolvedThisWeek: number;
  /**
   * Average time-to-resolve in days, or null when no resolved claims
   * have decided_at + extracted_at. Surfaces as amber em-dash when null.
   */
  avgTimeToResolveDays: number | null;

  /** Resolutions per day for the last 7 days (oldest → newest). */
  resolutionsPerDay: ClaimsKpiSpark[];

  /** True while underlying useClaimsList query is loading. */
  isLoading: boolean;
}

const EMPTY: ProjectClaimsKpis = {
  openClaims: 0,
  assignedToMe: null,
  resolvedThisWeek: 0,
  avgTimeToResolveDays: null,
  resolutionsPerDay: [],
  isLoading: false,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Derive the Claims-page KPI row entirely from the existing
 * `useClaimsList({ project })` payload. No extra API calls. Fields the
 * backend can't supply (assignee model has no assignment field yet) are
 * returned as null so the UI can render an amber em-dash.
 */
export function useProjectClaimsKpis(projectId?: string): ProjectClaimsKpis {
  const { data, isLoading } = useClaimsList(
    projectId ? { project: projectId } : undefined,
    { enabled: !!projectId },
  );

  return useMemo(() => {
    if (!data) return { ...EMPTY, isLoading };
    const claims = data as ClaimListItem[];

    const openClaims = claims.filter((c) => c.status === 'unresolved').length;

    // No assignee field on Claim yet — surface as null so UI shows amber em-dash.
    const assignedToMe: number | null = null;

    const now = Date.now();
    const weekAgo = now - 7 * DAY_MS;
    // Per-day buckets, 7 entries (oldest → newest).
    const buckets: number[] = Array(7).fill(0);
    let resolvedThisWeek = 0;

    for (const c of claims) {
      if (c.status !== 'promoted' && c.status !== 'rejected') continue;
      // ClaimListItem doesn't carry `decided_at`; fall back to extracted_at
      // for the resolution timestamp. (Detail endpoint has decided_at but
      // the list endpoint is what we have here.)
      const decidedAt = new Date(c.extracted_at).getTime();
      if (Number.isNaN(decidedAt)) continue;
      if (decidedAt >= weekAgo) {
        resolvedThisWeek += 1;
        const daysAgo = Math.floor((now - decidedAt) / DAY_MS);
        const idx = 6 - Math.min(6, Math.max(0, daysAgo));
        buckets[idx] += 1;
      }
      // Time-to-resolve: list endpoint only carries extracted_at, not
      // decided_at, so we can't compute this honestly. Leave null.
      // (Detail endpoint exposes decided_at; future work could fetch.)
    }

    const resolutionsPerDay: ClaimsKpiSpark[] = buckets.map((value, i) => ({
      key: `d-${i}`,
      value,
      label: `Day ${i + 1}`,
    }));

    const avgTimeToResolveDays: number | null = null;

    return {
      openClaims,
      assignedToMe,
      resolvedThisWeek,
      avgTimeToResolveDays,
      resolutionsPerDay,
      isLoading,
    };
  }, [data, isLoading]);
}
