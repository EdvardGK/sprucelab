import { useEffect } from 'react';
import { AlertTriangle, Trash2, Loader2 } from 'lucide-react';
import { useDeletePreview, useDeleteModel } from '@/hooks/use-models';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface DeleteModelDialogProps {
  modelId: string;
  modelName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DeleteModelDialog({
  modelId,
  open,
  onOpenChange,
  onSuccess,
}: DeleteModelDialogProps) {
  const { data: preview, isLoading: previewLoading } = useDeletePreview(modelId, open);
  const deleteModel = useDeleteModel();

  const handleDelete = async () => {
    try {
      await deleteModel.mutateAsync(modelId);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Failed to delete model:', error);
    }
  };

  // Reset mutation state when dialog closes
  useEffect(() => {
    if (!open) {
      deleteModel.reset();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-error">
            <Trash2 className="h-5 w-5" />
            Delete Model
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the model and all related data.
          </DialogDescription>
        </DialogHeader>

        {previewLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-text-secondary" />
          </div>
        ) : preview ? (
          <div className="space-y-4">
            {/* Model Info */}
            <Card className="border-border">
              <CardContent className="pt-6">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Model:</span>
                    <span className="text-text-primary font-medium">
                      {preview.model.name} (v{preview.model.version})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Status:</span>
                    <span className="text-text-primary">{preview.model.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Elements:</span>
                    <span className="text-text-primary">
                      {preview.model.element_count.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">File Size:</span>
                    <span className="text-text-primary">{preview.model.file_size_mb.toFixed(1)} MB</span>
                  </div>
                  {preview.model.is_published && (
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Published:</span>
                      <span className="text-warning font-medium">Yes (Active Version)</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Impact Summary */}
            <Card className="border-error/50 bg-error/5">
              <CardContent className="pt-6">
                <h4 className="text-sm font-semibold text-text-primary mb-3">Deletion Impact</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Total Models Deleted:</span>
                    <span className="text-text-primary font-medium">
                      {preview.impact.total_models_deleted}
                    </span>
                  </div>
                  {preview.child_versions.count > 0 && (
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Child Versions Deleted:</span>
                      <span className="text-error font-medium">{preview.child_versions.count}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Total Entities Deleted:</span>
                    <span className="text-text-primary font-medium">
                      {preview.impact.total_entities_deleted.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Total Data Deleted:</span>
                    <span className="text-text-primary font-medium">
                      {preview.impact.total_file_size_deleted_mb.toFixed(1)} MB
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Child Versions */}
            {preview.child_versions.count > 0 && (
              <Card className="border-border">
                <CardContent className="pt-6">
                  <h4 className="text-sm font-semibold text-text-primary mb-3">
                    Child Versions (will also be deleted)
                  </h4>
                  <div className="space-y-1 text-sm max-h-32 overflow-y-auto">
                    {preview.child_versions.versions.map((version) => (
                      <div
                        key={version.id}
                        className="flex items-center justify-between py-1 px-2 rounded hover:bg-surface"
                      >
                        <span className="text-text-secondary">
                          {version.name} (v{version.version})
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-text-tertiary">
                            {version.element_count.toLocaleString()} elements
                          </span>
                          {version.is_published && (
                            <span className="text-xs text-warning">Published</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Warnings */}
            {preview.warnings.length > 0 && (
              <div className="space-y-2">
                {preview.warnings.map((warning, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-2 p-3 rounded-md bg-warning/10 border border-warning/20"
                  >
                    <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                    <p className="text-sm text-warning">{warning}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Error Message */}
            {deleteModel.isError && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-error/10 border border-error/20">
                <AlertTriangle className="h-4 w-4 text-error mt-0.5 shrink-0" />
                <p className="text-sm text-error">
                  Failed to delete model: {deleteModel.error?.message || 'Unknown error'}
                </p>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteModel.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!preview?.can_delete || deleteModel.isPending}
          >
            {deleteModel.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Permanently
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
