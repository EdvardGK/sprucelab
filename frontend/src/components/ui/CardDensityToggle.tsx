import { LayoutGrid, Grid3x3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import type { CardDensity } from '@/hooks/useCardDensity';

interface CardDensityToggleProps {
  density: CardDensity;
  onChange: (next: CardDensity) => void;
  className?: string;
}

/**
 * Two-state segmented toggle for card density on galleries.
 * Mirrors the pattern used in tabular-vs-cards toggles elsewhere; keeps
 * the active button visually distinct without going loud.
 */
export function CardDensityToggle({ density, onChange, className }: CardDensityToggleProps) {
  const { t } = useTranslation();

  const buttonBase =
    'inline-flex items-center justify-center h-7 w-7 rounded-sm transition-colors';
  const activeCls = 'bg-muted text-foreground';
  const idleCls = 'text-muted-foreground hover:text-foreground';

  return (
    <div
      role="group"
      aria-label={t('density.toggleLabel')}
      className={cn(
        'inline-flex items-center rounded-md border border-border bg-card p-0.5',
        className
      )}
    >
      <button
        type="button"
        aria-pressed={density === 'big'}
        aria-label={t('density.big')}
        title={t('density.big')}
        onClick={() => onChange('big')}
        className={cn(buttonBase, density === 'big' ? activeCls : idleCls)}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-pressed={density === 'small'}
        aria-label={t('density.small')}
        title={t('density.small')}
        onClick={() => onChange('small')}
        className={cn(buttonBase, density === 'small' ? activeCls : idleCls)}
      >
        <Grid3x3 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
