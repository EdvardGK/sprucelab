import { useTranslation } from 'react-i18next';
import { Check, X, Replace, Loader2, AlertTriangle, FileText, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useClaimDetail, useClaimConflicts } from '@/hooks/use-claims';
import type { ClaimListItem, ClaimStatus } from '@/lib/claims-types';
import { StoreyListClaimPanel } from './StoreyListClaimPanel';

interface ClaimDetailProps {
  claimId: string | null;
  onApprove: () => void;
  onReject: () => void;
  onSupersede: () => void;
  isApproving?: boolean;
  approveError?: string | null;
}

const STATUS_STYLES: Record<ClaimStatus, string> = {
  unresolved: 'bg-amber-100 text-amber-800',
  promoted: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  superseded: 'bg-slate-100 text-slate-700',
};

export function ClaimDetail({
  claimId,
  onApprove,
  onReject,
  onSupersede,
  isApproving,
  approveError,
}: ClaimDetailProps) {
  const { t } = useTranslation();
  const { data: claim, isLoading } = useClaimDetail(claimId);
  const { data: conflicts } = useClaimConflicts(claimId, { enabled: !!claim });

  if (!claimId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Inbox className="h-10 w-10 mb-2 opacity-30" />
        <p className="text-sm">{t('claims.detail.noSelection')}</p>
      </div>
    );
  }

  if (isLoading || !claim) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const normalized = claim.normalized || {};
  const sourceLocation = claim.source_location || {};
  const isUnresolved = claim.status === 'unresolved';
  const confidencePct = Math.round((claim.confidence ?? 0) * 100);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={cn(
                  'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium',
                  STATUS_STYLES[claim.status],
                )}
              >
                {t(`claims.status.${claim.status}`)}
              </span>
              {normalized.predicate && (
                <Badge variant="outline" className="text-xs font-mono">
                  {t(`claims.predicates.${normalized.predicate}`, {
                    defaultValue: String(normalized.predicate),
                  })}
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs">
                {t(`claims.types.${claim.claim_type}`, { defaultValue: claim.claim_type })}
              </Badge>
              <span className="text-xs text-muted-foreground">{confidencePct}%</span>
            </div>
            <p className="text-sm font-medium leading-relaxed">{claim.statement}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={onApprove}
            disabled={!isUnresolved || isApproving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isApproving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5 mr-1.5" />
            )}
            {t('claims.actions.promote')}{' '}
            <kbd className="ml-1.5 px-1 rounded bg-emerald-700/40 text-[10px]">A</kbd>
          </Button>
          <Button size="sm" variant="outline" onClick={onReject} disabled={!isUnresolved}>
            <X className="h-3.5 w-3.5 mr-1.5" />
            {t('claims.actions.reject')}{' '}
            <kbd className="ml-1.5 px-1 rounded bg-muted text-[10px]">R</kbd>
          </Button>
          <Button size="sm" variant="outline" onClick={onSupersede} disabled={!isUnresolved}>
            <Replace className="h-3.5 w-3.5 mr-1.5" />
            {t('claims.actions.supersede')}{' '}
            <kbd className="ml-1.5 px-1 rounded bg-muted text-[10px]">S</kbd>
          </Button>
        </div>

        {approveError && (
          <div className="mt-2 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 rounded-md px-2 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{approveError}</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {claim.claim_type === 'storey_list' ? (
          <StoreyListClaimPanel claim={claim} />
        ) : (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {t('claims.detail.normalized')}
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label={t('claims.detail.predicate')} value={normalized.predicate as string} />
              <Field label={t('claims.detail.subject')} value={normalized.subject as string} />
              <Field
                label={t('claims.detail.value')}
                value={
                  normalized.value !== undefined
                    ? `${normalized.value}${normalized.units ? ` ${normalized.units}` : ''}`
                    : null
                }
              />
              <Field label={t('claims.detail.lang')} value={normalized.lang as string} />
            </div>
          </section>
        )}

        {/* Provenance */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {t('claims.detail.provenance')}
          </h3>
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{claim.original_filename}</span>
              {sourceLocation.page !== undefined && (
                <span className="text-xs text-muted-foreground">
                  · {t('claims.detail.page')} {sourceLocation.page}
                </span>
              )}
            </div>
            {sourceLocation.char_start !== undefined && (
              <div className="text-xs text-muted-foreground">
                {t('claims.detail.charRange', {
                  start: sourceLocation.char_start,
                  end: sourceLocation.char_end ?? sourceLocation.char_start,
                })}
              </div>
            )}
          </div>
        </section>

        {/* Decision history */}
        {(claim.status !== 'unresolved' || claim.rejected_reason || claim.config_section) && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {t('claims.detail.decision')}
            </h3>
            <div className="space-y-1.5 text-sm">
              {claim.decided_at && (
                <div>
                  <span className="text-muted-foreground">{t('claims.detail.decidedAt')}: </span>
                  <span>{new Date(claim.decided_at).toLocaleString()}</span>
                </div>
              )}
              {claim.config_section && (
                <div>
                  <span className="text-muted-foreground">{t('claims.detail.configSection')}: </span>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{claim.config_section}</code>
                </div>
              )}
              {claim.rejected_reason && (
                <div>
                  <span className="text-muted-foreground">{t('claims.detail.rejectedReason')}: </span>
                  <span>{claim.rejected_reason}</span>
                </div>
              )}
              {claim.superseded_by && (
                <div>
                  <span className="text-muted-foreground">{t('claims.detail.supersededBy')}: </span>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{claim.superseded_by}</code>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Conflicts */}
        {conflicts && conflicts.count > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              {t('claims.detail.conflicts')} ({conflicts.count})
            </h3>
            <ul className="space-y-1.5">
              {conflicts.results.map((rival: ClaimListItem) => (
                <li
                  key={rival.id}
                  className="text-sm rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2"
                >
                  <div className="line-clamp-2">{rival.snippet}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {t(`claims.status.${rival.status}`)}
                    {rival.normalized?.value !== undefined && (
                      <>
                        {' · '}
                        {String(rival.normalized.value)}
                        {rival.normalized.units ? ` ${rival.normalized.units}` : ''}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">
        {value || <span className="text-muted-foreground italic">—</span>}
      </span>
    </div>
  );
}
