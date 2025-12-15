/**
 * Mapping Progress Bar
 *
 * Shows overall mapping progress for a model's types.
 * Displays: "Type X of Y" with progress bar and navigation buttons.
 */

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Keyboard } from 'lucide-react';
import type { MappingSummary } from '@/hooks/use-warehouse';

interface MappingProgressBarProps {
  currentIndex: number;
  totalCount: number;
  summary?: MappingSummary | null;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  showKeyboardHint?: boolean;
  className?: string;
}

export function MappingProgressBar({
  currentIndex,
  totalCount,
  summary,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  showKeyboardHint = true,
  className,
}: MappingProgressBarProps) {
  const progressPercent = summary?.progress_percent ?? 0;

  return (
    <div className={cn('flex items-center gap-4', className)}>
      {/* Type Counter */}
      <div className="flex items-center gap-2 min-w-[120px]">
        <span className="text-sm text-text-secondary">Type</span>
        <span className="font-medium text-text-primary tabular-nums">
          {currentIndex + 1}
        </span>
        <span className="text-text-tertiary">of</span>
        <span className="font-medium text-text-primary tabular-nums">{totalCount}</span>
      </div>

      {/* Progress Bar */}
      <div className="flex-1 flex items-center gap-3">
        <Progress value={progressPercent} className="h-2 flex-1" />
        <span className="text-sm text-text-secondary tabular-nums min-w-[50px]">
          {Math.round(progressPercent)}% mapped
        </span>
      </div>

      {/* Summary Stats (optional) */}
      {summary && (
        <div className="hidden md:flex items-center gap-3 text-xs">
          <StatusPill count={summary.mapped} label="Mapped" color="green" />
          <StatusPill count={summary.pending} label="Pending" color="gray" />
          <StatusPill count={summary.review} label="Review" color="yellow" />
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrevious}
          disabled={!hasPrevious}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Prev</span>
          {showKeyboardHint && (
            <kbd className="hidden lg:inline-flex ml-1 px-1 py-0.5 text-[10px] bg-background-tertiary rounded">
              ←
            </kbd>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={!hasNext}
          className="gap-1"
        >
          <span className="hidden sm:inline">Next</span>
          {showKeyboardHint && (
            <kbd className="hidden lg:inline-flex mr-1 px-1 py-0.5 text-[10px] bg-background-tertiary rounded">
              →
            </kbd>
          )}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function StatusPill({
  count,
  label,
  color,
}: {
  count: number;
  label: string;
  color: 'green' | 'gray' | 'yellow' | 'red';
}) {
  const colorClasses = {
    green: 'text-green-600',
    gray: 'text-gray-500',
    yellow: 'text-yellow-600',
    red: 'text-red-600',
  };

  return (
    <span className={cn('tabular-nums', colorClasses[color])}>
      <span className="font-medium">{count}</span>
      <span className="text-text-tertiary ml-1">{label}</span>
    </span>
  );
}

/**
 * Keyboard shortcuts hint panel.
 */
export function KeyboardShortcutsHint({ className }: { className?: string }) {
  const shortcuts = [
    { key: '←', action: 'Previous type' },
    { key: '→', action: 'Next type (skip)' },
    { key: 'A', action: 'Accept & save' },
    { key: 'I', action: 'Mark ignored' },
    { key: 'F', action: 'Mark follow-up' },
  ];

  return (
    <div className={cn('flex items-center gap-4 text-xs text-text-tertiary', className)}>
      <Keyboard className="h-4 w-4" />
      {shortcuts.map(({ key, action }) => (
        <span key={key} className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 bg-background-tertiary rounded font-mono">
            {key}
          </kbd>
          <span>{action}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Compact version for mobile/narrow layouts.
 */
export function MappingProgressCompact({
  currentIndex,
  totalCount,
  progressPercent,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  className,
}: {
  currentIndex: number;
  totalCount: number;
  progressPercent: number;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button variant="ghost" size="icon" onClick={onPrevious} disabled={!hasPrevious}>
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex-1 text-center">
        <div className="text-sm font-medium tabular-nums">
          {currentIndex + 1} / {totalCount}
        </div>
        <Progress value={progressPercent} className="h-1 mt-1" />
      </div>

      <Button variant="ghost" size="icon" onClick={onNext} disabled={!hasNext}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
