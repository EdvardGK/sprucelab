import {
  PencilRuler,
  Scale,
  BookOpen,
  FileText,
  Scroll,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CheckItem, ReferenceType } from './types'

interface ReferencePanelProps {
  item: CheckItem
}

const REF_CONFIG: Record<
  ReferenceType,
  { label: string; icon: typeof PencilRuler; badgeClass: string }
> = {
  drawing: {
    label: 'Tegning',
    icon: PencilRuler,
    badgeClass: 'bg-ref-drawing-bg text-ref-drawing',
  },
  tek17: {
    label: 'TEK17',
    icon: Scale,
    badgeClass: 'bg-ref-regulation-bg text-ref-regulation',
  },
  product_manual: {
    label: 'Produktblad',
    icon: BookOpen,
    badgeClass: 'bg-ref-product-bg text-ref-product',
  },
  design_spec: {
    label: 'Prosjektbeskrivelse',
    icon: FileText,
    badgeClass: 'bg-ref-spec-bg text-ref-spec',
  },
  ns_standard: {
    label: 'NS Standard',
    icon: Scroll,
    badgeClass: 'bg-ref-standard-bg text-ref-standard',
  },
  custom: {
    label: 'Annet',
    icon: Info,
    badgeClass: 'bg-bone text-concrete',
  },
  none: {
    label: '',
    icon: Info,
    badgeClass: '',
  },
}

export function ReferencePanel({ item }: ReferencePanelProps) {
  if (!item.reference_type || item.reference_type === 'none') return null

  const config = REF_CONFIG[item.reference_type]
  const Icon = config.icon

  return (
    <div className="rounded-lg border border-dashed border-border-strong bg-background p-4">
      <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
        Kontrolleres mot
      </p>

      {/* Reference badge + code */}
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
            config.badgeClass
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {config.label}
        </span>
        {item.reference_code && (
          <span className="text-sm font-semibold text-text-primary">
            {item.reference_code}
          </span>
        )}
      </div>

      {/* Reference description */}
      {item.reference_description && (
        <p className="mt-3 text-sm leading-relaxed text-text-primary">
          {item.reference_description}
        </p>
      )}

      {/* Page reference */}
      {item.reference_page && (
        <p className="mt-1.5 text-xs text-text-tertiary">
          Se: {item.reference_page}
        </p>
      )}

      {/* Acceptance criteria */}
      {item.acceptance_criteria && (
        <div className="mt-3 rounded-md bg-white/80 px-3 py-2">
          <span className="text-xs font-semibold text-text-tertiary">
            Godkjenningskriterie:{' '}
          </span>
          <span className="text-sm text-text-primary">
            {item.acceptance_criteria}
          </span>
        </div>
      )}

      {/* Tolerance */}
      {(item.tolerance_min !== null || item.tolerance_max !== null) && (
        <p className="mt-2 text-xs font-medium text-text-tertiary">
          Toleranse:{' '}
          <span className="text-text-secondary">
            {item.tolerance_min !== null && item.tolerance_max !== null
              ? `${item.tolerance_min}–${item.tolerance_max} ${item.measurement_unit ?? ''}`
              : item.tolerance_min !== null
              ? `min ${item.tolerance_min} ${item.measurement_unit ?? ''}`
              : `maks ${item.tolerance_max} ${item.measurement_unit ?? ''}`}
          </span>
        </p>
      )}
    </div>
  )
}
