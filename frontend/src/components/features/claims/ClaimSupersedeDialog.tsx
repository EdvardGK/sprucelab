import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Replace } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ClaimListItem } from '@/lib/claims-types';

interface ClaimSupersedeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claim: ClaimListItem | null;
  candidates: ClaimListItem[];
  onConfirm: (newerClaimId: string) => Promise<void> | void;
  isPending?: boolean;
  error?: string | null;
}

export function ClaimSupersedeDialog({
  open,
  onOpenChange,
  claim,
  candidates,
  onConfirm,
  isPending,
  error,
}: ClaimSupersedeDialogProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedId(null);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!claim) return [];
    const predicate = claim.normalized?.predicate;
    const q = search.trim().toLowerCase();
    return candidates
      .filter((c) => c.id !== claim.id)
      .filter((c) => c.status === 'unresolved' || c.status === 'promoted')
      .filter((c) => (predicate ? c.normalized?.predicate === predicate : true))
      .filter((c) => (q ? c.snippet.toLowerCase().includes(q) : true))
      .slice(0, 50);
  }, [candidates, claim, search]);

  const handleSubmit = async () => {
    if (!selectedId) return;
    await onConfirm(selectedId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('claims.supersedeDialog.title')}</DialogTitle>
          <DialogDescription>{t('claims.supersedeDialog.description')}</DialogDescription>
        </DialogHeader>
        {claim && (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <div className="text-xs text-muted-foreground mb-1">
              {t('claims.supersedeDialog.replacing')}
            </div>
            <div className="line-clamp-2">{claim.snippet}</div>
          </div>
        )}
        <Input
          autoFocus
          placeholder={t('claims.supersedeDialog.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
          {filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              {t('claims.supersedeDialog.noCandidates')}
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  'w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors',
                  selectedId === c.id && 'bg-primary/10',
                )}
              >
                <div className="text-sm line-clamp-2">{c.snippet}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {c.normalized?.value !== undefined &&
                    `${c.normalized.value}${c.normalized.units ? ` ${c.normalized.units}` : ''} · `}
                  {t(`claims.status.${c.status}`)}
                </div>
              </button>
            ))
          )}
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedId || isPending}>
            {isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Replace className="h-4 w-4 mr-2" />
            )}
            {t('claims.actions.supersede')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
