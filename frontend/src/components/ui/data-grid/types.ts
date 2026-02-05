import type { ColumnDef } from '@tanstack/react-table';

export type DataGridColumn<TData> = ColumnDef<TData, unknown> & {
  /** Whether this column's cells are editable */
  editable?: boolean;
  /** Cell type for rendering: text, select, badge, number */
  cellType?: 'text' | 'select' | 'badge' | 'number';
  /** Options for select-type cells */
  selectOptions?: SelectOption[];
  /** Minimum column width in px */
  minWidth?: number;
  /** Default column width in px */
  defaultWidth?: number;
};

export interface SelectOption {
  value: string;
  label: string;
  color?: string;
  bgColor?: string;
}

export interface ActiveCell {
  rowId: string;
  columnId: string;
}

export interface DataGridProps<TData> {
  data: TData[];
  columns: DataGridColumn<TData>[];
  groupBy?: string;
  getRowId: (row: TData) => string;
  onCellEdit?: (rowId: string, columnId: string, value: unknown) => void;
  isLoading?: boolean;
  toolbar?: React.ReactNode;
  emptyState?: React.ReactNode;
  className?: string;
  rowHeight?: number;
  groupRowHeight?: number;
}

export interface CellEditorProps {
  value: unknown;
  onCommit: (value: unknown) => void;
  onCancel: () => void;
  options?: SelectOption[];
}

/** Group tint index cycling */
export function getGroupTintColor(index: number): string {
  const tints = [
    'var(--dg-group-tint-0)',
    'var(--dg-group-tint-1)',
    'var(--dg-group-tint-2)',
    'var(--dg-group-tint-3)',
    'var(--dg-group-tint-4)',
    'var(--dg-group-tint-5)',
    'var(--dg-group-tint-6)',
    'var(--dg-group-tint-7)',
  ];
  return tints[index % tints.length];
}
