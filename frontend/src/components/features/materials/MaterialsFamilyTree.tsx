import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { FAMILIES, type FamilyKey } from '@/lib/material-families';
import { familyColor } from './familyColors';
import type { FamilyNode } from '@/hooks/use-project-materials';

interface MaterialsFamilyTreeProps {
  families: FamilyNode[];
  selectedFamily: FamilyKey | null;
  selectedSubtype: string | null;
  onSelectFamily: (family: FamilyKey | null) => void;
  onSelectSubtype: (subtype: string | null) => void;
}

export function MaterialsFamilyTree({
  families,
  selectedFamily,
  selectedSubtype,
  onSelectFamily,
  onSelectSubtype,
}: MaterialsFamilyTreeProps) {
  const [expandedFamilies, setExpandedFamilies] = useState<Set<FamilyKey>>(
    () => new Set(FAMILIES.map((f) => f.key)),
  );

  const toggleFamilyExpand = (key: FamilyKey) => {
    setExpandedFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-0.5 p-[clamp(0.375rem,0.8vw,0.625rem)]">
        {families.map((family) => (
          <FamilyTreeNode
            key={family.key}
            family={family}
            expanded={expandedFamilies.has(family.key)}
            selectedFamily={selectedFamily}
            selectedSubtype={selectedSubtype}
            onToggleExpand={() => toggleFamilyExpand(family.key)}
            onSelectFamily={() => {
              if (family.key === selectedFamily) {
                onSelectFamily(null);
              } else {
                onSelectFamily(family.key);
              }
              onSelectSubtype(null);
            }}
            onSelectSubtype={(subtypeKey) => {
              onSelectFamily(family.key);
              onSelectSubtype(subtypeKey === selectedSubtype ? null : subtypeKey);
            }}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

interface FamilyTreeNodeProps {
  family: FamilyNode;
  expanded: boolean;
  selectedFamily: FamilyKey | null;
  selectedSubtype: string | null;
  onToggleExpand: () => void;
  onSelectFamily: () => void;
  onSelectSubtype: (key: string) => void;
}

function FamilyTreeNode({
  family,
  expanded,
  selectedFamily,
  selectedSubtype,
  onToggleExpand,
  onSelectFamily,
  onSelectSubtype,
}: FamilyTreeNodeProps) {
  const { t } = useTranslation();
  const isSelected = selectedFamily === family.key;
  const swatch = familyColor(family.key);

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 rounded px-[clamp(0.375rem,0.7vw,0.625rem)] py-[clamp(0.25rem,0.5vh,0.4rem)] cursor-pointer transition-colors',
          isSelected
            ? 'bg-primary/10 text-primary'
            : 'hover:bg-muted/50 text-text-primary',
        )}
        onClick={onSelectFamily}
      >
        {family.subtypes.length > 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="flex h-4 w-4 items-center justify-center text-text-tertiary"
            aria-label={expanded ? 'collapse' : 'expand'}
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <div className="w-4" />
        )}
        <span
          aria-hidden
          className="h-[clamp(0.45rem,0.65vw,0.6rem)] w-[clamp(0.45rem,0.65vw,0.6rem)] rounded-sm shrink-0"
          style={{ background: swatch }}
        />
        <span className="flex-1 truncate text-[clamp(0.625rem,1vw,0.8125rem)] font-medium">
          {t(family.labelKey)}
        </span>
        <Badge
          variant="secondary"
          className="h-4 px-1 text-[clamp(0.5rem,0.8vw,0.625rem)]"
        >
          {family.material_count}
        </Badge>
      </div>
      {expanded && family.subtypes.length > 0 && (
        <div className="ml-4 space-y-0.5 border-l border-border/50 pl-2">
          {family.subtypes.map((s) => {
            const isSubtypeSelected =
              selectedFamily === family.key && selectedSubtype === s.key;
            return (
              <div
                key={s.key}
                className={cn(
                  'flex items-center gap-1 rounded px-[clamp(0.375rem,0.7vw,0.625rem)] py-[clamp(0.2rem,0.4vh,0.3rem)] cursor-pointer transition-colors',
                  isSubtypeSelected
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted/50 text-text-secondary',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSubtype(s.key);
                }}
              >
                <span className="flex-1 truncate text-[clamp(0.5rem,0.9vw,0.6875rem)]">
                  {t(s.labelKey)}
                </span>
                <span className="text-[clamp(0.5rem,0.8vw,0.625rem)] text-text-tertiary">
                  {s.material_count}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
