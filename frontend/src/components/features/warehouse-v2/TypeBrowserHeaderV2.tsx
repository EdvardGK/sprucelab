import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Layers, Boxes, Hash } from 'lucide-react';

import { DashboardTile } from '@/components/Layout';

interface HeaderStats {
  totalTypes: number;
  ifcClasses: number;
  instances: number;
  mappedPercent: number;
}

interface TypeBrowserHeaderV2Props {
  stats: HeaderStats;
  loading?: boolean;
}

export function TypeBrowserHeaderV2({ stats, loading }: TypeBrowserHeaderV2Props) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const switchToV1 = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('v');
    setSearchParams(next, { replace: false });
  };

  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('typesV2.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('typesV2.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={switchToV1}
          className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
        >
          {t('typesV2.tryV1Link')}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          id="stat-total-types"
          icon={<Layers className="h-4 w-4" />}
          label={t('typesV2.stats.totalTypes')}
          value={stats.totalTypes}
          loading={loading}
        />
        <StatTile
          id="stat-ifc-classes"
          icon={<Boxes className="h-4 w-4" />}
          label={t('typesV2.stats.ifcClasses')}
          value={stats.ifcClasses}
          loading={loading}
        />
        <StatTile
          id="stat-instances"
          icon={<Hash className="h-4 w-4" />}
          label={t('typesV2.stats.instances')}
          value={stats.instances}
          loading={loading}
        />
        <StatTile
          id="stat-mapped"
          icon={<Layers className="h-4 w-4" />}
          label={t('typesV2.stats.mapped')}
          value={stats.mappedPercent}
          suffix="%"
          loading={loading}
        />
      </div>
    </header>
  );
}

interface StatTileProps {
  id: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
  loading?: boolean;
}

function StatTile({ id, icon, label, value, suffix, loading }: StatTileProps) {
  return (
    <DashboardTile id={id} className="p-4">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">
        {loading ? (
          <span className="inline-block h-7 w-16 bg-muted/50 rounded animate-pulse" />
        ) : (
          <>
            {value.toLocaleString()}
            {suffix ?? ''}
          </>
        )}
      </div>
    </DashboardTile>
  );
}
