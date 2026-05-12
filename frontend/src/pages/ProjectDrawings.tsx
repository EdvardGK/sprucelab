import { useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Upload,
  FileImage,
  FileText,
  FileBox,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
} from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import {
  useDrawingsList,
  useUploadDrawing,
  isDuplicateFileError,
  type DrawingSheetListItem,
  type DrawingFormat,
} from '@/hooks/use-drawings';
import { useProjectDrawingsKpis } from '@/hooks/useDrawingsKpis';
import apiClient from '@/lib/api-client';
import type { PaginatedResponse, SourceFileListItem } from '@/lib/api-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AppLayout } from '@/components/Layout/AppLayout';
import { PageShell } from '@/components/Layout';
import { DrawingsKpiRow } from '@/components/features/drawings/DrawingsKpiRow';
import { cn } from '@/lib/utils';

const DrawingDetail = lazy(
  () => import('@/components/features/drawings/DrawingDetail'),
);

type DisciplineFilter = 'all' | 'architecture' | 'structural' | 'mep' | 'civil' | 'other';
type RegistrationFilter = 'all' | 'registered' | 'unregistered';

const DISCIPLINE_OPTIONS: Array<{ key: DisciplineFilter; labelKey: string }> = [
  { key: 'all', labelKey: 'drawings.filter.disciplineAll' },
  { key: 'architecture', labelKey: 'drawings.filter.disciplineArchitecture' },
  { key: 'structural', labelKey: 'drawings.filter.disciplineStructural' },
  { key: 'mep', labelKey: 'drawings.filter.disciplineMep' },
  { key: 'civil', labelKey: 'drawings.filter.disciplineCivil' },
  { key: 'other', labelKey: 'drawings.filter.disciplineOther' },
];

const STATUS_OPTIONS: Array<{ key: RegistrationFilter; labelKey: string }> = [
  { key: 'all', labelKey: 'drawings.filter.statusAll' },
  { key: 'registered', labelKey: 'drawings.filter.statusRegistered' },
  { key: 'unregistered', labelKey: 'drawings.filter.statusUnregistered' },
];

function inferFormat(filename: string | undefined, fallback?: string): DrawingFormat | string {
  if (!filename) return fallback ?? '';
  const lower = filename.toLowerCase();
  if (lower.endsWith('.dxf')) return 'dxf';
  if (lower.endsWith('.dwg')) return 'dwg';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.svg')) return 'svg';
  return fallback ?? '';
}

function FormatIcon({ format }: { format: string }) {
  const iconClass = 'h-[clamp(1.25rem,2vw,1.5rem)] w-[clamp(1.25rem,2vw,1.5rem)]';
  if (format === 'dxf' || format === 'dwg') return <FileBox className={cn(iconClass, 'text-primary')} />;
  if (format === 'pdf') return <FileText className={cn(iconClass, 'text-error')} />;
  if (format === 'svg') return <FileImage className={cn(iconClass, 'text-success')} />;
  return <FileImage className={cn(iconClass, 'text-text-tertiary')} />;
}

/**
 * Best-effort discipline classification from a sheet number prefix.
 * Sheet-number prefixes encode discipline in many drawing standards
 * (e.g. ARK-100 = architecture, RIB-100 = structural). The list payload
 * has no first-class discipline field; this is a heuristic. Unknown
 * prefixes fall through to 'other' rather than failing.
 */
function inferDiscipline(sheetNumber: string | undefined | null): DisciplineFilter {
  if (!sheetNumber) return 'other';
  const upper = sheetNumber.toUpperCase();
  if (/^(A|ARK|ARC)/.test(upper)) return 'architecture';
  if (/^(S|R?IB|STR|STRUCT)/.test(upper)) return 'structural';
  if (/^(M|R?IV|R?IE|MEP|ELE|VVS|HVAC)/.test(upper)) return 'mep';
  if (/^(C|CIV|R?IL|LAN)/.test(upper)) return 'civil';
  return 'other';
}

