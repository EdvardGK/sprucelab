import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DocumentListItem } from '@/lib/claims-types';

interface ClaimFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  predicate: string;
  onPredicateChange: (value: string) => void;
  documentId: string;
  onDocumentChange: (value: string) => void;
  minConfidence: number;
  onMinConfidenceChange: (value: number) => void;
  predicates: string[];
  documents: DocumentListItem[];
}

export const ClaimFilterBar = forwardRef<HTMLInputElement, ClaimFilterBarProps>(
  function ClaimFilterBar(
    {
      search,
      onSearchChange,
      predicate,
      onPredicateChange,
      documentId,
      onDocumentChange,
      minConfidence,
      onMinConfidenceChange,
      predicates,
      documents,
    },
    searchRef,
  ) {
    const { t } = useTranslation();
    return (
      <div className="flex-none flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('claims.filters.searchPlaceholder')}
            className="pl-7 h-8 text-xs"
          />
        </div>
        <Select value={predicate} onValueChange={onPredicateChange}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder={t('claims.filters.allPredicates')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('claims.filters.allPredicates')}</SelectItem>
            {predicates.map((p) => (
              <SelectItem key={p} value={p}>
                {t(`claims.predicates.${p}`, { defaultValue: p })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={documentId} onValueChange={onDocumentChange}>
          <SelectTrigger className="w-56 h-8 text-xs">
            <SelectValue placeholder={t('claims.filters.allDocuments')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('claims.filters.allDocuments')}</SelectItem>
            {documents.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.original_filename}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 text-xs">
          <label htmlFor="min-conf" className="text-muted-foreground whitespace-nowrap">
            {t('claims.filters.minConfidence')}
          </label>
          <input
            id="min-conf"
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(minConfidence * 100)}
            onChange={(e) => onMinConfidenceChange(Number(e.target.value) / 100)}
            className="w-24"
          />
          <span className="font-mono text-muted-foreground w-9">
            {Math.round(minConfidence * 100)}%
          </span>
        </div>
      </div>
    );
  },
);
