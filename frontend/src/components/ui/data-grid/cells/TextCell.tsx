import { useState, useRef, useEffect } from 'react';

interface TextCellProps {
  value: string | null | undefined;
  isEditing: boolean;
  onCommit: (value: string) => void;
  onCancel: () => void;
  onStartEdit: () => void;
  placeholder?: string;
}

export function TextCell({ value, isEditing, onCommit, onCancel, onStartEdit, placeholder }: TextCellProps) {
  const [editValue, setEditValue] = useState(value ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setEditValue(value ?? '');
      // Small delay to ensure DOM is ready
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isEditing, value]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        className="dg-cell-input"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onCommit(editValue);
          } else if (e.key === 'Escape') {
            onCancel();
          }
          e.stopPropagation();
        }}
        onBlur={() => onCommit(editValue)}
      />
    );
  }

  return (
    <span
      className="truncate"
      onDoubleClick={onStartEdit}
      title={value ?? undefined}
      style={{ color: value ? undefined : 'var(--dg-text-placeholder)' }}
    >
      {value || placeholder || ''}
    </span>
  );
}
