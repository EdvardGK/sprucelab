import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, X, FileText, AlertCircle, CheckCircle, Loader2, Minimize2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { formatFileSize } from '@/lib/format';
import { useUploadContext, UploadStatus } from '@/contexts/UploadContext';

interface ModelUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function ModelUploadDialog({ open, onOpenChange, projectId }: ModelUploadDialogProps) {
  const { t } = useTranslation();
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    uploads,
    addFiles,
    removeFile,
    startUpload,
    clearCompleted,
    isUploading,
  } = useUploadContext();

  // Filter uploads for this project
  const projectUploads = uploads.filter(u => u.projectId === projectId);
  const pendingCount = projectUploads.filter(u => u.status === 'pending').length;
  const uploadingCount = projectUploads.filter(u => u.status === 'uploading').length;
  const successCount = projectUploads.filter(u => u.status === 'success').length;
  const errorCount = projectUploads.filter(u => u.status === 'error').length;
  const allDone = projectUploads.length > 0 && pendingCount === 0 && uploadingCount === 0;

  const validateAndAddFiles = useCallback((newFiles: FileList | File[]) => {
    setError(null);
    const validFiles: File[] = [];
    const existingNames = new Set(projectUploads.map(u => u.file.name));

    for (const file of Array.from(newFiles)) {
      // Skip duplicates
      if (existingNames.has(file.name)) {
        continue;
      }

      // Validate file type
      if (!file.name.toLowerCase().endsWith('.ifc')) {
        setError(t('modelUpload.invalidFileType'));
        continue;
      }

      // Validate file size (1GB max)
      if (file.size > 1024 * 1024 * 1024) {
        setError(t('modelUpload.fileTooLarge'));
        continue;
      }

      validFiles.push(file);
      existingNames.add(file.name);
    }

    if (validFiles.length > 0) {
      addFiles(validFiles, projectId);
    }
  }, [projectUploads, projectId, addFiles, t]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files);
    }
  }, [validateAndAddFiles]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndAddFiles(e.target.files);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const handleClose = () => {
    // Always allow closing - uploads continue in background
    setError(null);
    onOpenChange(false);
  };

  const handleDone = () => {
    clearCompleted();
    setError(null);
    onOpenChange(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingCount > 0 && !isUploading) {
      startUpload();
    }
  };

  const getStatusIcon = (status: UploadStatus) => {
    switch (status) {
      case 'uploading':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('modelUpload.title')}</DialogTitle>
            <DialogDescription>
              {t('modelUpload.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Drag and drop area */}
            {!allDone && (
              <div
                className={cn(
                  'relative rounded-lg border-2 border-dashed p-6 text-center transition-colors',
                  dragActive
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-background-elevated hover:border-primary/50'
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept=".ifc"
                  multiple
                  onChange={handleFileChange}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  id="file-upload"
                  tabIndex={-1}
                  onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                />

                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {t('modelUpload.dropzone')}
                    </p>
                    <p className="text-xs text-text-tertiary mt-1">
                      {t('modelUpload.multipleFiles')} · {t('modelUpload.maxSize')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Error message */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* File list with individual progress bars */}
            {projectUploads.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-primary">
                    {t('modelUpload.selectedFiles')} ({projectUploads.length})
                  </span>
                  {isUploading && (
                    <span className="text-xs text-text-tertiary">
                      {t('modelUpload.uploadingProgress', { current: successCount + errorCount + 1, total: projectUploads.length })}
                    </span>
                  )}
                </div>

                <div className="max-h-[280px] overflow-y-auto rounded-lg border bg-background-elevated">
                  {projectUploads.map((upload) => (
                    <div
                      key={upload.id}
                      className={cn(
                        'px-3 py-2 border-b last:border-b-0',
                        upload.status === 'error' && 'bg-red-500/5'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {upload.file.name}
                          </p>
                          <p className="text-xs text-text-tertiary">
                            {upload.error || formatFileSize(upload.file.size)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {getStatusIcon(upload.status)}
                          {upload.status === 'pending' && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => removeFile(upload.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Individual progress bar */}
                      {upload.status === 'uploading' && (
                        <div className="mt-2">
                          <Progress value={upload.progress} className="h-1" />
                        </div>
                      )}
                      {upload.status === 'success' && (
                        <div className="mt-2">
                          <Progress value={100} className="h-1" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Completion summary */}
                {allDone && (
                  <Alert variant="default" className={cn(
                    errorCount > 0
                      ? 'border-yellow-500/50 bg-yellow-500/10'
                      : 'border-green-500/50 bg-green-500/10'
                  )}>
                    <CheckCircle className={cn('h-4 w-4', errorCount > 0 ? 'text-yellow-500' : 'text-green-500')} />
                    <AlertDescription>
                      {errorCount > 0
                        ? t('modelUpload.partialSuccess', { success: successCount, failed: errorCount })
                        : t('modelUpload.allSuccess', { count: successCount })}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {allDone ? (
              <Button type="button" onClick={handleDone}>
                {t('common.close')}
              </Button>
            ) : (
              <>
                {isUploading ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    className="gap-2"
                  >
                    <Minimize2 className="h-4 w-4" />
                    {t('modelUpload.minimize')}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleClose}
                  >
                    {t('common.cancel')}
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={isUploading || pendingCount === 0}
                >
                  {isUploading
                    ? t('modelUpload.uploading')
                    : pendingCount > 1
                      ? t('modelUpload.uploadAllButton', { count: pendingCount })
                      : t('modelUpload.uploadButton')}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
