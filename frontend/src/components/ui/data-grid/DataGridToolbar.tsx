import { Search, X } from 'lucide-react';
import type { Table } from '@tanstack/react-table';

interface DataGridToolbarProps<TData> {
  table: Table<TData>;
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
  /** Extra toolbar content (e.g., Excel export buttons) */
  children?: React.ReactNode;
  totalCount: number;
  filteredCount: number;
  selectedCount: number;
  /** Bulk action buttons rendered when selection > 0 */
  bulkActions?: React.ReactNode;
  searchPlaceholder?: string;
}

export function DataGridToolbar<TData>({
  table,
  globalFilter,
  onGlobalFilterChange,
  children,
  totalCount,
  filteredCount,
  selectedCount,
  bulkActions,
  searchPlaceholder = 'Search...',
}: DataGridToolbarProps<TData>) {
  return (
    <>
      <div className="dg-toolbar">
        {/* Search */}
        <div className="dg-toolbar-search">
          <Search size={14} style={{ color: 'var(--dg-text-placeholder)', flexShrink: 0 }} />
          <input
            value={globalFilter}
            onChange={(e) => onGlobalFilterChange(e.target.value)}
            placeholder={searchPlaceholder}
          />
          {globalFilter && (
            <X
              size={14}
              style={{ color: 'var(--dg-text-secondary)', cursor: 'pointer', flexShrink: 0 }}
              onClick={() => onGlobalFilterChange('')}
            />
          )}
        </div>

        {/* Custom toolbar content */}
        {children}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Row count */}
        <span
          style={{
            fontSize: 'var(--dg-font-size-small)',
            color: 'var(--dg-text-secondary)',
            whiteSpace: 'nowrap',
          }}
        >
          {filteredCount === totalCount
            ? `${totalCount} rows`
            : `${filteredCount} of ${totalCount}`}
        </span>
      </div>

      {/* Bulk action bar */}
      {selectedCount > 0 && bulkActions && (
        <div className="dg-bulk-bar">
          <span>{selectedCount} selected</span>
          <span style={{ color: 'var(--dg-border)', margin: '0 4px' }}>|</span>
          {bulkActions}
          <div style={{ flex: 1 }} />
          <button
            className="dg-bulk-btn"
            onClick={() => table.toggleAllRowsSelected(false)}
          >
            <X size={12} /> Clear
          </button>
        </div>
      )}
    </>
  );
}
