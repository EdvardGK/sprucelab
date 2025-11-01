import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings, Maximize2, Eye, EyeOff, Plus } from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { useViewerGroup } from '@/hooks/use-viewer-groups';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { IFCViewer } from '@/components/features/viewer/IFCViewer';
import { AddModelsDialog } from '@/components/features/viewers/AddModelsDialog';

export default function FederatedViewer() {
  const { id: projectId, groupId } = useParams<{ id: string; groupId: string }>();
  const navigate = useNavigate();
  useProject(projectId!); // Load project for sidebar

  // Load group data from API
  const { data: group, isLoading } = useViewerGroup(groupId!);

  // State for add models dialog
  const [isAddModelsDialogOpen, setIsAddModelsDialogOpen] = useState(false);

  // State for model visibility
  const [modelVisibility, setModelVisibility] = useState<Record<string, boolean>>({});

  // Update model visibility when group data loads
  useEffect(() => {
    if (group?.models && Object.keys(modelVisibility).length === 0) {
      setModelVisibility(Object.fromEntries(group.models.map(m => [m.id, m.is_visible ?? true])));
    }
  }, [group]); // Only re-run when group changes, not modelVisibility

  // State for filters
  const [elementTypeFilters, setElementTypeFilters] = useState<Record<string, boolean>>({
    'IfcWall': true,
    'IfcWindow': true,
    'IfcDoor': true,
    'IfcSlab': true,
    'IfcBeam': true,
  });

  const [systemFilters, setSystemFilters] = useState<Record<string, boolean>>({
    'HVAC System 1': true,
    'Electrical System 1': true,
  });

  // Handlers
  const handleModelVisibilityToggle = (modelId: string) => {
    setModelVisibility(prev => ({ ...prev, [modelId]: !prev[modelId] }));
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-text-secondary">Loading viewer...</div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-error mb-2">Group not found</div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/projects/${projectId}/viewer-groups`)}
          >
            Back to Groups
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-surface">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/projects/${projectId}/viewer-groups`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Groups
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div>
            <h1 className="text-sm font-semibold text-text-primary">{group?.name || 'Loading...'}</h1>
            {group?.description && (
              <p className="text-xs text-text-tertiary">{group.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-text-tertiary">
            {group?.models?.length || 0} models
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={() => setIsAddModelsDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Models
          </Button>
          <Button variant="ghost" size="icon">
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* 3-Column Layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left Panel - Models */}
        <div className="w-64 border-r border-border bg-surface flex flex-col">
          <div className="h-10 border-b border-border flex items-center justify-between px-3">
            <h2 className="text-xs font-semibold text-text-primary">Models</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {group?.models && group.models.length > 0 ? (
              group.models.map((model) => (
                <div
                  key={model.id}
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-surface-hover transition-colors"
                >
                  <button
                    onClick={() => handleModelVisibilityToggle(model.id)}
                    className="text-text-tertiary hover:text-text-primary"
                  >
                    {modelVisibility[model.id] ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </button>
                  <span className="text-xs text-text-primary flex-1 truncate">
                    {model.model_name}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-xs text-text-tertiary text-center py-8">
                No models in this group yet
              </div>
            )}
          </div>
        </div>

        {/* Center Panel - 3D Canvas */}
        <div className="flex-1 bg-background-dark relative">
          <IFCViewer modelIds={group?.models?.map(m => m.model) || []} />
        </div>

        {/* Right Panel - Filters */}
        <div className="w-80 border-l border-border bg-surface flex flex-col">
          <div className="h-10 border-b border-border flex items-center px-3">
            <h2 className="text-xs font-semibold text-text-primary">Filters</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {/* Model Visibility Section */}
            <Card className="p-3">
              <h3 className="text-xs font-semibold text-text-primary mb-2">Model Visibility</h3>
              <div className="space-y-2">
                {group?.models && group.models.length > 0 ? (
                  group.models.map((model) => (
                    <div key={model.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`model-${model.id}`}
                        checked={modelVisibility[model.id] ?? true}
                        onCheckedChange={() => handleModelVisibilityToggle(model.id)}
                      />
                      <label
                        htmlFor={`model-${model.id}`}
                        className="text-xs text-text-primary cursor-pointer flex-1 truncate"
                      >
                        {model.model_name}
                      </label>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-text-tertiary">No models</div>
                )}
              </div>
            </Card>

            {/* IFC Element Types Section */}
            <Card className="p-3">
              <h3 className="text-xs font-semibold text-text-primary mb-2">IFC Element Types</h3>
              <div className="space-y-2">
                {Object.entries(elementTypeFilters).map(([type, checked]) => (
                  <div key={type} className="flex items-center gap-2">
                    <Checkbox
                      id={`type-${type}`}
                      checked={checked}
                      onCheckedChange={(value: boolean) =>
                        setElementTypeFilters(prev => ({ ...prev, [type]: !!value }))
                      }
                    />
                    <label
                      htmlFor={`type-${type}`}
                      className="text-xs text-text-primary cursor-pointer"
                    >
                      {type}
                    </label>
                  </div>
                ))}
              </div>
            </Card>

            {/* IFC Systems Section */}
            <Card className="p-3">
              <h3 className="text-xs font-semibold text-text-primary mb-2">IFC Systems</h3>
              <div className="space-y-2">
                {Object.entries(systemFilters).map(([system, checked]) => (
                  <div key={system} className="flex items-center gap-2">
                    <Checkbox
                      id={`system-${system}`}
                      checked={checked}
                      onCheckedChange={(value: boolean) =>
                        setSystemFilters(prev => ({ ...prev, [system]: !!value }))
                      }
                    />
                    <label
                      htmlFor={`system-${system}`}
                      className="text-xs text-text-primary cursor-pointer"
                    >
                      {system}
                    </label>
                  </div>
                ))}
              </div>
            </Card>

            {/* Reset Filters Button */}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                setElementTypeFilters({
                  'IfcWall': true,
                  'IfcWindow': true,
                  'IfcDoor': true,
                  'IfcSlab': true,
                  'IfcBeam': true,
                });
                setSystemFilters({
                  'HVAC System 1': true,
                  'Electrical System 1': true,
                });
              }}
            >
              Reset Filters
            </Button>
          </div>
        </div>
      </div>

      {/* Add Models Dialog */}
      <AddModelsDialog
        isOpen={isAddModelsDialogOpen}
        onClose={() => setIsAddModelsDialogOpen(false)}
        groupId={groupId!}
        projectId={projectId!}
        existingModelIds={group?.models?.map(m => m.model) || []}
      />
    </div>
  );
}
