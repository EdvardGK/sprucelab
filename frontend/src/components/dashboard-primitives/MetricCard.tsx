import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  levelForFraction,
  trafficLight,
  type TrafficLightLevel,
} from '@/lib/discipline-tokens';

/**
 * MetricCard — a single big-number tile with optional fraction-based
 * traffic-light tint. The first dashboard primitive lifted from the
 * skiplum-pages visual idiom (KPI grid in `_index.html.j2`).
 *
 * Composes `components/ui/card.tsx` (shadcn primitive); does not fork.
 * Future primitives (`CoverageBar`, `TrafficLightBadge`, `DisciplineRow`,
 * `Sidebar.NavSection`) follow the same composition pattern.
 *
 * Not yet rendered in any existing route — exported so PR #6's
 * `TypeBrowser` tile has a target import path. See README in this
 * directory for the contract vs. `components/ui/`.
 */

export interface MetricCardProps {
  /** i18n key passed through `t()` for the metric label. */
  labelKey: string;
  /** Pre-formatted big number. Caller owns formatting (locale, units, etc.). */
  value: string;
  /**
   * Optional 0–1 fraction; when set, drives the traffic-light tint.
   * Pass `undefined` for a neutral card.
   */
  fraction?: number;
  /**
   * Optional explicit level override. Wins over `fraction` when both
   * are set. Useful when level is computed upstream.
   */
  level?: TrafficLightLevel;
  /** Optional supporting line under the big number (e.g. "234 / 892"). */
  helperKey?: string;
  /** Variables injected into the helper translation. */
  helperValues?: Record<string, string | number>;
  className?: string;
}

export const MetricCard = React.forwardRef<HTMLDivElement, MetricCardProps>(
  ({ labelKey, value, fraction, level, helperKey, helperValues, className }, ref) => {
    const { t } = useTranslation();
    const resolved: TrafficLightLevel | null =
      level ?? (fraction !== undefined ? levelForFraction(fraction) : null);
    const tint = resolved ? trafficLight[resolved] : null;

    const tintStyle: React.CSSProperties | undefined = tint
      ? { backgroundColor: tint.bg, color: tint.text }
      : undefined;

    return (
      <Card ref={ref} className={cn('overflow-hidden', className)} style={tintStyle}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium opacity-80">{t(labelKey)}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold leading-tight tracking-tight">{value}</div>
          {helperKey ? (
            <div className="mt-1 text-xs opacity-70">{t(helperKey, helperValues)}</div>
          ) : null}
        </CardContent>
      </Card>
    );
  },
);
MetricCard.displayName = 'MetricCard';
