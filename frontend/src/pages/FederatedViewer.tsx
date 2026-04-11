/**
 * FederatedViewer — Full-screen BIM model viewer
 *
 * Layout: Left panel (Platform) | Center (Canvas + HUD) | Right panel (IFC Properties)
 * No global sidebar — viewer owns the entire screen.
 *
 * Left:   What Sprucelab knows (models, verification, type classification)
 * Center: 3D canvas with toolbar, type toolbar, section float, filter HUD
 * Right:  What the IFC file says (raw psets, quantities, materials)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Layers } from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { useViewerGroup } from '@/hooks/use-viewer-groups';
import { Button } from '@/components/ui/button';
import { UnifiedBIMViewer, type SectionPlane, type UnifiedBIMViewerHandle } from '@/components/features/viewer/UnifiedBIMViewer';
import { type TypeInfo } from '@/components/features/viewer/ViewerFilterHUD';
import { type ElementProperties } from '@/components/features/viewer/ElementPropertiesPanel';
import { PlatformPanel, type ModelInfo, type VerificationSummary, type TypeClassificationItem } from '@/components/features/viewer/PlatformPanel';
import { ViewerToolbar, type ViewerTool, type ViewMode } from '@/components/features/viewer/ViewerToolbar';
import { TypeToolbar, SectionFloat, FilterHUD, CameraInfo, type ActiveFilter, type TypeFilterInfo } from '@/components/features/viewer/CanvasOverlays';
import { IFCPropertiesPanel } from '@/components/features/viewer/IFCPropertiesPanel';
import { AddModelsDialog } from '@/components/features/viewers/AddModelsDialog';

// Discipline detection from model filename
function detectDiscipline(name: string): 'ARK' | 'RIB' | 'RIV' | 'RIE' | undefined {
  const upper = name.toUpperCase();
  if (upper.includes('_ARK') || upper.includes('-ARK')) return 'ARK';
  if (upper.includes('_RIB') || upper.includes('-RIB')) return 'RIB';
  if (upper.includes('_RIV') || upper.includes('-RIV') || upper.includes('_VVS') || upper.includes('-VVS')) return 'RIV';
  if (upper.includes('_RIE') || upper.includes('-RIE') || upper.includes('_EL') || upper.includes('-EL')) return 'RIE';
  return undefined;
}

export default function FederatedViewer() {
  const { id: projectId, groupId } = useParams<{ id: string; groupId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: project } = useProject(projectId!);
  const { data: group, isLoading } = useViewerGroup(groupId!);

  // Viewer ref
  const viewerRef = useRef<UnifiedBIMViewerHandle>(null);

  // Dialog
  const [isAddModelsDialogOpen, setIsAddModelsDialogOpen] = useState(false);

  // Model visibility
  const [modelVisibility, setModelVisibility] = useState<Record<string, boolean>>({});

  // Toolbar state
  const [activeTool, setActiveTool] = useState<ViewerTool>('select');
  const [viewMode, setViewMode] = useState<ViewMode>('perspective');

  // Section planes
  const [sectionPlanes, setSectionPlanes] = useState<SectionPlane[]>([]);
  const [activePlaneId, setActivePlaneId] = useState<string | null>(null);

  // Selected element
  const [selectedElement, setSelectedElement] = useState<ElementProperties | null>(null);

  // Type filters (from viewer)
  const [typeFilters, setTypeFilters] = useState<TypeInfo[]>([]);

  // Storey selection
  const [selectedStoreyId, setSelectedStoreyId] = useState<string | null>(null);

  // Active filters for HUD
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);

  // Initialize model visibility when group loads
  useEffect(() => {
    if (group?.models && Object.keys(modelVisibility).length === 0) {
      setModelVisibility(Object.fromEntries(group.models.map(m => [m.id, m.is_visible ?? true])));
    }
  }, [group]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──

  const handleModelVisibilityToggle = useCallback((modelId: string) => {
    setModelVisibility(prev => ({ ...prev, [modelId]: !prev[modelId] }));
  }, []);

  const handleToggleType = useCallback((type: string) => {
    setTypeFilters(prev =>
      prev.map(f => (f.type === type ? { ...f, visible: !f.visible } : f))
    );
  }, []);

  const handleShowAllTypes = useCallback(() => {
    setTypeFilters(prev => prev.map(f => ({ ...f, visible: true })));
  }, []);

  const handleTypesDiscovered = useCallback((types: TypeInfo[]) => {
    setTypeFilters(types);
  }, []);

  const handleSelectPlane = useCallback((id: string | null) => {
    setActivePlaneId(id);
    viewerRef.current?.setActiveSectionPlane(id);
  }, []);

  const handleDeletePlane = useCallback((id: string) => {
    viewerRef.current?.deleteSectionPlane(id);
  }, []);

  const handleSelectStorey = useCallback((_modelId: string, storeyId: string | null) => {
    setSelectedStoreyId(storeyId);
    // TODO: Filter viewer to show only this storey's elements
  }, []);

  const handleFitView = useCallback(() => {
    // TODO: Call viewer's fitToView when implemented
  }, []);

  const handleRemoveFilter = useCallback((id: string) => {
    setActiveFilters(prev => prev.filter(f => f.id !== id));
  }, []);

  const handleClearFilters = useCallback(() => {
    setActiveFilters([]);
    setSelectedStoreyId(null);
    setTypeFilters(prev => prev.map(f => ({ ...f, visible: true })));
  }, []);

  // ── Derived data ──

  // Build filter pills from hidden types + storey selection
  const computedFilters: ActiveFilter[] = [
    ...activeFilters,
    ...typeFilters
      .filter(f => !f.visible)
      .map(f => ({ id: `type-${f.type}`, label: `-${f.type.replace('Ifc', '')}` })),
  ];
  if (selectedStoreyId) {
    computedFilters.unshift({ id: 'storey', label: selectedStoreyId });
  }

  // Convert type filters for canvas overlay
  const typeFilterInfos: TypeFilterInfo[] = typeFilters.map(f => ({
    type: f.type,
    visible: f.visible,
    count: f.count,
  }));

  // Build model info for platform panel
  const platformModels: ModelInfo[] = (group?.models || []).map(m => ({
    id: m.id,
    name: m.model.slice(0, 20), // Will be replaced with actual model name from API
    discipline: detectDiscipline(m.model),
    visible: modelVisibility[m.id] ?? true,
    elementCount: undefined, // TODO: get from viewer after model load
    storeys: [], // TODO: get from OBC.Classifier after fragment load
  }));

  // Placeholder verification (will come from API)
  const verification: VerificationSummary | undefined = undefined;

  // Placeholder type classification (will come from API)
  const typeClassification: TypeClassificationItem[] | undefined = undefined;

  // Visible model/element counts for camera info
  const visibleModelCount = platformModels.filter(m => m.visible).length;
  const visibleElementCount = typeFilters.reduce((sum, f) => sum + (f.visible ? f.count : 0), 0);

  // Breadcrumb
  const breadcrumb: string[] = [];
  if (selectedElement) {
    if (selectedElement.storey) breadcrumb.push(selectedElement.storey);
    const elemName = selectedElement.name || selectedElement.objectType || selectedElement.type;
    if (elemName) breadcrumb.push(elemName);
  }

  // ── Loading / Error states ──

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--viewer-bg)]">
        <div className="text-text-secondary text-sm">{t('viewer.loading')}</div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--viewer-bg)]">
        <div className="text-center">
          <div className="text-red-400 mb-2 text-sm">{t('viewer.groupNotFound')}</div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/projects/${projectId}/viewer-groups`)}
          >
            {t('viewer.backToGroups')}
          </Button>
        </div>
      </div>
    );
  }

  // ── Render ──

  return (
    <div className="h-screen w-screen grid grid-cols-[280px_1fr_300px] grid-rows-[3px_1fr] overflow-hidden">
      {/* Top accent bar */}
      <div className="col-span-full bg-gradient-to-r from-[var(--accent)] via-[var(--forest)] to-[var(--navy)]" />

      {/* LEFT: Platform Layer */}
      <PlatformPanel
        projectName={project?.name || group.name}
        models={platformModels}
        verification={verification}
        typeClassification={typeClassification}
        selectedStoreyId={selectedStoreyId}
        onBack={() => navigate(`/projects/${projectId}/viewer-groups`)}
        onToggleModelVisibility={handleModelVisibilityToggle}
        onSelectStorey={handleSelectStorey}
      />

      {/* CENTER: Canvas + Toolbar */}
      <div className="relative flex flex-col bg-[var(--viewer-bg)] min-h-0 min-w-0">
        {/* Toolbar */}
        <ViewerToolbar
          activeTool={activeTool}
          viewMode={viewMode}
          sectionPlaneCount={sectionPlanes.length}
          breadcrumb={breadcrumb.length > 0 ? breadcrumb : undefined}
          onToolChange={setActiveTool}
          onViewModeChange={setViewMode}
          onFitView={handleFitView}
        />

        {/* Canvas area */}
        <div className="flex-1 relative min-h-0 overflow-hidden">
          {group.models && group.models.length > 0 ? (
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

              {/* Canvas overlays */}
              {typeFilterInfos.length > 0 && (
                <TypeToolbar
                  types={typeFilterInfos}
                  onToggle={handleToggleType}
                  onShowAll={handleShowAllTypes}
                />
              )}

              <SectionFloat
                planes={sectionPlanes}
                activePlaneId={activePlaneId}
                onSelectPlane={handleSelectPlane}
                onDeletePlane={handleDeletePlane}
              />

              {computedFilters.length > 0 && (
                <FilterHUD
                  filters={computedFilters}
                  onRemoveFilter={handleRemoveFilter}
                  onClearAll={handleClearFilters}
                />
              )}

              <CameraInfo
                visibleModelCount={visibleModelCount}
                visibleElementCount={visibleElementCount}
                viewMode={t(`viewer.toolbar.${viewMode}`)}
              />
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-text-tertiary">
              <div className="text-center">
                <Layers className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t('viewer.noModels')}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setIsAddModelsDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {t('viewer.addModels')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: IFC Properties */}
      <IFCPropertiesPanel element={selectedElement} />

      {/* Add Models Dialog */}
      <AddModelsDialog
        isOpen={isAddModelsDialogOpen}
        onClose={() => setIsAddModelsDialogOpen(false)}
        groupId={groupId!}
        projectId={projectId!}
        existingModelIds={group.models?.map(m => m.model) || []}
      />
    </div>
  );
}
