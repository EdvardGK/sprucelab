import { useState, useCallback } from 'react';
import { Upload, X, FileText, AlertCircle } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { formatFileSize } from '@/lib/format';

interface ModelUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function ModelUploadDialog({ open, onOpenChange, projectId }: ModelUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [versionNumber, setVersionNumber] = useState('1.0');
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        setError('Please upload an IFC file (.ifc)');
        return;
      }

      // Validate file size (1GB max)
      if (droppedFile.size > 1024 * 1024 * 1024) {
        setError('File size must be less than 1GB');
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
        setError('Please upload an IFC file (.ifc)');
        return;
      }

      // Validate file size (1GB max)
      if (selectedFile.size > 1024 * 1024 * 1024) {
        setError('File size must be less than 1GB');
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

    if (!file) {
      setError('Please select a file');
      return;
    }

    try {
      await uploadModel.mutateAsync({
        file,
        project_id: projectId,
        name: name || file.name.replace('.ifc', ''),
        version_number: versionNumber,
      });

      // Reset form and close dialog
      setFile(null);
      setName('');
      setVersionNumber('1.0');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload model');
    }
  };

  const handleClose = () => {
    if (!uploadModel.isPending) {
      setFile(null);
      setName('');
      setVersionNumber('1.0');
      setError(null);
      onOpenChange(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Upload IFC Model</DialogTitle>
            <DialogDescription>
              Upload a new IFC model to this project for processing and visualization
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Drag and drop area */}
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
                      Drop IFC file here or click to browse
                    </p>
                    <p className="text-xs text-text-tertiary mt-1">
                      Maximum file size: 1GB
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

            {/* Error message */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Model details */}
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="model-name">Model Name</Label>
                <Input
                  id="model-name"
                  placeholder="Building Model"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={uploadModel.isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="version">Version Number</Label>
                <Input
                  id="version"
                  placeholder="1.0"
                  value={versionNumber}
                  onChange={(e) => setVersionNumber(e.target.value)}
                  disabled={uploadModel.isPending}
                />
              </div>
            </div>

            {/* Upload progress */}
            {uploadModel.isPending && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">Uploading and processing...</span>
                  <span className="text-text-tertiary">This may take a few minutes</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full w-full bg-primary animate-pulse" />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              disabled={uploadModel.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={uploadModel.isPending || !file}>
              {uploadModel.isPending ? 'Uploading...' : 'Upload Model'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
