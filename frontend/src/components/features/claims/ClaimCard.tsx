import { useTranslation } from 'react-i18next';
import { Flame, Wind, Thermometer, Volume2, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { ClaimListItem, ClaimStatus } from '@/lib/claims-types';
import type { LucideIcon } from 'lucide-react';

interface ClaimCardProps {
  claim: ClaimListItem;
  selected: boolean;
  onSelect: () => void;
  documentName?: string;
}

const PREDICATE_ICONS: Record<string, LucideIcon> = {
  fire_resistance: Flame,
  flow_rate: Wind,
  u_value: Thermometer,
  acoustic: Volume2,
};

const STATUS_STYLES: Record<ClaimStatus, string> = {
  unresolved: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  promoted: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  superseded: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export function ClaimCard({ claim, selected, onSelect, documentName }: ClaimCardProps) {
  const { t } = useTranslation();
  const predicate = claim.normalized?.predicate;
  const PredicateIcon = (predicate && PREDICATE_ICONS[predicate]) || FileText;
  const confidencePct = Math.round((claim.confidence ?? 0) * 100);
  const page = claim.normalized?.lang ? null : null;
  void page; // page is on source_location, not normalized; included in detail pane

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left rounded-md border px-3 py-2.5 transition-colors',
        'flex flex-col gap-1.5',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border hover:border-primary/50 hover:bg-muted/40',
      )}
    >
      <div className="flex items-start gap-2">
        <PredicateIcon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-sm leading-snug line-clamp-2">{claim.snippet}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {predicate && (
          <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
            {t(`claims.predicates.${predicate}`, { defaultValue: predicate })}
          </Badge>
        )}
        <span
          className={cn(
            'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
            STATUS_STYLES[claim.status],
          )}
        >
          {t(`claims.status.${claim.status}`)}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {confidencePct}% {t('claims.confidence')}
        </span>
        {documentName && (
          <span className="text-[10px] text-muted-foreground truncate max-w-[180px]" title={documentName}>
            · {documentName}
          </span>
        )}
      </div>
    </button>
  );
}
