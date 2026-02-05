import type { Row } from '@tanstack/react-table';
import { DataGridCell } from './DataGridCell';
import { getGroupTintColor } from './types';
import { Check } from 'lucide-react';

interface DataGridRowProps<TData> {
  row: Row<TData>;
  gridTemplateColumns: string;
  groupIndex: number;
  activeRowId: string | null;
  activeColumnId: string | null;
  isEditing: boolean;
  onActivateCell: (rowId: string, columnId: string) => void;
  onStartEdit: (rowId: string, columnId: string) => void;
  onCommitEdit: (rowId: string, columnId: string, value: unknown) => void;
  onCancelEdit: () => void;
}

export function DataGridRow<TData>({
  row,
  gridTemplateColumns,
  groupIndex,
  activeRowId,
  activeColumnId,
  isEditing,
  onActivateCell,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
}: DataGridRowProps<TData>) {
  const tintColor = getGroupTintColor(groupIndex);
  const isSelected = row.getIsSelected();

  return (
    <div
      className={`dg-row ${isSelected ? 'dg-row-selected' : ''}`}
      style={{
        gridTemplateColumns,
        borderLeft: `3px solid ${tintColor}`,
      }}
      data-row-id={row.id}
    >
      {row.getVisibleCells().map((cell) => {
        // Special rendering for the select checkbox column
        if (cell.column.id === 'select') {
          return (
            <div
              key={cell.id}
              className="dg-cell"
              style={{ justifyContent: 'center' }}
            >
              <div
                className={`dg-checkbox ${isSelected ? 'checked' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  row.toggleSelected();
                }}
              >
                {isSelected && <Check size={10} color="white" strokeWidth={3} />}
              </div>
            </div>
          );
        }

        return (
          <DataGridCell
            key={cell.id}
            cell={cell}
            isActive={activeRowId === row.id && activeColumnId === cell.column.id}
            isEditing={isEditing && activeRowId === row.id && activeColumnId === cell.column.id}
            onActivate={() => onActivateCell(row.id, cell.column.id)}
            onStartEdit={() => onStartEdit(row.id, cell.column.id)}
            onCommitEdit={(value) => onCommitEdit(row.id, cell.column.id, value)}
            onCancelEdit={onCancelEdit}
            groupTintColor={tintColor}
          />
        );
      })}
    </div>
  );
}
