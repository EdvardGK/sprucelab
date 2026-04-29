import { useTranslation } from 'react-i18next';
import { Loader2, Inbox } from 'lucide-react';
import { ClaimCard } from './ClaimCard';
import type { ClaimListItem } from '@/lib/claims-types';
import type { DocumentListItem } from '@/lib/claims-types';

interface ClaimListProps {
  claims: ClaimListItem[];
  isLoading: boolean;
  selectedClaimId: string | null;
  onSelect: (claimId: string) => void;
  documents?: DocumentListItem[];
}

export function ClaimList({
  claims,
  isLoading,
  selectedClaimId,
  onSelect,
  documents,
}: ClaimListProps) {
  const { t } = useTranslation();

  const documentName = (sourceFileId: string) => {
    if (!documents) return undefined;
    const doc = documents.find((d) => d.source_file === sourceFileId);
    return doc?.original_filename;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (claims.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6">
        <Inbox className="h-10 w-10 mb-2 opacity-30" />
        <p className="text-sm font-medium">{t('claims.empty.title')}</p>
        <p className="text-xs mt-1 text-center max-w-xs">{t('claims.empty.description')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 overflow-y-auto h-full">
      {claims.map((claim) => (
        <ClaimCard
          key={claim.id}
          claim={claim}
          selected={selectedClaimId === claim.id}
          onSelect={() => onSelect(claim.id)}
          documentName={documentName(claim.source_file)}
        />
      ))}
    </div>
  );
}
