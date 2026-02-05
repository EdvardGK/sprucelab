import { useRef, useState, useMemo, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  type SortingState,
  type ExpandedState,
  type RowSelectionState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import { useDataGridVirtualizer } from './hooks/useVirtualization';
import { useDataGridEditing } from './hooks/useDataGridEditing';
import { DataGridHeader } from './DataGridHeader';
import { DataGridRow } from './DataGridRow';
import { DataGridGroupRow } from './DataGridGroupRow';
import { DataGridToolbar } from './DataGridToolbar';
import type { DataGridColumn } from './types';
import './data-grid.css';

export interface DataGridProps<TData> {
  data: TData[];
  columns: DataGridColumn<TData>[];
  groupBy?: string;
  getRowId: (row: TData) => string;
  onCellEdit?: (rowId: string, columnId: string, value: unknown) => void;
  onBulkAction?: (selectedIds: string[], action: string, value?: unknown) => void;
  isLoading?: boolean;
  /** Extra toolbar content (buttons, etc.) rendered after the search box */
  toolbarExtra?: React.ReactNode;
  /** Bulk action buttons rendered when rows are selected */
  bulkActions?: React.ReactNode;
  emptyState?: React.ReactNode;
  className?: string;
  rowHeight?: number;
  groupRowHeight?: number;
  searchPlaceholder?: string;
}

export function DataGrid<TData>({
  data,
  columns,
  groupBy,
  getRowId,
  onCellEdit,
  isLoading,
  toolbarExtra,
  bulkActions,
  emptyState,
  className,
  rowHeight = 36,
  groupRowHeight = 40,
  searchPlaceholder,
}: DataGridProps<TData>) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>(true);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  // Editing state
  const editing = useDataGridEditing();

  // Grouping config
  const grouping = useMemo(() => (groupBy ? [groupBy] : []), [groupBy]);

  // Build table
  const table = useReactTable({
    data,
    columns: columns as any,
    state: {
      sorting,
      expanded,
      rowSelection,
      columnFilters,
      globalFilter,
      grouping,
    },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getGroupedRowModel: groupBy ? getGroupedRowModel() : undefined,
    getExpandedRowModel: getExpandedRowModel(),
    enableRowSelection: true,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
  });

  const { rows } = table.getRowModel();

  // Virtualizer
  const virtualizer = useDataGridVirtualizer({
    rows,
    parentRef: scrollRef,
    rowHeight,
    groupRowHeight,
  });

  // Grid template columns from table column sizes
  const gridTemplateColumns = useMemo(() => {
    return table
      .getFlatHeaders()
      .map((header) => `${header.getSize()}px`)
      .join(' ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.getState().columnSizing, table.getState().columnSizingInfo, columns]);

  // Track group indices for tint colors
  const groupIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    for (const row of rows) {
      if (row.getIsGrouped() && !map.has(row.id)) {
        map.set(row.id, idx);
        idx++;
      }
    }
    return map;
  }, [rows]);

  const getGroupIndex = useCallback(
    (row: (typeof rows)[0]) => {
      if (row.getIsGrouped()) return groupIndexMap.get(row.id) ?? 0;
      return row.parentId ? groupIndexMap.get(row.parentId) ?? 0 : 0;
    },
    [groupIndexMap]
  );

  const handleCommitEdit = useCallback(
    (rowId: string, columnId: string, value: unknown) => {
      editing.stopEditing();
      onCellEdit?.(rowId, columnId, value);
    },
    [editing, onCellEdit]
  );

  const selectedCount = Object.keys(rowSelection).length;
  // Count leaf rows only for the filtered count
  const leafRowCount = rows.filter((r) => !r.getIsGrouped()).length;

  if (isLoading) {
    return (
      <div className={`data-grid-airtable ${className || ''}`}>
        <div className="dg-empty">
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`data-grid-airtable ${className || ''}`}>
      {/* Toolbar */}
      <DataGridToolbar
        table={table}
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        totalCount={data.length}
        filteredCount={leafRowCount}
        selectedCount={selectedCount}
        bulkActions={bulkActions}
        searchPlaceholder={searchPlaceholder}
      >
        {toolbarExtra}
      </DataGridToolbar>

      {data.length === 0 ? (
        emptyState || (
          <div className="dg-empty">
            <span>No data</span>
          </div>
        )
      ) : (
        <>
          {/* Header */}
          <DataGridHeader table={table} gridTemplateColumns={gridTemplateColumns} />

          {/* Virtual scroll body */}
          <div ref={scrollRef} className="dg-scroll-container">
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                position: 'relative',
                width: '100%',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                const groupIndex = getGroupIndex(row);

                return (
                  <div
                    key={row.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {row.getIsGrouped() ? (
                      <DataGridGroupRow row={row} groupIndex={groupIndex} />
                    ) : (
                      <DataGridRow
                        row={row}
                        gridTemplateColumns={gridTemplateColumns}
                        groupIndex={groupIndex}
                        activeRowId={editing.activeCell?.rowId ?? null}
                        activeColumnId={editing.activeCell?.columnId ?? null}
                        isEditing={editing.isEditing}
                        onActivateCell={editing.setActive}
                        onStartEdit={editing.startEditing}
                        onCommitEdit={handleCommitEdit}
                        onCancelEdit={editing.clearActive}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Re-export for convenience
export { DataGridToolbar } from './DataGridToolbar';
export type { DataGridColumn, SelectOption } from './types';