export default function ProjectDrawings() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState<{
    file: File;
    existingFilename: string;
  } | null>(null);
  const [disciplineFilter, setDisciplineFilter] = useState<DisciplineFilter>('all');
  const [statusFilter, setStatusFilter] = useState<RegistrationFilter>('all');

  const { data: project, isLoading: projectLoading } = useProject(id!);
  const { data: drawings, isLoading: drawingsLoading } = useDrawingsList(id);
  const kpis = useProjectDrawingsKpis(id);
  const upload = useUploadDrawing();

  // Pull all source files for this project so we can show original filenames
  // and infer formats on the cards.
  const { data: sourceFileIndex } = useQuery({
    queryKey: ['source-files', 'index', id],
    queryFn: async () => {
      const response = await apiClient.get<
        PaginatedResponse<SourceFileListItem> | SourceFileListItem[]
      >(`/files/?project=${id}`);
      const data = response.data;
      const items = Array.isArray(data) ? data : data.results || [];
      return new Map(items.map((sf) => [sf.id, sf]));
    },
    enabled: !!id,
    staleTime: 30_000,
  });

  const validateAndUpload = useCallback(
    async (filesToUpload: FileList | File[]) => {
      setUploadError(null);
      const allowed = ['.dwg', '.dxf', '.pdf', '.svg'];
      for (const file of Array.from(filesToUpload)) {
        const lower = file.name.toLowerCase();
        if (!allowed.some((ext) => lower.endsWith(ext))) {
          setUploadError(t('drawings.upload.invalidFileType'));
          continue;
        }
        try {
          await upload.mutateAsync({ projectId: id!, file });
        } catch (err) {
          if (isDuplicateFileError(err)) {
            setDuplicatePrompt({ file, existingFilename: err.existingFile.original_filename });
            continue;
          }
          const message = err instanceof Error ? err.message : t('drawings.upload.failed');
          setUploadError(message);
        }
      }
    },
    [upload, id, t],
  );

  const handleDuplicateAction = useCallback(
    async (action: 'use_existing' | 'replace') => {
      const pending = duplicatePrompt;
      setDuplicatePrompt(null);
      if (!pending) return;
      try {
        await upload.mutateAsync({ projectId: id!, file: pending.file, onDuplicate: action });
      } catch (err) {
        const message = err instanceof Error ? err.message : t('drawings.upload.failed');
        setUploadError(message);
      }
    },
    [duplicatePrompt, upload, id, t],
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        void validateAndUpload(e.dataTransfer.files);
      }
    },
    [validateAndUpload],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void validateAndUpload(e.target.files);
    }
    e.target.value = '';
  };

  const sortedDrawings = useMemo(() => {
    if (!drawings) return [];
    return [...drawings].sort((a, b) => {
      const aLabel = a.sheet_number || a.sheet_name || '';
      const bLabel = b.sheet_number || b.sheet_name || '';
      return aLabel.localeCompare(bLabel);
    });
  }, [drawings]);

  const visibleDrawings = useMemo(() => {
    return sortedDrawings.filter((d) => {
      if (disciplineFilter !== 'all' && inferDiscipline(d.sheet_number) !== disciplineFilter) {
        return false;
      }
      const registered = !!d.sheet_number && d.sheet_number.trim().length > 0;
      if (statusFilter === 'registered' && !registered) return false;
      if (statusFilter === 'unregistered' && registered) return false;
      return true;
    });
  }, [sortedDrawings, disciplineFilter, statusFilter]);

  if (projectLoading) {
    return (
      <AppLayout>
        <PageShell title={t('drawings.pageTitle')}>
          <div className="text-text-secondary text-sm">{t('common.loading')}</div>
        </PageShell>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <PageShell title={t('drawings.pageTitle')}>
          <div className="text-error text-sm">{t('drawings.projectNotFound')}</div>
        </PageShell>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageShell
        title={t('drawings.pageTitle')}
        subtitle={project.name}
      >
        <DrawingsKpiRow kpis={kpis} />

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-[clamp(0.25rem,0.5vw,0.5rem)] mt-[clamp(0.25rem,0.5vh,0.5rem)]">
          <ChipGroup
            label={t('drawings.filter.disciplineLabel')}
            options={DISCIPLINE_OPTIONS}
            value={disciplineFilter}
            onChange={(v) => setDisciplineFilter(v as DisciplineFilter)}
          />
          <span className="text-text-tertiary" aria-hidden="true">·</span>
          <ChipGroup
            label={t('drawings.filter.statusLabel')}
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as RegistrationFilter)}
          />
        </div>

        {/* Drag-drop upload area */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={cn(
            'border-2 border-dashed rounded-md transition-colors',
            dragActive
              ? 'border-primary bg-primary/5'
              : 'border-border bg-surface/30',
          )}
        >
          <label
            htmlFor="drawing-upload-input"
            className="flex items-center justify-center gap-3 cursor-pointer p-[clamp(0.75rem,1.5vw,1.25rem)] text-text-secondary hover:text-text-primary"
          >
            <Upload className="h-[clamp(1rem,2vw,1.25rem)] w-[clamp(1rem,2vw,1.25rem)]" />
            <span className="text-[clamp(0.75rem,1.2vw,0.875rem)]">
              {upload.isPending
                ? t('drawings.upload.uploading')
                : t('drawings.upload.dropOrClick')}
            </span>
            {upload.isPending && (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            )}
          </label>
          <input
            id="drawing-upload-input"
            type="file"
            multiple
            accept=".dwg,.dxf,.pdf,.svg"
            className="hidden"
            onChange={handleFileChange}
            disabled={upload.isPending}
          />
        </div>

        {uploadError && (
          <div className="flex items-start gap-2 rounded-md border border-error/30 bg-error/10 p-3 text-error">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <p className="text-[clamp(0.75rem,1.2vw,0.875rem)]">{uploadError}</p>
          </div>
        )}

        {/* Drawings grid */}
        {drawingsLoading ? (
          <div className="text-text-secondary text-sm">{t('common.loading')}</div>
        ) : visibleDrawings.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent className="pt-6">
              <ImageIcon className="h-[clamp(2rem,4vw,3rem)] w-[clamp(2rem,4vw,3rem)] text-muted-foreground mx-auto mb-4" />
              <h3 className="text-[clamp(1rem,1.4vw,1.125rem)] font-semibold text-text-primary mb-2">
                {t('drawings.empty.title')}
              </h3>
              <p className="text-text-secondary text-[clamp(0.75rem,1.2vw,0.875rem)]">
                {t('drawings.empty.description')}
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul
            className="grid gap-[clamp(0.75rem,1.5vw,1rem)] list-none p-0"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
          >
            {visibleDrawings.map((drawing) => (
              <DrawingCard
                key={drawing.id}
                drawing={drawing}
                sourceFile={sourceFileIndex?.get(drawing.source_file)}
                onSelect={() => setSelectedDrawingId(drawing.id)}
              />
            ))}
          </ul>
        )}

        {selectedDrawingId && (
          <Suspense
            fallback={
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            }
          >
            <DrawingDetail
              drawingId={selectedDrawingId}
              sourceFile={sourceFileIndex?.get(
                drawings?.find((d) => d.id === selectedDrawingId)?.source_file ?? '',
              )}
              onClose={() => setSelectedDrawingId(null)}
            />
          </Suspense>
        )}

        <Dialog
          open={duplicatePrompt !== null}
          onOpenChange={(open) => {
            if (!open) setDuplicatePrompt(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('drawings.upload.duplicate.title')}</DialogTitle>
              <DialogDescription>
                {t('drawings.upload.duplicate.body', {
                  filename: duplicatePrompt?.existingFilename ?? '',
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-[clamp(0.5rem,1vw,0.75rem)]">
              <Button variant="ghost" onClick={() => setDuplicatePrompt(null)}>
                {t('common.cancel')}
              </Button>
              <Button variant="outline" onClick={() => handleDuplicateAction('use_existing')}>
                {t('drawings.upload.duplicate.useExisting')}
              </Button>
              <Button onClick={() => handleDuplicateAction('replace')}>
                {t('drawings.upload.duplicate.replace')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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

interface DrawingCardProps {
  drawing: DrawingSheetListItem;
  sourceFile: SourceFileListItem | undefined;
  onSelect: () => void;
}

function DrawingCard({ drawing, sourceFile, onSelect }: DrawingCardProps) {
  const { t } = useTranslation();
  const format = inferFormat(sourceFile?.original_filename, sourceFile?.format);
  const label = drawing.sheet_number || drawing.sheet_name || t('drawings.untitledSheet');
  // Registration status isn't included in the list payload (the backend
  // exposes it only on the OneToOne reverse relation), so we treat list
  // entries as "Not registered" here. The detail dialog shows the truth.
  const registered = false;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left bg-surface border border-border rounded-md p-[clamp(0.75rem,1.5vw,1rem)] flex flex-col gap-[clamp(0.5rem,1vw,0.75rem)] h-[220px] transition-all duration-150 hover:bg-surface/80 hover:border-primary/50"
      >
        <div className="flex items-start gap-[clamp(0.5rem,1vw,0.75rem)]">
          <FormatIcon format={format} />
          <div className="flex-1 min-w-0">
            <p className="text-[clamp(0.75rem,1.3vw,0.9rem)] font-medium text-text-primary truncate">
              {label}
            </p>
            {sourceFile?.original_filename && (
              <p className="text-[clamp(0.625rem,1vw,0.75rem)] text-text-tertiary truncate">
                {sourceFile.original_filename}
              </p>
            )}
          </div>
        </div>

        {drawing.sheet_name && drawing.sheet_number && (
          <p className="text-[clamp(0.625rem,1.1vw,0.75rem)] text-text-secondary line-clamp-2">
            {drawing.sheet_name}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-[clamp(0.375rem,1vw,0.5rem)] text-[clamp(0.5rem,1vw,0.625rem)] text-text-tertiary uppercase tracking-wide">
            {drawing.scale && <span>{drawing.scale}</span>}
            {drawing.scale && <span>·</span>}
            <span>{t('drawings.page')} {drawing.page_index + 1}</span>
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[clamp(0.5rem,1vw,0.625rem)] font-medium',
              registered
                ? 'bg-success/10 text-success'
                : 'bg-surface text-text-tertiary border border-border',
            )}
          >
            {registered ? (
              <>
                <CheckCircle2 className="h-3 w-3" />
                {t('drawings.registered')}
              </>
            ) : (
              t('drawings.notRegistered')
            )}
          </span>
        </div>
      </button>
    </li>
  );
}
