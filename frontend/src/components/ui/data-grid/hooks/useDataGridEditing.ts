import { useState, useCallback } from 'react';
import type { ActiveCell } from '../types';

export function useDataGridEditing() {
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const startEditing = useCallback((rowId: string, columnId: string) => {
    setActiveCell({ rowId, columnId });
    setIsEditing(true);
  }, []);

  const stopEditing = useCallback(() => {
    setIsEditing(false);
  }, []);

  const setActive = useCallback((rowId: string, columnId: string) => {
    setActiveCell({ rowId, columnId });
    setIsEditing(false);
  }, []);

  const clearActive = useCallback(() => {
    setActiveCell(null);
    setIsEditing(false);
  }, []);

  const isActiveCell = useCallback(
    (rowId: string, columnId: string) =>
      activeCell?.rowId === rowId && activeCell?.columnId === columnId,
    [activeCell]
  );

  const isEditingCell = useCallback(
    (rowId: string, columnId: string) =>
      isEditing && activeCell?.rowId === rowId && activeCell?.columnId === columnId,
    [isEditing, activeCell]
  );

  return {
    activeCell,
    isEditing,
    startEditing,
    stopEditing,
    setActive,
    clearActive,
    isActiveCell,
    isEditingCell,
  };
}
