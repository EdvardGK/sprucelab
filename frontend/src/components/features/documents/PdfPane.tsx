// Lazy-loaded PDF pane backed by react-pdf. Kept in its own module so the
// react-pdf + pdfjs payload is split out of the main bundle and only fetched
// when the user opens a PDF document.
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Document, Page, pdfjs } from 'react-pdf';
import { Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

// react-pdf needs an explicit worker URL. We point at the cdnjs build matching
// the resolved pdfjs version so the bundler doesn't try to fold the worker
// into the main chunk.
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface PdfPaneProps {
  fileUrl: string;
}

export default function PdfPane({ fileUrl }: PdfPaneProps) {
  const { t } = useTranslation();
  const [numPages, setNumPages] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);

  const fileSpec = useMemo(() => ({ url: fileUrl }), [fileUrl]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-none flex items-center gap-2 border-b border-border bg-surface/40 px-[clamp(0.75rem,1.5vw,1rem)] py-[clamp(0.375rem,0.75vw,0.5rem)]">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          aria-label={t('common.prev')}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-[clamp(0.625rem,1.1vw,0.75rem)] text-text-secondary">
          {numPages > 0 ? `${page} / ${numPages}` : '—'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setPage((p) => Math.min(numPages || p, p + 1))}
          disabled={page >= numPages}
          aria-label={t('common.next')}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto bg-background flex items-start justify-center py-[clamp(1rem,2vw,2rem)]">
        <Document
          file={fileSpec}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          onLoadError={(err) => setError(err.message)}
          loading={
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          }
          error={
            <div className="flex flex-col items-center gap-3 py-12 text-center max-w-md">
              <AlertCircle className="h-8 w-8 text-error" />
              <p className="text-error text-[clamp(0.75rem,1.2vw,0.875rem)]">
                {error ?? t('documents.preview.loadFailed')}
              </p>
            </div>
          }
        >
          <Page pageNumber={page} renderTextLayer={false} renderAnnotationLayer={false} />
        </Document>
      </div>
    </div>
  );
}
