/**
 * Type Navigation Hook
 *
 * Manages navigation state and keyboard shortcuts for the focused type mapping view.
 * Supports: arrow keys for navigation, hotkeys for quick actions.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import type { IFCType } from './use-warehouse';

interface TypeNavigationOptions {
  types: IFCType[];
  enabled?: boolean;
  autoAdvanceOnSave?: boolean;
  onSave?: (type: IFCType) => void;
  onIgnore?: (type: IFCType) => void;
  onFollowUp?: (type: IFCType) => void;
}

interface TypeNavigationResult {
  // Current state
  currentIndex: number;
  currentType: IFCType | null;
  totalCount: number;

  // Navigation
  hasPrevious: boolean;
  hasNext: boolean;
  goToPrevious: () => void;
  goToNext: () => void;
  goToIndex: (index: number) => void;

  // Filtering
  filterStatus: MappingStatusFilter;
  setFilterStatus: (status: MappingStatusFilter) => void;
  filteredTypes: IFCType[];

  // Actions
  handleSave: () => void;
  handleIgnore: () => void;
  handleFollowUp: () => void;
}

export type MappingStatusFilter = 'all' | 'pending' | 'mapped' | 'ignored' | 'review' | 'followup';

export function useTypeNavigation({
  types,
  enabled = true,
  autoAdvanceOnSave = true,
  onSave,
  onIgnore,
  onFollowUp,
}: TypeNavigationOptions): TypeNavigationResult {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [filterStatus, setFilterStatus] = useState<MappingStatusFilter>('all');

  // Filter types by status
  const filteredTypes = useMemo(() => {
    if (filterStatus === 'all') return types;
    return types.filter((t) => {
      const status = t.mapping?.mapping_status || 'pending';
      return status === filterStatus;
    });
  }, [types, filterStatus]);

  const totalCount = filteredTypes.length;
  const currentType = filteredTypes[currentIndex] ?? null;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < totalCount - 1;

  // Reset index when filter changes or types list changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [filterStatus, types.length]);

  // Keep index in bounds
  useEffect(() => {
    if (currentIndex >= totalCount && totalCount > 0) {
      setCurrentIndex(totalCount - 1);
    }
  }, [currentIndex, totalCount]);

  const goToPrevious = useCallback(() => {
    if (hasPrevious) {
      setCurrentIndex((i) => i - 1);
    }
  }, [hasPrevious]);

  const goToNext = useCallback(() => {
    if (hasNext) {
      setCurrentIndex((i) => i + 1);
    }
  }, [hasNext]);

  const goToIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < totalCount) {
        setCurrentIndex(index);
      }
    },
    [totalCount]
  );

  const advanceIfEnabled = useCallback(() => {
    if (autoAdvanceOnSave && hasNext) {
      setCurrentIndex((i) => i + 1);
    }
  }, [autoAdvanceOnSave, hasNext]);

  const handleSave = useCallback(() => {
    if (currentType && onSave) {
      onSave(currentType);
      advanceIfEnabled();
    }
  }, [currentType, onSave, advanceIfEnabled]);

  const handleIgnore = useCallback(() => {
    if (currentType && onIgnore) {
      onIgnore(currentType);
      advanceIfEnabled();
    }
  }, [currentType, onIgnore, advanceIfEnabled]);

  const handleFollowUp = useCallback(() => {
    if (currentType && onFollowUp) {
      onFollowUp(currentType);
      advanceIfEnabled();
    }
  }, [currentType, onFollowUp, advanceIfEnabled]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          goToPrevious();
          break;
        case 'ArrowRight':
          e.preventDefault();
          goToNext();
          break;
        case 'a':
        case 'A':
          e.preventDefault();
          handleSave();
          break;
        case 'i':
        case 'I':
          e.preventDefault();
          handleIgnore();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          handleFollowUp();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, goToPrevious, goToNext, handleSave, handleIgnore, handleFollowUp]);

  return {
    currentIndex,
    currentType,
    totalCount,
    hasPrevious,
    hasNext,
    goToPrevious,
    goToNext,
    goToIndex,
    filterStatus,
    setFilterStatus,
    filteredTypes,
    handleSave,
    handleIgnore,
    handleFollowUp,
  };
}

/**
 * Get counts by status for summary display.
 */
export function getStatusCounts(types: IFCType[]): Record<MappingStatusFilter, number> {
  const counts: Record<MappingStatusFilter, number> = {
    all: types.length,
    pending: 0,
    mapped: 0,
    ignored: 0,
    review: 0,
    followup: 0,
  };

  for (const type of types) {
    const status = (type.mapping?.mapping_status || 'pending') as MappingStatusFilter;
    if (status in counts) {
      counts[status]++;
    }
  }

  return counts;
}
