import { useRef, useEffect } from 'react';
import type { SelectOption } from '../types';

interface SelectCellProps {
  value: string | null | undefined;
  options: SelectOption[];
  isEditing: boolean;
  onCommit: (value: string) => void;
  onCancel: () => void;
  onStartEdit: () => void;
  /** If true, render the value as a colored badge */
  asBadge?: boolean;
}

export function SelectCell({
  value,
  options,
  isEditing,
  onCommit,
  onCancel,
  onStartEdit,
  asBadge = false,
}: SelectCellProps) {
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (isEditing) {
      requestAnimationFrame(() => {
        selectRef.current?.focus();
      });
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <select
        ref={selectRef}
        className="dg-cell-select"
        value={value ?? ''}
        onChange={(e) => onCommit(e.target.value)}
        onBlur={() => onCancel()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onCancel();
          }
          e.stopPropagation();
        }}
      >
        <option value="">—</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  const selectedOption = options.find((o) => o.value === value);

  if (asBadge && selectedOption) {
    return (
      <span
        className={`dg-badge dg-badge-${value}`}
        onClick={onStartEdit}
        style={{ cursor: 'pointer' }}
      >
        {selectedOption.label}
      </span>
    );
  }

  return (
    <span
      className="truncate"
      onClick={onStartEdit}
      style={{
        cursor: 'pointer',
        color: value ? undefined : 'var(--dg-text-placeholder)',
      }}
    >
      {selectedOption?.label || value || '—'}
    </span>
  );
}
