import { useCallback, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
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
import { Eye, LayoutDashboard, Pencil } from 'lucide-react';

import { AppLayout } from '@/components/Layout/AppLayout';
import { PageShell } from '@/components/Layout';
import { useProject } from '@/hooks/use-projects';
import { useAuth } from '@/contexts/AuthContext';
import {
  EIR_RULES,
  EIR_RULE_BY_KIND,
  makeActiveRule,
  ruleMaxInstances,
  type ActiveEirRule,
  type EirRuleKind,
  type EirRuleTier,
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

type BuilderMode = 'view' | 'edit';

function parseMode(raw: string | null): BuilderMode {
  return raw === 'edit' ? 'edit' : 'view';
}

function parseTier(raw: string | null): EirRuleTier {
  if (raw === 'oir' || raw === 'air' || raw === 'pir' || raw === 'eir') return raw;
  return 'eir';
}

export default function ProjectSettingsPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading } = useProject(id!);
  const { user } = useAuth();

  // ── URL-synced state: ?mode=view|edit and ?tier=eir|pir|... ─────────
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = parseMode(searchParams.get('mode'));
  const tier = parseTier(searchParams.get('tier'));

  // Role gating: try to read a role flag off the supabase user object,
  // fall back to "any authed user may edit". A proper role-claim layer
  // lives in Phase 7 backend (BEP responses + ISO 19650 join flow).
  // TODO: wire role-based gating once user.role / membership.role
  // ships in the frontend auth context.
  const userMetadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const appMetadata = (user?.app_metadata ?? {}) as Record<string, unknown>;
  const rawRole =
    (userMetadata.role as string | undefined) ??
    (appMetadata.role as string | undefined) ??
    null;
  const isEditorRaw = userMetadata.is_editor ?? appMetadata.is_editor;
  // If we DO find a role / is_editor flag, gate edit mode to it.
  // Otherwise treat any authed user as eligible (worktree fallback).
  const hasRolePlumbing = rawRole !== null || typeof isEditorRaw === 'boolean';
  const canEdit = hasRolePlumbing
    ? rawRole === null
      ? Boolean(isEditorRaw)
      : ['editor', 'admin', 'owner'].includes(rawRole.toLowerCase())
    : Boolean(user);

  const updateMode = useCallback(
    (next: BuilderMode) => {
      // Block escalation to edit when role gating refuses it.
      if (next === 'edit' && !canEdit) return;
      setSearchParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          if (next === 'edit') out.set('mode', 'edit');
          else out.delete('mode'); // view is default
          return out;
        },
        { replace: true }
      );
    },
    [canEdit, setSearchParams]
  );

  const updateTier = useCallback(
    (next: EirRuleTier) => {
      setSearchParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          if (next === 'eir') out.delete('tier'); // eir is default
          else out.set('tier', next);
          return out;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

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
    if (mode !== 'edit') return false;
    const max = ruleMaxInstances(EIR_RULE_BY_KIND[kind]);
    const current = kindCounts.get(kind) ?? 0;
    if (current >= max) return false;
    setRules((prev) => [...prev, makeActiveRule(kind)]);
    return true;
  };

  const removeRule = (ruleId: string) => {
    if (mode !== 'edit') return;
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
  };

  const updateRuleField = (
    ruleId: string,
    fieldId: string,
    value: EirFieldValue
  ) => {
    if (mode !== 'edit') return;
    setRules((prev) =>
      prev.map((r) =>
        r.id === ruleId
          ? { ...r, config: { ...r.config, [fieldId]: value } }
          : r
      )
    );
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (mode !== 'edit') return;
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
      <PageShell
        title={t('settings.title')}
        subtitle={t('settings.subtitleEirBuilder', {
          defaultValue: 'Compose the EIR — rules the project commits to',
        })}
        headerRight={
          <>
            <ModeToggle mode={mode} canEdit={canEdit} onChange={updateMode} />
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
          </>
        }
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <div
            className={cn(
              'min-h-[clamp(480px,70vh,960px)] grid grid-cols-1 gap-[clamp(0.75rem,1.25vw,1.25rem)]',
              mode === 'edit'
                ? 'md:grid-cols-[clamp(14rem,16vw,18rem)_1fr] xl:grid-cols-[clamp(14rem,16vw,18rem)_1fr_clamp(20rem,24vw,28rem)]'
                : 'xl:grid-cols-[1fr_clamp(20rem,24vw,28rem)]'
            )}
          >
            {mode === 'edit' && (
              <aside className="overflow-y-auto pr-[clamp(0.25rem,0.5vw,0.5rem)]">
                <EirRulePalette
                  kindCounts={kindCounts}
                  onAdd={tryAddRule}
                  tier={tier}
                  onTierChange={updateTier}
                />
              </aside>
            )}
            <WorkspaceDropZone hasRules={rules.length > 0} disabled={mode !== 'edit'}>
              <SortableContext
                items={rules.map((r) => r.id)}
                strategy={rectSortingStrategy}
                disabled={mode !== 'edit'}
              >
                {rules.length === 0 ? (
                  <EmptyWorkspace mode={mode} />
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
                        mode={mode}
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
      </PageShell>
    </AppLayout>
  );
}

function ModeToggle({
  mode,
  canEdit,
  onChange,
}: {
  mode: BuilderMode;
  canEdit: boolean;
  onChange: (next: BuilderMode) => void;
}) {
  const { t } = useTranslation();
  const tiers: Array<{
    value: BuilderMode;
    label: string;
    Icon: typeof Eye;
    title?: string;
  }> = [
    {
      value: 'view',
      label: t('eirBuilder.mode.view', { defaultValue: 'View' }),
      Icon: Eye,
    },
    {
      value: 'edit',
      label: t('eirBuilder.mode.edit', { defaultValue: 'Edit' }),
      Icon: Pencil,
      title: canEdit
        ? undefined
        : t('eirBuilder.mode.editLocked', {
            defaultValue: 'You do not have edit access to this project.',
          }),
    },
  ];
  return (
    <div
      role="tablist"
      aria-label={t('eirBuilder.mode.label', { defaultValue: 'Builder mode' })}
      className="inline-flex items-stretch rounded-md bg-muted/50 p-[clamp(0.125rem,0.2vw,0.25rem)]"
    >
      {tiers.map(({ value, label, Icon, title }) => {
        const selected = value === mode;
        const disabled = value === 'edit' && !canEdit;
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled}
            onClick={() => onChange(value)}
            title={title}
            className={cn(
              'inline-flex items-center gap-1 rounded px-[clamp(0.5rem,0.8vw,0.875rem)] py-[clamp(0.25rem,0.4vh,0.5rem)] text-[clamp(0.6rem,0.75vw,0.8rem)] font-semibold transition-colors',
              selected
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
              disabled && 'cursor-not-allowed opacity-50 hover:text-muted-foreground'
            )}
          >
            <Icon className="h-[clamp(0.75rem,0.95vw,0.95rem)] w-[clamp(0.75rem,0.95vw,0.95rem)]" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function WorkspaceDropZone({
  hasRules,
  disabled,
  children,
}: {
  hasRules: boolean;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: WORKSPACE_DROPPABLE_ID,
    disabled,
  });
  return (
    <main
      ref={setNodeRef}
      className={cn(
        'overflow-y-auto pr-[clamp(0.25rem,0.5vw,0.5rem)] transition-colors rounded-lg',
        isOver && !disabled && 'bg-primary/5 ring-1 ring-primary/30',
        !hasRules && 'min-h-[60vh]'
      )}
    >
      {children}
    </main>
  );
}

function EmptyWorkspace({ mode }: { mode: BuilderMode }) {
  const { t } = useTranslation();
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-[clamp(0.5rem,1vh,1rem)] px-[clamp(1rem,2vw,2rem)] text-muted-foreground py-[clamp(2rem,6vh,4rem)]">
      <LayoutDashboard className="h-[clamp(2rem,4vw,3.5rem)] w-[clamp(2rem,4vw,3.5rem)] opacity-30" />
      <p className="text-[clamp(0.8rem,1vw,1.05rem)] font-medium text-foreground">
        {t('settings.eir.emptyTitle', { defaultValue: 'No EIR rules yet' })}
      </p>
      <p className="text-[clamp(0.7rem,0.85vw,0.9rem)] max-w-[40ch] leading-[1.5]">
        {mode === 'edit'
          ? t('settings.eir.emptyBody', {
              defaultValue:
                'Drag a rule from the palette on the left into this area — or double-click a palette row to add it.',
            })
          : t('eirBuilder.workspace.emptyView', {
              defaultValue:
                'This project has no EIR rules yet. Switch to Edit to compose the contract.',
            })}
      </p>
    </div>
  );
}
