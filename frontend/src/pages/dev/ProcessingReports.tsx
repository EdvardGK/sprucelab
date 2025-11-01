import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Database, AlertCircle } from 'lucide-react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { Button } from '@/components/ui/button';
import { ProcessingStatusBadge } from '@/components/ProcessingStatusBadge';
import { useProcessingReports } from '@/hooks/use-processing-reports';
import type { ProcessingReportFilters } from '@/hooks/use-processing-reports';
import { cn } from '@/lib/utils';

export default function ProcessingReports() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<ProcessingReportFilters>({
    ordering: '-started_at', // Newest first
  });

  const { data: reports, isLoading, error } = useProcessingReports(filters);

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return '—';
    if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <AppLayout>
      <div className="flex flex-col w-full flex-grow py-6 px-6 md:px-8 lg:px-12">
        <div className="max-w-7xl w-full mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-text-primary">Processing Reports</h1>
            <p className="text-text-secondary mt-1">
              Detailed IFC processing logs for debugging and monitoring
            </p>
          </div>

          {/* Filters */}
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm text-text-secondary">Filter:</span>
            <Button
              variant={filters.overall_status === undefined ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilters({ ...filters, overall_status: undefined })}
            >
              All
            </Button>
            <Button
              variant={filters.overall_status === 'success' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilters({ ...filters, overall_status: 'success' })}
            >
              Success
            </Button>
            <Button
              variant={filters.overall_status === 'partial' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilters({ ...filters, overall_status: 'partial' })}
            >
              Partial
            </Button>
            <Button
              variant={filters.overall_status === 'failed' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilters({ ...filters, overall_status: 'failed' })}
            >
              Failed
            </Button>

            <div className="ml-auto">
              <Button
                variant={filters.catastrophic_failure ? 'destructive' : 'outline'}
                size="sm"
                onClick={() =>
                  setFilters({
                    ...filters,
                    catastrophic_failure: !filters.catastrophic_failure ? true : undefined,
                  })
                }
              >
                Catastrophic Only
              </Button>
            </div>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-12 text-text-secondary">
              Loading processing reports...
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="rounded-lg border border-error bg-error/10 p-4 text-error">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-5 w-5" />
                <h3 className="font-semibold">Failed to load reports</h3>
              </div>
              <p className="text-sm">{String(error)}</p>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && reports && reports.length === 0 && (
            <div className="text-center py-12">
              <Database className="h-12 w-12 text-text-tertiary mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-text-primary mb-2">No reports found</h3>
              <p className="text-text-secondary">
                {filters.overall_status
                  ? `No reports with status "${filters.overall_status}"`
                  : 'Upload an IFC model to generate processing reports'}
              </p>
            </div>
          )}

          {/* Table */}
          {!isLoading && !error && reports && reports.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full">
                <thead className="bg-surface border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">
                      Model
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-text-primary">
                      Duration
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">
                      Schema
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-text-primary">
                      File Size
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-text-primary">
                      Errors
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">
                      Started
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {reports.map((report) => (
                    <tr
                      key={report.id}
                      className="cursor-pointer hover:bg-surface/50 transition-colors"
                      onClick={() => navigate(`/dev/processing-reports/${report.id}`)}
                    >
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-text-primary">{report.model_name}</div>
                        <div className="text-xs text-text-tertiary">{report.project_name}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ProcessingStatusBadge status={report.overall_status} />
                          {report.catastrophic_failure && (
                            <span className="text-xs text-error font-medium">CRITICAL</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(report.duration_seconds)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        <code className="text-xs bg-surface px-1.5 py-0.5 rounded">
                          {report.ifc_schema || '—'}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary text-right">
                        {formatFileSize(report.file_size_bytes)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        <span
                          className={cn(
                            'font-medium',
                            report.errors.length > 0 ? 'text-error' : 'text-text-tertiary'
                          )}
                        >
                          {report.errors.length}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-tertiary">
                        {formatDate(report.started_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
