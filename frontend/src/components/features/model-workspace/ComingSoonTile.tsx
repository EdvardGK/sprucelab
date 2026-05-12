import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';

import { DashboardTile } from '@/components/Layout';

export interface ComingSoonTileProps {
  /** Localized heading (e.g. tab name). */
  title: string;
  /** Localized roadmap hint shown under the muted "Coming next round" line. */
  roadmap?: string;
}

/**
 * Empty-state wrapper for stubbed tabs. Same DashboardTile shell the rest
 * of the page uses — no bespoke modal / centred Card pattern. Modelers
 * looking at this should immediately recognise it as a tab that will be
 * built, not a feature that's broken.
 */
export function ComingSoonTile({ title, roadmap }: ComingSoonTileProps) {
  const { t } = useTranslation();
  return (
    <div className="p-[clamp(0.75rem,1.5vw,1rem)]">
      <DashboardTile
        id={`coming-soon-${title.toLowerCase()}`}
        className="p-[clamp(1rem,2vw,1.5rem)] min-h-[clamp(8rem,20vh,14rem)] flex flex-col items-center justify-center text-center gap-[clamp(0.5rem,1vh,0.75rem)]"
      >
        <Sparkles className="h-[clamp(1.25rem,2vw,1.75rem)] w-[clamp(1.25rem,2vw,1.75rem)] text-text-tertiary/60" />
        <h3 className="text-[clamp(0.9rem,1.4vw,1.25rem)] font-semibold text-text-primary">
          {title}
        </h3>
        <p className="text-[clamp(0.65rem,0.85vw,0.85rem)] text-text-tertiary">
          {t('modelDash.comingSoon.nextRound')}
        </p>
        {roadmap && (
          <p className="text-[clamp(0.6rem,0.75vw,0.75rem)] text-text-tertiary/80 max-w-[40ch]">
            {roadmap}
          </p>
        )}
      </DashboardTile>
    </div>
  );
}
