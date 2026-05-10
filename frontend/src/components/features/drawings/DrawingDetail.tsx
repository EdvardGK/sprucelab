// Detail panel for a DrawingSheet. Renders DXF in-browser via `dxf-viewer`,
// PDF/DWG fall back to "Open original" download links (DWG conversion is PR 2.4).
// Exposes a layer-toggle panel and an inline "Register sheet" dialog.
import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Download, Layers as LayersIcon, MapPin, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  useDrawingDetail,
  useRegisterDrawing,
  type DrawingRegistrationPayload,
} from '@/hooks/use-drawings';
import type { SourceFileListItem } from '@/lib/api-types';
import { cn } from '@/lib/utils';

interface DrawingDetailProps {
  drawingId: string;
  sourceFile: SourceFileListItem | undefined;
  onClose: () => void;
}

interface LayerEntry {
  name: string;
  displayName: string;
  visible: boolean;
}

function fileExt(filename: string | undefined): string {
  if (!filename) return '';
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : '';
}

export default function DrawingDetail({ drawingId, sourceFile, onClose }: DrawingDetailProps) {
  const { t } = useTranslation();
  const { data: drawing } = useDrawingDetail(drawingId);
  const [registerOpen, setRegisterOpen] = useState(false);
  const ext = fileExt(sourceFile?.original_filename);

  return (
    <div className="fixed inset-0 z-40 flex bg-background/95 backdrop-blur-sm">
      <div className="flex w-full h-full flex-col">
        <div className="flex-none flex items-center justify-between gap-3 border-b border-border px-[clamp(1rem,2vw,1.5rem)] py-[clamp(0.5rem,1vw,0.75rem)]">
          <div className="min-w-0">
            <h2 className="text-[clamp(0.875rem,1.5vw,1.125rem)] font-semibold text-text-primary truncate">
              {drawing?.sheet_number || drawing?.sheet_name || sourceFile?.original_filename || t('drawings.untitledSheet')}
            </h2>
            {sourceFile?.original_filename && (
              <p className="text-[clamp(0.625rem,1vw,0.75rem)] text-text-tertiary truncate">
                {sourceFile.original_filename}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setRegisterOpen(true)}>
              <MapPin className="h-4 w-4 mr-1.5" />
              {t('drawings.registerSheet')}
            </Button>
            <DownloadOriginalLink sourceFileId={sourceFile?.id} />
            <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('common.close')}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {ext === 'dxf' ? (
            <DxfPane sourceFile={sourceFile} />
          ) : (
            <UnsupportedPane ext={ext} sourceFile={sourceFile} />
          )}
        </div>
      </div>

      <RegisterDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        drawingId={drawingId}
      />
    </div>
  );
}

function UnsupportedPane({
  ext,
  sourceFile,
}: {
  ext: string;
  sourceFile: SourceFileListItem | undefined;
}) {
  const { t } = useTranslation();
  const message =
    ext === 'pdf'
      ? t('drawings.preview.pdfDeferred')
      : ext === 'dwg'
        ? t('drawings.preview.dwgDeferred')
        : t('drawings.preview.unsupported');

  return (
    <div className="flex flex-1 items-center justify-center p-[clamp(1rem,2vw,2rem)]">
      <div className="flex flex-col items-center gap-3 text-center max-w-md">
        <AlertCircle className="h-[clamp(1.5rem,3vw,2.5rem)] w-[clamp(1.5rem,3vw,2.5rem)] text-text-tertiary" />
        <p className="text-text-secondary text-[clamp(0.75rem,1.2vw,0.875rem)]">{message}</p>
        <DownloadOriginalLink sourceFileId={sourceFile?.id} />
      </div>
    </div>
  );
}

function DownloadOriginalLink({ sourceFileId }: { sourceFileId: string | undefined }) {
  const { t } = useTranslation();
  const [href, setHref] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceFileId) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@/lib/api-client');
        const response = await mod.default.get<{ file_url: string }>(`/files/${sourceFileId}/`);
        if (!cancelled) setHref(response.data.file_url);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'fetch failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceFileId]);

  if (!sourceFileId || error) return null;
  if (!href) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-[clamp(0.75rem,1.2vw,0.875rem)] text-text-tertiary">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('drawings.openOriginal')}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-[clamp(0.75rem,1.2vw,0.875rem)] text-text-primary hover:bg-surface/80"
    >
      <Download className="h-4 w-4" />
      {t('drawings.openOriginal')}
    </a>
  );
}

