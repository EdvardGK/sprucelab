import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
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
    <div className="border-t border-warning/20 bg-warning-light px-5 py-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-bold text-text-primary">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Registrer avvik
        </h4>
        <button
          onClick={onClose}
          className="focus-ring rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-white/50 hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Context: what was required */}
      {item.reference_description && (
        <div className="mb-4 rounded-lg bg-white/60 px-3.5 py-2.5">
          <span className="text-xs font-semibold text-text-tertiary">
            Krav:{' '}
          </span>
          <span className="text-sm text-text-primary">
            {item.reference_description}
          </span>
        </div>
      )}

      {/* Measured value context */}
      {item.measured_value !== null && item.measurement_unit && (
        <div className="mb-4 rounded-lg bg-white/60 px-3.5 py-2.5">
          <span className="text-xs font-semibold text-text-tertiary">
            Målt:{' '}
          </span>
          <span className="text-sm font-semibold text-text-primary">
            {item.measured_value} {item.measurement_unit}
          </span>
        </div>
      )}

      {/* Description */}
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-semibold text-text-primary">
          Beskriv avviket *
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Hva er avviket? Hva var forventet vs. hva ble funnet?"
          className="focus-ring h-auto w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-text-primary outline-none resize-none transition-colors placeholder:text-text-tertiary hover:border-border-strong"
        />
      </div>

      {/* Responsibility */}
      <div className="mb-4">
        <label className="mb-2 block text-xs font-semibold text-text-primary">
          Hvem har ansvar for å løse dette? *
        </label>
        <div className="flex gap-2">
          {(
            Object.entries(DEVIATION_RESPONSIBLE_LABELS) as [
              DeviationResponsible,
              string,
            ][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setResponsible(value)}
              className={cn(
                'focus-ring flex-1 rounded-lg border px-2 py-2.5 text-sm font-medium transition-all',
                responsible === value
                  ? 'border-accent bg-accent text-white shadow-sm'
                  : 'border-border bg-white text-text-primary hover:border-border-strong'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Action */}
      <div className="mb-5">
        <label className="mb-2 block text-xs font-semibold text-text-primary">
          Hva gjør du nå? *
        </label>
        <div className="space-y-2">
          {(
            Object.entries(DEVIATION_ACTION_LABELS) as [
              DeviationAction,
              string,
            ][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setAction(value)}
              className={cn(
                'focus-ring w-full rounded-lg border px-3.5 py-3 text-left text-sm transition-all',
                action === value
                  ? 'border-accent bg-accent-light font-semibold text-accent'
                  : 'border-border bg-white text-text-secondary hover:border-border-strong hover:text-text-primary'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={cn(
          'focus-ring w-full rounded-lg px-4 py-3 text-sm font-bold transition-all',
          canSubmit
            ? 'bg-warning text-white shadow-sm hover:bg-warning/90 active:scale-[0.99]'
            : 'bg-bone text-text-tertiary cursor-not-allowed'
        )}
      >
        Registrer avvik
      </button>
    </div>
  )
}
