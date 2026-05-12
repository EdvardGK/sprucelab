import { useCallback, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
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
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Eye, Pencil, PanelRight } from 'lucide-react';

import { AppLayout } from '@/components/Layout/AppLayout';
import { PageShell } from '@/components/Layout';
import { useProject } from '@/hooks/use-projects';
import { useAuth } from '@/contexts/AuthContext';
import {
  EIR_RULE_BY_KIND,
  EIR_TIER_LABELS,
  EIR_TIER_ORDER,
  makeActiveRule,
  ruleMaxInstances,
  type ActiveEirRule,
  type EirRuleKind,
  type EirRuleTier,
} from '@/components/features/settings/eirRules';
import { EirRulePaletteSheet } from '@/components/features/settings/EirRulePaletteSheet';
import { EirDocumentSection } from '@/components/features/settings/EirDocumentSection';
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

type BuilderMode = 'view' | 'edit';
type TierFilter = EirRuleTier | 'all';

const TIER_FILTER_ORDER: TierFilter[] = ['all', ...EIR_TIER_ORDER];

function parseMode(raw: string | null): BuilderMode {
  return raw === 'edit' ? 'edit' : 'view';
}

function parseTierFilter(raw: string | null): TierFilter {
  if (raw === 'oir' || raw === 'air' || raw === 'pir' || raw === 'eir') return raw;
  return 'all';
}

/**
 * Project Config / EIR builder.
 *
 * Documents-first: the workspace is a structured ISO 19650 document
 * (OIR / AIR / PIR / EIR tier sections). Editor mode overlays drag
 * handles, X buttons, inline edit affordances, and a "+ Add rule"
 * popover; view mode renders the same layout as static `<dl>` rows
 * with amber em-dash for gaps.
 *
 * Route: `/projects/:id/eir`. `/projects/:id/settings` is kept as a
 * redirect for back-compat (handled at the App router level).
 */
