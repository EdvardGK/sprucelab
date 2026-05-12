import { useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Sparkles,
  Wrench,
  FileText,
  Pencil,
  Activity,
  AlertCircle,
} from 'lucide-react';

import { AppLayout } from '@/components/Layout/AppLayout';
import { useProject } from '@/hooks/use-projects';
import { ProjectFloorsTab } from '@/components/features/projects/ProjectFloorsTab';
import {
  SETTINGS_SECTIONS,
  GROUP_LABELS,
  GROUP_ORDER,
  type SettingsSection,
} from '@/components/features/settings/sections';
import { getEirFields } from '@/components/features/settings/eirConfig';
import { EirConfigurator } from '@/components/features/settings/EirConfigurator';
import { cn } from '@/lib/utils';

export default function ProjectSettingsPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: project, isLoading } = useProject(id!);

  const sectionId = searchParams.get('section') ?? SETTINGS_SECTIONS[0].id;
  const section = useMemo(
    () => SETTINGS_SECTIONS.find((s) => s.id === sectionId) ?? SETTINGS_SECTIONS[0],
    [sectionId]
  );

  const setSection = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('section', id);
    setSearchParams(next, { replace: false });
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
              {t('settings.subtitle')}
            </span>
          </div>
          <span className="text-[clamp(0.65rem,0.8vw,0.85rem)] text-muted-foreground">
            {project.name}
          </span>
        </header>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[clamp(14rem,16vw,16rem)_1fr] gap-[clamp(0.75rem,1.5vw,1.25rem)] overflow-hidden">
          {/* Left sub-nav */}
          <aside className="overflow-y-auto pr-[clamp(0.25rem,0.5vw,0.5rem)]">
            <nav className="flex flex-col gap-[clamp(0.5rem,1vh,1rem)]">
              {GROUP_ORDER.map((group) => {
                const items = SETTINGS_SECTIONS.filter((s) => s.group === group);
                return (
                  <div key={group}>
                    <div className="px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.25rem,0.4vh,0.5rem)] text-[clamp(0.55rem,0.7vw,0.75rem)] uppercase tracking-wide font-semibold text-muted-foreground">
                      {GROUP_LABELS[group]}
                    </div>
                    <div className="flex flex-col gap-0.5 mt-1">
                      {items.map((item) => {
                        const active = item.id === section.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSection(item.id)}
                            className={cn(
                              'flex items-center justify-between gap-2 rounded-md px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] text-left text-[clamp(0.7rem,0.85vw,0.9rem)] transition-colors',
                              active
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'text-foreground hover:bg-muted/40'
                            )}
                          >
                            <span className="truncate">{item.title}</span>
                            <StateChip state={item.state} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </nav>
          </aside>

          {/* Right content — EIR · BEP · STATUS triad */}
          <main className="overflow-y-auto">
            <SectionTriad section={section} projectId={project.id} />
          </main>
        </div>
      </div>
    </AppLayout>
  );
}

function StateChip({ state }: { state: SettingsSection['state'] }) {
  const { t } = useTranslation();
  if (state === 'live') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(158_70%_28%/0.15)] text-[hsl(158_70%_28%)] px-1.5 py-0.5 text-[clamp(0.5rem,0.6vw,0.65rem)] font-medium">
        <Sparkles className="h-[0.5rem] w-[0.5rem]" />
        {t('settings.state.live')}
      </span>
    );
  }
  if (state === 'partial') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[clamp(0.5rem,0.6vw,0.65rem)] font-medium">
        <Wrench className="h-[0.5rem] w-[0.5rem]" />
        {t('settings.state.partial')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-1.5 py-0.5 text-[clamp(0.5rem,0.6vw,0.65rem)] font-medium">
      {t('settings.state.planned')}
    </span>
  );
}

function SectionTriad({
  section,
  projectId,
}: {
  section: SettingsSection;
  projectId: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-[clamp(0.75rem,1.5vh,1.25rem)]">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[clamp(1rem,1.4vw,1.375rem)] font-semibold tracking-tight">
            {section.title}
          </h2>
          <p className="mt-[clamp(0.125rem,0.4vh,0.5rem)] text-[clamp(0.7rem,0.85vw,0.95rem)] text-muted-foreground max-w-[60ch]">
            {section.scope}
          </p>
        </div>
        <StateChip state={section.state} />
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.4fr_1fr] gap-[clamp(0.75rem,1.2vw,1.25rem)] items-stretch">
        <EirColumn section={section} />
        <BepColumn section={section} projectId={projectId} />
        <StatusColumn section={section} projectId={projectId} />
      </div>

      {section.id === 'classification' && (
        <Link
          to={`/projects/${projectId}/types?v=2`}
          className="inline-flex items-center gap-1 self-start rounded-full bg-primary/10 text-primary px-3 py-1.5 text-[clamp(0.65rem,0.8vw,0.85rem)] font-medium hover:bg-primary/20 transition-colors"
        >
          {t('settings.classification.openTypesV2')}
        </Link>
      )}
    </div>
  );
}

function ColumnShell({
  icon,
  label,
  hint,
  children,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  children: React.ReactNode;
  accent?: 'bep' | 'status' | null;
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-[clamp(0.5rem,1vh,1rem)] rounded-lg border bg-card p-[clamp(0.75rem,1.2vw,1.25rem)]',
        accent === 'bep' && 'border-primary/30',
        accent === 'status' && 'border-[hsl(158_70%_28%/0.25)]',
        !accent && 'border-border/60'
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="shrink-0">{icon}</span>
          <span className="text-[clamp(0.55rem,0.7vw,0.75rem)] uppercase tracking-wide font-semibold">
            {label}
          </span>
        </div>
        {hint && (
          <span className="text-[clamp(0.55rem,0.65vw,0.7rem)] text-muted-foreground/70 italic truncate">
            {hint}
          </span>
        )}
      </header>
      <div className="flex-1 min-h-0">{children}</div>
    </section>
  );
}

