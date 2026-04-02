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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
    card: 'glass',
    icon: null,
  },
  ok: {
    card: 'glass ring-1 ring-success/20',
    icon: <CheckCircle2 className="h-6 w-6 text-success" />,
  },
  deviation: {
    card: 'glass ring-1 ring-warning/30',
    icon: <AlertTriangle className="h-6 w-6 text-warning" />,
  },
  not_applicable: {
    card: 'glass-subtle opacity-60',
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
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                {item.sort_order}
              </span>
              <h4
                className={cn(
                  'text-base font-semibold text-foreground',
                  item.status === 'not_applicable' && 'line-through opacity-50'
                )}
              >
                {item.title}
              </h4>
            </div>

            {/* Tags */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.is_critical && (
                <Badge variant="destructive" className="gap-1">
                  <ShieldAlert className="h-3 w-3" />
                  Kritisk
                </Badge>
              )}
              {item.requires_photo && (
                <Badge variant="secondary" className="gap-1">
                  <Camera className="h-3 w-3" />
                  Foto
                </Badge>
              )}
              {item.measurement_unit && (
                <Badge variant="secondary" className="gap-1">
                  <Ruler className="h-3 w-3" />
                  Måling ({item.measurement_unit})
                </Badge>
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
            className="mt-3 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Målt verdi ({item.measurement_unit})
              {item.tolerance_min !== null && item.tolerance_max !== null && (
                <span className="ml-1 font-normal opacity-70">
                  (godkjent: {item.tolerance_min}–{item.tolerance_max} {item.measurement_unit})
                </span>
              )}
              {item.tolerance_min !== null && item.tolerance_max === null && (
                <span className="ml-1 font-normal opacity-70">
                  (min {item.tolerance_min} {item.measurement_unit})
                </span>
              )}
              {item.tolerance_min === null && item.tolerance_max !== null && (
                <span className="ml-1 font-normal opacity-70">
                  (maks {item.tolerance_max} {item.measurement_unit})
                </span>
              )}
            </label>
            <Input
              type="number"
              value={measureInput}
              onChange={(e) => setMeasureInput(e.target.value)}
              onBlur={handleMeasurementBlur}
              placeholder={`Skriv inn verdi i ${item.measurement_unit}`}
              className={cn(
                measurementWarning && 'border-warning bg-warning/10'
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
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                + Legg til notat
              </button>
            ) : (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Notat
                </label>
                <Textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  onBlur={handleNotesBlur}
                  rows={2}
                  placeholder="Valgfri kommentar..."
                />
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-4 flex gap-2">
          <Button
            onClick={() => handleStatusClick('ok')}
            variant={item.status === 'ok' ? 'default' : 'outline'}
            className={cn(
              'flex-1',
              item.status === 'ok'
                ? 'bg-success text-white hover:bg-success/90'
                : 'hover:border-success hover:bg-success/10 hover:text-success'
            )}
          >
            OK
          </Button>
          <Button
            onClick={() => handleStatusClick('deviation')}
            variant={item.status === 'deviation' ? 'default' : 'outline'}
            className={cn(
              'flex-1',
              item.status === 'deviation'
                ? 'bg-warning text-white hover:bg-warning/90'
                : 'hover:border-warning hover:bg-warning/10 hover:text-warning'
            )}
          >
            Avvik
          </Button>
          <Button
            onClick={() => handleStatusClick('not_applicable')}
            variant={item.status === 'not_applicable' ? 'default' : 'outline'}
            className={cn(
              item.status === 'not_applicable'
                ? 'bg-muted-foreground text-white hover:bg-muted-foreground/90'
                : 'hover:bg-muted'
            )}
          >
            N/A
          </Button>
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
        <div className="border-t border-warning/20 bg-warning/5 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Registrert avvik
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.deviation_description}
              </p>
              {item.deviation_responsible && (
                <p className="mt-1.5 text-xs text-muted-foreground/70">
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
