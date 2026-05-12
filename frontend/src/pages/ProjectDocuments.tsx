// Real Documents library — list of extracted DocumentContent rows with
// preview + lineage to claims. Session 8 added PageShell chrome + a
// project-level KPI row + format/status filter chips above the
// format-aware card grid (cards themselves unchanged).
import { useMemo, useState, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Loader2,
  Files,
  FileBox,
  FileSpreadsheet,
  FileImage,
} from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { useDocumentsList } from '@/hooks/use-documents';
import { useClaimsList } from '@/hooks/use-claims';
import { useProjectDocumentsKpis } from '@/hooks/useDocumentsKpis';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AppLayout } from '@/components/Layout/AppLayout';
import { PageShell } from '@/components/Layout';
import { DocumentsKpiRow } from '@/components/features/documents/DocumentsKpiRow';
import type { ClaimListItem, DocumentListItem, DocumentFormat } from '@/lib/claims-types';
import { cn } from '@/lib/utils';

const DocumentDetail = lazy(
  () => import('@/components/features/documents/DocumentDetail'),
);

const FORMAT_OPTIONS: Array<{ key: 'all' | DocumentFormat; labelKey: string }> = [
  { key: 'all', labelKey: 'documents.filter.formatAll' },
  { key: 'pdf', labelKey: 'documents.filter.formatPdf' },
  { key: 'docx', labelKey: 'documents.filter.formatDocx' },
  { key: 'xlsx', labelKey: 'documents.filter.formatXlsx' },
  { key: 'pptx', labelKey: 'documents.filter.formatPptx' },
];

type StatusFilter = 'all' | 'pending' | 'classified' | 'with_claims';

const STATUS_OPTIONS: Array<{ key: StatusFilter; labelKey: string }> = [
  { key: 'all', labelKey: 'documents.filter.statusAll' },
  { key: 'pending', labelKey: 'documents.filter.statusPending' },
  { key: 'classified', labelKey: 'documents.filter.statusClassified' },
  { key: 'with_claims', labelKey: 'documents.filter.statusWithClaims' },
];

function FormatIcon({ format }: { format: string }) {
  const iconClass = 'h-[clamp(1.25rem,2vw,1.5rem)] w-[clamp(1.25rem,2vw,1.5rem)]';
  if (format === 'pdf') return <FileText className={cn(iconClass, 'text-error')} />;
  if (format === 'docx') return <FileBox className={cn(iconClass, 'text-primary')} />;
  if (format === 'xlsx') return <FileSpreadsheet className={cn(iconClass, 'text-success')} />;
  if (format === 'pptx') return <FileImage className={cn(iconClass, 'text-warning')} />;
  return <FileText className={cn(iconClass, 'text-text-tertiary')} />;
}

interface ClaimLineage {
  total: number;
  decided: number;
  unresolved: number;
}

function buildClaimLineage(claims: ClaimListItem[] | undefined): Map<string, ClaimLineage> {
  const map = new Map<string, ClaimLineage>();
  if (!claims) return map;
  for (const claim of claims) {
    const sf = claim.source_file;
    const entry = map.get(sf) ?? { total: 0, decided: 0, unresolved: 0 };
    entry.total += 1;
    if (claim.status !== 'unresolved') entry.decided += 1;
    else entry.unresolved += 1;
    map.set(sf, entry);
  }
  return map;
}

