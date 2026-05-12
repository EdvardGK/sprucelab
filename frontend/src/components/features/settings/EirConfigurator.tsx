import { useState } from 'react';
import { Check, MapPin, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
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
import type { EirField, AddressValue } from './eirConfig';
import { useKartverketAddressSearch } from './use-kartverket-address-search';

export type EirFieldValue =
  | string
  | number
  | boolean
  | string[]
  | AddressValue
  | null
  | undefined;

interface EirConfiguratorProps {
  values: Record<string, EirFieldValue>;
  onChange: (id: string, value: EirFieldValue) => void;
  fields: EirField[];
}

/**
 * Controlled. Caller owns the `values` map (one per rule instance) so
 * persistence/undo can sit at the rule level.
 */
export function EirConfigurator({
  fields,
  values,
  onChange,
}: EirConfiguratorProps) {
  return (
    <div className="flex flex-col gap-[clamp(0.5rem,0.8vh,0.875rem)]">
      {fields.map((field) => {
        if (field.dependsOn) {
          const dep = values[field.dependsOn.fieldId];
          if (dep !== field.dependsOn.equals) return null;
        }
        return (
          <EirFieldRow
            key={field.id}
            field={field}
            value={values[field.id]}
            onChange={(v) => onChange(field.id, v)}
          />
        );
      })}
    </div>
  );
}

function EirFieldRow({
  field,
  value,
  onChange,
}: {
  field: EirField;
  value: EirFieldValue;
  onChange: (v: EirFieldValue) => void;
}) {
  // Toggles + numbers sit nicely on the same row as the label (compact);
  // selects, multiselects, addresses, and text inputs stack vertically
  // so they get full card-width breathing room.
  const inlineLabel = field.kind === 'toggle' || field.kind === 'number';

  return (
    <div className="flex flex-col gap-[clamp(0.125rem,0.25vh,0.375rem)]">
      {inlineLabel ? (
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor={`eir-${field.id}`}
            className="text-[clamp(0.65rem,0.78vw,0.82rem)] font-medium text-foreground"
          >
            {field.label}
          </label>
          <EirControl field={field} value={value} onChange={onChange} />
        </div>
      ) : (
        <>
          <label
            htmlFor={`eir-${field.id}`}
            className="text-[clamp(0.6rem,0.72vw,0.78rem)] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {field.label}
          </label>
          <EirControl field={field} value={value} onChange={onChange} />
        </>
      )}
      {(field.hint || field.bepRole) && (
        <div className="text-[clamp(0.5rem,0.65vw,0.7rem)] text-muted-foreground/70 leading-[1.4]">
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
  value: EirFieldValue;
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
        <div className="flex items-baseline gap-1">
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
            className="h-[clamp(1.5rem,1.7vw,1.75rem)] w-[clamp(3.5rem,5vw,4.5rem)] tabular-nums text-right text-[clamp(0.65rem,0.78vw,0.82rem)] px-1.5"
          />
          {field.unit && (
            <span className="text-[clamp(0.55rem,0.7vw,0.75rem)] text-muted-foreground tabular-nums">
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
            className="h-[clamp(1.5rem,1.7vw,1.75rem)] w-full text-[clamp(0.65rem,0.78vw,0.82rem)]"
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
        <MultiselectCombobox
          field={field}
          value={Array.isArray(value) ? value : []}
          onChange={(v) => onChange(v)}
        />
      );
    case 'address':
      return (
        <AddressCombobox
          fieldId={field.id}
          value={isAddressValue(value) ? value : null}
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
          className="h-[clamp(1.5rem,1.7vw,1.75rem)] w-full text-[clamp(0.65rem,0.78vw,0.82rem)]"
        />
      );
  }
}

function isAddressValue(v: unknown): v is AddressValue {
  return (
    v !== null &&
    typeof v === 'object' &&
    v !== undefined &&
    'adressetekst' in (v as object) &&
    'lat' in (v as object) &&
    'lon' in (v as object)
  );
}

function MultiselectCombobox({
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
          className="flex items-center gap-2 h-[clamp(1.5rem,1.7vw,1.75rem)] w-full px-2 rounded-md border border-input bg-background text-[clamp(0.65rem,0.78vw,0.82rem)] hover:bg-muted/50 transition-colors text-left"
        >
          <span className="flex-1 truncate text-foreground/90">{summary}</span>
          <span className="text-[clamp(0.5rem,0.65vw,0.7rem)] tabular-nums text-muted-foreground shrink-0">
            {value.length}/{options.length}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[clamp(16rem,22vw,24rem)] p-0"
      >
        <Command shouldFilter>
          <CommandInput
            placeholder={t('settings.eirConfig.searchOptions', {
              defaultValue: 'Search…',
            })}
            className="h-9"
          />
          <CommandList className="max-h-[clamp(12rem,32vh,20rem)]">
            <CommandEmpty>
              {t('settings.eirConfig.noOptions', {
                defaultValue: 'No matches.',
              })}
            </CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const selected = value.includes(opt.value);
                return (
                  <CommandItem
                    key={opt.value}
                    value={`${opt.label} ${opt.hint ?? ''}`}
                    onSelect={() => toggle(opt.value)}
                    className="flex items-start justify-between gap-2 cursor-pointer"
                  >
                    <span className="flex flex-col min-w-0">
                      <span className="truncate">{opt.label}</span>
                      {opt.hint && (
                        <span className="text-[clamp(0.55rem,0.7vw,0.75rem)] text-muted-foreground truncate">
                          {opt.hint}
                        </span>
                      )}
                    </span>
                    {selected && (
                      <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AddressCombobox({
  fieldId,
  value,
  onChange,
}: {
  fieldId: string;
  value: AddressValue | null;
  onChange: (v: AddressValue | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { query, setQuery, results, isLoading, error } =
    useKartverketAddressSearch({ debounceMs: 220, limit: 10 });

  const summary = value
    ? value.adressetekst
    : t('settings.eirConfig.addressEmpty', { defaultValue: 'Search address…' });

  return (
    <div className="flex items-center gap-1 w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={`eir-${fieldId}`}
            type="button"
            className="flex items-center gap-1.5 h-[clamp(1.5rem,1.7vw,1.75rem)] flex-1 min-w-0 px-2 rounded-md border border-input bg-background text-[clamp(0.65rem,0.78vw,0.82rem)] hover:bg-muted/50 transition-colors text-left"
          >
            <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate text-foreground/90">{summary}</span>
            {value && (
              <span className="text-[clamp(0.5rem,0.65vw,0.7rem)] tabular-nums text-muted-foreground shrink-0">
                {value.lat.toFixed(3)}, {value.lon.toFixed(3)}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[clamp(18rem,26vw,28rem)] p-0"
        >
          <Command shouldFilter={false}>
            <div className="relative">
              <CommandInput
                placeholder={t('settings.eirConfig.addressSearch', {
                  defaultValue: 'Adressesøk (min. 3 tegn)',
                })}
                value={query}
                onValueChange={setQuery}
                className="h-9"
              />
              {isLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
            <CommandList className="max-h-[clamp(14rem,36vh,24rem)]">
              {error && (
                <div className="px-3 py-2 text-[clamp(0.6rem,0.75vw,0.8rem)] text-destructive">
                  {error}
                </div>
              )}
              {!error && query.trim().length < 3 && (
                <div className="px-3 py-3 text-[clamp(0.6rem,0.75vw,0.8rem)] text-muted-foreground">
                  {t('settings.eirConfig.addressHint', {
                    defaultValue:
                      'Skriv minst 3 tegn. Søker mot Kartverket (Geonorge).',
                  })}
                </div>
              )}
              {!error && query.trim().length >= 3 && results.length === 0 && !isLoading && (
                <CommandEmpty>
                  {t('settings.eirConfig.addressNoMatch', {
                    defaultValue: 'Ingen treff.',
                  })}
                </CommandEmpty>
              )}
              {results.length > 0 && (
                <CommandGroup>
                  {results.map((addr) => (
                    <CommandItem
                      key={`${addr.adressetekst}-${addr.lat}-${addr.lon}`}
                      value={addr.adressetekst}
                      onSelect={() => {
                        onChange(addr);
                        setOpen(false);
                      }}
                      className="flex flex-col items-start gap-0.5 cursor-pointer"
                    >
                      <span className="text-[clamp(0.7rem,0.85vw,0.9rem)]">
                        {addr.adressetekst}
                      </span>
                      <span className="text-[clamp(0.55rem,0.7vw,0.75rem)] text-muted-foreground tabular-nums">
                        {[addr.postalCode, addr.postalPlace, addr.municipality]
                          .filter(Boolean)
                          .join(' · ')}
                        {' — '}
                        {addr.lat.toFixed(5)}, {addr.lon.toFixed(5)}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="h-[clamp(1.5rem,1.7vw,1.75rem)] w-[clamp(1.5rem,1.7vw,1.75rem)] inline-flex items-center justify-center rounded-md hover:bg-muted/50 text-muted-foreground shrink-0"
          title={t('settings.eirConfig.addressClear', { defaultValue: 'Clear' })}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
