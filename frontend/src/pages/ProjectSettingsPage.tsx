import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useDroppable,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { LayoutDashboard } from 'lucide-react';

import { AppLayout } from '@/components/Layout/AppLayout';
import { useProject } from '@/hooks/use-projects';
import {
  EIR_RULES,
  EIR_RULE_BY_KIND,
  makeActiveRule,
  ruleMaxInstances,
  type ActiveEirRule,
  type EirRuleKind,
} from '@/components/features/settings/eirRules';
import { EirRulePalette } from '@/components/features/settings/EirRulePalette';
import { EirRuleCard } from '@/components/features/settings/EirRuleCard';
import { EirPreviewPanel } from '@/components/features/settings/EirPreviewPanel';
import type { EirFieldValue } from '@/components/features/settings/EirConfigurator';
import { cn } from '@/lib/utils';

const DEFAULT_KINDS: EirRuleKind[] = [
  'crs',
  'placement',
  'site_plan',
  'canonical_floors',
  'classification',
];

const WORKSPACE_DROPPABLE_ID = 'eir-workspace';

export default function ProjectSettingsPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading } = useProject(id!);

  const [rules, setRules] = useState<ActiveEirRule[]>(() =>
    DEFAULT_KINDS.map(makeActiveRule)
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const kindCounts = useMemo(() => {
    const m = new Map<EirRuleKind, number>();
    for (const r of rules) m.set(r.kind, (m.get(r.kind) ?? 0) + 1);
    return m;
  }, [rules]);

  const tryAddRule = (kind: EirRuleKind) => {
    const max = ruleMaxInstances(EIR_RULE_BY_KIND[kind]);
    const current = kindCounts.get(kind) ?? 0;
    if (current >= max) return false;
    setRules((prev) => [...prev, makeActiveRule(kind)]);
    return true;
  };

  const removeRule = (ruleId: string) => {
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
  };

  const updateRuleField = (
    ruleId: string,
    fieldId: string,
    value: EirFieldValue
  ) => {
    setRules((prev) =>
      prev.map((r) =>
        r.id === ruleId
          ? { ...r, config: { ...r.config, [fieldId]: value } }
          : r
      )
    );
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const data = active.data.current as
      | { source?: 'palette'; kind?: EirRuleKind }
      | undefined;

    // Palette drag → add (only if dropped on the workspace or a rule).
    if (data?.source === 'palette' && data.kind) {
      const droppedOnWorkspace =
        over.id === WORKSPACE_DROPPABLE_ID ||
        rules.some((r) => r.id === over.id);
      if (droppedOnWorkspace) tryAddRule(data.kind);
      return;
    }

    // Sortable reorder within the workspace.
    if (active.id !== over.id) {
      setRules((prev) => {
        const oldIndex = prev.findIndex((r) => r.id === active.id);
        const newIndex = prev.findIndex((r) => r.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center text-muted-foreground">
          {t('common.loading')}
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center text-destructive">
          {t('project.notFound')}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden gap-[clamp(0.5rem,1vh,1rem)] px-[clamp(1rem,2vw,1.5rem)] py-[clamp(0.75rem,1.5vh,1.25rem)]">
        <div
          className="h-[3px] w-full rounded-full bg-gradient-to-r from-[#D0D34D] via-[#157954] to-[#21263A]"
          aria-hidden="true"
        />

        <header className="flex items-baseline justify-between gap-[clamp(0.5rem,1vw,1rem)] flex-shrink-0 flex-wrap">
          <div className="flex items-baseline gap-[clamp(0.5rem,1vw,1rem)] flex-wrap">
            <h1 className="text-[clamp(1rem,1.6vw,1.5rem)] font-semibold tracking-tight">
              {t('settings.title')}
            </h1>
            <span className="text-[clamp(0.65rem,0.8vw,0.85rem)] text-muted-foreground">
              {t('settings.subtitleEirBuilder', {
                defaultValue: 'Compose the EIR — rules the project commits to',
              })}
            </span>
          </div>
          <span className="text-[clamp(0.65rem,0.8vw,0.85rem)] text-muted-foreground">
            {project.name}
            {' · '}
            <span className="tabular-nums">
              {t('settings.eir.activeCount', {
                defaultValue: '{{active}} of {{total}} rule kinds in use',
                active: kindCounts.size,
                total: EIR_RULES.length,
              })}
            </span>
          </span>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[clamp(14rem,16vw,18rem)_1fr] xl:grid-cols-[clamp(14rem,16vw,18rem)_1fr_clamp(20rem,24vw,28rem)] gap-[clamp(0.75rem,1.25vw,1.25rem)] overflow-hidden">
            <aside className="overflow-y-auto pr-[clamp(0.25rem,0.5vw,0.5rem)]">
              <EirRulePalette kindCounts={kindCounts} onAdd={tryAddRule} />
            </aside>
            <WorkspaceDropZone hasRules={rules.length > 0}>
              <SortableContext
                items={rules.map((r) => r.id)}
                strategy={rectSortingStrategy}
              >
                {rules.length === 0 ? (
                  <EmptyWorkspace />
                ) : (
                  <div
                    className="grid gap-[clamp(0.625rem,1vw,1rem)] pb-[clamp(1rem,2vh,2rem)] items-start"
                    style={{
                      gridTemplateColumns:
                        'repeat(auto-fill, minmax(clamp(18rem, 22vw, 22rem), 1fr))',
                    }}
                  >
                    {rules.map((rule) => (
                      <EirRuleCard
                        key={rule.id}
                        rule={rule}
                        onConfigChange={updateRuleField}
                        onRemove={removeRule}
                      />
                    ))}
                  </div>
                )}
              </SortableContext>
            </WorkspaceDropZone>
            <div className="hidden xl:flex flex-col min-h-0 overflow-hidden">
              <EirPreviewPanel rules={rules} />
            </div>
          </div>
        </DndContext>
      </div>
    </AppLayout>
  );
}

function WorkspaceDropZone({
  hasRules,
  children,
}: {
  hasRules: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: WORKSPACE_DROPPABLE_ID });
  return (
    <main
      ref={setNodeRef}
      className={cn(
        'overflow-y-auto pr-[clamp(0.25rem,0.5vw,0.5rem)] transition-colors rounded-lg',
        isOver && 'bg-primary/5 ring-1 ring-primary/30',
        !hasRules && 'min-h-[60vh]'
      )}
    >
      {children}
    </main>
  );
}

function EmptyWorkspace() {
  const { t } = useTranslation();
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-[clamp(0.5rem,1vh,1rem)] px-[clamp(1rem,2vw,2rem)] text-muted-foreground py-[clamp(2rem,6vh,4rem)]">
      <LayoutDashboard className="h-[clamp(2rem,4vw,3.5rem)] w-[clamp(2rem,4vw,3.5rem)] opacity-30" />
      <p className="text-[clamp(0.8rem,1vw,1.05rem)] font-medium text-foreground">
        {t('settings.eir.emptyTitle', { defaultValue: 'No EIR rules yet' })}
      </p>
      <p className="text-[clamp(0.7rem,0.85vw,0.9rem)] max-w-[40ch] leading-[1.5]">
        {t('settings.eir.emptyBody', {
          defaultValue:
            'Drag a rule from the palette on the left into this area — or double-click a palette row to add it.',
        })}
      </p>
    </div>
  );
}
