/**
 * SandwichDiagram
 *
 * SVG stacked rectangle diagram showing material layer composition of a type.
 * Each layer is a horizontal band proportional to its thickness, colored by
 * material category. Shows layer names and thicknesses on hover.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { TypeDefinitionLayer } from '@/hooks/use-warehouse';

// Material name -> color mapping (heuristic-based)
const LAYER_COLORS: Record<string, string> = {
  concrete: '#94a3b8',    // slate
  betong: '#94a3b8',
  steel: '#64748b',       // gray-blue
  stål: '#64748b',
  wood: '#d4a574',        // warm brown
  tre: '#d4a574',
  timber: '#d4a574',
  insulation: '#fbbf24',  // amber
  isolasjon: '#fbbf24',
  mineral: '#fbbf24',
  rockwool: '#fbbf24',
  gypsum: '#e2e8f0',      // light gray
  gips: '#e2e8f0',
  brick: '#dc7c5a',       // terracotta
  tegl: '#dc7c5a',
  glass: '#93c5fd',       // light blue
  membrane: '#6ee7b7',    // green
  membran: '#6ee7b7',
  air: '#f8fafc',         // near white
  luft: '#f8fafc',
  cladding: '#a78bfa',    // purple
  kledning: '#a78bfa',
  finish: '#fda4af',      // pink
  paint: '#fda4af',
};

const DEFAULT_COLORS = [
  '#94a3b8', '#d4a574', '#fbbf24', '#e2e8f0',
  '#dc7c5a', '#93c5fd', '#6ee7b7', '#a78bfa',
];

function getLayerColor(materialName: string, index: number): string {
  const lower = materialName.toLowerCase();
  for (const [keyword, color] of Object.entries(LAYER_COLORS)) {
    if (lower.includes(keyword)) return color;
  }
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

interface SandwichDiagramProps {
  layers: TypeDefinitionLayer[];
  height?: number;
  className?: string;
}

export function SandwichDiagram({
  layers,
  height = 160,
  className,
}: SandwichDiagramProps) {
  const { t } = useTranslation();

  const sortedLayers = useMemo(
    () => [...layers].sort((a, b) => a.layer_order - b.layer_order),
    [layers]
  );

  const totalThickness = useMemo(
    () => sortedLayers.reduce((sum, l) => sum + (l.thickness_mm ?? 10), 0),
    [sortedLayers]
  );

  if (sortedLayers.length === 0) {
    return (
      <div className={cn('flex items-center justify-center text-muted-foreground text-[clamp(0.5rem,1vw,0.625rem)]', className)}>
        {t('sandwich.noLayers', 'No material layers defined')}
      </div>
    );
  }

  const width = 200;
  const padding = 4;
  const labelWidth = 120;
  const barWidth = width - labelWidth - padding * 2;
  const usableHeight = height - padding * 2;

  let currentY = padding;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        className="border border-border rounded"
      >
        {sortedLayers.map((layer, i) => {
          const thickness = layer.thickness_mm ?? 10;
          const layerHeight = Math.max(
            12,
            (thickness / totalThickness) * usableHeight
          );
          const y = currentY;
          currentY += layerHeight;
          const color = getLayerColor(layer.material_name, i);

          return (
            <g key={layer.id ?? i}>
              {/* Material bar */}
              <rect
                x={padding}
                y={y}
                width={barWidth}
                height={layerHeight - 1}
                fill={color}
                rx={2}
                stroke="#e2e8f0"
                strokeWidth={0.5}
              />
              {/* Label */}
              <text
                x={barWidth + padding + 4}
                y={y + layerHeight / 2}
                dominantBaseline="central"
                className="fill-foreground"
                fontSize={9}
              >
                {layer.material_name}
              </text>
              {/* Thickness */}
              {layer.thickness_mm && (
                <text
                  x={padding + barWidth / 2}
                  y={y + layerHeight / 2}
                  dominantBaseline="central"
                  textAnchor="middle"
                  className="fill-foreground/70"
                  fontSize={8}
                  fontWeight={500}
                >
                  {layer.thickness_mm}mm
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {/* Total thickness annotation */}
      <div className="text-[clamp(0.5rem,1vw,0.625rem)] text-muted-foreground text-center">
        {t('sandwich.totalThickness', 'Total')}: {totalThickness}mm
      </div>
    </div>
  );
}
