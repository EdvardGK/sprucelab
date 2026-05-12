import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, Layers, Package, Box, HardDrive } from 'lucide-react';

import { Sparkline, type SparkSegment } from '@/components/features/warehouse-v2/Sparkline';
import { ModelsKpiTile } from '@/components/features/project-models/ModelsKpiTile';
import { formatFileSize } from '@/lib/format';
import type { ProjectsKpis, ProjectKpiSpark } from '@/hooks/useProjectsKpis';

const SPARK_PALETTE = [
  '#157954', '#C7CEE8', '#D0D34D', '#21263A', '#2dd4a0',
  '#fb923c', '#f87171', '#818cf8', '#38bdf8', '#a78bfa',
  '#34d399', '#fbbf24',
];

function toSegments(items: ProjectKpiSpark[]): SparkSegment[] {
  return items.map((it, i) => ({
    key: it.key,
    value: it.value,
    color: SPARK_PALETTE[i % SPARK_PALETTE.length],
    label: it.label,
  }));
}

interface ProjectsGalleryKpisProps {
  kpis: ProjectsKpis;
}

/**
 * Project-level KPI row for the Projects Gallery page. Mirrors the
 * `<ModelsKpiRow>` aesthetic on the IFC Models page so the project-tier
 * and model-tier surfaces rhyme visually.
 *
 * Five tiles: projects, models, types, instances, storage. All use
 * `useCountUp` (or `display` for variable-unit values like storage) and
 * a per-project sparkline distribution where meaningful.
 *
 * Layout: 2 → 3 → 5 across breakpoints so the row stays a single line on
 * the 27" target while wrapping cleanly on a laptop.
 */
export function ProjectsGalleryKpis({ kpis }: ProjectsGalleryKpisProps) {
  const { t } = useTranslation();

  const modelsSegs = useMemo(() => toSegments(kpis.modelsByProject), [kpis.modelsByProject]);
  const instancesSegs = useMemo(
    () => toSegments(kpis.instancesByProject),
    [kpis.instancesByProject]
  );
  const storageSegs = useMemo(() => toSegments(kpis.storageByProject), [kpis.storageByProject]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-[clamp(0.5rem,1vw,1rem)]">
      <ModelsKpiTile
        id="gallery-kpi-projects"
        icon={<Folder className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('projectsGallery.kpi.projects')}
        value={kpis.totalProjects}
        loading={kpis.isLoading}
      />
      <ModelsKpiTile
        id="gallery-kpi-models"
        icon={<Layers className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('projectsGallery.kpi.models')}
        value={kpis.totalModels}
        loading={kpis.isLoading}
        spark={<Sparkline segments={modelsSegs} variant="stacked" />}
      />
      <ModelsKpiTile
        id="gallery-kpi-types"
        icon={<Package className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('projectsGallery.kpi.types')}
        value={kpis.totalTypes ?? 0}
        unavailable={kpis.totalTypes === null}
        loading={kpis.isLoading}
      />
      <ModelsKpiTile
        id="gallery-kpi-instances"
        icon={<Box className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('projectsGallery.kpi.instances')}
        value={kpis.totalInstances}
        loading={kpis.isLoading}
        spark={<Sparkline segments={instancesSegs} variant="stacked" />}
      />
      <ModelsKpiTile
        id="gallery-kpi-storage"
        icon={<HardDrive className="h-[clamp(0.875rem,1.4vw,1.25rem)] w-[clamp(0.875rem,1.4vw,1.25rem)]" />}
        label={t('projectsGallery.kpi.storage')}
        display={kpis.isLoading ? undefined : formatFileSize(kpis.totalStorageBytes)}
        loading={kpis.isLoading}
        spark={<Sparkline segments={storageSegs} variant="stacked" />}
      />
    </div>
  );
}
