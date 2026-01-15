import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, AlertCircle, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProcessingStatusBadge } from '@/components/ProcessingStatusBadge';
import { useProcessingReport } from '@/hooks/use-processing-reports';
import { cn } from '@/lib/utils';
import { formatFileSize } from '@/lib/format';

export default function ProcessingReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: report, isLoading, error } = useProcessingReport(id!);

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return '—';
    if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
  };

  const getStageIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'partial':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    const variants = {
      critical: 'bg-red-100 text-red-800 border-red-200',
      error: 'bg-orange-100 text-orange-800 border-orange-200',
      warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    };
    return variants[severity as keyof typeof variants] || variants.warning;
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex flex-col w-full flex-grow py-6 px-6 md:px-8 lg:px-12">
          <div className="max-w-7xl w-full mx-auto">
            <div className="text-text-secondary">Loading processing report...</div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !report) {
    return (
      <AppLayout>
        <div className="flex flex-col w-full flex-grow py-6 px-6 md:px-8 lg:px-12">
          <div className="max-w-7xl w-full mx-auto">
            <Button variant="ghost" size="sm" onClick={() => navigate('/dev/processing-reports')} className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Reports
            </Button>

            <div className="rounded-lg border border-error bg-error/10 p-4 text-error">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-5 w-5" />
                <h3 className="font-semibold">Report not found</h3>
              </div>
              <p className="text-sm">{error ? String(error) : "The report you're looking for doesn't exist."}</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Group errors by severity
  const criticalErrors = report.errors.filter((e) => e.severity === 'critical');
  const errors = report.errors.filter((e) => e.severity === 'error');
  const warnings = report.errors.filter((e) => e.severity === 'warning');

  return (
    <AppLayout>
      <div className="flex flex-col w-full flex-grow py-6 px-6 md:px-8 lg:px-12">
        <div className="max-w-7xl w-full mx-auto">
          {/* Header */}
          <Button variant="ghost" size="sm" onClick={() => navigate('/dev/processing-reports')} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Reports
          </Button>

          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-text-primary">{report.model_name}</h1>
              <ProcessingStatusBadge status={report.overall_status} />
              {report.catastrophic_failure && (
                <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 text-xs font-semibold border border-red-200">
                  CATASTROPHIC
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-text-secondary">
              <span>{report.project_name}</span>
              <span>•</span>
              <span>
                <code className="text-xs bg-surface px-1.5 py-0.5 rounded">{report.ifc_schema || 'Unknown'}</code>
              </span>
              <span>•</span>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(report.duration_seconds)}
              </div>
              <span>•</span>
              <span>{formatFileSize(report.file_size_bytes)}</span>
            </div>
          </div>

          {/* Catastrophic Failure Alert */}
          {report.catastrophic_failure && (
            <Card className="mb-6 border-error">
              <CardHeader className="bg-error/10">
                <CardTitle className="text-error flex items-center gap-2">
                  <XCircle className="h-5 w-5" />
                  Catastrophic Failure
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-2">
                  <div>
                    <span className="text-sm font-medium">Failed at stage:</span>
                    <code className="ml-2 text-sm bg-surface px-2 py-0.5 rounded">{report.failure_stage || 'Unknown'}</code>
                  </div>
                  {report.failure_exception && (
                    <div>
                      <span className="text-sm font-medium block mb-1">Exception:</span>
                      <pre className="text-xs bg-surface p-3 rounded overflow-x-auto border border-border">{report.failure_exception}</pre>
                    </div>
                  )}
                  {report.failure_traceback && (
                    <details className="mt-2">
                      <summary className="text-sm font-medium cursor-pointer hover:text-primary">
                        View Full Traceback
                      </summary>
                      <pre className="text-xs bg-surface p-3 rounded overflow-x-auto border border-border mt-2 max-h-96">
                        {report.failure_traceback}
                      </pre>
                    </details>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stage Timeline */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Processing Stages</CardTitle>
            </CardHeader>
            <CardContent>
              {report.stage_results.length === 0 ? (
                <p className="text-sm text-text-secondary">No stage information available</p>
              ) : (
                <div className="space-y-3">
                  {report.stage_results.map((stage, index) => (
                    <div
                      key={index}
                      className={cn(
                        'p-3 rounded-lg border',
                        stage.status === 'success' && 'bg-green-50 border-green-200',
                        stage.status === 'partial' && 'bg-yellow-50 border-yellow-200',
                        stage.status === 'failed' && 'bg-red-50 border-red-200'
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getStageIcon(stage.status)}
                          <span className="font-medium text-sm capitalize">
                            {stage.stage.replace(/_/g, ' ')}
                          </span>
                          <span className="text-xs text-text-tertiary">({stage.duration_ms}ms)</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-green-700">✓ {stage.processed}</span>
                          {stage.failed > 0 && <span className="text-red-700">✗ {stage.failed}</span>}
                          {stage.skipped > 0 && <span className="text-gray-600">○ {stage.skipped}</span>}
                        </div>
                      </div>
                      <p className="text-sm text-text-secondary">{stage.message}</p>
                      {stage.errors.length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs cursor-pointer text-error">
                            {stage.errors.length} error(s)
                          </summary>
                          <ul className="mt-1 space-y-1 pl-4">
                            {stage.errors.map((err: any, i: number) => (
                              <li key={i} className="text-xs text-error">
                                • {err}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Total Processed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{report.total_entities_processed}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Skipped</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-500">{report.total_entities_skipped}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Failed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{report.total_entities_failed}</div>
              </CardContent>
            </Card>
          </div>

          {/* Errors and Warnings */}
          {report.errors.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Errors & Warnings ({report.errors.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Critical Errors */}
                  {criticalErrors.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-red-700 mb-2">
                        ❌ Critical ({criticalErrors.length})
                      </h3>
                      <div className="space-y-2">
                        {criticalErrors.map((err, i) => (
                          <div
                            key={i}
                            className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm"
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="font-medium text-red-900">{err.message}</span>
                              <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium border', getSeverityBadge(err.severity))}>
                                {err.stage}
                              </span>
                            </div>
                            {(err.element_guid || err.element_type) && (
                              <div className="text-xs text-red-700 mt-1">
                                {err.element_type && <span>Type: {err.element_type}</span>}
                                {err.element_type && err.element_guid && <span className="mx-2">•</span>}
                                {err.element_guid && <code className="bg-red-100 px-1 py-0.5 rounded">{err.element_guid}</code>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Errors */}
                  {errors.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-orange-700 mb-2">
                        ⚠️ Errors ({errors.length})
                      </h3>
                      <div className="space-y-2">
                        {errors.slice(0, 10).map((err, i) => (
                          <div
                            key={i}
                            className="p-3 rounded-lg bg-orange-50 border border-orange-200 text-sm"
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="font-medium text-orange-900">{err.message}</span>
                              <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium border', getSeverityBadge(err.severity))}>
                                {err.stage}
                              </span>
                            </div>
                            {(err.element_guid || err.element_type) && (
                              <div className="text-xs text-orange-700 mt-1">
                                {err.element_type && <span>Type: {err.element_type}</span>}
                                {err.element_type && err.element_guid && <span className="mx-2">•</span>}
                                {err.element_guid && <code className="bg-orange-100 px-1 py-0.5 rounded">{err.element_guid}</code>}
                              </div>
                            )}
                          </div>
                        ))}
                        {errors.length > 10 && (
                          <p className="text-xs text-text-tertiary text-center pt-2">
                            ... and {errors.length - 10} more errors
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Warnings */}
                  {warnings.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-yellow-700 mb-2">
                        ℹ️ Warnings ({warnings.length})
                      </h3>
                      <div className="space-y-2">
                        {warnings.slice(0, 10).map((err, i) => (
                          <div
                            key={i}
                            className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-sm"
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="font-medium text-yellow-900">{err.message}</span>
                              <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium border', getSeverityBadge(err.severity))}>
                                {err.stage}
                              </span>
                            </div>
                            {(err.element_guid || err.element_type) && (
                              <div className="text-xs text-yellow-700 mt-1">
                                {err.element_type && <span>Type: {err.element_type}</span>}
                                {err.element_type && err.element_guid && <span className="mx-2">•</span>}
                                {err.element_guid && <code className="bg-yellow-100 px-1 py-0.5 rounded">{err.element_guid}</code>}
                              </div>
                            )}
                          </div>
                        ))}
                        {warnings.length > 10 && (
                          <p className="text-xs text-text-tertiary text-center pt-2">
                            ... and {warnings.length - 10} more warnings
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary */}
          {report.summary && (
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs font-mono bg-surface p-4 rounded-lg overflow-x-auto whitespace-pre-wrap border border-border">
                  {report.summary}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
