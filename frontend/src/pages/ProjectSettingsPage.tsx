import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { LayoutDashboard } from 'lucide-react';

import { AppLayout } from '@/components/Layout/AppLayout';
import { useProject } from '@/hooks/use-projects';
import {
  EIR_RULES,
  makeActiveRule,
  type ActiveEirRule,
  type EirRuleKind,
} from '@/components/features/settings/eirRules';
import { EirRulePalette } from '@/components/features/settings/EirRulePalette';
import { EirRuleCard } from '@/components/features/settings/EirRuleCard';
import type { EirFieldValue } from '@/components/features/settings/EirConfigurator';

const DEFAULT_KINDS: EirRuleKind[] = [
  'crs',
  'basepoint',
  'canonical_floors',
  'classification',
];

export default function ProjectSettingsPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading } = useProject(id!);

  // Seed with a sensible starter set per `feedback-modelers-own-data-platform-suggests.md`
  // — modeler can immediately add/remove from there. State is local-only;
  // persistence lands with Phase 7 BEP-backend restore.
  const [rules, setRules] = useState<ActiveEirRule[]>(() =>
    DEFAULT_KINDS.map(makeActiveRule)
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const addRule = (kind: EirRuleKind) => {
    setRules((prev) => [...prev, makeActiveRule(kind)]);
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
    if (!over || active.id === over.id) return;
    setRules((prev) => {
      const oldIndex = prev.findIndex((r) => r.id === active.id);
      const newIndex = prev.findIndex((r) => r.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const activeKinds = new Set(rules.map((r) => r.kind));

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

  const totalKinds = EIR_RULES.length;

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
                defaultValue: '{{active}} of {{total}} rules active',
                active: rules.length,
                total: totalKinds,
              })}
            </span>
          </span>
        </header>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[clamp(16rem,20vw,22rem)_1fr] gap-[clamp(0.75rem,1.5vw,1.25rem)] overflow-hidden">
          <aside className="overflow-y-auto pr-[clamp(0.25rem,0.5vw,0.5rem)]">
            <EirRulePalette activeKinds={activeKinds} onAdd={addRule} />
          </aside>

          <main className="overflow-y-auto pr-[clamp(0.25rem,0.5vw,0.5rem)]">
            {rules.length === 0 ? (
              <EmptyWorkspace />
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={rules.map((r) => r.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="flex flex-col gap-[clamp(0.75rem,1.2vh,1.25rem)] pb-[clamp(1rem,2vh,2rem)]">
                    {rules.map((rule) => (
                      <EirRuleCard
                        key={rule.id}
                        rule={rule}
                        onConfigChange={updateRuleField}
                        onRemove={removeRule}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </main>
        </div>
      </div>
    </AppLayout>
  );
}

function EmptyWorkspace() {
  const { t } = useTranslation();
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-[clamp(0.5rem,1vh,1rem)] px-[clamp(1rem,2vw,2rem)] text-muted-foreground">
      <LayoutDashboard className="h-[clamp(2rem,4vw,3.5rem)] w-[clamp(2rem,4vw,3.5rem)] opacity-30" />
      <p className="text-[clamp(0.8rem,1vw,1.05rem)] font-medium text-foreground">
        {t('settings.eir.emptyTitle', { defaultValue: 'No EIR rules yet' })}
      </p>
      <p className="text-[clamp(0.7rem,0.85vw,0.9rem)] max-w-[40ch] leading-[1.5]">
        {t('settings.eir.emptyBody', {
          defaultValue:
            'Pick rule kinds from the palette on the left. Each rule defines what the project commits to — CRS, basepoint, classification, naming, tagging, and so on.',
        })}
      </p>
    </div>
  );
}