export default function ProjectDocuments() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: project, isLoading: projectLoading } = useProject(id!);
  const { data: documents, isLoading: documentsLoading } = useDocumentsList({ project: id });
  const { data: claims } = useClaimsList({ project: id });
  const kpis = useProjectDocumentsKpis(id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formatFilter, setFormatFilter] = useState<'all' | DocumentFormat>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const claimLineage = useMemo(() => buildClaimLineage(claims), [claims]);

  const visibleDocuments = useMemo(() => {
    if (!documents) return [];
    return documents.filter((d) => {
      if (formatFilter !== 'all' && d.format !== formatFilter) return false;
      const lineage = claimLineage.get(d.source_file);
      if (statusFilter === 'with_claims') return (lineage?.total ?? 0) > 0;
      if (statusFilter === 'pending') return (lineage?.unresolved ?? 0) > 0;
      // "classified" — backend has no per-document classification status;
      // surface as a no-op filter that shows everything, matching the
      // amber em-dash on the KPI tile.
      if (statusFilter === 'classified') return false;
      return true;
    });
  }, [documents, formatFilter, statusFilter, claimLineage]);

  if (projectLoading) {
    return (
      <AppLayout>
        <PageShell title={t('documents.pageTitle')}>
          <div className="text-text-secondary text-sm">{t('common.loading')}</div>
        </PageShell>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <PageShell title={t('documents.pageTitle')}>
          <div className="text-error text-sm">{t('documents.projectNotFound')}</div>
        </PageShell>
      </AppLayout>
    );
  }

  const claimsButton = (
    <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/claims`)}>
      {t('documents.openClaimsInbox')}
    </Button>
  );

  return (
    <AppLayout>
      <PageShell
        title={t('documents.pageTitle')}
        subtitle={project.name}
        headerRight={claimsButton}
      >
        <DocumentsKpiRow kpis={kpis} />

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-[clamp(0.25rem,0.5vw,0.5rem)] mt-[clamp(0.25rem,0.5vh,0.5rem)]">
          <ChipGroup
            label={t('documents.filter.formatLabel')}
            options={FORMAT_OPTIONS}
            value={formatFilter}
            onChange={(v) => setFormatFilter(v as 'all' | DocumentFormat)}
          />
          <span className="text-text-tertiary" aria-hidden="true">·</span>
          <ChipGroup
            label={t('documents.filter.statusLabel')}
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
          />
        </div>

        {documentsLoading ? (
          <div className="text-text-secondary text-sm">{t('common.loading')}</div>
        ) : !visibleDocuments || visibleDocuments.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent className="pt-6">
              <Files className="h-[clamp(2rem,4vw,3rem)] w-[clamp(2rem,4vw,3rem)] text-muted-foreground mx-auto mb-4" />
              <h3 className="text-[clamp(1rem,1.4vw,1.125rem)] font-semibold text-text-primary mb-2">
                {t('documents.empty.title')}
              </h3>
              <p className="text-text-secondary text-[clamp(0.75rem,1.2vw,0.875rem)]">
                {t('documents.empty.description')}
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul
            className="grid gap-[clamp(0.75rem,1.5vw,1rem)] list-none p-0"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
          >
            {visibleDocuments.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                lineage={claimLineage.get(doc.source_file)}
                onSelect={() => setSelectedId(doc.id)}
              />
            ))}
          </ul>
        )}

        {selectedId && (
          <Suspense
            fallback={
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            }
          >
            <DocumentDetail
              documentId={selectedId}
              onClose={() => setSelectedId(null)}
            />
          </Suspense>
        )}
      </PageShell>
    </AppLayout>
  );
}

interface ChipGroupProps {
  label: string;
  options: Array<{ key: string; labelKey: string }>;
  value: string;
  onChange: (value: string) => void;
}

function ChipGroup({ label, options, value, onChange }: ChipGroupProps) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex items-center gap-[clamp(0.25rem,0.5vw,0.5rem)]">
      <span className="text-[clamp(0.55rem,0.8vw,0.7rem)] uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </span>
      <div
        role="group"
        aria-label={label}
        className="inline-flex items-center rounded-md border bg-background p-[clamp(1px,0.2vw,2px)] gap-[clamp(1px,0.2vw,2px)]"
      >
        {options.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            aria-pressed={value === opt.key}
            className={cn(
              'rounded px-[clamp(0.4rem,1vw,0.6rem)] py-[clamp(0.15rem,0.5vw,0.3rem)] text-[clamp(0.625rem,1vw,0.75rem)] font-medium transition-colors',
              value === opt.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {t(opt.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}

interface DocumentCardProps {
  doc: DocumentListItem;
  lineage: ClaimLineage | undefined;
  onSelect: () => void;
}

function DocumentCard({ doc, lineage, onSelect }: DocumentCardProps) {
  const { t } = useTranslation();
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left bg-surface border border-border rounded-md p-[clamp(0.75rem,1.5vw,1rem)] flex flex-col gap-[clamp(0.5rem,1vw,0.75rem)] h-[220px] transition-all duration-150 hover:bg-surface/80 hover:border-primary/50"
      >
        <div className="flex items-start gap-[clamp(0.5rem,1vw,0.75rem)]">
          <FormatIcon format={doc.format} />
          <div className="flex-1 min-w-0">
            <p className="text-[clamp(0.75rem,1.3vw,0.9rem)] font-medium text-text-primary truncate">
              {doc.original_filename}
            </p>
            <p className="text-[clamp(0.625rem,1vw,0.75rem)] text-text-tertiary uppercase">
              {doc.format}
              {doc.page_count > 0 && (
                <>
                  {' · '}
                  {t('documents.pageCount', { count: doc.page_count })}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 rounded-full bg-surface border border-border px-2 py-0.5 text-[clamp(0.5rem,1vw,0.625rem)] text-text-secondary">
            {t(`documents.method.${doc.extraction_method}`)}
          </span>
          {lineage && lineage.total > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[clamp(0.5rem,1vw,0.625rem)] font-medium">
              {t('documents.lineage', {
                total: lineage.total,
                decided: lineage.decided,
              })}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}
