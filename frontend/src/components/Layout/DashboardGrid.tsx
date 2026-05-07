import * as React from 'react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

const DESKTOP_COLUMNS = 4;
const TABLET_COLUMNS = 2;
const TABLET_BREAKPOINT_PX = 768;
const DESKTOP_BREAKPOINT_PX = 1024;

export interface DashboardLayoutDefinition {
  rows: number;
  cols: number;
  layout: string[][];
}

export interface GridPosition {
  gridColumn: string;
  gridRow: string;
  colSpan: number;
  rowSpan: number;
}

interface DashboardGridProps {
  layout: DashboardLayoutDefinition;
  className?: string;
  debug?: boolean;
  children: React.ReactNode;
}

function generateGridPositions(layout: string[][]): Record<string, GridPosition> {
  const positions: Record<string, GridPosition> = {};
  const seen = new Set<string>();

  layout.forEach((row, rowIndex) => {
    row.forEach((cellName, colIndex) => {
      if (seen.has(cellName)) return;

      let maxCol = colIndex;
      let maxRow = rowIndex;

      for (let c = colIndex + 1; c < row.length; c++) {
        if (row[c] === cellName) maxCol = c;
        else break;
      }
      for (let r = rowIndex + 1; r < layout.length; r++) {
        if (layout[r][colIndex] === cellName) maxRow = r;
        else break;
      }

      positions[cellName] = {
        gridColumn: `${colIndex + 1} / ${maxCol + 2}`,
        gridRow: `${rowIndex + 1} / ${maxRow + 2}`,
        colSpan: maxCol - colIndex + 1,
        rowSpan: maxRow - rowIndex + 1,
      };
      seen.add(cellName);
    });
  });

  return positions;
}

function validateLayout(layout: string[][]): string[] {
  const errors: string[] = [];
  const occurrences = new Map<string, Array<{ row: number; col: number }>>();

  layout.forEach((row, rowIndex) =>
    row.forEach((cellName, colIndex) => {
      const list = occurrences.get(cellName) ?? [];
      list.push({ row: rowIndex, col: colIndex });
      occurrences.set(cellName, list);
    })
  );

  occurrences.forEach((cells, name) => {
    if (cells.length === 1) return;
    const rows = new Set(cells.map((c) => c.row));
    const cols = new Set(cells.map((c) => c.col));
    if (rows.size * cols.size !== cells.length) {
      errors.push(`Cell "${name}" doesn't form a rectangle`);
    }
  });

  return errors;
}

function useViewport() {
  const [width, setWidth] = useState(() =>
    typeof window === 'undefined' ? DESKTOP_BREAKPOINT_PX : window.innerWidth
  );

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return {
    width,
    isMobile: width < TABLET_BREAKPOINT_PX,
    isTablet: width >= TABLET_BREAKPOINT_PX && width < DESKTOP_BREAKPOINT_PX,
  };
}

export function DashboardGrid({ layout, className, debug = false, children }: DashboardGridProps) {
  const { width, isMobile, isTablet } = useViewport();
  const positions = generateGridPositions(layout.layout);
  const errors = validateLayout(layout.layout);

  if (import.meta.env.DEV && errors.length > 0) {
    console.warn('DashboardGrid validation:', errors);
  }

  if (isMobile) {
    return (
      <div className={cn('flex flex-col gap-4 w-full', className)}>
        {children}
        {debug && <DebugPanel viewport={width} mode="mobile" />}
      </div>
    );
  }

  const cols = isTablet ? TABLET_COLUMNS : DESKTOP_COLUMNS;
  const rows = isTablet ? Math.ceil(layout.rows * 2) : layout.rows;

  return (
    <div className={cn('w-full h-full', className)}>
      <div
        className="grid gap-3 w-full h-full"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) return child;
          const id = (child.props as { id?: string }).id;
          if (!id || isTablet) return child;
          const position = positions[id];
          if (!position) return child;
          return React.cloneElement(child as React.ReactElement<{ style?: React.CSSProperties }>, {
            style: {
              gridColumn: position.gridColumn,
              gridRow: position.gridRow,
              ...(child.props as { style?: React.CSSProperties }).style,
            },
          });
        })}
      </div>
      {debug && <DebugPanel viewport={width} mode={isTablet ? 'tablet' : 'desktop'} errors={errors} />}
    </div>
  );
}

function DebugPanel({
  viewport,
  mode,
  errors = [],
}: {
  viewport: number;
  mode: 'mobile' | 'tablet' | 'desktop';
  errors?: string[];
}) {
  return (
    <div className="mt-4 rounded-md border border-border bg-surface p-3 text-xs text-text-secondary">
      <div className="font-mono">
        viewport={viewport}px mode={mode}
      </div>
      {errors.length > 0 && (
        <div className="mt-1 text-error">errors: {errors.join('; ')}</div>
      )}
    </div>
  );
}

export { generateGridPositions, validateLayout };
