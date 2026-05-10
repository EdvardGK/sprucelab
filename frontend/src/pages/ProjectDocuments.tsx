// Real Documents library — list of extracted DocumentContent rows with
// preview + lineage to claims. Supersedes the old ClaimInbox host (now at
// /projects/:id/claims).
import { useMemo, useState, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
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
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AppLayout } from '@/components/Layout/AppLayout';
import type { ClaimListItem, DocumentListItem } from '@/lib/claims-types';
import { cn } from '@/lib/utils';

const DocumentDetail = lazy(
  () => import('@/components/features/documents/DocumentDetail'),
);

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
}

function buildClaimLineage(claims: ClaimListItem[] | undefined): Map<string, ClaimLineage> {
  const map = new Map<string, ClaimLineage>();
  if (!claims) return map;
  for (const claim of claims) {
    const sf = claim.source_file;
    const entry = map.get(sf) ?? { total: 0, decided: 0 };
    entry.total += 1;
    if (claim.status !== 'unresolved') entry.decided += 1;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const claimLineage = useMemo(() => buildClaimLineage(claims), [claims]);

  if (projectLoading) {
    return (
      <AppLayout>
        <div className="flex flex-col w-full flex-grow py-6 px-6 md:px-8 lg:px-12">
          <div className="text-text-secondary">{t('common.loading')}</div>
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="flex flex-col w-full flex-grow py-6 px-6 md:px-8 lg:px-12">
          <div className="text-error">{t('documents.projectNotFound')}</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col w-full flex-grow py-[clamp(1rem,2vw,1.5rem)] px-[clamp(1rem,3vw,3rem)]">
        <div className="mb-[clamp(1rem,2vw,2rem)]">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/projects/${id}`)}
            className="mb-[clamp(0.5rem,1vw,1rem)] -ml-2"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('common.back')}
          </Button>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-[clamp(1.5rem,3vw,2.25rem)] font-bold text-text-primary">
                {t('documents.pageTitle')}
              </h1>
              <p className="text-text-secondary mt-2 text-[clamp(0.75rem,1.2vw,0.875rem)]">
                {project.name}
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate(`/projects/${id}/claims`)}>
              {t('documents.openClaimsInbox')}
            </Button>
          </div>
        </div>

        {documentsLoading ? (
          <div className="text-text-secondary">{t('common.loading')}</div>
        ) : !documents || documents.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent className="pt-6">
              <Files className="h-[clamp(2rem,4vw,3rem)] w-[clamp(2rem,4vw,3rem)] text-muted-foreground mx-auto mb-4" />
              <h3 className="text-[clamp(1rem,2vw,1.125rem)] font-semibold text-text-primary mb-2">
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
            {documents.map((doc) => (
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
      </div>
    </AppLayout>
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
