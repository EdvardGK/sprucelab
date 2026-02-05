import type { Cell } from '@tanstack/react-table';
import type { DataGridColumn } from './types';
import { TextCell } from './cells/TextCell';
import { SelectCell } from './cells/SelectCell';
import { BadgeCell } from './cells/BadgeCell';
import { NumberCell } from './cells/NumberCell';

interface DataGridCellProps<TData> {
  cell: Cell<TData, unknown>;
  isActive: boolean;
  isEditing: boolean;
  onActivate: () => void;
  onStartEdit: () => void;
  onCommitEdit: (value: unknown) => void;
  onCancelEdit: () => void;
  groupTintColor?: string;
}

export function DataGridCell<TData>({
  cell,
  isActive,
  isEditing,
  onActivate,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
}: DataGridCellProps<TData>) {
  const columnDef = cell.column.columnDef as DataGridColumn<TData>;
  const cellType = columnDef.cellType;
  const editable = columnDef.editable;
  const value = cell.getValue();

  const classNames = [
    'dg-cell',
    isActive && 'dg-cell-active',
    isEditing && 'dg-cell-editing',
    editable && 'dg-cell-editable',
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = () => {
    onActivate();
    // For select cells, single click opens the editor
    if (editable && (cellType === 'select')) {
      onStartEdit();
    }
  };

  const handleDoubleClick = () => {
    if (editable && cellType === 'text') {
      onStartEdit();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && editable && isActive && !isEditing) {
      onStartEdit();
    } else if (e.key === 'Escape') {
      onCancelEdit();
    }
  };

  const renderContent = () => {
    switch (cellType) {
      case 'text':
        return (
          <TextCell
            value={value as string | null}
            isEditing={isEditing}
            onCommit={(v) => onCommitEdit(v)}
            onCancel={onCancelEdit}
            onStartEdit={onStartEdit}
          />
        );
      case 'select':
        return (
          <SelectCell
            value={value as string | null}
            options={columnDef.selectOptions || []}
            isEditing={isEditing}
            onCommit={(v) => onCommitEdit(v)}
            onCancel={onCancelEdit}
            onStartEdit={onStartEdit}
            asBadge={cell.column.id === 'mapping_status'}
          />
        );
      case 'badge':
        return <BadgeCell value={value as string | null} />;
      case 'number':
        return <NumberCell value={value as number | null} />;
      default:
        // Default: render raw value
        return (
          <span className="truncate" title={String(value ?? '')}>
            {String(value ?? '')}
          </span>
        );
    }
  };

  return (
    <div
      className={classNames}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      tabIndex={isActive ? 0 : -1}
      role="gridcell"
    >
      {renderContent()}
    </div>
  );
}
