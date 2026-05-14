import { AlertTriangle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  useActiveFilterCount,
  useProjectFilterActions,
} from '@/contexts/ProjectFilterProvider';

interface FilteredEmptyBannerProps {
  /** Rows in the current filtered result set. */
  filteredCount: number;
  /** Rows in the underlying unfiltered universe. */
  totalCount: number;
  /** What the rows represent — "types", "instances", "materials", etc. */
  noun?: string;
  className?: string;
}

export function FilteredEmptyBanner({
  filteredCount,
  totalCount,
  noun,
  className,
}: FilteredEmptyBannerProps) {
  const { t } = useTranslation();
  const activeFilterCount = useActiveFilterCount();
  const { clearDimensions } = useProjectFilterActions();

  if (activeFilterCount === 0 || filteredCount > 0 || totalCount === 0) {
    return null;
  }

  const resolvedNoun = noun ?? t('filteredEmpty.defaultNoun');

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        className ??
        'flex items-center justify-between gap-3 rounded-md border border-amber-400/40 bg-amber-400/[0.08] px-3 py-2 text-amber-200'
      }
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span className="text-sm font-medium truncate">
          {t('filteredEmpty.message', {
            total: totalCount.toLocaleString(),
            noun: resolvedNoun,
            count: totalCount,
          })}
        </span>
        <span className="text-xs text-amber-200/70 truncate">
          {t('filteredEmpty.hint', {
            filters: activeFilterCount,
            count: activeFilterCount,
          })}
        </span>
      </div>
      <button
        type="button"
        onClick={() => clearDimensions()}
        className="inline-flex items-center gap-1.5 rounded-md bg-amber-400/20 px-2.5 py-1 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/30 active:bg-amber-400/40 whitespace-nowrap"
        aria-label={t('filteredEmpty.clearAria')}
      >
        <X className="h-3 w-3" />
        {t('filteredEmpty.clear')}
      </button>
    </div>
  );
}
