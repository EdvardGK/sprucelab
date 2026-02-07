import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Layers,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Database,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  useTypeBankEntries,
  useTypeBankSummary,
  type TypeBankEntry,
} from '@/hooks/use-warehouse';
import { SemanticTypeCellSelector } from './SemanticTypeSelector';
import { SemanticCoverageWidget } from './SemanticCoverageWidget';
import type { SemanticTypeCategory } from '@/hooks/use-warehouse';

/**
 * Derive semantic type category from code prefix.
 * E.g., "A01" -> "A-Structural", "D02" -> "D-Openings"
 */
function getCategoryFromCode(code: string | null): SemanticTypeCategory | null {
  if (!code) return null;
  const prefix = code.charAt(0).toUpperCase();
  const categoryMap: Record<string, SemanticTypeCategory> = {
    'A': 'A-Structural',
    'D': 'D-Openings',
    'E': 'E-Cladding',
    'F': 'F-MEP',
    'Z': 'Z-Generic',
  };
  return categoryMap[prefix] || 'Z-Generic';
}

interface TypeBankPanelProps {
  className?: string;
}

/**
 * TypeBankPanel - Global type classification library across all models.
 * Shows TypeBankEntries with semantic type badges and selectors.
 */
export function TypeBankPanel({ className }: TypeBankPanelProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [ifcClassFilter, setIfcClassFilter] = useState<string>('all');
  const [semanticFilter, setSemanticFilter] = useState<string>('all');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Fetch type bank entries (global cross-project system)
  const {
    data: entries = [],
    isLoading,
    refetch,
  } = useTypeBankEntries();

  // Fetch summary
  const { data: summary } = useTypeBankSummary();

  // Get unique IFC classes for filter dropdown
  const uniqueIfcClasses = useMemo(() => {
    const classSet = new Set(entries.map((e) => e.ifc_class));
    return Array.from(classSet).sort();
  }, [entries]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matches =
          entry.type_name.toLowerCase().includes(query) ||
          entry.ifc_class.toLowerCase().includes(query) ||
          (entry.predefined_type?.toLowerCase().includes(query) ?? false) ||
          (entry.material?.toLowerCase().includes(query) ?? false) ||
          (entry.semantic_type_code?.toLowerCase().includes(query) ?? false);
        if (!matches) return false;
      }

      // IFC class filter
      if (ifcClassFilter !== 'all' && entry.ifc_class !== ifcClassFilter) {
        return false;
      }

      // Semantic type filter
      if (semanticFilter === 'with' && !entry.semantic_type_code) {
        return false;
      }
      if (semanticFilter === 'without' && entry.semantic_type_code) {
        return false;
      }
      if (semanticFilter === 'verified' && entry.semantic_type_source !== 'verified') {
        return false;
      }
      if (semanticFilter === 'auto' &&
          entry.semantic_type_source !== 'auto_ifc_class' &&
          entry.semantic_type_source !== 'auto_name_pattern') {
        return false;
      }

      return true;
    });
  }, [entries, searchQuery, ifcClassFilter, semanticFilter]);

  // Group by IFC class
  const groupedEntries = useMemo(() => {
    const groups: Record<string, TypeBankEntry[]> = {};
    filteredEntries.forEach((entry) => {
      if (!groups[entry.ifc_class]) {
        groups[entry.ifc_class] = [];
      }
      groups[entry.ifc_class].push(entry);
    });
    return groups;
  }, [filteredEntries]);

  const toggleGroup = (ifcClass: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(ifcClass)) {
        next.delete(ifcClass);
      } else {
        next.add(ifcClass);
      }
      return next;
    });
  };

  const toggleAllGroups = () => {
    if (expandedGroups.size === Object.keys(groupedEntries).length) {
      setExpandedGroups(new Set());
    } else {
      setExpandedGroups(new Set(Object.keys(groupedEntries)));
    }
  };

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* Header */}
      <div className="flex-none p-4 border-b bg-background space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">{t('typeBank.title')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('typeBank.description')}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
            {t('common.refresh', 'Refresh')}
          </Button>
        </div>

        {/* Summary stats */}
        {summary && (
          <div className="grid grid-cols-5 gap-3">
            <SummaryCard
              label={t('typeBank.summary.total')}
              value={summary.total}
              color="neutral"
            />
            <SummaryCard
              label={t('typeBank.summary.mapped')}
              value={summary.mapped}
              color="green"
            />
            <SummaryCard
              label={t('typeBank.summary.pending')}
              value={summary.pending}
              color="yellow"
            />
            <SummaryCard
              label={t('typeBank.summary.review')}
              value={summary.review}
              color="blue"
            />
            <SummaryCard
              label={t('typeBank.summary.ignored')}
              value={summary.ignored}
              color="gray"
            />
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('common.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={ifcClassFilter} onValueChange={setIfcClassFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder={t('typeBank.ifcClass')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('typeMapping.allIfcClasses')}</SelectItem>
              {uniqueIfcClasses.map((ifcClass) => (
                <SelectItem key={ifcClass} value={ifcClass}>
                  {ifcClass}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={semanticFilter} onValueChange={setSemanticFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t('semanticTypes.title')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              <SelectItem value="with">{t('semanticTypes.coverage.withType')}</SelectItem>
              <SelectItem value="without">{t('semanticTypes.coverage.withoutType')}</SelectItem>
              <SelectItem value="verified">{t('semanticTypes.verified')}</SelectItem>
              <SelectItem value="auto">{t('semanticTypes.autoAssigned')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        {/* Left: Type bank list */}
        <Card className="flex-[7] flex flex-col overflow-hidden">
          <CardHeader className="pb-2 flex-none">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>
                {t('typeBank.title')} ({filteredEntries.length})
              </span>
              <Button variant="ghost" size="sm" onClick={toggleAllGroups}>
                {expandedGroups.size === Object.keys(groupedEntries).length
                  ? t('typeMapping.collapseAll')
                  : t('typeMapping.expandAll')}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <Layers className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {t('typeBank.noEntries')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t('typeBank.noEntriesDesc')}
                </p>
              </div>
            ) : (
              <ScrollArea className="h-full">
                <div className="space-y-1 p-2">
                  {Object.entries(groupedEntries).map(([ifcClass, entryList]) => (
                    <TypeBankGroup
                      key={ifcClass}
                      ifcClass={ifcClass}
                      entries={entryList}
                      isExpanded={expandedGroups.has(ifcClass)}
                      onToggle={() => toggleGroup(ifcClass)}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Right: Semantic coverage widget */}
        <div className="flex-[3] flex flex-col gap-4">
          <SemanticCoverageWidget />
        </div>
      </div>
    </div>
  );
}

/**
 * Summary card for type bank statistics.
 */
function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'green' | 'yellow' | 'blue' | 'gray' | 'neutral';
}) {
  const colorClasses = {
    green: 'text-green-600 bg-green-50 dark:bg-green-900/20',
    yellow: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20',
    blue: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
    gray: 'text-gray-500 bg-gray-50 dark:bg-gray-800/50',
    neutral: 'text-foreground bg-muted',
  };

  return (
    <div className={cn('rounded-lg p-3 text-center', colorClasses[color])}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

/**
 * Collapsible group of type bank entries by IFC class.
 */
function TypeBankGroup({
  ifcClass,
  entries,
  isExpanded,
  onToggle,
}: {
  ifcClass: string;
  entries: TypeBankEntry[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  // Count entries with semantic types
  const withSemanticType = entries.filter((e) => e.semantic_type_code).length;
  const totalInstances = entries.reduce((sum, e) => sum + e.total_instance_count, 0);

  return (
    <div className="border rounded-md overflow-hidden">
      {/* Group header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/50 hover:bg-muted transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-medium text-sm">{ifcClass}</span>
          <Badge variant="secondary" className="text-xs">
            {entries.length} {t('common.types')}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {totalInstances} {t('common.instances')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {withSemanticType === entries.length ? (
            <Badge variant="outline" className="text-xs text-green-600 border-green-300 bg-green-50">
              {t('semanticTypes.coverage.withType')}: {withSemanticType}/{entries.length}
            </Badge>
          ) : withSemanticType > 0 ? (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50">
              {withSemanticType}/{entries.length}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">
              {t('semanticTypes.coverage.withoutType')}
            </Badge>
          )}
        </div>
      </button>

      {/* Expanded entries */}
      {isExpanded && (
        <div className="divide-y">
          {entries.map((entry) => (
            <TypeBankEntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Single type bank entry row with semantic type selector.
 */
function TypeBankEntryRow({ entry }: { entry: TypeBankEntry }) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-background hover:bg-accent/30 transition-colors">
      {/* Type info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{entry.type_name}</span>
          {entry.predefined_type && (
            <Badge variant="outline" className="text-xs">
              {entry.predefined_type}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {entry.material && <span>{entry.material}</span>}
          <span>
            {entry.total_instance_count} {t('common.instances')} · {entry.source_model_count} {t('dashboard.models')}
          </span>
        </div>
      </div>

      {/* Semantic type selector */}
      <div className="w-[200px]">
        <SemanticTypeCellSelector
          entryId={entry.id}
          currentCode={entry.semantic_type_code}
          currentCategory={getCategoryFromCode(entry.semantic_type_code)}
          currentSource={entry.semantic_type_source}
          ifcClass={entry.ifc_class}
        />
      </div>

      {/* Confidence indicator */}
      {entry.semantic_type_confidence !== null && entry.semantic_type_source !== 'verified' && (
        <span className="text-xs text-muted-foreground w-12 text-right">
          {Math.round(entry.semantic_type_confidence * 100)}%
        </span>
      )}
    </div>
  );
}

export default TypeBankPanel;
