import { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Camera,
  Ruler,
  ShieldAlert,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ReferencePanel } from './ReferencePanel'
import { DeviationPanel } from './DeviationPanel'
import type { CheckItem, CheckItemStatus, DeviationResponsible, DeviationAction } from './types'

interface CheckItemCardProps {
  item: CheckItem
  onStatusChange: (itemId: string, status: CheckItemStatus) => void
  onMeasurementChange: (itemId: string, value: number) => void
  onNotesChange: (itemId: string, notes: string) => void
  onDeviation: (itemId: string, data: {
    deviation_description: string
    deviation_responsible: DeviationResponsible
    deviation_action: DeviationAction
  }) => void
}

const STATUS_STYLES: Record<
  CheckItemStatus,
  { card: string; icon: React.ReactNode | null }
> = {
  pending: {
    card: 'glass shadow-glass',
    icon: null,
  },
  ok: {
    card: 'glass shadow-glass ring-1 ring-success/20',
    icon: <CheckCircle2 className="h-6 w-6 text-success" />,
  },
  deviation: {
    card: 'glass shadow-glass ring-1 ring-warning/30',
    icon: <AlertTriangle className="h-6 w-6 text-warning" />,
  },
  not_applicable: {
    card: 'glass-subtle shadow-glass opacity-60',
    icon: null,
  },
}

