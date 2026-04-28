import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, AlertCircle, XCircle } from 'lucide-react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useExtraction } from '@/hooks/use-processing-reports';
import type { ExtractionRunLogEntry, ExtractionRunStatus } from '@/lib/api-types';
import { cn } from '@/lib/utils';
import { formatFileSize } from '@/lib/format';

const STATUS_BADGE: Record<ExtractionRunStatus, string> = {
  pending: 'bg-gray-100 text-gray-800 border-gray-200',
  running: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
};

function StatusBadge({ status }: { status: ExtractionRunStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize',
        STATUS_BADGE[status]
      )}
    >
      {status}
    </span>
  );
}

const LEVEL_STYLES: Record<string, string> = {
  error: 'bg-red-50 border-red-200 text-red-900',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-900',
  info: 'bg-surface border-border text-text-secondary',
  debug: 'bg-surface border-border text-text-tertiary',
};

function logRowClass(level?: string) {
  return LEVEL_STYLES[(level || 'info').toLowerCase()] ?? LEVEL_STYLES.info;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export default function ProcessingReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: run, isLoading, error } = useExtraction(id!);

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return '—';
    if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex flex-col w-full flex-grow py-6 px-6 md:px-8 lg:px-12">
          <div className="text-text-secondary">Loading extraction run...</div>
        </div>
      </AppLayout>
    );
  }

  if (error || !run) {
    return (
      <AppLayout>
        <div className="flex flex-col w-full flex-grow py-6 px-6 md:px-8 lg:px-12">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/dev/processing-reports')}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Runs
          </Button>

          <div className="rounded-lg border border-error bg-error/10 p-4 text-error">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-5 w-5" />
              <h3 className="font-semibold">Run not found</h3>
            </div>
            <p className="text-sm">
              {error ? String(error) : "The extraction run you're looking for doesn't exist."}
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const qr = run.quality_report ?? {};
  const ifcSchema = asString(qr.ifc_schema);
  const fileSizeFromReport = asNumber(qr.file_size_bytes);
  const fileSize = run.file_size ?? fileSizeFromReport;
  const totalElements = asNumber(qr.total_elements);
  const typeCount = asNumber(qr.type_count);
  const typesWithInstances = asNumber(qr.types_with_instances);
  const totalInstances = asNumber(qr.total_instances);
  const storeyCount = asNumber(qr.storey_count);
  const materialCount = asNumber(qr.material_count);

  const logEntries: ExtractionRunLogEntry[] = run.log_entries ?? [];
  const errorEntries = logEntries.filter(
    (e) => (e.level ?? '').toLowerCase() === 'error'
  );
  const warningEntries = logEntries.filter(
    (e) => (e.level ?? '').toLowerCase() === 'warning'
  );

  const isFailed = run.status === 'failed';

  return (
    <AppLayout>
      <div className="flex flex-col w-full flex-grow py-6 px-6 md:px-8 lg:px-12">
        <div className="w-full">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/dev/processing-reports')}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Runs
          </Button>

          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-text-primary">
                {run.source_file_name ?? 'Extraction Run'}
              </h1>
              <StatusBadge status={run.status} />
              {run.format && (
                <code className="text-xs bg-surface px-1.5 py-0.5 rounded uppercase">
                  {run.format}
                </code>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-text-secondary flex-wrap">
              {run.project_name && <span>{run.project_name}</span>}
              {ifcSchema && (
                <>
                  <span>•</span>
                  <code className="text-xs bg-surface px-1.5 py-0.5 rounded">{ifcSchema}</code>
                </>
              )}
              <span>•</span>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(run.duration_seconds)}
              </div>
              {fileSize !== null && fileSize !== undefined && (
                <>
                  <span>•</span>
                  <span>{formatFileSize(fileSize)}</span>
                </>
              )}
              {run.extractor_version && (
                <>
                  <span>•</span>
                  <span className="text-text-tertiary">
                    Extractor: {run.extractor_version}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Failure callout */}
          {isFailed && (
            <Card className="mb-6 border-error">
              <CardHeader className="bg-error/10">
                <CardTitle className="text-error flex items-center gap-2">
                  <XCircle className="h-5 w-5" />
                  Extraction Failed
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {run.error_message ? (
                  <pre className="text-xs bg-surface p-3 rounded overflow-x-auto border border-border whitespace-pre-wrap">
                    {run.error_message}
                  </pre>
                ) : (
                  <p className="text-sm text-text-secondary">
                    No error message recorded.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* CRS + units */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Discovered CRS</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>
                  <span className="text-text-tertiary">CRS:</span>{' '}
                  <code className="bg-surface px-1.5 py-0.5 rounded">
                    {run.discovered_crs ?? '—'}
                  </code>
                </div>
                <div>
                  <span className="text-text-tertiary">Source:</span>{' '}
                  {run.crs_source ?? '—'}
                </div>
                <div>
                  <span className="text-text-tertiary">Confidence:</span>{' '}
                  {run.crs_confidence !== null ? run.crs_confidence?.toFixed(2) : '—'}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Discovered Units</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(run.discovered_units ?? {}).length === 0 ? (
                  <p className="text-sm text-text-tertiary">No units recorded.</p>
                ) : (
                  <ul className="text-sm space-y-1">
                    {Object.entries(run.discovered_units).map(([k, v]) => (
                      <li key={k}>
                        <span className="text-text-tertiary">{k}:</span>{' '}
                        <code className="bg-surface px-1.5 py-0.5 rounded">{v}</code>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Elements</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalElements ?? '—'}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Types</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{typeCount ?? '—'}</div>
                {typesWithInstances !== null && typeCount !== null && (
                  <div className="text-xs text-text-tertiary">
                    {typesWithInstances} with instances
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Instances</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalInstances ?? '—'}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Storeys / Materials</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {storeyCount ?? '—'} / {materialCount ?? '—'}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Log entries */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>
                Log Entries ({logEntries.length})
                {(errorEntries.length > 0 || warningEntries.length > 0) && (
                  <span className="ml-3 text-sm font-normal text-text-secondary">
                    {errorEntries.length} error / {warningEntries.length} warning
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {logEntries.length === 0 ? (
                <p className="text-sm text-text-secondary">No log entries.</p>
              ) : (
                <div className="space-y-2">
                  {logEntries.map((entry, i) => (
                    <div
                      key={i}
                      className={cn(
                        'p-3 rounded-lg border text-sm',
                        logRowClass(entry.level)
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono uppercase">
                            {entry.level ?? 'info'}
                          </span>
                          {entry.stage && (
                            <code className="text-xs bg-surface px-1.5 py-0.5 rounded">
                              {entry.stage}
                            </code>
                          )}
                        </div>
                        {entry.ts && (
                          <span className="text-xs text-text-tertiary">{entry.ts}</span>
                        )}
                      </div>
                      <div className="font-medium">{entry.message ?? '—'}</div>
                      {entry.details && Object.keys(entry.details).length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs cursor-pointer text-text-secondary">
                            details
                          </summary>
                          <pre className="text-xs mt-2 overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(entry.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Raw quality report */}
          {Object.keys(qr).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Quality Report (raw)</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs font-mono bg-surface p-4 rounded-lg overflow-x-auto whitespace-pre-wrap border border-border">
                  {JSON.stringify(qr, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