function EirColumn({ section }: { section: SettingsSection }) {
  const { t } = useTranslation();
  const eir = section.eirRequirement;
  const fields = getEirFields(section.id);
  return (
    <ColumnShell
      icon={
        <FileText className="h-[clamp(0.75rem,1vw,1rem)] w-[clamp(0.75rem,1vw,1rem)]" />
      }
      label={t('settings.column.eir')}
      hint={
        fields
          ? eir.sourceRef ?? t('settings.eir.configurator')
          : eir.imported
            ? eir.sourceRef
            : t('settings.eir.placeholder')
      }
    >
      {fields ? (
        <EirConfigurator fields={fields} />
      ) : (
        <blockquote className="relative pl-[clamp(0.5rem,0.9vw,0.875rem)] border-l-2 border-border/50">
          <p className="text-[clamp(0.7rem,0.85vw,0.95rem)] text-foreground/85 italic leading-[1.55] whitespace-pre-line">
            {eir.text}
          </p>
          {eir.sourceRef && (
            <footer className="mt-[clamp(0.375rem,0.6vh,0.625rem)] text-[clamp(0.55rem,0.7vw,0.75rem)] text-muted-foreground not-italic">
              {eir.sourceRef}
            </footer>
          )}
        </blockquote>
      )}
    </ColumnShell>
  );
}

function BepColumn({
  section,
  projectId,
}: {
  section: SettingsSection;
  projectId: string;
}) {
  const { t } = useTranslation();
  return (
    <ColumnShell
      icon={
        <Pencil className="h-[clamp(0.75rem,1vw,1rem)] w-[clamp(0.75rem,1vw,1rem)]" />
      }
      label={t('settings.column.bep')}
      accent="bep"
    >
      {section.state === 'live' && section.id === 'floors' && (
        <ProjectFloorsTab projectId={projectId} />
      )}

      {!(section.state === 'live' && section.id === 'floors') && section.bepBody && (
        <div className="flex flex-col gap-[clamp(0.375rem,0.6vh,0.625rem)]">
          <ul className="flex flex-col gap-[clamp(0.25rem,0.4vh,0.5rem)] text-[clamp(0.7rem,0.85vw,0.95rem)] leading-[1.5] text-foreground/85">
            {section.bepBody.map((line, i) => (
              <li key={i} className="pl-[clamp(0.5rem,0.8vw,0.75rem)] relative before:content-['•'] before:absolute before:left-0 before:text-muted-foreground">
                {line}
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled
            className="mt-[clamp(0.5rem,0.8vh,1rem)] inline-flex items-center gap-1 self-start rounded-md bg-muted text-muted-foreground/70 px-[clamp(0.625rem,1vw,1rem)] py-[clamp(0.25rem,0.4vh,0.5rem)] text-[clamp(0.65rem,0.8vw,0.85rem)] font-medium cursor-not-allowed"
            title={t('settings.bep.placeholderHint')}
          >
            {t('settings.bep.configure')}
          </button>
        </div>
      )}
    </ColumnShell>
  );
}

function StatusColumn({ section }: { section: SettingsSection; projectId: string }) {
  const { t } = useTranslation();
  return (
    <ColumnShell
      icon={
        <Activity className="h-[clamp(0.75rem,1vw,1rem)] w-[clamp(0.75rem,1vw,1rem)]" />
      }
      label={t('settings.column.status')}
      accent="status"
    >
      {section.state === 'live' && section.id === 'floors' ? (
        <FloorsStatus />
      ) : (
        <PlaceholderStatus />
      )}
    </ColumnShell>
  );
}

function FloorsStatus() {
  const { t } = useTranslation();
  // Real wiring lands when we connect to useProjectScopes / useScopeFloors;
  // for now we surface a friendly read-only state that points to the
  // floors data already rendered in the BEP column.
  return (
    <div className="flex flex-col gap-[clamp(0.375rem,0.6vh,0.625rem)] text-[clamp(0.7rem,0.85vw,0.95rem)]">
      <div className="flex items-center gap-2">
        <span className="inline-block h-[clamp(0.5rem,0.7vw,0.625rem)] w-[clamp(0.5rem,0.7vw,0.625rem)] rounded-full bg-[hsl(158_70%_28%)]" />
        <span className="text-muted-foreground">
          {t('settings.status.floorsLiveHint')}
        </span>
      </div>
      <p className="text-[clamp(0.65rem,0.8vw,0.85rem)] text-muted-foreground/80">
        {t('settings.status.floorsExplain')}
      </p>
    </div>
  );
}

function PlaceholderStatus() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-[clamp(0.5rem,0.8vh,0.875rem)] text-[clamp(0.7rem,0.85vw,0.95rem)] text-muted-foreground">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-[clamp(0.875rem,1.2vw,1.125rem)] w-[clamp(0.875rem,1.2vw,1.125rem)] shrink-0" />
        <span className="font-medium text-foreground">
          {t('settings.status.placeholderTitle')}
        </span>
      </div>
      <p className="text-[clamp(0.65rem,0.8vw,0.85rem)] leading-[1.5]">
        {t('settings.status.placeholderBody')}
      </p>
    </div>
  );
}
