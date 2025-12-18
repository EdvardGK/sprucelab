import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Layers } from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { useViewerGroup } from '@/hooks/use-viewer-groups';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { UnifiedBIMViewer, type SectionPlane, type UnifiedBIMViewerHandle } from '@/components/features/viewer/UnifiedBIMViewer';
import { ViewerToolPanel, type TabId, type TypeFilter, type ModelInfo } from '@/components/features/viewer/ViewerToolPanel';
import { ViewerTypeToolbar, type TypeInfo } from '@/components/features/viewer/ViewerTypeToolbar';
import { ViewerColorHUD, type ColorMode, type FilterPreset, type ModelColorInfo } from '@/components/features/viewer/ViewerColorHUD';
import { type ElementProperties } from '@/components/features/viewer/ElementPropertiesPanel';
import { AddModelsDialog } from '@/components/features/viewers/AddModelsDialog';

// localStorage keys for persistence
const STORAGE_KEYS = {
  rightCollapsed: 'viewer-right-collapsed',
  activeTab: 'viewer-active-tab',
  colorPresets: 'viewer-color-presets',
};

// Model color palette (distinct colors for each model)
const MODEL_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
];

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

  // Right panel collapse state (persisted)
  const [rightCollapsed, setRightCollapsed] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.rightCollapsed);
    return saved === 'true';
  });

  // Active tab state (persisted) - always default to properties
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.activeTab);
    const validTabs: TabId[] = ['properties', 'sections', 'models'];
    return validTabs.includes(saved as TabId) ? (saved as TabId) : 'properties';
  });

  // Color mode state
  const [colorMode, setColorMode] = useState<ColorMode>('none');
  const [colorProperty, setColorProperty] = useState<string | undefined>();

  // Filter presets (persisted)
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.colorPresets);
    return saved ? JSON.parse(saved) : [];
  });
  const [activePreset, setActivePreset] = useState<string | undefined>();

  // Persist states
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.rightCollapsed, String(rightCollapsed));
  }, [rightCollapsed]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.activeTab, activeTab);
  }, [activeTab]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.colorPresets, JSON.stringify(filterPresets));
  }, [filterPresets]);

  // Update model visibility when group data loads
  useEffect(() => {
    if (group?.models && Object.keys(modelVisibility).length === 0) {
      setModelVisibility(Object.fromEntries(group.models.map(m => [m.id, m.is_visible ?? true])));
    }
  }, [group]); // Only re-run when group changes, not modelVisibility

  // Ref to access viewer's section plane controls
  const viewerRef = useRef<UnifiedBIMViewerHandle>(null);

  // State for section planes (managed by UnifiedBIMViewer, we just display)
  const [sectionPlanes, setSectionPlanes] = useState<SectionPlane[]>([]);
  const [activePlaneId, setActivePlaneId] = useState<string | null>(null);

  // State for selected element (for properties panel)
  const [selectedElement, setSelectedElement] = useState<ElementProperties | null>(null);

  // State for type filters (from UnifiedBIMViewer)
  const [typeFilters, setTypeFilters] = useState<TypeFilter[]>([]);

  // Available properties for color-by (placeholder - will be populated from viewer in future)
  const availableProperties = [
    'Material', 'FireRating', 'IsExternal', 'LoadBearing', 'ThermalTransmittance',
  ];

  // Handlers
  const handleModelVisibilityToggle = useCallback((modelId: string) => {
    setModelVisibility(prev => ({ ...prev, [modelId]: !prev[modelId] }));
  }, []);

  // Type toolbar handlers
  const handleToggleType = useCallback((type: string) => {
    setTypeFilters(prev =>
      prev.map(f => (f.type === type ? { ...f, visible: !f.visible } : f))
    );
  }, []);

  const handleIsolateType = useCallback((type: string) => {
    setTypeFilters(prev =>
      prev.map(f => ({ ...f, visible: f.type === type }))
    );
  }, []);

  // Color mode handlers
  const handleColorModeChange = useCallback((mode: ColorMode, property?: string) => {
    setColorMode(mode);
    setColorProperty(property);
    setActivePreset(undefined); // Clear active preset when manually changing
  }, []);

  // Preset handlers
  const handleSavePreset = useCallback((name: string) => {
    const newPreset: FilterPreset = {
      id: `preset-${Date.now()}`,
      name,
      colorMode,
      colorProperty,
      hiddenTypes: typeFilters.filter(f => !f.visible).map(f => f.type),
    };
    setFilterPresets(prev => [...prev, newPreset]);
    setActivePreset(newPreset.id);
  }, [colorMode, colorProperty, typeFilters]);

  const handleLoadPreset = useCallback((preset: FilterPreset) => {
    setColorMode(preset.colorMode);
    setColorProperty(preset.colorProperty);
    setActivePreset(preset.id);

    // Apply hidden types
    if (preset.hiddenTypes) {
      setTypeFilters(prev =>
        prev.map(f => ({
          ...f,
          visible: !preset.hiddenTypes!.includes(f.type),
        }))
      );
    }
  }, []);

  const handleDeletePreset = useCallback((id: string) => {
    setFilterPresets(prev => prev.filter(p => p.id !== id));
    if (activePreset === id) {
      setActivePreset(undefined);
    }
  }, [activePreset]);

  // Receive type filters from viewer
  const handleTypesDiscovered = useCallback((types: TypeFilter[]) => {
    setTypeFilters(types);
  }, []);

  // Convert model visibility to pass to ViewerToolPanel
  const modelsInfo: ModelInfo[] = (group?.models || []).map(m => ({
    id: m.id,
    name: `Model ${m.model.slice(0, 8)}`,
    visible: modelVisibility[m.id] ?? true,
  }));

  // Model colors for HUD
  const modelColors: ModelColorInfo[] = (group?.models || []).map((m, i) => ({
    id: m.id,
    name: `Model ${m.model.slice(0, 8)}`,
    color: MODEL_COLORS[i % MODEL_COLORS.length],
  }));

  // Convert type filters to TypeInfo for toolbar
  const typeInfoForToolbar: TypeInfo[] = typeFilters;

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
      {/* Compact Header */}
      <header className="h-12 flex-shrink-0 border-b border-border flex items-center justify-between px-3 bg-surface">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => navigate(`/projects/${projectId}/viewer-groups`)}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <div className="truncate">
            <h1 className="text-sm font-semibold text-text-primary truncate max-w-[200px]">
              {group?.name || 'Loading...'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary hidden sm:inline">
            {group?.models?.length || 0} models
          </span>
          <Button
            variant="default"
            size="sm"
            className="h-8"
            onClick={() => setIsAddModelsDialogOpen(true)}
          >
            <Plus className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Add Models</span>
          </Button>
        </div>
      </header>

      {/* Main Content - 3 Zone Layout */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT: Type Toolbar (Blender-style, always visible) */}
        {typeInfoForToolbar.length > 0 && (
          <ViewerTypeToolbar
            types={typeInfoForToolbar}
            onToggle={handleToggleType}
            onIsolate={handleIsolateType}
            className="flex-shrink-0"
          />
        )}

        {/* CENTER: 3D Viewer + Bottom HUD */}
        <div className="flex-1 bg-background-dark relative min-h-0 min-w-0">
          {group?.models && group.models.length > 0 ? (
            <>
              <UnifiedBIMViewer
                ref={viewerRef}
                modelIds={group.models.map(m => m.model)}
                modelVisibility={modelVisibility}
                showPropertiesPanel={false}
                showModelInfo={false}
                showControls={false}
                showFilterHUD={false}
                onSectionPlanesChange={setSectionPlanes}
                onSelectionChange={setSelectedElement}
                onTypesDiscovered={handleTypesDiscovered}
                typeVisibility={Object.fromEntries(typeFilters.map(f => [f.type, f.visible]))}
              />

              {/* Bottom Center HUD */}
              <ViewerColorHUD
                colorMode={colorMode}
                colorProperty={colorProperty}
                onColorModeChange={handleColorModeChange}
                modelColors={modelColors}
                availableProperties={availableProperties}
                presets={filterPresets}
                activePreset={activePreset}
                onLoadPreset={handleLoadPreset}
                onSavePreset={handleSavePreset}
                onDeletePreset={handleDeletePreset}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10"
              />
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-text-tertiary">
              <div className="text-center">
                <Layers className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No models in this viewer group</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setIsAddModelsDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Models
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Tool Panel (Properties, Sections, Models) */}
        <ViewerToolPanel
          collapsed={rightCollapsed}
          onToggle={() => setRightCollapsed(c => !c)}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          selectedElement={selectedElement}
          onClearSelection={() => setSelectedElement(null)}
          sectionPlanes={sectionPlanes}
          activePlaneId={activePlaneId}
          onSelectPlane={(id) => {
            setActivePlaneId(id);
            viewerRef.current?.setActiveSectionPlane(id);
          }}
          onDeletePlane={(id) => {
            viewerRef.current?.deleteSectionPlane(id);
          }}
          onClearAllPlanes={() => {
            viewerRef.current?.clearAllSectionPlanes();
          }}
          models={modelsInfo}
          onToggleModelVisibility={handleModelVisibilityToggle}
        />
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
