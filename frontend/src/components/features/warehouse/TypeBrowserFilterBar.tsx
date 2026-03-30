/**
 * TypeBrowserFilterBar
 *
 * Shared filter bar for the Type Browser. Provides filtering by:
 * - Search (type name / IFC class)
 * - IFC class (dropdown)
 * - NS3451 code (dropdown from hierarchy)
 * - Mapping status
 * - View mode toggle (list / gallery / grid)
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  List,
  LayoutGrid,
  Grid3X3,
  Download,
  Upload,
  Leaf,
  Loader2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { IFCType } from '@/hooks/use-warehouse';

export type ViewMode = 'list' | 'gallery' | 'grid';

interface TypeBrowserFilterBarProps {
  // Filter state
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  ifcClassFilter: string;
  onIfcClassFilterChange: (ifcClass: string) => void;
  ns3451Filter: string;
  onNs3451FilterChange: (code: string) => void;
  // Available filter options (derived from types)
  uniqueIfcClasses: string[];
  uniqueNs3451Codes: { code: string; name: string }[];
  // View mode
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  // Excel actions
  onExportExcel?: () => void;
  onImportExcel?: () => void;
  onExportReduzer?: () => void;
  isExporting?: boolean;
  isImporting?: boolean;
  isExportingReduzer?: boolean;
  // Counts
  totalTypes: number;
  filteredCount: number;
  className?: string;
}

export function TypeBrowserFilterBar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  ifcClassFilter,
  onIfcClassFilterChange,
  ns3451Filter,
  onNs3451FilterChange,
  uniqueIfcClasses,
  uniqueNs3451Codes,
  viewMode,
  onViewModeChange,
  onExportExcel,
  onImportExcel,
  onExportReduzer,
  isExporting,
  isImporting,
  isExportingReduzer,
  totalTypes,
  filteredCount,
  className,
}: TypeBrowserFilterBarProps) {
  const { t } = useTranslation();

  const showingFiltered = filteredCount !== totalTypes;

  return (
    <div className={cn('flex items-center gap-2 px-3 py-2 border-b bg-muted/10 flex-wrap', className)}>
      {/* Search */}
      <div className="relative flex-shrink-0 w-48">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder={t('typeBrowser.searchTypes')}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 h-7 text-xs"
        />
      </div>

      {/* IFC Class Filter */}
      <Select value={ifcClassFilter} onValueChange={onIfcClassFilterChange}>
        <SelectTrigger className="w-40 h-7 text-xs">
          <SelectValue placeholder={t('typeBrowser.ifcClass')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('typeBrowser.allIfcClasses')}</SelectItem>
          {uniqueIfcClasses.map((cls) => (
            <SelectItem key={cls} value={cls}>{cls}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* NS3451 Filter */}
      <Select value={ns3451Filter} onValueChange={onNs3451FilterChange}>
        <SelectTrigger className="w-44 h-7 text-xs">
          <SelectValue placeholder="NS3451" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('typeBrowser.allCodes')}</SelectItem>
          {uniqueNs3451Codes.map(({ code, name }) => (
            <SelectItem key={code} value={code}>
              {code} - {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Status Filter */}
      <Select value={statusFilter} onValueChange={onStatusFilterChange}>
        <SelectTrigger className="w-32 h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('typeBrowser.allStatus')}</SelectItem>
          <SelectItem value="pending">{t('status.pending')}</SelectItem>
          <SelectItem value="mapped">{t('status.mapped')}</SelectItem>
          <SelectItem value="ignored">{t('status.ignored')}</SelectItem>
          <SelectItem value="review">{t('status.review')}</SelectItem>
          <SelectItem value="followup">{t('status.followup')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Count */}
      <span className="text-xs text-muted-foreground tabular-nums">
        {showingFiltered
          ? t('typeBrowser.showingOf', { showing: filteredCount, total: totalTypes })
          : t('typeBrowser.totalTypes', { count: totalTypes })}
      </span>

      <div className="flex-1" />

      {/* Excel Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
            <Download className="h-3 w-3" />
            Excel
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onExportExcel} disabled={isExporting}>
            {isExporting ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-2" />}
            {t('typeMapping.exportExcel')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onImportExcel} disabled={isImporting}>
            {isImporting ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-2" />}
            {t('typeMapping.importExcel')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExportReduzer} disabled={isExportingReduzer}>
            {isExportingReduzer ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Leaf className="h-3.5 w-3.5 mr-2" />}
            {t('typeMapping.exportReduzer')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* View Mode Toggle */}
      <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
        <Button
          variant={viewMode === 'list' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onViewModeChange('list')}
          className="h-6 w-6 p-0"
          title={t('typeBrowser.listView')}
        >
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant={viewMode === 'gallery' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onViewModeChange('gallery')}
          className="h-6 w-6 p-0"
          title={t('typeBrowser.galleryView')}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onViewModeChange('grid')}
          className="h-6 w-6 p-0"
          title={t('typeBrowser.gridView')}
        >
          <Grid3X3 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Derive unique filter options from a list of types.
 */
export function useFilterOptions(types: IFCType[]) {
  const uniqueIfcClasses = useMemo(() => {
    const classes = new Set(types.map((t) => t.ifc_type));
    return Array.from(classes).sort();
  }, [types]);

  const uniqueNs3451Codes = useMemo(() => {
    const codeMap = new Map<string, string>();
    for (const type of types) {
      const code = type.mapping?.ns3451_code;
      const name = type.mapping?.ns3451_name || '';
      if (code && !codeMap.has(code)) {
        codeMap.set(code, name);
      }
    }
    return Array.from(codeMap.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [types]);

  return { uniqueIfcClasses, uniqueNs3451Codes };
}

/**
 * Apply filters to a list of types.
 */
export function filterTypes(
  types: IFCType[],
  filters: {
    searchQuery: string;
    statusFilter: string;
    ifcClassFilter: string;
    ns3451Filter: string;
  }
): IFCType[] {
  return types.filter((type) => {
    // Search
    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      if (
        !type.type_name.toLowerCase().includes(q) &&
        !type.ifc_type.toLowerCase().includes(q)
      ) {
        return false;
      }
    }

    // Status
    if (filters.statusFilter !== 'all') {
      const status = type.mapping?.mapping_status || 'pending';
      if (status !== filters.statusFilter) return false;
    }

    // IFC class
    if (filters.ifcClassFilter !== 'all' && type.ifc_type !== filters.ifcClassFilter) {
      return false;
    }

    // NS3451
    if (filters.ns3451Filter !== 'all') {
      const code = type.mapping?.ns3451_code || '';
      if (!code.startsWith(filters.ns3451Filter)) return false;
    }

    return true;
  });
}
