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
    <div className="flex items-center gap-[clamp(0.375rem,0.6vw,0.75rem)] flex-wrap rounded-md border border-border/60 bg-card px-[clamp(0.5rem,1vw,1rem)] py-[clamp(0.375rem,0.6vw,0.625rem)]">
      <div className="relative w-[clamp(11rem,16vw,18rem)]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-[clamp(0.75rem,1vw,1rem)] w-[clamp(0.75rem,1vw,1rem)] text-muted-foreground" />
        <Input
          placeholder={t('typesV2.filter.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 h-[clamp(1.75rem,2.2vw,2.25rem)] text-[clamp(0.65rem,0.8vw,0.85rem)]"
        />
      </div>

      <Select
        value={modelId ?? ''}
        onValueChange={onModelChange}
        disabled={models.length === 0}
      >
        <SelectTrigger className="w-[clamp(10rem,14vw,16rem)] h-[clamp(1.75rem,2.2vw,2.25rem)] text-[clamp(0.65rem,0.8vw,0.85rem)]">
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
        <SelectTrigger className="w-[clamp(9rem,12vw,14rem)] h-[clamp(1.75rem,2.2vw,2.25rem)] text-[clamp(0.65rem,0.8vw,0.85rem)]">
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

      <span className="text-[clamp(0.65rem,0.8vw,0.85rem)] text-muted-foreground tabular-nums ml-1">
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
