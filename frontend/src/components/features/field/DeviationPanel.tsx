import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { CheckItem, DeviationResponsible, DeviationAction } from './types'
import { DEVIATION_RESPONSIBLE_LABELS, DEVIATION_ACTION_LABELS } from './types'

interface DeviationPanelProps {
  item: CheckItem
  onClose: () => void
  onSubmit: (data: {
    deviation_description: string
    deviation_responsible: DeviationResponsible
    deviation_action: DeviationAction
  }) => void
}

export function DeviationPanel({ item, onClose, onSubmit }: DeviationPanelProps) {
  const [description, setDescription] = useState(
    item.deviation_description ?? ''
  )
  const [responsible, setResponsible] = useState<DeviationResponsible | null>(
    item.deviation_responsible ?? null
  )
  const [action, setAction] = useState<DeviationAction | null>(
    item.deviation_action ?? null
  )

  const canSubmit = description.trim() && responsible && action

  function handleSubmit() {
    if (!canSubmit) return
    onSubmit({
      deviation_description: description.trim(),
      deviation_responsible: responsible!,
      deviation_action: action!,
    })
    onClose()
  }

  return (
    <div className="border-t border-warning/20 bg-warning/5 px-5 py-5">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-bold">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Registrer avvik
        </h4>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {item.reference_description && (
        <div className="mb-4 rounded-lg bg-background px-3.5 py-2.5">
          <span className="text-xs font-semibold text-muted-foreground">Krav: </span>
          <span className="text-sm">{item.reference_description}</span>
        </div>
      )}

      {item.measured_value !== null && item.measurement_unit && (
        <div className="mb-4 rounded-lg bg-background px-3.5 py-2.5">
          <span className="text-xs font-semibold text-muted-foreground">Målt: </span>
          <span className="text-sm font-semibold">
            {item.measured_value} {item.measurement_unit}
          </span>
        </div>
      )}

      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-semibold">
          Beskriv avviket *
        </label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Hva er avviket? Hva var forventet vs. hva ble funnet?"
        />
      </div>

      <div className="mb-4">
        <label className="mb-2 block text-xs font-semibold">
          Hvem har ansvar for å løse dette? *
        </label>
        <div className="flex gap-2">
          {(
            Object.entries(DEVIATION_RESPONSIBLE_LABELS) as [DeviationResponsible, string][]
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={responsible === value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setResponsible(value)}
              className="flex-1"
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <label className="mb-2 block text-xs font-semibold">
          Hva gjør du nå? *
        </label>
        <div className="space-y-2">
          {(
            Object.entries(DEVIATION_ACTION_LABELS) as [DeviationAction, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setAction(value)}
              className={cn(
                'w-full rounded-lg border px-3.5 py-3 text-left text-sm transition-all',
                action === value
                  ? 'border-primary bg-primary/10 font-semibold text-primary'
                  : 'border-border bg-background text-muted-foreground hover:border-border-strong hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full"
        variant={canSubmit ? 'default' : 'secondary'}
      >
        Registrer avvik
      </Button>
    </div>
  )
}
