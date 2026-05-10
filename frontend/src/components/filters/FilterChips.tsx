import { MouseEvent } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  useProjectFilter,
  useProjectFilterActions,
} from '@/contexts/ProjectFilterProvider';
import { DrillTarget } from './DrillTarget';

interface FloorLabel {
  code: string;
  name: string;
}

interface FilterChipsProps {
  /** Optional canonical floor labels keyed by code; falls back to the raw code. */
  floorLabels?: Map<string, FloorLabel>;
  className?: string;
}

type ChipKind = 'include' | 'exclude' | 'floor';

interface Chip {
  kind: ChipKind;
  /** Domain key (IFC class for include/exclude, floor code for floor). */
  key: string;
  label: string;
}

export function FilterChips({ floorLabels, className }: FilterChipsProps) {
  const { t } = useTranslation();
  const filter = useProjectFilter();
  const {
    setIfcClass,
    setExcludedIfcClass,
    setFloorCode,
  } = useProjectFilterActions();

  const includes = filter.ifc_class ?? [];
  const excludes = filter.excluded_ifc_class ?? [];
  const floors = filter.floor_code ?? [];

  const chips: Chip[] = [
    ...floors.map<Chip>((code) => {
      const canonical = floorLabels?.get(code);
      return {
        kind: 'floor',
        key: code,
        label: canonical ? `${canonical.code} ${canonical.name}` : code,
      };
    }),
    ...includes.map<Chip>((cls) => ({
      kind: 'include',
      key: cls,
      label: `+${cls.replace('Ifc', '')}`,
    })),
    ...excludes.map<Chip>((cls) => ({
      kind: 'exclude',
      key: cls,
      label: `−${cls.replace('Ifc', '')}`,
    })),
  ];

  if (chips.length === 0) return null;

  const isolate = (chip: Chip) => {
    switch (chip.kind) {
      case 'include':
        if (includes.length === 1 && includes[0] === chip.key) return;
        setIfcClass([chip.key]);
        return;
      case 'exclude':
        if (excludes.length === 1 && excludes[0] === chip.key) return;
        setExcludedIfcClass([chip.key]);
        return;
      case 'floor':
        if (floors.length === 1 && floors[0] === chip.key) return;
        setFloorCode([chip.key]);
        return;
    }
  };

  const remove = (chip: Chip, e: MouseEvent) => {
    e.stopPropagation();
    switch (chip.kind) {
      case 'include': {
        const next = includes.filter((c) => c !== chip.key);
        setIfcClass(next.length === 0 ? undefined : next);
        return;
      }
      case 'exclude': {
        const next = excludes.filter((c) => c !== chip.key);
        setExcludedIfcClass(next.length === 0 ? undefined : next);
        return;
      }
      case 'floor': {
        const next = floors.filter((c) => c !== chip.key);
        setFloorCode(next.length === 0 ? undefined : next);
        return;
      }
    }
  };

  const reset = () => {
    setIfcClass(undefined);
    setExcludedIfcClass(undefined);
    setFloorCode(undefined);
  };

  return (
    <div className={className ?? 'flex items-center gap-[3px] flex-wrap px-2 py-[5px]'}>
      {chips.map((chip) => {
        const onlyInDimension =
          (chip.kind === 'include' && includes.length === 1) ||
          (chip.kind === 'exclude' && excludes.length === 1) ||
          (chip.kind === 'floor' && floors.length === 1);
        return (
          <DrillTarget
            key={`${chip.kind}-${chip.key}`}
            as="span"
            ariaLabel={`${chip.label} — click to isolate, X to remove`}
            active={onlyInDimension}
            onActivate={() => isolate(chip)}
            className="inline-flex items-center gap-[3px] px-[7px] py-[2px] rounded-[3px] text-[8.5px] font-semibold bg-[rgba(21,121,84,0.15)] text-[rgba(208,211,77,0.85)] border border-[rgba(21,121,84,0.25)] hover:bg-[rgba(21,121,84,0.25)]"
          >
            {chip.label}
            <button
              type="button"
              onClick={(e) => remove(chip, e)}
              className="w-[10px] h-[10px] flex items-center justify-center opacity-50 hover:opacity-100"
              aria-label={`Remove ${chip.label}`}
            >
              <X className="w-[7px] h-[7px]" />
            </button>
          </DrillTarget>
        );
      })}
      <button
        type="button"
        onClick={reset}
        className="text-[8px] text-white/25 px-1 py-0.5 rounded-[3px] hover:text-white/60 hover:bg-white/[0.06] transition-all cursor-pointer"
      >
        {t('viewer.filters.reset')}
      </button>
    </div>
  );
}
