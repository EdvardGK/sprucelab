import { useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { EirField } from './eirConfig';

type EirFieldValue = string | number | boolean | string[];

interface EirConfiguratorProps {
  fields: EirField[];
}

export function EirConfigurator({ fields }: EirConfiguratorProps) {
  const [values, setValues] = useState<Record<string, EirFieldValue>>(() => {
    const initial: Record<string, EirFieldValue> = {};
    for (const f of fields) {
      if (f.defaultValue !== undefined) initial[f.id] = f.defaultValue;
    }
    return initial;
  });

  const setField = (id: string, v: EirFieldValue) =>
    setValues((prev) => ({ ...prev, [id]: v }));

  return (
    <div className="flex flex-col gap-[clamp(0.75rem,1.2vh,1.25rem)]">
      {fields.map((field) => (
        <EirFieldRow
          key={field.id}
          field={field}
          value={values[field.id]}
          onChange={(v) => setField(field.id, v)}
        />
      ))}
    </div>
  );
}

function EirFieldRow({
  field,
  value,
  onChange,
}: {
  field: EirField;
  value: EirFieldValue | undefined;
  onChange: (v: EirFieldValue) => void;
}) {
  return (
    <div className="flex flex-col gap-[clamp(0.25rem,0.4vh,0.5rem)]">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={`eir-${field.id}`}
          className="text-[clamp(0.7rem,0.85vw,0.9rem)] font-medium text-foreground"
        >
          {field.label}
        </label>
        <EirControl field={field} value={value} onChange={onChange} />
      </div>
      {(field.hint || field.bepRole) && (
        <div className="text-[clamp(0.55rem,0.7vw,0.75rem)] text-muted-foreground/80 leading-[1.45]">
          {field.hint && <span>{field.hint}</span>}
          {field.hint && field.bepRole && <span> · </span>}
          {field.bepRole && <span className="italic">{field.bepRole}</span>}
        </div>
      )}
    </div>
  );
}

function EirControl({
  field,
  value,
  onChange,
}: {
  field: EirField;
  value: EirFieldValue | undefined;
  onChange: (v: EirFieldValue) => void;
}) {
  switch (field.kind) {
    case 'toggle':
      return (
        <button
          id={`eir-${field.id}`}
          type="button"
          role="switch"
          aria-checked={Boolean(value)}
          onClick={() => onChange(!value)}
          className={cn(
            'relative inline-flex h-[clamp(1rem,1.2vw,1.25rem)] w-[clamp(1.875rem,2.2vw,2.25rem)] shrink-0 items-center rounded-full transition-colors',
            value ? 'bg-primary' : 'bg-input'
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-[clamp(0.75rem,0.9vw,0.9rem)] w-[clamp(0.75rem,0.9vw,0.9rem)] transform rounded-full bg-background shadow-sm transition-transform',
              value
                ? 'translate-x-[clamp(0.95rem,1.15vw,1.2rem)]'
                : 'translate-x-[clamp(0.1rem,0.15vw,0.15rem)]'
            )}
          />
        </button>
      );
    case 'number':
      return (
        <div className="flex items-baseline gap-1.5">
          <Input
            id={`eir-${field.id}`}
            type="number"
            inputMode="decimal"
            value={typeof value === 'number' ? value : ''}
            min={field.min}
            max={field.max}
            step={field.step ?? 'any'}
            onChange={(e) => {
              const n = e.target.value === '' ? NaN : Number(e.target.value);
              onChange(Number.isFinite(n) ? n : 0);
            }}
            className="h-[clamp(1.5rem,1.8vw,1.875rem)] w-[clamp(4rem,6vw,5rem)] tabular-nums text-right text-[clamp(0.7rem,0.85vw,0.9rem)]"
          />
          {field.unit && (
            <span className="text-[clamp(0.6rem,0.75vw,0.8rem)] text-muted-foreground tabular-nums">
              {field.unit}
            </span>
          )}
        </div>
      );
    case 'select':
      return (
        <Select
          value={typeof value === 'string' ? value : ''}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger
            id={`eir-${field.id}`}
            className="h-[clamp(1.5rem,1.8vw,1.875rem)] w-[clamp(8rem,12vw,12rem)] text-[clamp(0.7rem,0.85vw,0.9rem)]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'multiselect':
      return (
        <MultiselectChips
          field={field}
          value={Array.isArray(value) ? value : []}
          onChange={(v) => onChange(v)}
        />
      );
    case 'text':
      return (
        <Input
          id={`eir-${field.id}`}
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className="h-[clamp(1.5rem,1.8vw,1.875rem)] w-[clamp(8rem,12vw,14rem)] text-[clamp(0.7rem,0.85vw,0.9rem)]"
        />
      );
  }
}

function MultiselectChips({
  field,
  value,
  onChange,
}: {
  field: EirField;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const options = field.options ?? [];

  const toggle = (optVal: string) => {
    if (value.includes(optVal)) {
      onChange(value.filter((v) => v !== optVal));
    } else {
      onChange([...value, optVal]);
    }
  };

  const summary =
    value.length === 0
      ? t('settings.eirConfig.multiselectNone', { defaultValue: 'None selected' })
      : value.length <= 2
        ? value
            .map((v) => options.find((o) => o.value === v)?.label ?? v)
            .join(', ')
        : t('settings.eirConfig.multiselectCount', {
            defaultValue: '{{count}} selected',
            count: value.length,
          });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={`eir-${field.id}`}
          type="button"
          className="flex items-center gap-2 h-[clamp(1.5rem,1.8vw,1.875rem)] min-w-[clamp(8rem,12vw,12rem)] max-w-[clamp(10rem,16vw,18rem)] px-2 rounded-md border border-input bg-background text-[clamp(0.7rem,0.85vw,0.9rem)] hover:bg-muted/50 transition-colors text-left"
        >
          <span className="flex-1 truncate text-foreground/90">{summary}</span>
          <span className="text-[clamp(0.55rem,0.7vw,0.75rem)] tabular-nums text-muted-foreground">
            {value.length}/{options.length}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[clamp(14rem,20vw,20rem)] p-1"
      >
        <ul className="flex flex-col gap-0.5">
          {options.map((opt) => {
            const selected = value.includes(opt.value);
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className={cn(
                    'flex items-center justify-between gap-2 w-full rounded-sm px-2 py-1.5 text-left text-[clamp(0.7rem,0.85vw,0.9rem)] transition-colors',
                    selected
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted/50'
                  )}
                >
                  <span className="flex flex-col">
                    <span>{opt.label}</span>
                    {opt.hint && (
                      <span className="text-[clamp(0.55rem,0.7vw,0.75rem)] text-muted-foreground">
                        {opt.hint}
                      </span>
                    )}
                  </span>
                  {selected && (
                    <Check className="h-[clamp(0.75rem,1vw,1rem)] w-[clamp(0.75rem,1vw,1rem)] shrink-0" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
