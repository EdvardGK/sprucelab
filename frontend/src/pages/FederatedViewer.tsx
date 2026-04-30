/**
 * FederatedViewer — Full-screen BIM model viewer
 *
 * Layout: Left panel (Platform) | Center (Canvas + HUD + Status) | Right panel (IFC Properties)
 * No global sidebar — viewer owns the entire screen.
 *
 * Left:   What Sprucelab knows (models, verification, type classification)
 * Center: 3D canvas with floating HUD toolbar (bottom-center) and status panel (bottom-right)
 * Right:  What the IFC file says (quantities, key props, psets, materials)
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Layers, AlertTriangle } from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { useViewerGroup } from '@/hooks/use-viewer-groups';
import { useModels } from '@/hooks/use-models';
import { Button } from '@/components/ui/button';
import { UnifiedBIMViewer, type SectionPlane, type UnifiedBIMViewerHandle } from '@/components/features/viewer/UnifiedBIMViewer';
import { type TypeInfo } from '@/components/features/viewer/ViewerFilterHUD';
import { type ElementProperties } from '@/components/features/viewer/ElementPropertiesPanel';
import { PlatformPanel, type ModelInfo, type VerificationSummary, type TypeClassificationItem } from '@/components/features/viewer/PlatformPanel';
import {
  SectionFloat,
  ViewerHUD,
  CanvasStatusPanel,
  type ActiveFilter,
  type ViewerTool,
  type ViewMode,
} from '@/components/features/viewer/CanvasOverlays';
import { ViewerFilterPanel } from '@/components/features/viewer/ViewerFilterPanel';
import { useViewerFilterStore, deriveTypeVisibility } from '@/stores/useViewerFilterStore';
import { useViewerFilterUrl } from '@/hooks/useViewerFilterUrl';
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
  const { data: models } = useModels(projectId);

  // Viewer ref
  const viewerRef = useRef<UnifiedBIMViewerHandle>(null);

  // Dialog
  const [isAddModelsDialogOpen, setIsAddModelsDialogOpen] = useState(false);

  // Model visibility
  const [modelVisibility, setModelVisibility] = useState<Record<string, boolean>>({});

  // Toolbar state (now owned here, passed to HUD)
  const [activeTool, setActiveTool] = useState<ViewerTool>('select');
  const [viewMode, setViewMode] = useState<ViewMode>('perspective');

  // Section planes
  const [sectionPlanes, setSectionPlanes] = useState<SectionPlane[]>([]);
  const [activePlaneId, setActivePlaneId] = useState<string | null>(null);

  // Selected element
  const [selectedElement, setSelectedElement] = useState<ElementProperties | null>(null);

  // Discovered types/storeys from the viewer (used to populate filter panel)
  const [discoveredTypes, setDiscoveredTypes] = useState<TypeInfo[]>([]);
  const [discoveredStoreys, setDiscoveredStoreys] = useState<{ name: string; count: number }[]>([]);

  // Filter panel state — collapsed/expanded
  const [filterPanelCollapsed, setFilterPanelCollapsed] = useState(false);

  // Filter store — single source of truth for what's visible
  const hiddenIfcClasses = useViewerFilterStore((s) => s.hiddenIfcClasses);
  const storeyFilter = useViewerFilterStore((s) => s.storey);
  const setScope = useViewerFilterStore((s) => s.setScope);
  useViewerFilterUrl();

  // Active filters for status panel (manual additions, not auto-derived)
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);

  // Model load errors
  const [loadErrors, setLoadErrors] = useState<string[]>([]);

  // Reset filter scope when project changes (so switching projects clears facets).
  useEffect(() => {
    if (projectId) setScope(projectId);
  }, [projectId, setScope]);

  // Memoize props passed to UnifiedBIMViewer. Without these, every FederatedViewer
  // re-render produces new object/array references, which makes UnifiedBIMViewer's
  // useEffect dependencies fire and re-run expensive hider operations across
  // tens of thousands of GUIDs — blowing the rAF budget on every interaction.
  const modelIdList = useMemo(
    () => group?.models?.map(m => m.model) ?? [],
    [group?.models]
  );
  const typeVisibilityMap = useMemo(
    () => deriveTypeVisibility(discoveredTypes.map((t) => t.type), hiddenIfcClasses),
    [discoveredTypes, hiddenIfcClasses]
  );

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

  const handleTypesDiscovered = useCallback((types: TypeInfo[]) => {
    setDiscoveredTypes(types);
  }, []);

  const handleStoreysDiscovered = useCallback((storeys: { name: string; count: number }[]) => {
    setDiscoveredStoreys(storeys);
  }, []);

  const handleSelectPlane = useCallback((id: string | null) => {
    setActivePlaneId(id);
    viewerRef.current?.setActiveSectionPlane(id);
  }, []);

  const handleDeletePlane = useCallback((id: string) => {
    viewerRef.current?.deleteSectionPlane(id);
  }, []);

  const handleSelectStorey = useCallback((_modelId: string, storeyId: string | null) => {
    useViewerFilterStore.getState().setStorey(storeyId);
  }, []);

  const handleFitView = useCallback(() => {
    viewerRef.current?.fitToView();
  }, []);

  const handleRemoveFilter = useCallback((id: string) => {
    if (id === 'storey') {
      useViewerFilterStore.getState().setStorey(null);
      return;
    }
    if (id.startsWith('type-')) {
      useViewerFilterStore.getState().toggleIfcClass(id.slice(5));
      return;
    }
    setActiveFilters(prev => prev.filter(f => f.id !== id));
  }, []);

  const handleClearFilters = useCallback(() => {
    setActiveFilters([]);
    useViewerFilterStore.getState().reset();
  }, []);

  // ── Derived data ──

  // Build filter pills from hidden types + storey selection
  const computedFilters: ActiveFilter[] = [
    ...activeFilters,
    ...hiddenIfcClasses.map((cls) => ({ id: `type-${cls}`, label: `−${cls.replace('Ifc', '')}` })),
  ];
  if (storeyFilter) {
    computedFilters.unshift({ id: 'storey', label: storeyFilter });
  }

  // Build model info for platform panel
  const modelLookup = new Map((models || []).map(m => [m.id, m]));
  const platformModels: ModelInfo[] = (group?.models || []).map(m => {
    const modelData = modelLookup.get(m.model);
    const displayName = modelData?.name || modelData?.original_filename || m.model;
    return {
      id: m.id,
      name: displayName,
      discipline: detectDiscipline(displayName),
      visible: modelVisibility[m.id] ?? true,
      elementCount: modelData?.element_count,
      storeys: [], // TODO: get from OBC.Classifier after fragment load
    };
  });

  // Placeholder verification (will come from API)
  const verification: VerificationSummary | undefined = undefined;

  // Placeholder type classification (will come from API)
  const typeClassification: TypeClassificationItem[] | undefined = undefined;

  // Visible model/element counts for status panel
  const visibleModelCount = platformModels.filter(m => m.visible).length;
  const visibleElementCount = discoveredTypes.reduce(
    (sum, t) => sum + (hiddenIfcClasses.includes(t.type) ? 0 : t.count),
    0,
  );

  // View mode label for status panel
  const viewModeLabel = t(`viewer.toolbar.${viewMode}`);

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
        selectedStoreyId={storeyFilter}
        onBack={() => navigate(`/projects/${projectId}/viewer-groups`)}
        onToggleModelVisibility={handleModelVisibilityToggle}
        onSelectStorey={handleSelectStorey}
      />

      {/* CENTER: Canvas + Floating Overlays */}
      <div className="relative flex flex-col bg-[var(--viewer-bg)] min-h-0 min-w-0">
        {/* Canvas area (no toolbar — tools are in the HUD) */}
        <div className="flex-1 relative min-h-0 overflow-hidden">
          {group.models && group.models.length > 0 ? (
            <>
              <UnifiedBIMViewer
                ref={viewerRef}
                modelIds={modelIdList}
                modelVisibility={modelVisibility}
                showPropertiesPanel={false}
                showModelInfo={false}
                showControls={false}
                showFilterHUD={false}
                onSectionPlanesChange={setSectionPlanes}
                onSelectionChange={setSelectedElement}
                onTypesDiscovered={handleTypesDiscovered}
                onStoreysDiscovered={handleStoreysDiscovered}
                typeVisibility={typeVisibilityMap}
                storeyFilter={storeyFilter}
                onError={(err) => setLoadErrors(prev => [...prev, err])}
              />

              {/* Model load error banner */}
              {loadErrors.length > 0 && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 max-w-md">
                  <div className="bg-red-900/90 backdrop-blur-sm border border-red-700/50 rounded-lg px-4 py-3 text-white text-sm">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-300" />
                      <div>
                        <p className="font-medium text-red-100">{t('viewer.loadErrors.title')}</p>
                        {loadErrors.map((err, i) => (
                          <p key={i} className="text-red-300 text-xs mt-1">{err}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Filter panel (left edge, replaces old TypeToolbar) */}
              {discoveredTypes.length > 0 && (
                <ViewerFilterPanel
                  types={discoveredTypes}
                  storeys={discoveredStoreys}
                  collapsed={filterPanelCollapsed}
                  onCollapseToggle={() => setFilterPanelCollapsed((v) => !v)}
                />
              )}

              {/* Section planes float (top-right) */}
              <SectionFloat
                planes={sectionPlanes}
                activePlaneId={activePlaneId}
                onSelectPlane={handleSelectPlane}
                onDeletePlane={handleDeletePlane}
              />

              {/* HUD toolbar (bottom-center, tools only) */}
              <ViewerHUD
                activeTool={activeTool}
                viewMode={viewMode}
                sectionPlaneCount={sectionPlanes.length}
                onToolChange={setActiveTool}
                onViewModeChange={(mode) => {
                  setViewMode(mode);
                  viewerRef.current?.setViewMode(mode);
                }}
                onFitView={handleFitView}
              />

              {/* Status panel (bottom-right, single frame) */}
              <CanvasStatusPanel
                filters={computedFilters}
                planes={sectionPlanes}
                activePlaneId={activePlaneId}
                visibleModelCount={visibleModelCount}
                visibleElementCount={visibleElementCount}
                viewMode={viewModeLabel}
                onRemoveFilter={handleRemoveFilter}
                onClearFilters={handleClearFilters}
                onSelectPlane={handleSelectPlane}
                onDeletePlane={handleDeletePlane}
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
