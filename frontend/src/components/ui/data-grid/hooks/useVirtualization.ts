import { useVirtualizer } from '@tanstack/react-virtual';
import type { Row } from '@tanstack/react-table';
import type { RefObject } from 'react';

interface UseDataGridVirtualizerOptions<TData> {
  rows: Row<TData>[];
  parentRef: RefObject<HTMLDivElement | null>;
  rowHeight?: number;
  groupRowHeight?: number;
  overscan?: number;
}

export function useDataGridVirtualizer<TData>({
  rows,
  parentRef,
  rowHeight = 36,
  groupRowHeight = 40,
  overscan = 20,
}: UseDataGridVirtualizerOptions<TData>) {
  return useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      return row.getIsGrouped() ? groupRowHeight : rowHeight;
    },
    overscan,
  });
}
