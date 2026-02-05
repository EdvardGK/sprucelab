import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Row } from '@tanstack/react-table';
import { getGroupTintColor } from './types';

interface DataGridGroupRowProps<TData> {
  row: Row<TData>;
  groupIndex: number;
}

export function DataGridGroupRow<TData>({ row, groupIndex }: DataGridGroupRowProps<TData>) {
  const tintColor = getGroupTintColor(groupIndex);
  const isExpanded = row.getIsExpanded();
  const leafCount = row.subRows.length;
  const groupValue = row.groupingValue as string;

  return (
    <div
      className="dg-group-row"
      onClick={() => row.toggleExpanded()}
      style={{ borderLeft: `3px solid ${tintColor}` }}
    >
      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      <span>{groupValue}</span>
      <span
        style={{
          fontSize: 'var(--dg-font-size-small)',
          color: 'var(--dg-text-secondary)',
          fontWeight: 400,
          background: 'var(--dg-bg)',
          padding: '1px 8px',
          borderRadius: '10px',
        }}
      >
        {leafCount}
      </span>
    </div>
  );
}
