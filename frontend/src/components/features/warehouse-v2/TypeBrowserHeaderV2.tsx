import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

import { cn } from '@/lib/utils';

interface HeaderStats {
  totalTypes: number;
  ifcClasses: number;
  instances: number;
  missingClassification: number;
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
    <header className="flex items-center justify-between gap-4 flex-wrap flex-shrink-0">
      <div className="flex items-baseline gap-4 flex-wrap">
        <h1 className="text-lg font-semibold tracking-tight">{t('typesV2.title')}</h1>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Metric label={t('typesV2.stats.totalTypes')} value={stats.totalTypes} loading={loading} />
          <Divider />
          <Metric label={t('typesV2.stats.ifcClasses')} value={stats.ifcClasses} loading={loading} />
          <Divider />
          <Metric label={t('typesV2.stats.instances')} value={stats.instances} loading={loading} />
          {stats.missingClassification > 0 && (
            <>
              <Divider />
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                <span className="font-medium tabular-nums">{stats.missingClassification.toLocaleString()}</span>
                <span>{t('typesV2.stats.missingClassification')}</span>
              </span>
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={switchToV1}
        className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
      >
        {t('typesV2.tryV1Link')}
      </button>
    </header>
  );
}

function Metric({
  label,
  value,
  loading,
  className,
}: {
  label: string;
  value: number;
  loading?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="font-semibold tabular-nums text-foreground">
        {loading ? (
          <span className="inline-block h-3 w-6 bg-muted/50 rounded animate-pulse align-middle" />
        ) : (
          value.toLocaleString()
        )}
      </span>
      <span>{label}</span>
    </span>
  );
}

function Divider() {
  return <span className="text-muted-foreground/40">·</span>;
}
