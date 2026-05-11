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
import type { Model } from '@/lib/api-types';

interface TypeBrowserFilterBarV2Props {
  models: Model[];
  modelId: string | null;
  onModelChange: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  ifcClassFilter: string;
  onIfcClassChange: (cls: string) => void;
  uniqueIfcClasses: string[];
  totalCount: number;
  filteredCount: number;
}

export function TypeBrowserFilterBarV2({
  models,
  modelId,
  onModelChange,
  searchQuery,
  onSearchChange,
  ifcClassFilter,
  onIfcClassChange,
  uniqueIfcClasses,
  totalCount,
  filteredCount,
}: TypeBrowserFilterBarV2Props) {
  const { t } = useTranslation();
  const showingFiltered = filteredCount !== totalCount;

  return (
    <div className="flex items-center gap-2 flex-wrap rounded-md border border-border/60 bg-card px-3 py-2">
      <div className="relative w-56">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder={t('typesV2.filter.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 h-8 text-xs"
        />
      </div>

      <Select
        value={modelId ?? undefined}
        onValueChange={onModelChange}
        disabled={models.length === 0}
      >
        <SelectTrigger className="w-48 h-8 text-xs">
          <SelectValue placeholder={t('typesV2.filter.modelPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={ifcClassFilter} onValueChange={onIfcClassChange}>
        <SelectTrigger className="w-44 h-8 text-xs">
          <SelectValue placeholder={t('typesV2.filter.ifcClassPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('typesV2.filter.ifcClassAll')}</SelectItem>
          {uniqueIfcClasses.map((cls) => (
            <SelectItem key={cls} value={cls}>
              {cls}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="text-xs text-muted-foreground tabular-nums ml-1">
        {showingFiltered
          ? t('typesV2.filter.showingOf', {
              showing: filteredCount,
              total: totalCount,
            })
          : t('typesV2.filter.totalCount', { count: totalCount })}
      </span>
    </div>
  );
}
