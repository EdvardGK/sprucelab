import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  useClaimsList,
  usePromoteClaim,
  useRejectClaim,
  useSupersedeClaim,
} from '@/hooks/use-claims';
import { useDocumentsList } from '@/hooks/use-documents';
import { useClaimNavigation } from '@/hooks/use-claim-navigation';
import type { ClaimListItem, ClaimStatus } from '@/lib/claims-types';
import { ClaimList } from './ClaimList';
import { ClaimDetail } from './ClaimDetail';
import { ClaimFilterBar } from './ClaimFilterBar';
import { ClaimRejectDialog } from './ClaimRejectDialog';
import { ClaimSupersedeDialog } from './ClaimSupersedeDialog';

interface ClaimInboxProps {
  projectId: string;
  className?: string;
}

type InboxTab = ClaimStatus | 'all';

const TAB_ORDER: InboxTab[] = ['unresolved', 'promoted', 'rejected', 'all'];

function extractApiError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const data = err.response?.data;
    if (data && typeof data === 'object' && 'error' in data) {
      const apiErr = (data as { error?: unknown }).error;
      if (typeof apiErr === 'string') return apiErr;
    }
    if (err.message) return err.message;
  }
  return fallback;
}

export function ClaimInbox({ projectId, className }: ClaimInboxProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = (searchParams.get('tab') as InboxTab | null) || 'unresolved';
  const initialClaimId = searchParams.get('claim');

  const [tab, setTab] = useState<InboxTab>(
    TAB_ORDER.includes(initialTab) ? initialTab : 'unresolved',
  );
  const [search, setSearch] = useState('');
  const [predicate, setPredicate] = useState('all');
  const [documentId, setDocumentId] = useState('all');
  const [minConfidence, setMinConfidence] = useState(0);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(initialClaimId);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [supersedeOpen, setSupersedeOpen] = useState(false);
  const [dialogClaim, setDialogClaim] = useState<ClaimListItem | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [supersedeError, setSupersedeError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch all-status counts in one shot for tab badges + supersede candidates.
  const { data: allClaims = [], isLoading } = useClaimsList({ project: projectId });
  const { data: documents = [] } = useDocumentsList({ project: projectId });

  // Visible claims for current tab + filters.
  const visibleClaims = useMemo(() => {
    let list = allClaims as ClaimListItem[];
    if (tab !== 'all') list = list.filter((c) => c.status === tab);
    if (predicate !== 'all') list = list.filter((c) => c.normalized?.predicate === predicate);
    if (documentId !== 'all') list = list.filter((c) => c.document === documentId);
    if (minConfidence > 0) list = list.filter((c) => (c.confidence ?? 0) >= minConfidence);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) => c.snippet.toLowerCase().includes(q));
    }
    return list;
  }, [allClaims, tab, predicate, documentId, minConfidence, search]);

  // Status counts (ignoring tab filter; respect other filters? -> keep simple, ignore filters too).
  const counts = useMemo(() => {
    const base = { unresolved: 0, promoted: 0, rejected: 0, superseded: 0, all: allClaims.length };
    for (const c of allClaims) base[c.status] += 1;
    return base;
  }, [allClaims]);

  // Predicates seen in the project.
  const predicateOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of allClaims) {
      const p = c.normalized?.predicate;
      if (typeof p === 'string') set.add(p);
    }
    return Array.from(set).sort();
  }, [allClaims]);

  // Sync tab + claim id to URL.
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', tab);
    if (selectedClaimId) params.set('claim', selectedClaimId);
    else params.delete('claim');
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedClaimId]);

  // If the URL pointed to a claim that exists, ensure we land on the right tab.
  useEffect(() => {
    if (!initialClaimId || !allClaims.length) return;
    const claim = allClaims.find((c) => c.id === initialClaimId);
    if (claim && claim.status !== tab && tab !== 'all') {
      setTab(claim.status);
    }
    // Once handled, don't fight further user navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialClaimId, allClaims.length]);

  // Keep selection valid when the visible list changes.
  useEffect(() => {
    if (!selectedClaimId) return;
    if (!visibleClaims.some((c) => c.id === selectedClaimId)) {
      setSelectedClaimId(visibleClaims[0]?.id ?? null);
    }
  }, [visibleClaims, selectedClaimId]);

  // Auto-select first claim if none selected.
  useEffect(() => {
    if (!selectedClaimId && visibleClaims.length > 0) {
      setSelectedClaimId(visibleClaims[0].id);
    }
  }, [selectedClaimId, visibleClaims]);

  const promoteMutation = usePromoteClaim();
  const rejectMutation = useRejectClaim();
  const supersedeMutation = useSupersedeClaim();

  const handleApproveClaim = useCallback(
    async (claim: ClaimListItem) => {
      setApproveError(null);
      try {
        await promoteMutation.mutateAsync({ claimId: claim.id });
        toast.success(t('claims.toast.promoted'));
      } catch (err) {
        const msg = extractApiError(err, t('claims.toast.promoteFailed'));
        setApproveError(msg);
        toast.error(t('claims.toast.promoteFailed'), msg);
      }
    },
    [promoteMutation, toast, t],
  );

  const handleOpenReject = useCallback((claim: ClaimListItem) => {
    setDialogClaim(claim);
    setRejectError(null);
    setRejectOpen(true);
  }, []);

  const handleOpenSupersede = useCallback((claim: ClaimListItem) => {
    setDialogClaim(claim);
    setSupersedeError(null);
    setSupersedeOpen(true);
  }, []);

  const nav = useClaimNavigation({
    claims: visibleClaims,
    enabled: !rejectOpen && !supersedeOpen,
    onApprove: handleApproveClaim,
    onOpenReject: handleOpenReject,
    onOpenSupersede: handleOpenSupersede,
    onFocusSearch: () => searchInputRef.current?.focus(),
  });

  // Keep nav cursor in sync with selectedClaimId (URL deep-link / explicit click).
  useEffect(() => {
    if (selectedClaimId && nav.currentClaim?.id !== selectedClaimId) {
      nav.goToClaim(selectedClaimId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClaimId, visibleClaims]);

  // Keep selectedClaimId in sync with nav cursor (keyboard navigation).
  useEffect(() => {
    if (nav.currentClaim?.id && nav.currentClaim.id !== selectedClaimId) {
      setSelectedClaimId(nav.currentClaim.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.currentClaim?.id]);

  const handleConfirmReject = async (reason: string) => {
    if (!dialogClaim) return;
    setRejectError(null);
    try {
      await rejectMutation.mutateAsync({ claimId: dialogClaim.id, reason });
      toast.success(t('claims.toast.rejected'));
      setRejectOpen(false);
    } catch (err) {
      const msg = extractApiError(err, t('claims.toast.rejectFailed'));
      setRejectError(msg);
    }
  };

  const handleConfirmSupersede = async (newerClaimId: string) => {
    if (!dialogClaim) return;
    setSupersedeError(null);
    try {
      await supersedeMutation.mutateAsync({
        claimId: dialogClaim.id,
        supersededByClaimId: newerClaimId,
      });
      toast.success(t('claims.toast.superseded'));
      setSupersedeOpen(false);
    } catch (err) {
      const msg = extractApiError(err, t('claims.toast.supersedeFailed'));
      setSupersedeError(msg);
    }
  };

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* Status tabs */}
      <div className="flex-none flex items-center gap-3 px-3 py-2 border-b bg-muted/30">
        <h1 className="text-sm font-semibold">{t('claims.title')}</h1>
        <Tabs value={tab} onValueChange={(v) => setTab(v as InboxTab)}>
          <TabsList className="h-8">
            {TAB_ORDER.map((tk) => (
              <TabsTrigger key={tk} value={tk} className="text-xs">
                {t(`claims.tabs.${tk}`)}{' '}
                <span className="ml-1.5 inline-flex items-center justify-center rounded bg-background px-1.5 text-[10px] font-mono">
                  {tk === 'all' ? counts.all : counts[tk as ClaimStatus]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="ml-auto text-xs text-muted-foreground">
          <span>
            {t('claims.keyboardLegend')}{' '}
            <kbd className="px-1 rounded bg-muted text-[10px]">←/→</kbd>{' '}
            <kbd className="px-1 rounded bg-muted text-[10px]">A</kbd>{' '}
            <kbd className="px-1 rounded bg-muted text-[10px]">R</kbd>{' '}
            <kbd className="px-1 rounded bg-muted text-[10px]">S</kbd>{' '}
            <kbd className="px-1 rounded bg-muted text-[10px]">/</kbd>
          </span>
        </div>
      </div>

      <ClaimFilterBar
        ref={searchInputRef}
        search={search}
        onSearchChange={setSearch}
        predicate={predicate}
        onPredicateChange={setPredicate}
        documentId={documentId}
        onDocumentChange={setDocumentId}
        minConfidence={minConfidence}
        onMinConfidenceChange={setMinConfidence}
        predicates={predicateOptions}
        documents={documents}
      />

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(320px,45%)_1fr]">
        <div className="border-r min-h-0">
          <ClaimList
            claims={visibleClaims}
            isLoading={isLoading}
            selectedClaimId={selectedClaimId}
            onSelect={setSelectedClaimId}
            documents={documents}
          />
        </div>
        <div className="min-h-0">
          <ClaimDetail
            claimId={selectedClaimId}
            onApprove={() => {
              const claim = visibleClaims.find((c) => c.id === selectedClaimId);
              if (claim) handleApproveClaim(claim);
            }}
            onReject={() => {
              const claim = visibleClaims.find((c) => c.id === selectedClaimId);
              if (claim) handleOpenReject(claim);
            }}
            onSupersede={() => {
              const claim = visibleClaims.find((c) => c.id === selectedClaimId);
              if (claim) handleOpenSupersede(claim);
            }}
            isApproving={promoteMutation.isPending}
            approveError={approveError}
          />
        </div>
      </div>

      <ClaimRejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        claim={dialogClaim}
        onConfirm={handleConfirmReject}
        isPending={rejectMutation.isPending}
        error={rejectError}
      />
      <ClaimSupersedeDialog
        open={supersedeOpen}
        onOpenChange={setSupersedeOpen}
        claim={dialogClaim}
        candidates={allClaims}
        onConfirm={handleConfirmSupersede}
        isPending={supersedeMutation.isPending}
        error={supersedeError}
      />
    </div>
  );
}
