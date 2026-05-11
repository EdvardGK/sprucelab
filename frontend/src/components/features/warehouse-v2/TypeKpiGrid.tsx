import { useTranslation } from 'react-i18next';
import { Layers, Boxes, Hash, AlertTriangle } from 'lucide-react';

import { DashboardTile } from '@/components/Layout';
import { cn } from '@/lib/utils';

export interface TypeKpiStats {
  totalTypes: number;
  ifcClasses: number;
  instances: number;
  missingClassification: number;
}

interface TypeKpiGridProps {
  stats: TypeKpiStats;
  loading?: boolean;
}

export function TypeKpiGrid({ stats, loading }: TypeKpiGridProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 h-full">
      <KpiCard
        id="kpi-total-types"
        icon={<Layers className="h-4 w-4" />}
        label={t('typesV2.stats.totalTypes')}
        value={stats.totalTypes}
        loading={loading}
      />
      <KpiCard
        id="kpi-ifc-classes"
        icon={<Boxes className="h-4 w-4" />}
        label={t('typesV2.stats.ifcClasses')}
        value={stats.ifcClasses}
        loading={loading}
      />
      <KpiCard
        id="kpi-instances"
        icon={<Hash className="h-4 w-4" />}
        label={t('typesV2.stats.instances')}
        value={stats.instances}
        loading={loading}
      />
      <KpiCard
        id="kpi-missing"
        icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
        label={t('typesV2.stats.missingClassification')}
        value={stats.missingClassification}
        loading={loading}
        tone={stats.missingClassification > 0 ? 'warning' : 'neutral'}
      />
    </div>
  );
}

interface KpiCardProps {
  id: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  loading?: boolean;
  tone?: 'neutral' | 'warning';
}

function KpiCard({ id, icon, label, value, loading, tone = 'neutral' }: KpiCardProps) {
  return (
    <DashboardTile id={id} className="p-4 flex flex-col justify-between h-full">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[0.7rem] uppercase tracking-wide font-medium">{label}</span>
        {icon}
      </div>
      <div
        className={cn(
          'text-3xl font-semibold tabular-nums tracking-tight',
          tone === 'warning' && 'text-amber-600 dark:text-amber-400'
        )}
      >
        {loading ? (
          <span className="inline-block h-9 w-20 bg-muted/50 rounded animate-pulse" />
        ) : (
          value.toLocaleString()
        )}
      </div>
    </DashboardTile>
  );
}
