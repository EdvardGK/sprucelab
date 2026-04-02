import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/Layout/AppLayout';
import {
  ClipboardList,
  Plus,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Minus,
  MapPin,
} from 'lucide-react';
import {
  useChecklists,
  useChecklist,
  useChecklistTemplates,
  useInstantiateChecklist,
  useRecordCheckItem,
  useRecordDeviation,
} from '@/hooks/use-field';
import { CheckItemCard } from '@/components/features/field/CheckItemCard';
import type { CheckItemStatus, DeviationResponsible, DeviationAction } from '@/components/features/field/types';
import { cn } from '@/lib/utils';

export default function ProjectField() {
  const { id: projectId } = useParams<{ id: string }>();
  const [selectedChecklistId, setSelectedChecklistId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  if (selectedChecklistId) {
    return (
      <AppLayout>
        <ChecklistView
          checklistId={selectedChecklistId}
          onBack={() => setSelectedChecklistId(null)}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <ChecklistListView
        projectId={projectId!}
        onSelect={setSelectedChecklistId}
        showCreate={showCreateDialog}
        onToggleCreate={setShowCreateDialog}
      />
    </AppLayout>
  );
}

// ─── Checklist List View ───────────────────────────────────────────

function ChecklistListView({
  projectId,
  onSelect,
  showCreate,
  onToggleCreate,
}: {
  projectId: string;
  onSelect: (id: string) => void;
  showCreate: boolean;
  onToggleCreate: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data: checklists, isLoading } = useChecklists({ project: projectId });
  const { data: templates } = useChecklistTemplates({ project: projectId });
  const instantiate = useInstantiateChecklist();
  const [newLocation, setNewLocation] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  function handleCreate() {
    if (!selectedTemplateId) return;
    instantiate.mutate(
      {
        template_id: selectedTemplateId,
        project_id: projectId,
        location: newLocation || undefined,
      },
      {
        onSuccess: (checklist) => {
          onToggleCreate(false);
          setNewLocation('');
          setSelectedTemplateId('');
          onSelect(checklist.id);
        },
      }
    );
  }

  const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-bone text-text-secondary',
    in_progress: 'bg-accent-light text-accent',
    completed: 'bg-success-light text-success',
    signed: 'bg-success text-white',
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            {t('field.title')}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {t('field.subtitle')}
          </p>
        </div>
        <button
          onClick={() => onToggleCreate(!showCreate)}
          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent/90"
        >
          <Plus className="h-4 w-4" />
          {t('field.newChecklist')}
        </button>
      </div>

      {/* Create dialog */}
      {showCreate && (
        <div className="mb-6 rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-bold text-text-primary">
            {t('field.createFromTemplate')}
          </h3>
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                {t('field.template')}
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="focus-ring h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              >
                <option value="">{t('field.selectTemplate')}</option>
                {templates?.map((tmpl) => (
                  <option key={tmpl.id} value={tmpl.id}>
                    {tmpl.name} {tmpl.is_system_template ? '(System)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                {t('field.location')}
              </label>
              <input
                type="text"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                placeholder={t('field.locationPlaceholder')}
                className="focus-ring h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!selectedTemplateId || instantiate.isPending}
                className="focus-ring rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {instantiate.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t('field.create')
                )}
              </button>
              <button
                onClick={() => onToggleCreate(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:bg-bone"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!checklists || checklists.length === 0) && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList className="mb-3 h-10 w-10 text-text-tertiary" />
          <p className="text-sm font-medium text-text-secondary">
            {t('field.noChecklists')}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            {t('field.noChecklistsHint')}
          </p>
        </div>
      )}

      {/* Checklist cards */}
      {checklists && checklists.length > 0 && (
        <div className="space-y-3">
          {checklists.map((cl) => {
            const done = cl.progress.ok + cl.progress.not_applicable;
            const pct = cl.progress.total > 0 ? (done / cl.progress.total) * 100 : 0;

            return (
              <button
                key={cl.id}
                onClick={() => onSelect(cl.id)}
                className="focus-ring w-full rounded-xl border border-border bg-white p-4 text-left shadow-sm transition-all hover:border-accent/30 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-text-primary">
                        {cl.name}
                      </h3>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                          STATUS_COLORS[cl.status] || STATUS_COLORS.draft
                        )}
                      >
                        {cl.status.replace('_', ' ')}
                      </span>
                    </div>
                    {cl.location && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-text-tertiary">
                        <MapPin className="h-3 w-3" />
                        {cl.location}
                      </p>
                    )}
                  </div>
                  <div className="ml-4 text-right">
                    <p className="text-xs font-medium text-text-secondary">
                      {done}/{cl.progress.total}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                {cl.progress.total > 0 && (
                  <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-bone">
                    {cl.progress.ok > 0 && (
                      <div
                        className="bg-success"
                        style={{ width: `${(cl.progress.ok / cl.progress.total) * 100}%` }}
                      />
                    )}
                    {cl.progress.deviations > 0 && (
                      <div
                        className="bg-warning"
                        style={{ width: `${(cl.progress.deviations / cl.progress.total) * 100}%` }}
                      />
                    )}
                    {cl.progress.not_applicable > 0 && (
                      <div
                        className="bg-silver"
                        style={{ width: `${(cl.progress.not_applicable / cl.progress.total) * 100}%` }}
                      />
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Checklist Detail View ─────────────────────────────────────────

function ChecklistView({
  checklistId,
  onBack,
}: {
  checklistId: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { data: checklist, isLoading } = useChecklist(checklistId);
  const recordItem = useRecordCheckItem();
  const recordDeviation = useRecordDeviation();

  function handleStatusChange(itemId: string, status: CheckItemStatus) {
    recordItem.mutate({ id: itemId, status });
  }

  function handleMeasurementChange(itemId: string, value: number) {
    recordItem.mutate({ id: itemId, measured_value: value });
  }

  function handleNotesChange(itemId: string, notes: string) {
    recordItem.mutate({ id: itemId, notes });
  }

  function handleDeviation(
    itemId: string,
    data: {
      deviation_description: string;
      deviation_responsible: DeviationResponsible;
      deviation_action: DeviationAction;
    }
  ) {
    recordDeviation.mutate({ id: itemId, ...data });
  }

  if (isLoading || !checklist) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
      </div>
    );
  }

  const items = (checklist.items || []).sort((a, b) => a.sort_order - b.sort_order);
  const progress = checklist.progress;
  const done = progress.ok + progress.not_applicable;

  return (
    <div className="p-6 pb-20 md:pb-6">
      {/* Back button + title */}
      <div className="mb-4">
        <button
          onClick={onBack}
          className="focus-ring mb-3 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-bone hover:text-text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('field.backToList')}
        </button>
        <h1 className="text-lg font-bold text-text-primary">{checklist.name}</h1>
        {checklist.location && (
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-text-secondary">
            <MapPin className="h-3.5 w-3.5" />
            {checklist.location}
          </p>
        )}
      </div>

      {/* Summary bar */}
      <div className="glass mb-6 rounded-xl p-5 shadow-glass">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="font-medium text-text-secondary">{t('field.progress')}</span>
          <span className="font-semibold text-text-primary">
            {done}/{progress.total} {t('field.checked')}
          </span>
        </div>

        {/* Segmented progress bar */}
        <div className="flex h-2.5 overflow-hidden rounded-full bg-bone">
          {progress.ok > 0 && (
            <div
              className="bg-success transition-all duration-500"
              style={{ width: `${(progress.ok / progress.total) * 100}%` }}
            />
          )}
          {progress.deviations > 0 && (
            <div
              className="bg-warning transition-all duration-500"
              style={{ width: `${(progress.deviations / progress.total) * 100}%` }}
            />
          )}
          {progress.not_applicable > 0 && (
            <div
              className="bg-silver transition-all duration-500"
              style={{ width: `${(progress.not_applicable / progress.total) * 100}%` }}
            />
          )}
        </div>

        {/* Stats row */}
        <div className="mt-3 flex gap-5 text-xs font-medium">
          <span className="flex items-center gap-1.5 text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> {progress.ok} OK
          </span>
          {progress.deviations > 0 && (
            <span className="flex items-center gap-1.5 text-warning">
              <AlertTriangle className="h-3.5 w-3.5" /> {progress.deviations} {t('field.deviations')}
            </span>
          )}
          {progress.not_applicable > 0 && (
            <span className="flex items-center gap-1.5 text-text-tertiary">
              <Minus className="h-3.5 w-3.5" /> {progress.not_applicable} N/A
            </span>
          )}
          <span className="flex items-center gap-1.5 text-text-tertiary">
            <Clock className="h-3.5 w-3.5" /> {progress.pending} {t('field.remaining')}
          </span>
        </div>
      </div>

      {/* Check items */}
      <div className="space-y-3">
        {items.map((item) => (
          <CheckItemCard
            key={item.id}
            item={item}
            onStatusChange={handleStatusChange}
            onMeasurementChange={handleMeasurementChange}
            onNotesChange={handleNotesChange}
            onDeviation={handleDeviation}
          />
        ))}
      </div>
    </div>
  );
}
