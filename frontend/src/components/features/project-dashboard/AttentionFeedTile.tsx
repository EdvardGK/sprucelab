import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Inbox } from 'lucide-react';

import { DashboardTile } from '@/components/Layout';
import { useClaimsList } from '@/hooks/use-claims';
import { cn } from '@/lib/utils';
import type { ClaimListItem } from '@/lib/claims-types';

interface AttentionFeedTileProps {
  id: string;
  projectId: string;
  onItemClick?: (claim: ClaimListItem) => void;
}

const TYPE_LABEL_KEY: Record<string, string> = {
  rule: 'projectDash.attention.typeRule',
  spec: 'projectDash.attention.typeSpec',
  requirement: 'projectDash.attention.typeRequirement',
  constraint: 'projectDash.attention.typeConstraint',
  fact: 'projectDash.attention.typeFact',
  storey_list: 'projectDash.attention.typeStoreyList',
};

function severityFromConfidence(confidence: number): 'low' | 'medium' | 'high' {
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}

const SEVERITY_STYLES: Record<'low' | 'medium' | 'high', string> = {
  high: 'bg-red-500/10 text-red-600 dark:text-red-400 ring-1 ring-red-500/20',
  medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20',
  low: 'bg-muted text-muted-foreground ring-1 ring-border',
};

export function AttentionFeedTile({ id, projectId, onItemClick }: AttentionFeedTileProps) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useClaimsList({
    project: projectId,
    status: 'unresolved',
  });

  const items = useMemo(() => (data ?? []).slice(0, 5), [data]);
  const hiddenCount = (data?.length ?? 0) - items.length;

  return (
    <DashboardTile
      id={id}
      className="p-[clamp(0.5rem,1vw,1rem)] flex flex-col h-full"
    >
      <div className="flex items-center justify-between mb-[clamp(0.375rem,0.7vh,0.5rem)]">
        <div className="flex items-center gap-[clamp(0.25rem,0.5vw,0.5rem)] text-muted-foreground">
          <AlertCircle className="h-[clamp(0.75rem,1.2vw,1rem)] w-[clamp(0.75rem,1.2vw,1rem)]" />
          <span className="text-[clamp(0.55rem,0.7vw,0.75rem)] uppercase tracking-wide font-medium">
            {t('projectDash.attention.title')}
          </span>
        </div>
        {items.length > 0 && (
          <span className="text-[clamp(0.55rem,0.7vw,0.75rem)] text-muted-foreground tabular-nums">
            {t('projectDash.attention.openCount', { count: data?.length ?? 0 })}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto -mx-[clamp(0.125rem,0.3vw,0.25rem)] px-[clamp(0.125rem,0.3vw,0.25rem)]">
        {isLoading ? (
          <div className="flex flex-col gap-[clamp(0.25rem,0.5vh,0.5rem)]">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[clamp(1.75rem,4vh,2.5rem)] rounded bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]"
              />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            label={t('projectDash.attention.errorTitle')}
            hint={t('projectDash.attention.errorHint')}
            tone="error"
          />
        ) : items.length === 0 ? (
          <EmptyState
            label={t('projectDash.attention.emptyTitle')}
            hint={t('projectDash.attention.emptyHint')}
          />
        ) : (
          <ul className="flex flex-col gap-[clamp(0.2rem,0.4vh,0.375rem)]">
            {items.map((claim) => {
              const sev = severityFromConfidence(claim.confidence);
              return (
                <li key={claim.id}>
                  <button
                    type="button"
                    onClick={() => onItemClick?.(claim)}
                    className={cn(
                      'w-full text-left rounded px-[clamp(0.375rem,0.6vw,0.625rem)] py-[clamp(0.25rem,0.45vh,0.4rem)]',
                      'flex items-center gap-[clamp(0.375rem,0.6vw,0.625rem)] min-w-0',
                      'hover:bg-muted/60 transition-colors',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
                    )}
                  >
                    <span
                      className={cn(
                        'text-[clamp(0.5rem,0.65vw,0.65rem)] font-semibold uppercase tracking-wide px-[clamp(0.25rem,0.45vw,0.4rem)] py-[clamp(0.05rem,0.1vh,0.1rem)] rounded shrink-0',
                        SEVERITY_STYLES[sev]
                      )}
                    >
                      {t(TYPE_LABEL_KEY[claim.claim_type] ?? 'projectDash.attention.typeFact')}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-[clamp(0.6rem,0.85vw,0.8rem)] text-text-primary">
                      {claim.snippet || claim.normalized.predicate || claim.id}
                    </span>
                    <span className="text-[clamp(0.5rem,0.7vw,0.7rem)] text-muted-foreground tabular-nums shrink-0">
                      {Math.round(claim.confidence * 100)}%
                    </span>
                  </button>
                </li>
              );
            })}
            {hiddenCount > 0 && (
              <li className="text-[clamp(0.55rem,0.7vw,0.7rem)] text-muted-foreground text-center pt-[clamp(0.125rem,0.3vh,0.25rem)]">
                {t('projectDash.attention.moreCount', { count: hiddenCount })}
              </li>
            )}
          </ul>
        )}
      </div>
    </DashboardTile>
  );
}

function EmptyState({
  label,
  hint,
  tone = 'neutral',
}: {
  label: string;
  hint?: string;
  tone?: 'neutral' | 'error';
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-[clamp(0.25rem,0.5vh,0.5rem)] py-[clamp(0.5rem,1vh,1rem)] text-center">
      <Inbox
        className={cn(
          'h-[clamp(1rem,2vw,1.5rem)] w-[clamp(1rem,2vw,1.5rem)]',
          tone === 'error' ? 'text-red-500/70' : 'text-muted-foreground/60'
        )}
      />
      <div className="text-[clamp(0.65rem,0.85vw,0.8rem)] font-medium text-text-primary">{label}</div>
      {hint && (
        <div className="text-[clamp(0.55rem,0.7vw,0.7rem)] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}
