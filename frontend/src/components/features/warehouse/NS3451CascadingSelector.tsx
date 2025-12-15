/**
 * NS3451 Cascading Selector
 *
 * 4-level cascading dropdown for NS3451 classification codes.
 * Each level depends on the parent selection.
 */

import { useMemo, useCallback } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useNS3451Hierarchy, type NS3451HierarchyNode } from '@/hooks/use-warehouse';
import { Loader2 } from 'lucide-react';

interface NS3451CascadingSelectorProps {
  value: string | null;
  onChange: (code: string | null) => void;
  disabled?: boolean;
  className?: string;
}

interface LevelSelection {
  level1: string | null;
  level2: string | null;
  level3: string | null;
  level4: string | null;
}

/**
 * Parse an NS3451 code into its level components.
 * e.g., "2341" -> { level1: "2", level2: "23", level3: "234", level4: "2341" }
 */
function parseCodeToLevels(code: string | null): LevelSelection {
  if (!code) {
    return { level1: null, level2: null, level3: null, level4: null };
  }

  return {
    level1: code.length >= 1 ? code[0] : null,
    level2: code.length >= 2 ? code.slice(0, 2) : null,
    level3: code.length >= 3 ? code.slice(0, 3) : null,
    level4: code.length >= 4 ? code.slice(0, 4) : null,
  };
}

export function NS3451CascadingSelector({
  value,
  onChange,
  disabled = false,
  className,
}: NS3451CascadingSelectorProps) {
  const { data: hierarchy, isLoading } = useNS3451Hierarchy();

  // Parse current value into level selections
  const currentLevels = useMemo(() => parseCodeToLevels(value), [value]);

  // Get options for each level
  const level1Options = useMemo(() => {
    if (!hierarchy) return [];
    return Object.values(hierarchy).map((node) => ({
      code: node.code,
      name: node.name,
    }));
  }, [hierarchy]);

  const level2Options = useMemo(() => {
    if (!hierarchy || !currentLevels.level1) return [];
    const parent = hierarchy[currentLevels.level1];
    if (!parent) return [];
    return Object.values(parent.children).map((node) => ({
      code: node.code,
      name: node.name,
    }));
  }, [hierarchy, currentLevels.level1]);

  const level3Options = useMemo(() => {
    if (!hierarchy || !currentLevels.level1 || !currentLevels.level2) return [];
    const l1 = hierarchy[currentLevels.level1];
    if (!l1) return [];
    const l2 = l1.children[currentLevels.level2];
    if (!l2) return [];
    return Object.values(l2.children).map((node) => ({
      code: node.code,
      name: node.name,
    }));
  }, [hierarchy, currentLevels.level1, currentLevels.level2]);

  const level4Options = useMemo(() => {
    if (!hierarchy || !currentLevels.level1 || !currentLevels.level2 || !currentLevels.level3)
      return [];
    const l1 = hierarchy[currentLevels.level1];
    if (!l1) return [];
    const l2 = l1.children[currentLevels.level2];
    if (!l2) return [];
    const l3 = l2.children[currentLevels.level3];
    if (!l3) return [];
    return Object.values(l3.children).map((node) => ({
      code: node.code,
      name: node.name,
    }));
  }, [hierarchy, currentLevels.level1, currentLevels.level2, currentLevels.level3]);

  // Get current node info for displaying descriptions
  const getCurrentNode = useCallback(
    (code: string | null): NS3451HierarchyNode | null => {
      if (!hierarchy || !code) return null;

      const l1 = hierarchy[code[0]];
      if (!l1) return null;
      if (code.length === 1) return l1;

      const l2 = l1.children[code.slice(0, 2)];
      if (!l2) return null;
      if (code.length === 2) return l2;

      const l3 = l2.children[code.slice(0, 3)];
      if (!l3) return null;
      if (code.length === 3) return l3;

      const l4 = l3.children[code.slice(0, 4)];
      return l4 || null;
    },
    [hierarchy]
  );

  // Handle level selection changes
  const handleLevel1Change = useCallback(
    (code: string) => {
      if (code === 'clear') {
        onChange(null);
      } else {
        onChange(code);
      }
    },
    [onChange]
  );

  const handleLevel2Change = useCallback(
    (code: string) => {
      if (code === 'clear') {
        onChange(currentLevels.level1);
      } else {
        onChange(code);
      }
    },
    [onChange, currentLevels.level1]
  );

  const handleLevel3Change = useCallback(
    (code: string) => {
      if (code === 'clear') {
        onChange(currentLevels.level2);
      } else {
        onChange(code);
      }
    },
    [onChange, currentLevels.level2]
  );

  const handleLevel4Change = useCallback(
    (code: string) => {
      if (code === 'clear') {
        onChange(currentLevels.level3);
      } else {
        onChange(code);
      }
    },
    [onChange, currentLevels.level3]
  );

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center py-4 ${className}`}>
        <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
      </div>
    );
  }

  const selectedNode = getCurrentNode(value);

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Level 1 */}
      <div className="space-y-1">
        <Label className="text-xs text-text-secondary">Level 1 - Hovedkategori</Label>
        <Select
          value={currentLevels.level1 || 'clear'}
          onValueChange={handleLevel1Change}
          disabled={disabled}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Velg hovedkategori..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="clear" className="text-text-tertiary">
              -- Fjern valg --
            </SelectItem>
            {level1Options.map((opt) => (
              <SelectItem key={opt.code} value={opt.code}>
                {opt.code} - {opt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Level 2 */}
      <div className="space-y-1">
        <Label className="text-xs text-text-secondary">Level 2 - Underkategori</Label>
        <Select
          value={currentLevels.level2 || 'clear'}
          onValueChange={handleLevel2Change}
          disabled={disabled || !currentLevels.level1}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Velg underkategori..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="clear" className="text-text-tertiary">
              -- Fjern valg --
            </SelectItem>
            {level2Options.map((opt) => (
              <SelectItem key={opt.code} value={opt.code}>
                {opt.code} - {opt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Level 3 */}
      <div className="space-y-1">
        <Label className="text-xs text-text-secondary">Level 3 - Detalj</Label>
        <Select
          value={currentLevels.level3 || 'clear'}
          onValueChange={handleLevel3Change}
          disabled={disabled || !currentLevels.level2}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Velg detaljkode..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="clear" className="text-text-tertiary">
              -- Fjern valg --
            </SelectItem>
            {level3Options.map((opt) => (
              <SelectItem key={opt.code} value={opt.code}>
                {opt.code} - {opt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Level 4 (optional) */}
      {level4Options.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs text-text-secondary">Level 4 - Utvidet detalj</Label>
          <Select
            value={currentLevels.level4 || 'clear'}
            onValueChange={handleLevel4Change}
            disabled={disabled || !currentLevels.level3}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Velg utvidet detalj..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="clear" className="text-text-tertiary">
                -- Fjern valg --
              </SelectItem>
              {level4Options.map((opt) => (
                <SelectItem key={opt.code} value={opt.code}>
                  {opt.code} - {opt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Current selection description */}
      {selectedNode && (
        <div className="rounded-md bg-background-tertiary p-2 text-xs">
          <div className="font-medium text-text-primary">
            {selectedNode.code} - {selectedNode.name}
          </div>
          {selectedNode.guidance && (
            <div className="mt-1 text-text-secondary">{selectedNode.guidance}</div>
          )}
        </div>
      )}
    </div>
  );
}