export default function ProjectSettingsPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading } = useProject(id!);
  const { user } = useAuth();

  // ── URL-synced state ────────────────────────────────────────────
  // ?mode=view|edit  · ?tier=all|oir|air|pir|eir
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = parseMode(searchParams.get('mode'));
  const tierFilter = parseTierFilter(searchParams.get('tier'));

  // Role gating (same logic Track D shipped).
  const userMetadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const appMetadata = (user?.app_metadata ?? {}) as Record<string, unknown>;
  const rawRole =
    (userMetadata.role as string | undefined) ??
    (appMetadata.role as string | undefined) ??
    null;
  const isEditorRaw = userMetadata.is_editor ?? appMetadata.is_editor;
  const hasRolePlumbing = rawRole !== null || typeof isEditorRaw === 'boolean';
  const canEdit = hasRolePlumbing
    ? rawRole === null
      ? Boolean(isEditorRaw)
      : ['editor', 'admin', 'owner'].includes(rawRole.toLowerCase())
    : Boolean(user);

  const updateMode = useCallback(
    (next: BuilderMode) => {
      if (next === 'edit' && !canEdit) return;
      setSearchParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          if (next === 'edit') out.set('mode', 'edit');
          else out.delete('mode');
          return out;
        },
        { replace: true }
      );
    },
    [canEdit, setSearchParams]
  );

  const updateTierFilter = useCallback(
    (next: TierFilter) => {
      setSearchParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          if (next === 'all') out.delete('tier');
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  // mobile/md preview panel slide-up state
  const [previewOpen, setPreviewOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const kindCounts = useMemo(() => {
    const m = new Map<EirRuleKind, number>();
    for (const r of rules) m.set(r.kind, (m.get(r.kind) ?? 0) + 1);
    return m;
  }, [rules]);

  // Group rules by their tier for the document sections.
  const rulesByTier = useMemo(() => {
    const m = new Map<EirRuleTier, ActiveEirRule[]>();
    for (const tier of EIR_TIER_ORDER) m.set(tier, []);
    for (const r of rules) {
      const def = EIR_RULE_BY_KIND[r.kind];
      m.get(def.tier)?.push(r);
    }
    return m;
  }, [rules]);

  const visibleTiers = useMemo(
    () => (tierFilter === 'all' ? EIR_TIER_ORDER : [tierFilter]),
    [tierFilter]
  );

  const tryAddRule = useCallback(
    (kind: EirRuleKind) => {
      if (mode !== 'edit') return null;
      const def = EIR_RULE_BY_KIND[kind];
      const max = ruleMaxInstances(def);
      const current = kindCounts.get(kind) ?? 0;
      if (current >= max) return null;
      const created = makeActiveRule(kind);
      setRules((prev) => [...prev, created]);
      // Scroll to + briefly highlight the new card on the next paint.
      requestAnimationFrame(() => {
        const node = document.querySelector(
          `[data-rule-id="${created.id}"]`
        ) as HTMLElement | null;
        if (node) {
          node.scrollIntoView({ behavior: 'smooth', block: 'center' });
          node.classList.add('ring-2', 'ring-primary/60');
          setTimeout(() => {
            node.classList.remove('ring-2', 'ring-primary/60');
          }, 1400);
        }
      });
      return created;
    },
    [kindCounts, mode]
  );

  const removeRule = useCallback(
    (ruleId: string) => {
      if (mode !== 'edit') return;
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    },
    [mode]
  );

  const updateRuleField = useCallback(
    (ruleId: string, fieldId: string, value: EirFieldValue) => {
      if (mode !== 'edit') return;
      setRules((prev) =>
        prev.map((r) =>
          r.id === ruleId ? { ...r, config: { ...r.config, [fieldId]: value } } : r
        )
      );
    },
    [mode]
  );

  /**
   * Open the rule palette with the popover pre-scoped to a specific
   * tier. We do that by switching the page-level tier filter to that
   * tier (since the popover mirrors it). 'all' → show every rule
   * kind grouped by tier.
   */
  const openPaletteForTier = useCallback(
    (tier: EirRuleTier) => {
      // Don't override the user's All filter — only narrow if the
      // current filter is a different specific tier.
      if (tierFilter !== 'all' && tierFilter !== tier) {
        updateTierFilter(tier);
      }
      setPaletteOpen(true);
    },
    [tierFilter, updateTierFilter]
  );

  const onDragEnd = (event: DragEndEvent) => {
    if (mode !== 'edit') return;
    const { active, over } = event;
    if (!over) return;
    const data = active.data.current as
      | { source?: 'palette'; kind?: EirRuleKind; tier?: EirRuleTier }
      | undefined;

    // Palette → workspace drop. If dropped on a tier section's
    // droppable id or on an existing rule, add the rule.
    if (data?.source === 'palette' && data.kind) {
      const overId = String(over.id);
      const droppedOnTierSection = overId.startsWith('eir-section-');
      const droppedOnRule = rules.some((r) => r.id === over.id);
      if (droppedOnTierSection || droppedOnRule) {
        tryAddRule(data.kind);
        setPaletteOpen(false);
      }
      return;
    }

    // Sortable reorder within the workspace (one flat list — tier
    // membership is rule-defined, so reorder is visual only within a
    // tier section's column).
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

  const isEditMode = mode === 'edit';

  return (
    <AppLayout>
      <PageShell
        title={t('settings.title')}
        subtitle={t('settings.subtitleEirBuilder', {
          defaultValue: 'Compose the EIR — rules the project commits to',
        })}
        headerRight={
          <>
            <span className="hidden md:inline text-[clamp(0.6rem,0.75vw,0.78rem)] text-muted-foreground tabular-nums">
              {project.name}
            </span>
            <TierFilterControl tier={tierFilter} onChange={updateTierFilter} />
            <ModeToggle mode={mode} canEdit={canEdit} onChange={updateMode} />
            {isEditMode && (
              <EirRulePaletteSheet
                open={paletteOpen}
                onOpenChange={setPaletteOpen}
                kindCounts={kindCounts}
                onAdd={(kind) => {
                  tryAddRule(kind);
                  setPaletteOpen(false);
                }}
                tier={tierFilter}
                disabled={!canEdit}
              />
            )}
          </>
        }
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_clamp(280px,28vw,420px)] gap-[clamp(0.75rem,1.5vw,1.5rem)]">
            <main className="flex flex-col gap-[clamp(1rem,2vh,1.75rem)] min-w-0">
              {visibleTiers.map((tier) => (
                <EirDocumentSection
                  key={tier}
                  tier={tier}
                  rules={rulesByTier.get(tier) ?? []}
                  mode={mode}
                  onConfigChange={updateRuleField}
                  onRemove={removeRule}
                  onAddRuleToTier={openPaletteForTier}
                />
              ))}
            </main>

            {/* Right preview column — visible at lg+ */}
            <aside className="hidden lg:flex flex-col min-w-0">
              <div className="lg:sticky lg:top-[clamp(0.75rem,1.5vh,1.25rem)]">
                <EirPreviewPanel
                  rules={rules}
                  className="max-h-[calc(100vh-clamp(8rem,16vh,12rem))]"
                />
              </div>
            </aside>
          </div>
        </DndContext>

        {/* md- preview slide-up sheet */}
        <PreviewMobileTrigger
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        />
        {previewOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex flex-col bg-background/95 backdrop-blur-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="text-base font-semibold">
                {t('eirBuilder.preview.title', { defaultValue: 'Preview' })}
              </h2>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="rounded-md px-3 py-1 text-sm font-medium hover:bg-muted/50"
              >
                {t('common.close', { defaultValue: 'Close' })}
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden p-3">
              <EirPreviewPanel rules={rules} className="h-full" />
            </div>
          </div>
        )}
      </PageShell>
    </AppLayout>
  );
}

function PreviewMobileTrigger({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  if (open) return null;
  return (
    <button
      type="button"
      onClick={() => onOpenChange(true)}
      className={cn(
        'lg:hidden fixed bottom-[clamp(1rem,2vh,1.75rem)] right-[clamp(1rem,2vw,1.75rem)] z-30',
        'inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-lg hover:bg-primary/90 transition-colors'
      )}
    >
      <PanelRight className="h-4 w-4" />
      <span>{t('eirBuilder.preview.button', { defaultValue: 'Preview' })}</span>
    </button>
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

function TierFilterControl({
  tier,
  onChange,
}: {
  tier: TierFilter;
  onChange: (next: TierFilter) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="tablist"
      aria-label={t('eirBuilder.tierFilter.label', {
        defaultValue: 'ISO 19650 tier filter',
      })}
      className="inline-flex items-stretch rounded-md bg-muted/50 p-[clamp(0.125rem,0.2vw,0.25rem)]"
    >
      {TIER_FILTER_ORDER.map((tf) => {
        const selected = tf === tier;
        const label =
          tf === 'all'
            ? t('eirBuilder.tierFilter.all', { defaultValue: 'All' })
            : EIR_TIER_LABELS[tf];
        return (
          <button
            key={tf}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tf)}
            className={cn(
              'inline-flex items-center justify-center rounded px-[clamp(0.4rem,0.65vw,0.75rem)] py-[clamp(0.25rem,0.4vh,0.5rem)] text-[clamp(0.55rem,0.7vw,0.78rem)] font-semibold tracking-wide transition-colors tabular-nums',
              selected
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
