import { useState, useCallback, useEffect, useMemo, lazy, memo, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, Loader2 } from 'lucide-react';
import { useTypeInstances, type TypeDefinitionLayer } from '@/hooks/use-warehouse';
import { useInstanceDetail } from '@/hooks/useInstanceDetail';
import { useInstanceGeometry } from '@/hooks/useInstanceGeometry';
import { useInstanceProfile } from '@/hooks/useInstanceProfile';
import HUDScene, { type ViewDimension, type RenderMode } from '../warehouse/instance-hud/HUDScene';
import {
  IdentityBadge,
  ViewControls,
  QuantitiesPanel,
  LocationPanel,
  InstanceNav,
  GeometryLoadingOverlay,
  NoGeometryOverlay,
} from '../warehouse/instance-hud/HUDOverlays';

// Lazy-load the heavy ThatOpen viewer for "See in Model".
// All three pages now share UnifiedBIMViewer; type-page isolation is a prop.
const UnifiedBIMViewer = lazy(() =>
  import('./UnifiedBIMViewer').then((m) => ({ default: m.UnifiedBIMViewer }))
);

interface InlineViewerProps {
  modelId: string;
  typeId: string | null;
  typeName?: string | null;
  ifcType?: string | null;
  definitionLayers?: TypeDefinitionLayer[];
  className?: string;
}

function InlineViewerImpl({
  modelId,
  typeId,
  typeName,
  ifcType,
  definitionLayers,
  className,
}: InlineViewerProps) {
  const { t } = useTranslation();
  const [viewDimension, setViewDimension] = useState<ViewDimension>('3d');
  const [renderMode, setRenderMode] = useState<RenderMode>('solid');
  const [showModel, setShowModel] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [resetTrigger, setResetTrigger] = useState(0);

  // Fetch instance list for type
  const { data: instanceData, error: instanceError } = useTypeInstances(typeId);
  const instances = instanceData?.instances || [];
  const totalCount = instanceData?.total_count || 0;

  // Current instance
  const currentInstance = instances[currentIndex] || null;
  const currentGuid = currentInstance?.ifc_guid || null;

  // Data hooks (only fetch when not in full-model view)
  const { data: detail, isLoading: detailLoading } = useInstanceDetail(
    modelId,
    !showModel ? currentGuid : null
  );
  const { data: geometry, isLoading: geometryLoading, error: geometryError } = useInstanceGeometry(
    modelId,
    !showModel ? currentGuid : null
  );
  const { data: profileData } = useInstanceProfile(
    modelId,
    !showModel ? currentGuid : null
  );

  if (import.meta.env.DEV) {
    console.log('[InlineViewer]', {
      typeId, modelId, viewDimension, showModel,
      instanceCount: instances.length,
      currentGuid,
      hasGeometry: !!geometry,
      geometryLoading,
      geometryError: geometryError?.message,
      instanceError: instanceError?.message,
    });
  }

  // Reset index when type changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [typeId]);

  // Navigation
  const goToPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(totalCount - 1, i + 1));
  }, [totalCount]);

  const handleResetCamera = useCallback(() => {
    setResetTrigger((n) => n + 1);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          goToPrev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          goToNext();
          break;
        case '2':
          if (!showModel) setViewDimension('2d');
          break;
        case '3':
          if (!showModel) setViewDimension('3d');
          break;
        case 's':
        case 'S':
          if (!showModel) setRenderMode('solid');
          break;
        case 'w':
        case 'W':
          if (!showModel) setRenderMode('wireframe');
          break;
        case 'r':
        case 'R':
          if (!showModel) handleResetCamera();
          break;
        case 'Escape':
          if (showModel) setShowModel(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext, handleResetCamera, showModel]);

  // Empty state: no type selected
  if (!typeId) {
    return (
      <div className={`flex flex-col items-center justify-center h-full bg-zinc-950 ${className || ''}`}>
        <Layers className="h-8 w-8 text-white/20 mb-3" />
        <p className="text-sm text-white/40">{t('typeLibrary.selectTypeToPreview')}</p>
      </div>
    );
  }

  // Empty state: no instances
  if (instanceData && totalCount === 0) {
    return (
      <div className={`flex flex-col items-center justify-center h-full bg-zinc-950 ${className || ''}`}>
        <Layers className="h-8 w-8 text-white/20 mb-3" />
        <p className="text-sm text-white/40">{t('instanceHUD.noInstances')}</p>
      </div>
    );
  }

  // Full-model view: render the unified viewer with GUID isolation pinned to
  // this type's instances. Prev/next is just incrementing currentIndex which
  // updates the isolation prop — no imperative API call needed.
  if (showModel) {
    return (
      <div className={`relative h-full bg-zinc-950 overflow-hidden ${className || ''}`}>
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 text-white/40 animate-spin" />
            </div>
          }
        >
          <ShowModelViewer
            modelId={modelId}
            instances={instances}
            currentIndex={currentIndex}
          />
        </Suspense>
        {/* Back button */}
        <button
          onClick={() => setShowModel(false)}
          className="absolute top-3 left-3 z-20 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 shadow-lg px-3 py-1.5 text-xs text-white/60 hover:text-white/90 transition-colors"
        >
          {t('common.back')}
        </button>
        {/* Instance nav still works — see InstanceNav rendered below the model view? */}
        {/* Match TypeInstanceViewer's UX: keep prev/next available while in model view */}
        {totalCount > 0 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20">
            <InstanceNav
              currentIndex={currentIndex}
              totalCount={totalCount}
              onPrev={goToPrev}
              onNext={goToNext}
              onSeeInModel={() => setShowModel(false)}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`relative h-full bg-zinc-950 overflow-hidden ${className || ''}`}>
      {/* 2D/3D Toggle */}
      <DimensionToggle dimension={viewDimension} onDimensionChange={setViewDimension} />

      {/* Three.js Scene (handles both 2D and 3D) */}
      <HUDScene
        geometry={geometry ?? null}
        profileData={profileData ?? null}
        definitionLayers={definitionLayers}
        viewDimension={viewDimension}
        renderMode={renderMode}
        resetTrigger={resetTrigger}
      />

      {geometryLoading && currentGuid && <GeometryLoadingOverlay />}
      {!geometryLoading && !geometry && currentGuid && <NoGeometryOverlay />}

      <IdentityBadge
        ifcType={ifcType || currentInstance?.ifc_type || null}
        typeName={typeName || null}
        instanceName={currentInstance?.name || null}
        guid={currentGuid}
      />

      <ViewControls
        renderMode={renderMode}
        onRenderModeChange={setRenderMode}
        onResetCamera={handleResetCamera}
      />

      <QuantitiesPanel detail={detail ?? null} isLoading={detailLoading} />

      <LocationPanel
        storey={currentInstance?.storey_id || null}
        detail={detail ?? null}
      />

      {/* Instance Navigation */}
      {totalCount > 0 && (
        <InstanceNav
          currentIndex={currentIndex}
          totalCount={totalCount}
          onPrev={goToPrev}
          onNext={goToNext}
          onSeeInModel={() => setShowModel(true)}
        />
      )}
    </div>
  );
}

