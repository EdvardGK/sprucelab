import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/Layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
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

export default function ProjectField() {
  const { id: projectId } = useParams<{ id: string }>();
  const [selectedChecklistId, setSelectedChecklistId] = useState<string | null>(null);

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
      />
    </AppLayout>
  );
}

// ─── Checklist List View ───────────────────────────────────────────

function ChecklistListView({
  projectId,
  onSelect,
}: {
  projectId: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { data: checklists, isLoading } = useChecklists({ project: projectId });
  const { data: templates } = useChecklistTemplates({ project: projectId });
  const instantiate = useInstantiateChecklist();
  const [showCreate, setShowCreate] = useState(false);
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
          setShowCreate(false);
          setNewLocation('');
          setSelectedTemplateId('');
          onSelect(checklist.id);
        },
      }
    );
  }

  const STATUS_BADGE: Record<string, 'secondary' | 'info' | 'success' | 'default'> = {
    draft: 'secondary',
    in_progress: 'info',
    completed: 'success',
    signed: 'default',
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {t('field.title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('field.subtitle')}
          </p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-1.5 h-4 w-4" />
          {t('field.newChecklist')}
        </Button>
      </div>

      {/* Create dialog */}
      {showCreate && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm">{t('field.createFromTemplate')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {t('field.template')}
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {t('field.location')}
              </label>
              <Input
                type="text"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                placeholder={t('field.locationPlaceholder')}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleCreate}
                disabled={!selectedTemplateId || instantiate.isPending}
              >
                {instantiate.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t('field.create')
                )}
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!checklists || checklists.length === 0) && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">
            {t('field.noChecklists')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {t('field.noChecklistsHint')}
          </p>
        </div>
      )}

      {/* Checklist cards */}
      {checklists && checklists.length > 0 && (
        <div className="space-y-3">
          {checklists.map((cl) => {
            const done = cl.progress.ok + cl.progress.not_applicable;

            return (
              <Card
                key={cl.id}
                className="cursor-pointer transition-all hover:border-primary/30 hover:shadow-md"
                onClick={() => onSelect(cl.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">
                          {cl.name}
                        </h3>
                        <Badge variant={STATUS_BADGE[cl.status] || 'secondary'}>
                          {cl.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      {cl.location && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {cl.location}
                        </p>
                      )}
                    </div>
                    <div className="ml-4 text-right">
                      <p className="text-xs font-medium text-muted-foreground">
                        {done}/{cl.progress.total}
                      </p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {cl.progress.total > 0 && (
                    <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-muted">
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
                          className="bg-muted-foreground/30"
                          style={{ width: `${(cl.progress.not_applicable / cl.progress.total) * 100}%` }}
                        />
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
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
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="mb-3"
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          {t('field.backToList')}
        </Button>
        <h1 className="text-lg font-bold text-foreground">{checklist.name}</h1>
        {checklist.location && (
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {checklist.location}
          </p>
        )}
      </div>

      {/* Summary bar */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="font-medium text-muted-foreground">{t('field.progress')}</span>
            <span className="font-semibold text-foreground">
              {done}/{progress.total} {t('field.checked')}
            </span>
          </div>

          {/* Segmented progress bar */}
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
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
                className="bg-muted-foreground/30 transition-all duration-500"
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
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Minus className="h-3.5 w-3.5" /> {progress.not_applicable} N/A
              </span>
            )}
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> {progress.pending} {t('field.remaining')}
            </span>
          </div>
        </CardContent>
      </Card>

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
