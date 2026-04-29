import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { ClaimListItem } from '@/lib/claims-types';

interface ClaimRejectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claim: ClaimListItem | null;
  onConfirm: (reason: string) => Promise<void> | void;
  isPending?: boolean;
  error?: string | null;
}

export function ClaimRejectDialog({
  open,
  onOpenChange,
  claim,
  onConfirm,
  isPending,
  error,
}: ClaimRejectDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const handleSubmit = async () => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    await onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('claims.rejectDialog.title')}</DialogTitle>
          <DialogDescription>{t('claims.rejectDialog.description')}</DialogDescription>
        </DialogHeader>
        {claim && (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <div className="line-clamp-3">{claim.snippet}</div>
          </div>
        )}
        <Textarea
          autoFocus
          placeholder={t('claims.rejectDialog.placeholder')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="min-h-[100px]"
        />
        {error && (
          <p className="text-xs text-rose-600">{error}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!reason.trim() || isPending}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <X className="h-4 w-4 mr-2" />
            )}
            {t('claims.actions.reject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