export const InlineViewer = memo(InlineViewerImpl);

// --- 2D/3D Toggle (top-center) ---

function DimensionToggle({
  dimension,
  onDimensionChange,
}: {
  dimension: ViewDimension;
  onDimensionChange: (dim: ViewDimension) => void;
}) {
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center bg-black/60 backdrop-blur-md rounded-full border border-white/10 shadow-lg p-0.5">
      <button
        onClick={() => onDimensionChange('2d')}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
          dimension === '2d'
            ? 'bg-cyan-400/20 text-cyan-400'
            : 'text-white/50 hover:text-white/80'
        }`}
      >
        2D
      </button>
      <button
        onClick={() => onDimensionChange('3d')}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
          dimension === '3d'
            ? 'bg-cyan-400/20 text-cyan-400'
            : 'text-white/50 hover:text-white/80'
        }`}
      >
        3D
      </button>
    </div>
  );
}

// --- Show-model wrapper ---
// Renders the unified BIM viewer with GUID isolation pinned to the type's
// instances. Replaces the old standalone TypeInstanceViewer.
function ShowModelViewer({
  modelId,
  instances,
  currentIndex,
}: {
  modelId: string;
  instances: { ifc_guid: string }[];
  currentIndex: number;
}) {
  const isolation = useMemo(
    () => ({
      guids: instances.map((i) => i.ifc_guid),
      mode: 'single' as const,
      currentGuid: instances[currentIndex]?.ifc_guid ?? null,
      zoomOnChange: true,
    }),
    [instances, currentIndex]
  );

  return (
    <UnifiedBIMViewer
      modelId={modelId}
      isolation={isolation}
      showPropertiesPanel={true}
      showModelInfo={false}
      showControls={false}
      showFilterHUD={false}
    />
  );
}
