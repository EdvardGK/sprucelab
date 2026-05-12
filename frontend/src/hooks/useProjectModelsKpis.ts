import { useMemo } from 'react';

import { useModels } from './use-models';
import type { Model } from '@/lib/api-types';

export interface ModelKpiSpark {
  /** Stable per-segment key. */
  key: string;
  /** Numeric value contributing to the distribution. */
  value: number;
  /** Optional accessible label shown via <title>. */
  label?: string;
}

export interface ProjectModelsKpis {
  totalModels: number;
  totalElements: number;
  totalStoreys: number;
  totalFileSizeBytes: number;
  /**
   * Average processing time in seconds, or null if unavailable. Backend
   * doesn't expose processing duration on the Model schema yet — surfaced
   * as amber em-dash in the UI when null.
   */
  avgProcessingSeconds: number | null;
  /** ISO timestamp of the most recent upload, or null when no models. */
  latestUploadIso: string | null;

  // Sparkline distributions.
  /** Models added per week, last 8 weeks (oldest → newest). */
  modelsPerWeek: ModelKpiSpark[];
  /** Top 8 models by element count (one bar each). */
  elementsByModel: ModelKpiSpark[];
  /** Top 8 models by storey count. */
  storeysByModel: ModelKpiSpark[];
  /** File sizes per model (histogram). */
  sizesByModel: ModelKpiSpark[];

  /** True while underlying useModels query is loading. */
  isLoading: boolean;
}

const EMPTY: ProjectModelsKpis = {
  totalModels: 0,
  totalElements: 0,
  totalStoreys: 0,
  totalFileSizeBytes: 0,
  avgProcessingSeconds: null,
  latestUploadIso: null,
  modelsPerWeek: [],
  elementsByModel: [],
  storeysByModel: [],
  sizesByModel: [],
  isLoading: false,
};

/**
 * Derive the project-level KPI row for the IFC Models page entirely from
 * the existing `useModels(projectId)` payload. Every value here is
 * local-only — no extra API calls. Fields that aren't on the Model schema
 * (avgProcessingSeconds) return null so the UI can render an amber
 * em-dash per the modelers-own-data rule.
 */
export function useProjectModelsKpis(projectId?: string): ProjectModelsKpis {
  const { data, isLoading } = useModels(projectId);

  return useMemo(() => {
    if (!data || data.length === 0) {
      return { ...EMPTY, isLoading };
    }

    // Reduce to the latest version of each model (mirrors the gallery rule).
    const latestByName = new Map<string, Model>();
    for (const m of data) {
      const existing = latestByName.get(m.name);
      if (!existing || m.version_number > existing.version_number) {
        latestByName.set(m.name, m);
      }
    }
    const models = [...latestByName.values()];

    const totalModels = models.length;
    const totalElements = models.reduce((s, m) => s + (m.element_count || 0), 0);
    const totalStoreys = models.reduce((s, m) => s + (m.storey_count || 0), 0);
    const totalFileSizeBytes = models.reduce((s, m) => s + (m.file_size || 0), 0);

    // Latest upload — use `created_at` (per-version timestamp).
    const latestUploadIso = models.reduce<string | null>((latest, m) => {
      const t = new Date(m.created_at).getTime();
      if (Number.isNaN(t)) return latest;
      if (latest === null) return m.created_at;
      return t > new Date(latest).getTime() ? m.created_at : latest;
    }, null);

    // Models added per week — last 8 weeks (oldest → newest). Use
    // `first_version_created_at` so re-uploads of the same model don't
    // double-count. Fall back to `created_at` when the field is empty.
    const now = new Date();
    const buckets: number[] = Array(8).fill(0);
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const startOfWindow = now.getTime() - 8 * WEEK_MS;
    for (const m of models) {
      const created = m.first_version_created_at || m.created_at;
      const t = new Date(created).getTime();
      if (Number.isNaN(t) || t < startOfWindow) continue;
      const weeksAgo = Math.floor((now.getTime() - t) / WEEK_MS);
      const idx = 7 - Math.min(7, Math.max(0, weeksAgo));
      buckets[idx] += 1;
    }
    const modelsPerWeek: ModelKpiSpark[] = buckets.map((value, i) => ({
      key: `w-${i}`,
      value,
      label: `Week ${i + 1}`,
    }));

    // Distribution sparklines — top 8 by metric so the bar reads. Falls
    // through to an empty distribution when nothing useful exists yet.
    const elementsByModel: ModelKpiSpark[] = models
      .filter((m) => m.element_count > 0)
      .sort((a, b) => b.element_count - a.element_count)
      .slice(0, 8)
      .map((m) => ({ key: m.id, value: m.element_count, label: m.name }));

    const storeysByModel: ModelKpiSpark[] = models
      .filter((m) => m.storey_count > 0)
      .sort((a, b) => b.storey_count - a.storey_count)
      .slice(0, 8)
      .map((m) => ({ key: m.id, value: m.storey_count, label: m.name }));

    const sizesByModel: ModelKpiSpark[] = models
      .filter((m) => m.file_size > 0)
      .sort((a, b) => b.file_size - a.file_size)
      .slice(0, 8)
      .map((m) => ({ key: m.id, value: m.file_size, label: m.name }));

    // TODO: backend exposes processing time — until then, surface as null
    // so the KPI tile shows an amber em-dash rather than a fabricated
    // average. Modelers-own-data: never fabricate.
    const avgProcessingSeconds: number | null = null;

    return {
      totalModels,
      totalElements,
      totalStoreys,
      totalFileSizeBytes,
      avgProcessingSeconds,
      latestUploadIso,
      modelsPerWeek,
      elementsByModel,
      storeysByModel,
      sizesByModel,
      isLoading,
    };
  }, [data, isLoading]);
}
