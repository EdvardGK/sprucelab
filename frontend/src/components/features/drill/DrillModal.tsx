import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, ArrowUpDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { downloadCsv } from '@/lib/export';

// ── Types ──

export interface DrillColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
  sortable?: boolean;
}

export interface DrillTab {
  id: string;
  label: string;
  count?: number;
  columns: DrillColumn[];
  data: Record<string, unknown>[];
}

export interface DrillModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  tabs: DrillTab[];
  exportFilename?: string;
}

// ── Sort state ──

type SortDir = 'asc' | 'desc' | null;
interface SortState {
  key: string;
  dir: SortDir;
}

function nextDir(current: SortDir): SortDir {
  if (current === null) return 'desc';
  if (current === 'desc') return 'asc';
  return null;
}

function sortRows(
  rows: Record<string, unknown>[],
  sort: SortState | null
): Record<string, unknown>[] {
  if (!sort || sort.dir === null) return rows;
  const { key, dir } = sort;
  return [...rows].sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') {
      return dir === 'asc' ? va - vb : vb - va;
    }
    const sa = String(va);
    const sb = String(vb);
    return dir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
  });
}

// ── Component ──

export function DrillModal({
  open,
  onOpenChange,
  title,
  subtitle,
  tabs,
  exportFilename,
}: DrillModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? '');
  const [sort, setSort] = useState<SortState | null>(null);

  // Reset sort when tab changes
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setSort(null);
  };

  // Reset when modal opens/closes
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setActiveTab(tabs[0]?.id ?? '');
      setSort(null);
    }
    onOpenChange(nextOpen);
  };

  const currentTab = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  const sortedData = useMemo(
    () => (currentTab ? sortRows(currentTab.data, sort) : []),
    [currentTab, sort]
  );

  const handleExport = () => {
    if (!currentTab) return;
    const headers = currentTab.columns.map((c) => c.label);
    const rows = currentTab.data.map((row) =>
      currentTab.columns.map((c) => {
        const v = row[c.key];
        return v == null ? '' : v;
      })
    );
    const stamp = new Date().toISOString().slice(0, 10);
    const base = exportFilename ?? title.replace(/[^\w-]+/g, '_');
    downloadCsv(`${base}_${currentTab.id}_${stamp}`, headers, rows as (string | number | null)[][]);
  };

  const handleSort = (key: string) => {
    setSort((prev) => ({
      key,
      dir: prev?.key === key ? nextDir(prev.dir) : 'desc',
    }));
  };

  if (!tabs.length) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[min(95vw,1100px)] max-h-[85vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
              {subtitle && (
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {subtitle}
                </DialogDescription>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="text-xs gap-1.5 mr-6"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
          </div>
        </DialogHeader>

        {/* Tabs + Content */}
        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="flex flex-col flex-1 min-h-0"
        >
          {tabs.length > 1 && (
            <div className="px-5 flex-shrink-0">
              <TabsList className="h-8">
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id} className="text-xs px-3 py-1">
                    {tab.label}
                    {tab.count != null && (
                      <span className="ml-1.5 text-muted-foreground">{tab.count}</span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          )}

          {tabs.map((tab) => (
            <TabsContent
              key={tab.id}
              value={tab.id}
              className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 mt-0"
            >
              <DrillTable
                columns={tab.columns}
                data={sortedData}
                sort={sort}
                onSort={handleSort}
              />
              {tab.data.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {t('common.noData', 'No data')}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ── Table sub-component ──

function DrillTable({
  columns,
  data,
  sort,
  onSort,
}: {
  columns: DrillColumn[];
  data: Record<string, unknown>[];
  sort: SortState | null;
  onSort: (key: string) => void;
}) {
  if (data.length === 0) return null;

  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              className={`
                sticky top-0 z-10 bg-muted/80 backdrop-blur
                px-2.5 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]
                border-b-2 border-border
                ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}
                ${col.sortable !== false ? 'cursor-pointer select-none hover:text-foreground transition-colors' : ''}
              `}
              onClick={col.sortable !== false ? () => onSort(col.key) : undefined}
            >
              <span className="inline-flex items-center gap-1">
                {col.label}
                {col.sortable !== false && (
                  <ArrowUpDown
                    className={`h-3 w-3 transition-opacity ${
                      sort?.key === col.key ? 'opacity-100' : 'opacity-30'
                    }`}
                  />
                )}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={i} className="hover:bg-muted/30 transition-colors">
            {columns.map((col) => (
              <td
                key={col.key}
                className={`
                  px-2.5 py-1.5 border-b border-border/50
                  ${col.align === 'right' ? 'text-right tabular-nums' : col.align === 'center' ? 'text-center' : 'text-left'}
                `}
              >
                {col.render
                  ? col.render(row[col.key], row)
                  : row[col.key] == null
                    ? '—'
                    : String(row[col.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
