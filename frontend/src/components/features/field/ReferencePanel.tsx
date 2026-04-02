import {
  PencilRuler,
  Scale,
  BookOpen,
  FileText,
  Scroll,
  Info,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { CheckItem, ReferenceType } from './types'

interface ReferencePanelProps {
  item: CheckItem
}

const REF_CONFIG: Record<
  ReferenceType,
  { label: string; icon: typeof PencilRuler; variant: 'default' | 'secondary' | 'info' | 'success' | 'warning' | 'outline' }
> = {
  drawing: { label: 'Tegning', icon: PencilRuler, variant: 'info' },
  tek17: { label: 'TEK17', icon: Scale, variant: 'warning' },
  product_manual: { label: 'Produktblad', icon: BookOpen, variant: 'default' },
  design_spec: { label: 'Prosjektbeskrivelse', icon: FileText, variant: 'secondary' },
  ns_standard: { label: 'NS Standard', icon: Scroll, variant: 'success' },
  custom: { label: 'Annet', icon: Info, variant: 'outline' },
  none: { label: '', icon: Info, variant: 'outline' },
}

export function ReferencePanel({ item }: ReferencePanelProps) {
  if (!item.reference_type || item.reference_type === 'none') return null

  const config = REF_CONFIG[item.reference_type]
  const Icon = config.icon

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
      <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Kontrolleres mot
      </p>

      <div className="flex items-center gap-2.5">
        <Badge variant={config.variant} className="gap-1.5">
          <Icon className="h-3 w-3" />
          {config.label}
        </Badge>
        {item.reference_code && (
          <span className="text-sm font-semibold">
            {item.reference_code}
          </span>
        )}
      </div>

      {item.reference_description && (
        <p className="mt-3 text-sm leading-relaxed">
          {item.reference_description}
        </p>
      )}

      {item.reference_page && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Se: {item.reference_page}
        </p>
      )}

      {item.acceptance_criteria && (
        <div className="mt-3 rounded-md bg-background px-3 py-2">
          <span className="text-xs font-semibold text-muted-foreground">
            Godkjenningskriterie:{' '}
          </span>
          <span className="text-sm">
            {item.acceptance_criteria}
          </span>
        </div>
      )}

      {(item.tolerance_min !== null || item.tolerance_max !== null) && (
        <p className="mt-2 text-xs font-medium text-muted-foreground">
          Toleranse:{' '}
          <span className="text-foreground">
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
