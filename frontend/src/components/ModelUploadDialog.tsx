import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, X, FileText, AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import { useUploadModel, type VersionWarning } from '@/hooks/use-models';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { formatFileSize } from '@/lib/format';

interface ModelUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function ModelUploadDialog({ open, onOpenChange, projectId }: ModelUploadDialogProps) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versionWarning, setVersionWarning] = useState<VersionWarning | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const uploadModel = useUploadModel();

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
    setError(null);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];

      // Validate file type
      if (!droppedFile.name.toLowerCase().endsWith('.ifc')) {
        setError(t('modelUpload.invalidFileType'));
        return;
      }

      // Validate file size (1GB max)
      if (droppedFile.size > 1024 * 1024 * 1024) {
        setError(t('modelUpload.fileTooLarge'));
        return;
      }

      setFile(droppedFile);
      // Auto-fill name if not set
      if (!name) {
        const fileName = droppedFile.name.replace('.ifc', '');
        setName(fileName);
      }
    }
  }, [name]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];

      // Validate file type
      if (!selectedFile.name.toLowerCase().endsWith('.ifc')) {
        setError(t('modelUpload.invalidFileType'));
        return;
      }

      // Validate file size (1GB max)
      if (selectedFile.size > 1024 * 1024 * 1024) {
        setError(t('modelUpload.fileTooLarge'));
        return;
      }

      setFile(selectedFile);
      // Auto-fill name if not set
      if (!name) {
        const fileName = selectedFile.name.replace('.ifc', '');
        setName(fileName);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setVersionWarning(null);

    if (!file) {
      setError(t('modelUpload.noFileSelected'));
      return;
    }

    try {
      const response = await uploadModel.mutateAsync({
        file,
        project: projectId,
        name: name || file.name.replace('.ifc', ''),
      });

      // Check for version warning
      if (response.version_warning) {
        setVersionWarning(response.version_warning);
        setUploadSuccess(true);
        // Don't close dialog - let user see the warning
      } else {
        // No warning - reset and close
        setFile(null);
        setName('');
        setUploadSuccess(false);
        onOpenChange(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload model');
    }
  };

  const handleClose = () => {
    if (!uploadModel.isPending) {
      setFile(null);
      setName('');
      setError(null);
      setVersionWarning(null);
      setUploadSuccess(false);
      onOpenChange(false);
    }
  };

  // Format timestamp for display
  const formatTimestamp = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('nb-NO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
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
            {/* Drag and drop area - hide when upload succeeded */}
            {!uploadSuccess && (
              <div
                className={cn(
                  'relative rounded-lg border-2 border-dashed p-8 text-center transition-colors',
                  dragActive
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-background-elevated hover:border-primary/50',
                  uploadModel.isPending && 'opacity-50 pointer-events-none'
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept=".ifc"
                  onChange={handleFileChange}
                  disabled={uploadModel.isPending}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  id="file-upload"
                />

                {!file ? (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-10 w-10 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {t('modelUpload.dropzone')}
                      </p>
                      <p className="text-xs text-text-tertiary mt-1">
                        {t('modelUpload.maxSize')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-primary" />
                      <div className="text-left">
                        <p className="text-sm font-medium text-text-primary">{file.name}</p>
                        <p className="text-xs text-text-tertiary">{formatFileSize(file.size)}</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                      disabled={uploadModel.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Error message */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Upload success with version warning */}
            {uploadSuccess && versionWarning && (
              <Alert variant="default" className="border-yellow-500/50 bg-yellow-500/10">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <AlertTitle className="text-yellow-600">{t('modelUpload.warning')}</AlertTitle>
                <AlertDescription className="text-sm">
                  <p className="mb-2">
                    {versionWarning.type === 'older_file'
                      ? t('modelUpload.olderVersion')
                      : t('modelUpload.sameTimestamp')}
                  </p>
                  <div className="text-xs space-y-1 mt-2 text-muted-foreground">
                    <p>
                      <span className="font-medium">{t('modelUpload.currentVersion')}:</span>{' '}
                      {formatTimestamp(versionWarning.current_version_timestamp)}
                    </p>
                    <p>
                      <span className="font-medium">{t('modelUpload.uploadedFile')}:</span>{' '}
                      {formatTimestamp(versionWarning.uploaded_file_timestamp)}
                    </p>
                  </div>
                  <p className="mt-2 text-xs">
                    {t('modelUpload.uploadedSuccess')}
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {/* Upload success without warning */}
            {uploadSuccess && !versionWarning && (
              <Alert variant="default" className="border-green-500/50 bg-green-500/10">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <AlertTitle className="text-green-600">{t('modelUpload.success')}</AlertTitle>
                <AlertDescription>
                  {t('modelUpload.processing')}
                </AlertDescription>
              </Alert>
            )}

            {/* Model details - hide when upload succeeded */}
            {!uploadSuccess && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="model-name">{t('modelUpload.modelName')}</Label>
                  <Input
                    id="model-name"
                    placeholder={t('modelUpload.modelNamePlaceholder')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={uploadModel.isPending}
                  />
                  <p className="text-xs text-text-tertiary">
                    {t('modelUpload.versionNote')}
                  </p>
                </div>
              </div>
            )}

            {/* Upload progress */}
            {uploadModel.isPending && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">{t('modelUpload.uploading')}</span>
                  <span className="text-text-tertiary">{t('modelUpload.uploadingNote')}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full w-full bg-primary animate-pulse" />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            {uploadSuccess ? (
              <Button type="button" onClick={handleClose}>
                {t('common.close')}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClose}
                  disabled={uploadModel.isPending}
                >
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={uploadModel.isPending || !file}>
                  {uploadModel.isPending ? t('modelUpload.uploading') : t('modelUpload.uploadButton')}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