export function CheckItemCard({
  item,
  onStatusChange,
  onMeasurementChange,
  onNotesChange,
  onDeviation,
}: CheckItemCardProps) {
  const [showRef, setShowRef] = useState(false)
  const [showDeviation, setShowDeviation] = useState(false)
  const [measureInput, setMeasureInput] = useState(
    item.measured_value?.toString() ?? ''
  )
  const [notesInput, setNotesInput] = useState(item.notes ?? '')
  const [showNotes, setShowNotes] = useState(!!item.notes)

  const style = STATUS_STYLES[item.status]
  const hasReference = item.reference_type && item.reference_type !== 'none'

  function handleStatusClick(status: CheckItemStatus) {
    if (status === 'deviation') {
      setShowDeviation(true)
      return
    }
    onStatusChange(item.id, status)
    setShowDeviation(false)
  }

  function handleMeasurementBlur() {
    const val = parseFloat(measureInput)
    if (!isNaN(val)) {
      onMeasurementChange(item.id, val)
    }
  }

  function handleNotesBlur() {
    onNotesChange(item.id, notesInput)
  }

  const measurementWarning =
    item.measured_value !== null &&
    item.measured_value !== undefined &&
    ((item.tolerance_min !== null && item.measured_value < item.tolerance_min) ||
      (item.tolerance_max !== null && item.measured_value > item.tolerance_max))

  return (
    <div className={cn('overflow-hidden rounded-xl transition-all', style.card)}>
      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bone text-xs font-semibold text-text-secondary">
                {item.sort_order}
              </span>
              <h4
                className={cn(
                  'text-base font-semibold text-text-primary',
                  item.status === 'not_applicable' && 'line-through opacity-50'
                )}
              >
                {item.title}
              </h4>
            </div>

            {/* Tags */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.is_critical && (
                <span className="inline-flex items-center gap-1 rounded-full bg-error-light px-2 py-0.5 text-xs font-medium text-error">
                  <ShieldAlert className="h-3 w-3" />
                  Kritisk
                </span>
              )}
              {item.requires_photo && (
                <span className="inline-flex items-center gap-1 rounded-full bg-bone px-2 py-0.5 text-xs font-medium text-text-secondary">
                  <Camera className="h-3 w-3" />
                  Foto
                </span>
              )}
              {item.measurement_unit && (
                <span className="inline-flex items-center gap-1 rounded-full bg-bone px-2 py-0.5 text-xs font-medium text-text-secondary">
                  <Ruler className="h-3 w-3" />
                  Måling ({item.measurement_unit})
                </span>
              )}
            </div>
          </div>

          {/* Status icon */}
          <div className="shrink-0">{style.icon}</div>
        </div>

        {/* Reference toggle */}
        {hasReference && (
          <button
            onClick={() => setShowRef(!showRef)}
            className="focus-ring mt-3 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent-light"
          >
            {showRef ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            Vis krav
          </button>
        )}

        {/* Reference panel */}
        {showRef && hasReference && (
          <div className="mt-3">
            <ReferencePanel item={item} />
          </div>
        )}

        {/* Measurement input */}
        {item.measurement_unit && item.status !== 'not_applicable' && (
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">
              Målt verdi ({item.measurement_unit})
              {item.tolerance_min !== null && item.tolerance_max !== null && (
                <span className="ml-1 font-normal text-text-tertiary">
                  (godkjent: {item.tolerance_min}–{item.tolerance_max} {item.measurement_unit})
                </span>
              )}
              {item.tolerance_min !== null && item.tolerance_max === null && (
                <span className="ml-1 font-normal text-text-tertiary">
                  (min {item.tolerance_min} {item.measurement_unit})
                </span>
              )}
              {item.tolerance_min === null && item.tolerance_max !== null && (
                <span className="ml-1 font-normal text-text-tertiary">
                  (maks {item.tolerance_max} {item.measurement_unit})
                </span>
              )}
            </label>
            <input
              type="number"
              value={measureInput}
              onChange={(e) => setMeasureInput(e.target.value)}
              onBlur={handleMeasurementBlur}
              placeholder={`Skriv inn verdi i ${item.measurement_unit}`}
              className={cn(
                'focus-ring h-10 w-full rounded-lg border bg-white px-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-tertiary',
                measurementWarning
                  ? 'border-warning bg-warning-light'
                  : 'border-border hover:border-border-strong'
              )}
            />
            {measurementWarning && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-warning">
                <AlertTriangle className="h-3 w-3" />
                Målt verdi er utenfor toleranse
              </p>
            )}
          </div>
        )}

        {/* Notes */}
        {item.status !== 'not_applicable' && (
          <div className="mt-3">
            {!showNotes ? (
              <button
                onClick={() => setShowNotes(true)}
                className="text-xs font-medium text-text-tertiary transition-colors hover:text-text-secondary"
              >
                + Legg til notat
              </button>
            ) : (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                  Notat
                </label>
                <textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  onBlur={handleNotesBlur}
                  rows={2}
                  placeholder="Valgfri kommentar..."
                  className="focus-ring h-auto w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary outline-none resize-none transition-colors placeholder:text-text-tertiary hover:border-border-strong"
                />
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => handleStatusClick('ok')}
            className={cn(
              'focus-ring flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all',
              item.status === 'ok'
                ? 'bg-success text-white shadow-sm'
                : 'border border-border bg-white text-text-primary hover:border-success hover:bg-success-light hover:text-success'
            )}
          >
            OK
          </button>
          <button
            onClick={() => handleStatusClick('deviation')}
            className={cn(
              'focus-ring flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all',
              item.status === 'deviation'
                ? 'bg-warning text-white shadow-sm'
                : 'border border-border bg-white text-text-primary hover:border-warning hover:bg-warning-light hover:text-warning'
            )}
          >
            Avvik
          </button>
          <button
            onClick={() => handleStatusClick('not_applicable')}
            className={cn(
              'focus-ring rounded-lg px-3 py-2.5 text-sm font-semibold transition-all',
              item.status === 'not_applicable'
                ? 'bg-concrete text-white shadow-sm'
                : 'border border-border bg-white text-text-secondary hover:border-border-strong hover:bg-bone'
            )}
          >
            N/A
          </button>
        </div>
      </div>

      {/* Deviation panel */}
      {showDeviation && item.status !== 'ok' && item.status !== 'not_applicable' && (
        <DeviationPanel
          item={item}
          onClose={() => setShowDeviation(false)}
          onSubmit={(data) => onDeviation(item.id, data)}
        />
      )}

      {/* Existing deviation summary */}
      {item.status === 'deviation' && item.deviation_description && !showDeviation && (
        <div className="border-t border-warning/20 bg-warning-light px-5 py-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary">
                Registrert avvik
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {item.deviation_description}
              </p>
              {item.deviation_responsible && (
                <p className="mt-1.5 text-xs text-text-tertiary">
                  Ansvar:{' '}
                  {item.deviation_responsible === 'prosjekterende'
                    ? 'Prosjekterende'
                    : item.deviation_responsible === 'utførende'
                    ? 'Utførende'
                    : 'Annet'}
                </p>
              )}
              <button
                onClick={() => setShowDeviation(true)}
                className="mt-2 text-xs font-semibold text-warning transition-colors hover:underline"
              >
                Rediger avvik
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
