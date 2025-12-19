import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, X, FileText, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useUploadModel } from '@/hooks/use-models';
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
import { cn } from '@/lib/utils';
import { formatFileSize } from '@/lib/format';

interface ModelUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

type FileStatus = 'pending' | 'uploading' | 'success' | 'error';

interface FileWithStatus {
  file: File;
  status: FileStatus;
  error?: string;
}

export function ModelUploadDialog({ open, onOpenChange, projectId }: ModelUploadDialogProps) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<FileWithStatus[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const uploadModel = useUploadModel();

  const validateAndAddFiles = useCallback((newFiles: FileList | File[]) => {
    setError(null);
    const validFiles: FileWithStatus[] = [];
    const existingNames = new Set(files.map(f => f.file.name));

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

      validFiles.push({ file, status: 'pending' });
      existingNames.add(file.name);
    }

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
    }
  }, [files, t]);

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

  const removeFile = (fileName: string) => {
    setFiles(prev => prev.filter(f => f.file.name !== fileName));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    setError(null);

    // Mark all as uploading
    setFiles(prev => prev.map(f => ({ ...f, status: 'uploading' as FileStatus })));

    // Upload all in parallel
    const uploads = files.map(async ({ file }) => {
      try {
        await uploadModel.mutateAsync({
          file,
          project: projectId,
          name: file.name.replace(/\.ifc$/i, ''),
        });
        setFiles(prev =>
          prev.map(f =>
            f.file.name === file.name ? { ...f, status: 'success' as FileStatus } : f
          )
        );
      } catch (err) {
        setFiles(prev =>
          prev.map(f =>
            f.file.name === file.name
              ? { ...f, status: 'error' as FileStatus, error: err instanceof Error ? err.message : 'Upload failed' }
              : f
          )
        );
      }
    });

    await Promise.all(uploads);
    setIsUploading(false);
  };

  const handleClose = () => {
    if (!isUploading) {
      setFiles([]);
      setError(null);
      onOpenChange(false);
    }
  };

  const successCount = files.filter(f => f.status === 'success').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  const allDone = files.length > 0 && successCount + errorCount === files.length;

  const getStatusIcon = (status: FileStatus) => {
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
                  : 'border-border bg-background-elevated hover:border-primary/50',
                isUploading && 'opacity-50 pointer-events-none'
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
                disabled={isUploading}
                className="absolute inset-0 cursor-pointer opacity-0"
                id="file-upload"
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

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-primary">
                  {t('modelUpload.selectedFiles')} ({files.length})
                </span>
                {isUploading && (
                  <span className="text-xs text-text-tertiary">
                    {t('modelUpload.uploadingProgress', { current: successCount + errorCount + 1, total: files.length })}
                  </span>
                )}
              </div>

              <div className="max-h-[240px] overflow-y-auto rounded-lg border bg-background-elevated">
                {files.map(({ file, status, error: fileError }) => (
                  <div
                    key={file.name}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 border-b last:border-b-0',
                      status === 'error' && 'bg-red-500/5'
                    )}
                  >
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-text-tertiary">
                        {fileError || formatFileSize(file.size)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {getStatusIcon(status)}
                      {status === 'pending' && !isUploading && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeFile(file.name)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Progress summary */}
              {isUploading && (
                <div className="space-y-2">
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${((successCount + errorCount) / files.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}

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

        <DialogFooter>
          {allDone ? (
            <Button type="button" onClick={handleClose}>
              {t('common.close')}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={handleClose}
                disabled={isUploading}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                onClick={handleUpload}
                disabled={isUploading || files.length === 0}
              >
                {isUploading
                  ? t('modelUpload.uploading')
                  : files.length > 1
                    ? t('modelUpload.uploadAllButton', { count: files.length })
                    : t('modelUpload.uploadButton')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
