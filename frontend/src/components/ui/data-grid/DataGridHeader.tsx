import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { Table } from '@tanstack/react-table';

interface DataGridHeaderProps<TData> {
  table: Table<TData>;
  gridTemplateColumns: string;
}

export function DataGridHeader<TData>({ table, gridTemplateColumns }: DataGridHeaderProps<TData>) {
  return (
    <div className="dg-header" style={{ gridTemplateColumns }}>
      {table.getFlatHeaders().map((header) => {
        const canSort = header.column.getCanSort();
        const sorted = header.column.getIsSorted();

        return (
          <div
            key={header.id}
            className="dg-header-cell"
            onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
            style={{
              cursor: canSort ? 'pointer' : 'default',
            }}
          >
            <span className="truncate">
              {header.isPlaceholder
                ? null
                : typeof header.column.columnDef.header === 'function'
                  ? header.column.columnDef.header({
                      column: header.column,
                      header,
                      table,
                    } as any)
                  : header.column.columnDef.header}
            </span>
            {canSort && (
              <span style={{ opacity: sorted ? 1 : 0.3, flexShrink: 0 }}>
                {sorted === 'asc' ? (
                  <ArrowUp size={12} />
                ) : sorted === 'desc' ? (
                  <ArrowDown size={12} />
                ) : (
                  <ArrowUpDown size={12} />
                )}
              </span>
            )}
            {header.column.getCanResize() && (
              <div
                className={`dg-resize-handle ${header.column.getIsResizing() ? 'resizing' : ''}`}
                onMouseDown={header.getResizeHandler()}
                onTouchStart={header.getResizeHandler()}
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
