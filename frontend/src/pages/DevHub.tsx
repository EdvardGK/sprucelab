import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, AlertTriangle, ArrowRight, ExternalLink } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Sprucelab — Dev. Internal project-management surface.
 *
 * Public URL but unlinked from marketing nav. Single source of truth for
 * "what's left before finish line", "what's deferred", and "what feels
 * uncanny-valley today". Content lives in this file — edit the arrays
 * below to update the page. No backend, no editor — the act of writing
 * the entry IS the prioritization.
 *
 * Finish line = full page coverage + cross-filter feels SOUND.
 * Optimization, cleanup, dead-code pruning is NOT finish-line work.
 */

type Status = 'done' | 'partial' | 'missing' | 'broken';

interface PunchItem {
  title: string;
  detail: string;
  status: Status;
}

interface PageRow {
  surface: string;
  route: string;
  status: Status;
  note?: string;
}

interface DeferredItem {
  title: string;
  why: string;
}

const PUNCH_LIST: PunchItem[] = [
  {
    title: 'Shareable filtered-view link — build the share affordance',
    detail:
      '?d=base64 URL roundtrip already encodes every filter dimension; what is missing is the user affordance. Add a "Copy view link" button in FilterChips (or header dropdown) on every dashboard surface. This is the gateway drug — paste a Sprucelab link into existing client work and they see live, filtered model intelligence. Forward-deployed embed mission starts here.',
    status: 'partial',
  },
  {
    title: 'Auto-trigger model analysis on upload',
    detail:
      'processing-complete callback queues Celery task — no worker on Railway. Drop .delay() + run synchronously in the handler so users never see "Run Analysis" again.',
    status: 'broken',
  },
  {
    title: 'Cross-filter — every click toggles same-state off',
    detail:
      'Memory says this is the rule; verify it on every dashboard surface. Treemap tile, quality chip, storey bar, type chip, table row.',
    status: 'partial',
  },
  {
    title: 'Cross-filter — counts agree across every tile',
    detail:
      '"4 types · 73 instances" in the viewer subtitle must equal what the treemap, KPI tiles, and table render. Pick one source per dimension; eliminate drift.',
    status: 'partial',
  },
  {
    title: 'Cross-filter — count-up animation on every metric',
    detail:
      'Types page does it; spread to Model dash KPI cluster, Materials, Project dash. Per memory, the animation is the signature.',
    status: 'partial',
  },
  {
    title: 'Persistent viewer everywhere (shipped on Type + Model dash)',
    detail:
      'ViewerPane block + isolation prop. Confirm Materials and Project dashboards do not remount viewers on filter changes.',
    status: 'partial',
  },
  {
    title: 'Cross-filter — clear-all affordance prominent',
    detail:
      'FilterChips row exists, but the Clear button is small. When the page is heavily filtered, exiting should be one obvious click.',
    status: 'partial',
  },
];

const PAGE_COVERAGE: PageRow[] = [
  { surface: 'Project gallery', route: '/projects', status: 'done' },
  { surface: 'Project dashboard', route: '/projects/:id', status: 'partial', note: 'EIR fulfillment ribbon, recent activity' },
  { surface: 'Type page', route: '/projects/:id/types', status: 'done', note: 'persistent viewer shipped 2026-05-15' },
  { surface: 'Model workspace', route: '/projects/:id/models/:modelId', status: 'done', note: 'ViewerPane shell shipped 2026-05-15' },
  { surface: 'Models gallery', route: '/projects/:id/models', status: 'done' },
  { surface: 'Type library', route: '/projects/:id/type-library', status: 'partial' },
  { surface: 'Material library', route: '/projects/:id/material-library', status: 'partial' },
  { surface: 'Floors', route: '/projects/:id/floors', status: 'partial' },
  { surface: 'Drawings', route: '/projects/:id/drawings', status: 'partial' },
  { surface: 'Documents', route: '/projects/:id/documents', status: 'partial' },
  { surface: 'Claims / inbox', route: '/projects/:id/claims', status: 'done' },
  { surface: 'EIR builder', route: '/projects/:id/eir', status: 'partial', note: 'Phase 7 lift-from-archive pending' },
  { surface: 'Federated viewer', route: '/projects/:id/viewer/:groupId', status: 'done' },
  { surface: 'Field checklists', route: '/projects/:id/field', status: 'missing', note: 'aspirational; not finish-line' },
  { surface: 'Workbench', route: '/projects/:id/workbench', status: 'done' },
];