function DxfPane({ sourceFile }: { sourceFile: SourceFileListItem | undefined }) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<{
    Destroy(): void;
    GetLayers(): Iterable<{ name: string; displayName: string }>;
    ShowLayer(name: string, show: boolean): void;
    GetBounds():
      | { minX: number; maxX: number; minY: number; maxY: number }
      | null;
    FitView(minX: number, maxX: number, minY: number, maxY: number, padding: number): void;
  } | null>(null);
  const [layers, setLayers] = useState<LayerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceFile?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@/lib/api-client');
        const response = await mod.default.get<{ file_url: string }>(`/files/${sourceFile.id}/`);
        if (!cancelled) setFileUrl(response.data.file_url);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('drawings.preview.loadFailed'));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceFile?.id, t]);

  useEffect(() => {
    if (!containerRef.current || !fileUrl) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const mod = await import('dxf-viewer');
        if (cancelled || !containerRef.current) return;
        const DxfViewerClass = (mod as { DxfViewer: new (el: HTMLElement, opts: unknown) => unknown })
          .DxfViewer;
        const instance = new DxfViewerClass(containerRef.current, {
          autoResize: true,
          clearAlpha: 1,
          antialias: true,
        }) as typeof viewerRef.current & {
          Load: (params: { url: string }) => Promise<void>;
        };
        viewerRef.current = instance;
        await instance!.Load({ url: fileUrl });
        if (cancelled) {
          instance!.Destroy();
          viewerRef.current = null;
          return;
        }
        const layerInfo = Array.from(instance!.GetLayers());
        setLayers(
          layerInfo.map((l) => ({
            name: l.name,
            displayName: l.displayName || l.name,
            visible: true,
          })),
        );
        const bounds = instance!.GetBounds();
        if (bounds) {
          instance!.FitView(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, 0.05);
        }
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t('drawings.preview.loadFailed'));
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (viewerRef.current) {
        viewerRef.current.Destroy();
        viewerRef.current = null;
      }
    };
  }, [fileUrl, t]);

  const toggleLayer = useCallback((name: string) => {
    setLayers((prev) =>
      prev.map((l) => {
        if (l.name !== name) return l;
        const next = !l.visible;
        viewerRef.current?.ShowLayer(name, next);
        return { ...l, visible: next };
      }),
    );
  }, []);

  return (
    <>
      <div className="relative flex-1 min-w-0 bg-background">
        <div ref={containerRef} className="h-full w-full" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-[clamp(1rem,2vw,2rem)]">
            <div className="flex flex-col items-center gap-3 text-center max-w-md">
              <AlertCircle className="h-8 w-8 text-error" />
              <p className="text-error text-[clamp(0.75rem,1.2vw,0.875rem)]">{error}</p>
            </div>
          </div>
        )}
      </div>
      <aside className="flex-none w-[clamp(220px,20vw,300px)] border-l border-border bg-surface/40 overflow-y-auto">
        <div className="flex items-center gap-2 px-[clamp(0.75rem,1.5vw,1rem)] py-[clamp(0.5rem,1vw,0.75rem)] border-b border-border">
          <LayersIcon className="h-[clamp(0.875rem,1.5vw,1rem)] w-[clamp(0.875rem,1.5vw,1rem)] text-text-secondary" />
          <h3 className="text-[clamp(0.75rem,1.2vw,0.875rem)] font-semibold text-text-primary">
            {t('drawings.layersPanelTitle')}
          </h3>
          <span className="ml-auto text-[clamp(0.625rem,1vw,0.75rem)] text-text-tertiary">
            {layers.length}
          </span>
        </div>
        {layers.length === 0 && !loading ? (
          <p className="px-[clamp(0.75rem,1.5vw,1rem)] py-3 text-[clamp(0.625rem,1vw,0.75rem)] text-text-tertiary">
            {t('drawings.noLayers')}
          </p>
        ) : (
          <ul className="space-y-0.5 py-2">
            {layers.map((layer) => (
              <li key={layer.name}>
                <label className="flex items-center gap-2 px-[clamp(0.75rem,1.5vw,1rem)] py-1.5 text-[clamp(0.625rem,1.1vw,0.75rem)] text-text-primary cursor-pointer hover:bg-surface">
                  <input
                    type="checkbox"
                    checked={layer.visible}
                    onChange={() => toggleLayer(layer.name)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="truncate">{layer.displayName}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </>
  );
}

interface RegisterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drawingId: string;
}

function RegisterDialog({ open, onOpenChange, drawingId }: RegisterDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const register = useRegisterDrawing();
  const [form, setForm] = useState({
    ref1_paper_x: '',
    ref1_paper_y: '',
    ref1_grid_u: '',
    ref1_grid_v: '',
    ref2_paper_x: '',
    ref2_paper_y: '',
    ref2_grid_u: '',
    ref2_grid_v: '',
    grid_source_run: '',
  });

  const setField = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const submit = async () => {
    const numeric = (v: string) => Number(v);
    const payload: DrawingRegistrationPayload = {
      ref1: {
        paper_x: numeric(form.ref1_paper_x),
        paper_y: numeric(form.ref1_paper_y),
        grid_u: form.ref1_grid_u,
        grid_v: form.ref1_grid_v,
      },
      ref2: {
        paper_x: numeric(form.ref2_paper_x),
        paper_y: numeric(form.ref2_paper_y),
        grid_u: form.ref2_grid_u,
        grid_v: form.ref2_grid_v,
      },
      grid_source_run: form.grid_source_run,
    };
    try {
      await register.mutateAsync({ drawingId, payload });
      toast.toast({ title: t('drawings.registerToast.success') });
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('drawings.registerToast.failed');
      toast.toast({ title: t('drawings.registerToast.failed'), description: message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('drawings.registerSheet')}</DialogTitle>
          <DialogDescription>{t('drawings.registerHelp')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-[clamp(0.625rem,1vw,0.75rem)] uppercase tracking-wide text-text-tertiary">
              {t('drawings.refPair', { n: 1 })}
            </Label>
            <RefPairInputs
              prefix="ref1"
              form={form}
              setField={setField}
            />
          </div>
          <div>
            <Label className="text-[clamp(0.625rem,1vw,0.75rem)] uppercase tracking-wide text-text-tertiary">
              {t('drawings.refPair', { n: 2 })}
            </Label>
            <RefPairInputs
              prefix="ref2"
              form={form}
              setField={setField}
            />
          </div>
          <div>
            <Label htmlFor="grid_source_run" className={cn('text-[clamp(0.625rem,1vw,0.75rem)]')}>
              {t('drawings.gridSourceRun')}
            </Label>
            <Input
              id="grid_source_run"
              value={form.grid_source_run}
              onChange={setField('grid_source_run')}
              placeholder="extraction-run-uuid"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={register.isPending}>
            {register.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {t('drawings.registerSubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RefPairInputsProps {
  prefix: 'ref1' | 'ref2';
  form: Record<string, string>;
  setField: (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function RefPairInputs({ prefix, form, setField }: RefPairInputsProps) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-2 mt-1">
      <Input
        type="number"
        step="any"
        placeholder={t('drawings.paperX')}
        value={form[`${prefix}_paper_x`] || ''}
        onChange={setField(`${prefix}_paper_x`)}
      />
      <Input
        type="number"
        step="any"
        placeholder={t('drawings.paperY')}
        value={form[`${prefix}_paper_y`] || ''}
        onChange={setField(`${prefix}_paper_y`)}
      />
      <Input
        placeholder={t('drawings.gridU')}
        value={form[`${prefix}_grid_u`] || ''}
        onChange={setField(`${prefix}_grid_u`)}
      />
      <Input
        placeholder={t('drawings.gridV')}
        value={form[`${prefix}_grid_v`] || ''}
        onChange={setField(`${prefix}_grid_v`)}
      />
    </div>
  );
}
