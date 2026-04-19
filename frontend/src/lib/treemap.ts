/**
 * Squarified treemap layout algorithm.
 * Takes labeled values and container dimensions, returns positioned rectangles.
 */

export interface TreemapItem {
  label: string;
  value: number;
}

export interface TreemapRect {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  value: number;
}

export function treemapLayout(items: TreemapItem[], W: number, H: number): TreemapRect[] {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!total) return [];

  const sorted = [...items].sort((a, b) => b.value - a.value);
  const rects: TreemapRect[] = [];
  let x = 0, y = 0, w = W, h = H;

  function layoutRow(row: typeof sorted, rowArea: number) {
    const rowSum = row.reduce((s, i) => s + i.value, 0);

    if (w >= h) {
      const colWidth = rowArea / h;
      let offsetY = y;
      for (const item of row) {
        const itemH = (item.value / rowSum) * h;
        rects.push({ x, y: offsetY, w: colWidth, h: itemH, label: item.label, value: item.value });
        offsetY += itemH;
      }
      x += colWidth;
      w -= colWidth;
    } else {
      const rowHeight = rowArea / w;
      let offsetX = x;
      for (const item of row) {
        const itemW = (item.value / rowSum) * w;
        rects.push({ x: offsetX, y, w: itemW, h: rowHeight, label: item.label, value: item.value });
        offsetX += itemW;
      }
      y += rowHeight;
      h -= rowHeight;
    }
  }

  function worst(row: typeof sorted, side: number) {
    const rowSum = row.reduce((s, i) => s + i.value, 0);
    const rowArea = (rowSum / total) * W * H;
    const stripSize = rowArea / side;
    let mx = 0;
    for (const item of row) {
      const itemSide = (item.value / rowSum) * side;
      const r = Math.max(stripSize / itemSide, itemSide / stripSize);
      mx = Math.max(mx, r);
    }
    return mx;
  }

  let remaining = [...sorted];
  while (remaining.length > 0) {
    const side = Math.min(w, h);
    const row = [remaining[0]];
    remaining = remaining.slice(1);

    while (remaining.length > 0) {
      const candidate = [...row, remaining[0]];
      if (worst(candidate, side) <= worst(row, side)) {
        row.push(remaining[0]);
        remaining = remaining.slice(1);
      } else break;
    }

    const rowArea = row.reduce((s, i) => s + (i.value / total) * W * H, 0);
    layoutRow(row, rowArea);
  }

  return rects;
}
