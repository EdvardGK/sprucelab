import { useState, useCallback, useEffect, useMemo } from 'react';
import type { ClaimListItem } from '@/lib/claims-types';

interface ClaimNavigationOptions {
  claims: ClaimListItem[];
  enabled?: boolean;
  autoAdvance?: boolean;
  onApprove?: (claim: ClaimListItem) => void;
  onOpenReject?: (claim: ClaimListItem) => void;
  onOpenSupersede?: (claim: ClaimListItem) => void;
  onFocusSearch?: () => void;
}

interface ClaimNavigationResult {
  currentIndex: number;
  currentClaim: ClaimListItem | null;
  totalCount: number;
  hasPrevious: boolean;
  hasNext: boolean;
  goToPrevious: () => void;
  goToNext: () => void;
  goToIndex: (index: number) => void;
  goToClaim: (claimId: string) => void;
  handleApprove: () => void;
  handleOpenReject: () => void;
  handleOpenSupersede: () => void;
}

export function useClaimNavigation({
  claims,
  enabled = true,
  autoAdvance = true,
  onApprove,
  onOpenReject,
  onOpenSupersede,
  onFocusSearch,
}: ClaimNavigationOptions): ClaimNavigationResult {
  const [currentIndex, setCurrentIndex] = useState(0);

  const totalCount = claims.length;
  const currentClaim = claims[currentIndex] ?? null;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < totalCount - 1;

  const claimIndexById = useMemo(() => {
    const map = new Map<string, number>();
    claims.forEach((c, idx) => map.set(c.id, idx));
    return map;
  }, [claims]);

  // Keep index in bounds when the list shrinks (e.g. after promote filters out
  // the current claim). Clamp to last valid index, never below zero.
  useEffect(() => {
    if (totalCount === 0) {
      if (currentIndex !== 0) setCurrentIndex(0);
      return;
    }
    if (currentIndex >= totalCount) {
      setCurrentIndex(totalCount - 1);
    }
  }, [currentIndex, totalCount]);

  const goToPrevious = useCallback(() => {
    if (hasPrevious) setCurrentIndex((i) => i - 1);
  }, [hasPrevious]);

  const goToNext = useCallback(() => {
    if (hasNext) setCurrentIndex((i) => i + 1);
  }, [hasNext]);

  const goToIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < totalCount) {
        setCurrentIndex(index);
      }
    },
    [totalCount],
  );

  const goToClaim = useCallback(
    (claimId: string) => {
      const idx = claimIndexById.get(claimId);
      if (idx !== undefined) setCurrentIndex(idx);
    },
    [claimIndexById],
  );

  const advanceIfEnabled = useCallback(() => {
    if (autoAdvance && hasNext) setCurrentIndex((i) => i + 1);
  }, [autoAdvance, hasNext]);

  const handleApprove = useCallback(() => {
    if (currentClaim && onApprove) {
      onApprove(currentClaim);
      advanceIfEnabled();
    }
  }, [currentClaim, onApprove, advanceIfEnabled]);

  const handleOpenReject = useCallback(() => {
    if (currentClaim && onOpenReject) {
      onOpenReject(currentClaim);
    }
  }, [currentClaim, onOpenReject]);

  const handleOpenSupersede = useCallback(() => {
    if (currentClaim && onOpenSupersede) {
      onOpenSupersede(currentClaim);
    }
  }, [currentClaim, onOpenSupersede]);

  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        // The exception: '/' should still focus search while not inside an input.
        return;
      }
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          goToPrevious();
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          goToNext();
          break;
        case 'a':
        case 'A':
          e.preventDefault();
          handleApprove();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          handleOpenReject();
          break;
        case 's':
        case 'S':
          e.preventDefault();
          handleOpenSupersede();
          break;
        case '/':
          if (onFocusSearch) {
            e.preventDefault();
            onFocusSearch();
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, goToPrevious, goToNext, handleApprove, handleOpenReject, handleOpenSupersede, onFocusSearch]);

  return {
    currentIndex,
    currentClaim,
    totalCount,
    hasPrevious,
    hasNext,
    goToPrevious,
    goToNext,
    goToIndex,
    goToClaim,
    handleApprove,
    handleOpenReject,
    handleOpenSupersede,
  };
}