const CORE_CONCEPTS = [
  {
    title: 'Agent-first, human-second',
    body:
      'Every operation is API-accessible with structured JSON. The GUI is one consumer; agents and scripts are equals. dry_run on every mutation.',
  },
  {
    title: 'Types are the unit of coordination',
    body:
      'A building has 50k entities but ~300 unique types. Sprucelab extracts and classifies types, never individual entities. Geometry stays in the viewer.',
  },
  {
    title: 'Files in → data streams out',
    body:
      'No file is an orphan. SourceFile (Layer 0) → ExtractionRun (Layer 1) → format-specific data (Layer 2) → cross-project intelligence (Layer 3). Format-agnostic at the edges, format-specific in extraction.',
  },
  {
    title: 'Viewers persist, isolation drives state',
    body:
      'UnifiedBIMViewer mounts once per modelId; filter/selection mutates the isolation prop. Never remount on interaction. ViewerPane is the canonical shell.',
  },
  {
    title: 'Modelers own the data; platform suggests + surfaces gaps',
    body:
      'Overview pages render raw values + amber em-dash for missing data. Never "Mapped %" framing. Manual mapping lives in a separate workspace page.',
  },
  {
    title: 'Cross-filter is primary; DrillModal is secondary',
    body:
      'Click on a chart/chip/bar mutates the project filter (PowerBI pattern). Modal escape lives behind the Table2 icon.',
  },
];

const DEFERRED: DeferredItem[] = [
  {
    title: 'TypeBank cross-project UI (writes stay)',
    why: 'TypeBankEntry + Observation writes on every ingest are foundational data — keep accruing the cross-project corpus. The READ side (browse / merge / scope tracking UI) is deferred until a real use case lands. Don\'t stop the writes.',
  },
  {
    title: 'Warehouse v1 (deprecated, kept as recovery)',
    why: 'The classic TypeBrowser surface is no longer mounted (ProjectTypesPage only renders V2) but the folder stays. Delete only after V2 has soaked long enough that no one needs the escape hatch. Until then: "deprecated", not "dead".',
  },
  {
    title: 'Field checklists module',
    why: 'Models exist (ChecklistTemplate, Checklist, CheckItem); no frontend caller. Picked up when handover-compliance becomes a customer ask. Until then on the roadmap, not the punch list.',
  },
  {
    title: 'Scripting + Automation pipelines (most of it)',
    why: '11 models across two apps for pipeline / agent / CDE / webhook orchestration. Webhook Phase 1 (signed dispatch) IS live — keep. Pipeline UI, CDE sync, AgentRegistration UI deferred until the automation epic picks up.',
  },
  {
    title: 'LCA export (Reduzer / OneClickLCA)',
    why: 'Type-material-layers data exists; export endpoints partial. Real customer ask gates this — until then the data foundation is enough.',
  },
  {
    title: 'Verification engine (full ProjectConfig rules)',
    why: 'AnalysisStorey green/yellow/red per floor ships. The per-type ruleset + IDS-driven validation is Phase 8+. Cross-filter integrity beats verification scope right now.',
  },
  {
    title: 'Marketplace for dashboards / rule packs',
    why: 'Long-term vision (per memory). Needs the definition-driven dashboard engine first. Not on the table until v1 is shipped and someone is using it.',
  },
];

const RECENT_SHIPS = [
  { date: '2026-05-15', body: 'ViewerPane block + persistent Type-page viewer (commit 8434672)' },
  { date: '2026-05-15', body: 'Vercel /api proxy regex fix; /api/capabilities/ + /llms.txt live on www' },
  { date: '2026-05-15', body: 'Agent-first marketing pivot: /agents + /benchmarks + sprucelab-mcp' },
  { date: '2026-05-15', body: 'ifcfast 0.1.0 adoption gated behind SPRUCELAB_PARSER=ifcfast env flag' },
];

