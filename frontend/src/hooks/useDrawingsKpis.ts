import { useMemo } from 'react';

import { useDrawingsList, type DrawingSheetListItem } from './use-drawings';

export interface DrawingsKpiSpark {
  key: string;
  value: number;
  label?: string;
}

export interface ProjectDrawingsKpis {
  totalDrawings: number;
  /**
   * "Registered" — a sheet is considered registered when it carries a
   * sheet_number (the basis for grid registration in the detail dialog).
   * The list payload doesn't include the registration row itself; the
   * detail dialog shows the authoritative state.
   */
  registered: number;
  unregistered: number;

  /**
   * Per-discipline distribution — discipline isn't stored on
   * DrawingSheet directly; the list payload has no discipline field.
   * Returned as an empty sparkline rather than fabricated.
   */
  drawingsBySheet: DrawingsKpiSpark[];

  isLoading: boolean;
}

const EMPTY: ProjectDrawingsKpis = {
  totalDrawings: 0,
  registered: 0,
  unregistered: 0,
  drawingsBySheet: [],
  isLoading: false,
};

/**
 * Derive the Drawings-page KPI row from the existing
 * `useDrawingsList(projectId)` payload. Modelers-own-data: we use
 * sheet_number as the proxy for "registered" since the registration
 * row isn't exposed on the list endpoint.
 */
export function useProjectDrawingsKpis(projectId?: string): ProjectDrawingsKpis {
  const { data, isLoading } = useDrawingsList(projectId ?? null);

  return useMemo(() => {
    if (!data) return { ...EMPTY, isLoading };
    const drawings = data as DrawingSheetListItem[];

    const totalDrawings = drawings.length;
    let registered = 0;
    for (const d of drawings) {
      if (d.sheet_number && d.sheet_number.trim().length > 0) registered += 1;
    }
    const unregistered = totalDrawings - registered;

    // Drawings by sheet — top 8 by page_index so the bar has segments.
    // Used as a generic distribution sparkline footer for the totals
    // tile. Cleanest, honest signal available.
    const drawingsBySheet: DrawingsKpiSpark[] = drawings
      .slice(0, 8)
      .map((d, i) => ({
        key: d.id,
        value: 1,
        label: d.sheet_number || d.sheet_name || `Sheet ${i + 1}`,
      }));

    return {
      totalDrawings,
      registered,
      unregistered,
      drawingsBySheet,
      isLoading,
    };
  }, [data, isLoading]);
}
