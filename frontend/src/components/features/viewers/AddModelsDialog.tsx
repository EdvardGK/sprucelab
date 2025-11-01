import { useState } from 'react';
import { Box, Plus } from 'lucide-react';
import { useModels } from '@/hooks/use-models';
import { useCreateViewerModel } from '@/hooks/use-viewer-groups';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

interface AddModelsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  projectId: string;
  existingModelIds: string[];
}

export function AddModelsDialog({
  isOpen,
  onClose,
  groupId,
  projectId,
  existingModelIds,
}: AddModelsDialogProps) {
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());

  const { data: models, isLoading: modelsLoading } = useModels(projectId);
  const createViewerModel = useCreateViewerModel();

  // Filter out models already in the group
  const availableModels = models?.filter(m => !existingModelIds.includes(m.id)) || [];

  const handleToggleModel = (modelId: string) => {
    const newSelection = new Set(selectedModelIds);
    if (newSelection.has(modelId)) {
      newSelection.delete(modelId);
    } else {
      newSelection.add(modelId);
    }
    setSelectedModelIds(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedModelIds.size === availableModels.length) {
      // Deselect all
      setSelectedModelIds(new Set());
    } else {
      // Select all
      setSelectedModelIds(new Set(availableModels.map(m => m.id)));
    }
  };

  const handleSubmit = async () => {
    if (selectedModelIds.size === 0) return;

    try {
      // Add each selected model to the group
      for (const modelId of selectedModelIds) {
        await createViewerModel.mutateAsync({
          group: groupId,
          model: modelId,
          is_visible: true,
          opacity: 1.0,
        });
      }

      // Reset and close
      setSelectedModelIds(new Set());
      onClose();
    } catch (error) {
      console.error('Failed to add models:', error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Models to Group</DialogTitle>
          <DialogDescription>
            Select models from this project to add to the viewer group
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Header with select all */}
          {availableModels.length > 0 && (
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div className="text-sm text-text-secondary">
                {selectedModelIds.size} of {availableModels.length} selected
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
              >
                {selectedModelIds.size === availableModels.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
          )}

          {/* Models list */}
          <div className="h-[400px] pr-4 overflow-y-auto">
            {modelsLoading ? (
              <div className="flex items-center justify-center h-32 text-text-secondary">
                Loading models...
              </div>
            ) : availableModels.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <Box className="h-12 w-12 text-text-tertiary mb-2" />
                <p className="text-sm text-text-secondary">
                  {models?.length === 0
                    ? 'No models in this project'
                    : 'All models are already in this group'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {availableModels.map((model) => (
                  <div
                    key={model.id}
                    className="flex items-center gap-3 p-3 rounded-md border border-border hover:bg-surface-hover transition-colors cursor-pointer"
                    onClick={() => handleToggleModel(model.id)}
                  >
                    <Checkbox
                      id={`model-${model.id}`}
                      checked={selectedModelIds.has(model.id)}
                      onCheckedChange={() => handleToggleModel(model.id)}
                      onClick={(e) => e.stopPropagation()}
                    />

                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Box className="h-4 w-4 text-text-tertiary" />
                        <span className="text-sm font-medium text-text-primary">
                          {model.name}
                        </span>
                      </div>
                      <div className="text-xs text-text-tertiary mt-1">
                        Version {model.version_number} • {model.element_count.toLocaleString()} elements
                      </div>
                    </div>

                    {/* Status badge */}
                    <div className={`text-xs px-2 py-1 rounded ${
                      model.status === 'ready'
                        ? 'bg-success/10 text-success'
                        : model.status === 'processing'
                        ? 'bg-warning/10 text-warning'
                        : 'bg-error/10 text-error'
                    }`}>
                      {model.status}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={createViewerModel.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={selectedModelIds.size === 0 || createViewerModel.isPending}
            >
              {createViewerModel.isPending ? (
                <>Adding...</>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Add {selectedModelIds.size} Model{selectedModelIds.size !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
