import { useMemo } from 'react';

import { useProjects } from './use-projects';
import { useModels } from './use-models';
import type { Model, Project } from '@/lib/api-types';

export interface ProjectKpiSpark {
  /** Stable per-segment key. */
  key: string;
  /** Numeric contribution to the distribution. */
  value: number;
  /** Optional accessible label shown via <title>. */
  label?: string;
}

export interface ProjectsKpis {
  totalProjects: number;
  totalModels: number;
  /**
   * Total types across all projects — backend doesn't expose this on the
   * project list payload yet, so we mark it unavailable. Modelers-own-data:
   * never fabricate.
   */
  totalTypes: number | null;
  totalInstances: number;
  totalStorageBytes: number;

  // Per-project distribution sparklines.
  modelsByProject: ProjectKpiSpark[];
  instancesByProject: ProjectKpiSpark[];
  storageByProject: ProjectKpiSpark[];

  isLoading: boolean;
}

const EMPTY: ProjectsKpis = {
  totalProjects: 0,
  totalModels: 0,
  totalTypes: null,
  totalInstances: 0,
  totalStorageBytes: 0,
  modelsByProject: [],
  instancesByProject: [],
  storageByProject: [],
  isLoading: false,
};

/**
 * Build the project-level KPI row for the Projects Gallery from
 * `useProjects()` + `useModels()` (no project filter — paginated list
 * across all projects). Every value here is derived; no extra endpoints.
 *
 * Fields the backend doesn't expose on the gallery surface
 * (`totalTypes`) come back as null so the UI can render an amber
 * em-dash per the modelers-own-data rule. Backend exposing
 * /projects/?fields=type_count is the future cleanup.
 */
export function useProjectsKpis(): ProjectsKpis {
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: models, isLoading: modelsLoading } = useModels();

  return useMemo(() => {
    const isLoading = projectsLoading || modelsLoading;

    if (!projects || projects.length === 0) {
      return { ...EMPTY, isLoading };
    }

    // Index models per project (latest version per name, mirroring the
    // gallery card rule). When `useModels()` returns nothing we still
    // produce KPIs from the project list itself.
    const modelsByProjectId = new Map<string, Model[]>();
    for (const m of models ?? []) {
      const arr = modelsByProjectId.get(m.project) ?? [];
      arr.push(m);
      modelsByProjectId.set(m.project, arr);
    }

    // Per-project latest-version reduction.
    const latestByProject = new Map<string, Model[]>();
    for (const [pid, arr] of modelsByProjectId.entries()) {
      const latestByName = new Map<string, Model>();
      for (const m of arr) {
        const existing = latestByName.get(m.name);
        if (!existing || m.version_number > existing.version_number) {
          latestByName.set(m.name, m);
        }
      }
      latestByProject.set(pid, [...latestByName.values()]);
    }

    const totalProjects = projects.length;
    const totalModels = projects.reduce((s, p) => s + (p.model_count || 0), 0);

    const totalStorageBytes = [...latestByProject.values()]
      .flat()
      .reduce((s, m) => s + (m.file_size || 0), 0);
    const totalInstances = [...latestByProject.values()]
      .flat()
      .reduce((s, m) => s + (m.element_count || 0), 0);

    // Distribution sparklines — top 8 projects per metric. Falls through
    // to an empty distribution when nothing useful exists yet.
    const projectName = (id: string): string =>
      projects.find((p) => p.id === id)?.name ?? id;

    const modelsByProject: ProjectKpiSpark[] = projects
      .filter((p) => (p.model_count || 0) > 0)
      .sort((a, b) => (b.model_count || 0) - (a.model_count || 0))
      .slice(0, 8)
      .map((p) => ({ key: p.id, value: p.model_count || 0, label: p.name }));

    const projectInstances: Array<{ id: string; v: number }> = [];
    const projectStorage: Array<{ id: string; v: number }> = [];
    for (const [pid, arr] of latestByProject.entries()) {
      const inst = arr.reduce((s, m) => s + (m.element_count || 0), 0);
      const sz = arr.reduce((s, m) => s + (m.file_size || 0), 0);
      if (inst > 0) projectInstances.push({ id: pid, v: inst });
      if (sz > 0) projectStorage.push({ id: pid, v: sz });
    }

    const instancesByProject: ProjectKpiSpark[] = projectInstances
      .sort((a, b) => b.v - a.v)
      .slice(0, 8)
      .map((p) => ({ key: p.id, value: p.v, label: projectName(p.id) }));

    const storageByProject: ProjectKpiSpark[] = projectStorage
      .sort((a, b) => b.v - a.v)
      .slice(0, 8)
      .map((p) => ({ key: p.id, value: p.v, label: projectName(p.id) }));

    // TODO: backend exposes /projects/?fields=type_count — until then,
    // surface as null so the KPI tile shows an amber em-dash rather than
    // a fabricated count. Modelers-own-data: never fabricate.
    const totalTypes: number | null = null;

    return {
      totalProjects,
      totalModels,
      totalTypes,
      totalInstances,
      totalStorageBytes,
      modelsByProject,
      instancesByProject,
      storageByProject,
      isLoading,
    };
  }, [projects, models, projectsLoading, modelsLoading]);
}

/**
 * Per-project IFC class distribution sparkbar — built from `useModels()`
 * filtered to that project. Returns top-N discipline segments so the
 * card sparkbar reads without exploding the legend.
 */
export function buildProjectDistribution(
  models: Model[],
  topN = 8
): ProjectKpiSpark[] {
  const buckets = new Map<string, number>();
  for (const m of models) {
    const key = m.discipline || 'UNSPEC';
    buckets.set(key, (buckets.get(key) || 0) + Math.max(1, m.element_count || 1));
  }
  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([key, v]) => ({ key, value: v, label: key }));
}

export function modelsForProject(
  models: Model[] | undefined,
  projectId: string
): Model[] {
  if (!models) return [];
  // Reduce to latest version per name within the project.
  const inProject = models.filter((m) => m.project === projectId);
  const latestByName = new Map<string, Model>();
  for (const m of inProject) {
    const existing = latestByName.get(m.name);
    if (!existing || m.version_number > existing.version_number) {
      latestByName.set(m.name, m);
    }
  }
  return [...latestByName.values()];
}

/** Helper for typing the consuming tile. */
export type _ProjectListItem = Project;
