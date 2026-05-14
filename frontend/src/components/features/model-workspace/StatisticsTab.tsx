import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

import { DashboardTile } from '@/components/Layout';
import { useModelAnalysis } from '@/hooks/use-model-analysis';
import { Sparkline, type SparkSegment } from '@/components/features/warehouse-v2/Sparkline';
import { tokens } from '@/lib/design-tokens';

const PALETTE = tokens.dataPalette.slots;

export interface StatisticsTabProps {
  modelId: string;
}

/**
 * Statistics surface for a single model. Re-implements the small chunk
 * of math we need inline — by design, this tab MUST NOT import from
 * warehouse-v2 (the Type-page wall stays intact). All input comes from
 * `useModelAnalysis()`, already polled by the Overview surface.
 */
export function StatisticsTab({ modelId }: StatisticsTabProps) {
  const { t } = useTranslation();
  const { data: analysis, isLoading } = useModelAnalysis(modelId);

  const { byClass, totalInstances, byRep, topN } = useMemo(() => {
    if (!analysis) {
      return {
        byClass: [] as { label: string; types: number; instances: number; color: string }[],
        totalInstances: 0,
        byRep: [] as SparkSegment[],
        topN: [] as { label: string; ifcClass: string; count: number; color: string }[],
      };
    }

    const classTypes: Record<string, number> = {};
    const classInstances: Record<string, number> = {};
    const repCounts: Record<string, number> = {};
    let total = 0;

    for (const tp of analysis.types) {
      const cls = (tp.element_class || tp.type_class.replace(/Type$/, '')).replace(
        /^Ifc/,
        ''
      );
      classTypes[cls] = (classTypes[cls] || 0) + 1;
      classInstances[cls] = (classInstances[cls] || 0) + tp.instance_count;
      total += tp.instance_count;
      if (tp.primary_representation && tp.instance_count > 0) {
        repCounts[tp.primary_representation] =
          (repCounts[tp.primary_representation] || 0) + tp.instance_count;
      }
    }

    const sortedClasses = Object.entries(classInstances)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([label, instances], i) => ({
        label,
        instances,
        types: classTypes[label] ?? 0,
        color: PALETTE[i % PALETTE.length],
      }));

    const repSegments: SparkSegment[] = Object.entries(repCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key, value], i) => ({
        key,
        value,
        color: PALETTE[i % PALETTE.length],
        label: key,
      }));

    const top = [...analysis.types]
      .sort((a, b) => b.instance_count - a.instance_count)
      .slice(0, 10)
      .map((tp, i) => ({
        label:
          tp.type_name ||
          tp.type_class.replace(/Type$/, '').replace(/^Ifc/, ''),
        ifcClass: (tp.element_class || tp.type_class).replace(/^Ifc/, ''),
        count: tp.instance_count,
        color: PALETTE[i % PALETTE.length],
      }));

    return { byClass: sortedClasses, totalInstances: total, byRep: repSegments, topN: top };
  }, [analysis]);

  if (isLoading) {
    return (
      <div className="p-[clamp(1rem,2vw,1.5rem)] flex items-center justify-center min-h-[20vh]">
        <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="p-[clamp(1rem,2vw,1.5rem)] text-center text-text-tertiary text-sm">
        {t('modelDash.stats.noAnalysis')}
      </div>
    );
  }

  const maxClassValue = Math.max(...byClass.map((c) => c.instances), 1);

  return (
    <div className="p-[clamp(0.75rem,1.5vw,1rem)] flex flex-col gap-[clamp(0.4rem,0.8vw,0.75rem)]">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[clamp(0.4rem,0.8vw,0.75rem)]">
        {/* Types-by-class bar chart — spans 2 columns on lg+ */}
        <DashboardTile
          id="stats-classes"
          className="lg:col-span-2 p-[clamp(0.75rem,1.5vw,1rem)] flex flex-col gap-[clamp(0.4rem,0.8vw,0.75rem)]"
        >
          <header className="flex items-baseline justify-between">
            <h3 className="text-[clamp(0.7rem,1.1vw,0.9rem)] font-semibold text-text-primary">
              {t('modelDash.stats.typesByClass')}
            </h3>
            <span className="text-[clamp(0.55rem,0.7vw,0.7rem)] text-text-tertiary tabular-nums">
              {t('modelDash.stats.totalsLine', {
                types: analysis.total_types.toLocaleString(),
                instances: totalInstances.toLocaleString(),
              })}
            </span>
          </header>
          {byClass.length === 0 ? (
            <p className="text-[clamp(0.6rem,0.8vw,0.8rem)] text-text-tertiary">
              {t('modelDash.stats.noClasses')}
            </p>
          ) : (
            <ul className="flex flex-col gap-[clamp(0.2rem,0.35vh,0.4rem)]">
              {byClass.map((row) => {
                const widthPct = (row.instances / maxClassValue) * 100;
                return (
                  <li
                    key={row.label}
                    className="grid items-center gap-[clamp(0.3rem,0.6vw,0.5rem)] text-[clamp(0.55rem,0.7vw,0.75rem)]"
                    style={{
                      gridTemplateColumns: 'minmax(0, 8rem) 1fr auto auto',
                    }}
                  >
                    <span
                      className="truncate text-text-secondary"
                      title={row.label}
                    >
                      {row.label}
                    </span>
                    <div className="h-[clamp(0.6rem,1vw,0.85rem)] bg-white/5 rounded overflow-hidden">
                      <div
                        className="h-full rounded transition-[width] duration-700 ease-out"
                        style={{
                          width: `${widthPct}%`,
                          background: row.color,
                          opacity: 0.85,
                        }}
                      />
                    </div>
                    <span className="text-text-tertiary tabular-nums font-mono w-[4em] text-right">
                      {row.types}
                      <span className="opacity-50"> t</span>
                    </span>
                    <span className="text-text-primary tabular-nums font-medium w-[5em] text-right">
                      {row.instances.toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </DashboardTile>

        {/* Representation distribution sparkline */}
        <DashboardTile
          id="stats-repdist"
          className="p-[clamp(0.75rem,1.5vw,1rem)] flex flex-col gap-[clamp(0.4rem,0.8vw,0.75rem)]"
        >
          <h3 className="text-[clamp(0.7rem,1.1vw,0.9rem)] font-semibold text-text-primary">
            {t('modelDash.stats.repDistribution')}
          </h3>
          {byRep.length === 0 ? (
            <p className="text-[clamp(0.6rem,0.8vw,0.8rem)] text-text-tertiary">
              {t('modelDash.stats.noRepData')}
            </p>
          ) : (
            <>
              <Sparkline segments={byRep} variant="stacked" />
              <ul className="flex flex-col gap-[clamp(0.15rem,0.25vh,0.3rem)] text-[clamp(0.55rem,0.7vw,0.7rem)] mt-[clamp(0.25rem,0.4vh,0.4rem)]">
                {byRep.map((seg) => (
                  <li
                    key={seg.key}
                    className="flex items-center gap-2 min-w-0"
                  >
                    <span
                      className="h-[clamp(0.45rem,0.6vw,0.55rem)] w-[clamp(0.45rem,0.6vw,0.55rem)] rounded-sm shrink-0"
                      style={{ background: seg.color }}
                    />
                    <span className="text-text-secondary truncate flex-1">
                      {seg.label ?? seg.key}
                    </span>
                    <span className="text-text-primary tabular-nums font-medium">
                      {seg.value.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </DashboardTile>
      </div>

      {/* Top-N types */}
      <DashboardTile
        id="stats-topn"
        className="p-[clamp(0.75rem,1.5vw,1rem)] flex flex-col gap-[clamp(0.4rem,0.8vw,0.75rem)]"
      >
        <header className="flex items-baseline justify-between">
          <h3 className="text-[clamp(0.7rem,1.1vw,0.9rem)] font-semibold text-text-primary">
            {t('modelDash.stats.topTypes')}
          </h3>
          <span className="text-[clamp(0.55rem,0.7vw,0.7rem)] text-text-tertiary">
            {t('modelDash.stats.topN', { n: topN.length })}
          </span>
        </header>
        {topN.length === 0 ? (
          <p className="text-[clamp(0.6rem,0.8vw,0.8rem)] text-text-tertiary">
            {t('modelDash.stats.noTypes')}
          </p>
        ) : (
          <ol className="flex flex-col gap-[clamp(0.2rem,0.35vh,0.4rem)]">
            {topN.map((row, i) => {
              const widthPct =
                topN[0].count > 0 ? (row.count / topN[0].count) * 100 : 0;
              return (
                <li
                  key={`${row.label}-${i}`}
                  className="grid items-center gap-[clamp(0.3rem,0.6vw,0.5rem)] text-[clamp(0.55rem,0.7vw,0.75rem)]"
                  style={{
                    gridTemplateColumns: 'auto minmax(0, 14rem) auto 1fr auto',
                  }}
                >
                  <span className="text-text-tertiary tabular-nums font-mono w-[1.5em]">
                    {i + 1}
                  </span>
                  <span
                    className="text-text-secondary truncate"
                    title={row.label}
                  >
                    {row.label}
                  </span>
                  <span
                    className="text-text-tertiary font-mono text-[clamp(0.5rem,0.65vw,0.65rem)]"
                    title={row.ifcClass}
                  >
                    {row.ifcClass}
                  </span>
                  <div className="h-[clamp(0.5rem,0.8vw,0.7rem)] bg-white/5 rounded overflow-hidden">
                    <div
                      className="h-full rounded transition-[width] duration-700 ease-out"
                      style={{
                        width: `${widthPct}%`,
                        background: row.color,
                        opacity: 0.85,
                      }}
                    />
                  </div>
                  <span className="text-text-primary tabular-nums font-medium w-[5em] text-right">
                    {row.count.toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </DashboardTile>
    </div>
  );
}
