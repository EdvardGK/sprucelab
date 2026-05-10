// Detail viewer for a DocumentContent. PDFs render with `react-pdf`
// (lazy-loaded), Office formats fall back to the markdown content with a
// "Download original" link to the underlying source file.
import { useEffect, useState, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Download, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDocumentDetail, useDocumentContent } from '@/hooks/use-documents';
import apiClient from '@/lib/api-client';

const PdfPaneLazy = lazy(() => import('./PdfPane'));

interface DocumentDetailProps {
  documentId: string;
  onClose: () => void;
}

export default function DocumentDetail({ documentId, onClose }: DocumentDetailProps) {
  const { t } = useTranslation();
  const { data: doc } = useDocumentDetail(documentId);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!doc?.source_file) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await apiClient.get<{ file_url: string }>(`/files/${doc.source_file}/`);
        if (!cancelled) setFileUrl(response.data.file_url);
      } catch {
        if (!cancelled) setFileUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc?.source_file]);

  if (!doc) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/95 backdrop-blur-sm">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex bg-background/95 backdrop-blur-sm">
      <div className="flex w-full h-full flex-col">
        <div className="flex-none flex items-center justify-between gap-3 border-b border-border px-[clamp(1rem,2vw,1.5rem)] py-[clamp(0.5rem,1vw,0.75rem)]">
          <div className="min-w-0">
            <h2 className="text-[clamp(0.875rem,1.5vw,1.125rem)] font-semibold text-text-primary truncate">
              {doc.original_filename}
            </h2>
            <p className="text-[clamp(0.625rem,1vw,0.75rem)] text-text-tertiary truncate uppercase">
              {doc.format} · {t('documents.method.' + doc.extraction_method)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {fileUrl && (
              <a
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-[clamp(0.75rem,1.2vw,0.875rem)] text-text-primary hover:bg-surface/80"
              >
                <Download className="h-4 w-4" />
                {t('documents.openOriginal')}
              </a>
            )}
            <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('common.close')}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {doc.format === 'pdf' && fileUrl ? (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              }
            >
              <PdfPaneLazy fileUrl={fileUrl} />
            </Suspense>
          ) : (
            <OfficePane documentId={documentId} />
          )}
        </div>
      </div>
    </div>
  );
}

function OfficePane({ documentId }: { documentId: string }) {
  const { t } = useTranslation();
  const { data: detail } = useDocumentDetail(documentId);
  const { data: content, isLoading, error } = useDocumentContent(documentId, 'markdown');

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-[clamp(1rem,2vw,2rem)]">
        <div className="flex flex-col items-center gap-3 text-center max-w-md">
          <AlertCircle className="h-8 w-8 text-error" />
          <p className="text-error text-[clamp(0.75rem,1.2vw,0.875rem)]">
            {t('documents.preview.loadFailed')}
          </p>
        </div>
      </div>
    );
  }

  // The API returns either {markdown_content: "..."} or the full DocumentDetail.
  // Use the detail's `markdown_content` if available.
  const markdown =
    (content && typeof content === 'object' && 'markdown_content' in content
      ? String((content as { markdown_content?: unknown }).markdown_content ?? '')
      : '') || detail?.markdown_content || '';

  return (
    <div className="mx-auto p-[clamp(1rem,2vw,2rem)] max-w-3xl">
      <pre className="whitespace-pre-wrap break-words font-sans text-[clamp(0.75rem,1.2vw,0.9rem)] text-text-primary leading-relaxed">
        {markdown || t('documents.preview.empty')}
      </pre>
    </div>
  );
}