const STATUS_TOKEN: Record<Status, { label: string; bg: string; fg: string; icon: typeof CheckCircle2 }> = {
  done:    { label: 'Done',    bg: 'bg-emerald-500/10 dark:bg-emerald-500/15', fg: 'text-emerald-700 dark:text-emerald-400', icon: CheckCircle2 },
  partial: { label: 'Partial', bg: 'bg-amber-500/10  dark:bg-amber-500/15',  fg: 'text-amber-700  dark:text-amber-400',  icon: Circle },
  missing: { label: 'Missing', bg: 'bg-zinc-500/10   dark:bg-zinc-500/15',   fg: 'text-zinc-700   dark:text-zinc-400',   icon: Circle },
  broken:  { label: 'Broken',  bg: 'bg-rose-500/10   dark:bg-rose-500/15',   fg: 'text-rose-700   dark:text-rose-400',   icon: AlertTriangle },
};

function StatusBadge({ status }: { status: Status }) {
  const tok = STATUS_TOKEN[status];
  const Icon = tok.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tok.bg} ${tok.fg}`}
    >
      <Icon className="h-3 w-3" />
      {tok.label}
    </span>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground max-w-prose">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

export default function DevHub() {
  const counts = PUNCH_LIST.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<Status, number>,
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-12 flex flex-col gap-12">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Sprucelab
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-sm font-medium">Dev</span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight">Path to finish line</h1>
          <p className="text-base text-muted-foreground max-w-prose">
            Finish line = core flows work and feel sound, not optimized. Cross-filter integrity beats dead-code cleanup. Aspirational modules wait. This page is the line — if it isn't here, it isn't finish-line.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Badge variant="outline" className="text-xs">
              {counts.broken ?? 0} broken
            </Badge>
            <Badge variant="outline" className="text-xs">
              {counts.partial ?? 0} partial
            </Badge>
            <Badge variant="outline" className="text-xs">
              {counts.done ?? 0} done
            </Badge>
            <a
              href="https://github.com/EdvardGK/sprucelab"
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              repo <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </header>

        <Section
          title="Punch list"
          subtitle='Concrete "feels off" + "broken" items blocking finish line. Edit DevHub.tsx to add/remove.'
        >
          <div className="flex flex-col gap-2">
            {PUNCH_LIST.map((item) => (
              <Card key={item.title} className="overflow-hidden">
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-medium leading-tight">{item.title}</h3>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.detail}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>

        <Section
          title="Page coverage"
          subtitle="Every primary surface has a row. Partial = exists but feels off / incomplete. Missing = not built. Aspirational rows live in Deferred."
        >
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Surface</th>
                  <th className="text-left font-medium px-4 py-2">Route</th>
                  <th className="text-left font-medium px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {PAGE_COVERAGE.map((row, i) => (
                  <tr
                    key={row.route}
                    className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}
                  >
                    <td className="px-4 py-2.5 align-top">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{row.surface}</span>
                        {row.note && (
                          <span className="text-xs text-muted-foreground">{row.note}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 align-top font-mono text-xs text-muted-foreground">
                      {row.route}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          title="Deferred"
          subtitle="Explicit non-goals for finish line. If a user asks for one of these, we say not yet."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {DEFERRED.map((d) => (
              <Card key={d.title} className="overflow-hidden">
                <CardContent className="p-4 flex flex-col gap-1.5">
                  <h3 className="text-sm font-medium leading-tight">{d.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{d.why}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>

        <Section
          title="Core concepts"
          subtitle="Anchor principles. If a PR violates one of these, push back."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {CORE_CONCEPTS.map((c) => (
              <div key={c.title} className="flex flex-col gap-1.5 p-4 rounded-lg border border-border">
                <h3 className="text-sm font-semibold leading-tight">{c.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Recent shipping" subtitle="Last few merged changes that matter.">
          <div className="flex flex-col gap-2">
            {RECENT_SHIPS.map((s, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="font-mono text-xs text-muted-foreground tabular-nums shrink-0 pt-0.5">
                  {s.date}
                </span>
                <span className="text-foreground">{s.body}</span>
              </div>
            ))}
          </div>
        </Section>

        <footer className="pt-8 mt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>Edit <code className="font-mono text-[11px] bg-muted/40 px-1 py-0.5 rounded">frontend/src/pages/DevHub.tsx</code> to update.</span>
          <Link to="/projects" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
            Projects <ArrowRight className="h-3 w-3" />
          </Link>
        </footer>
      </div>
    </div>
  );
}
