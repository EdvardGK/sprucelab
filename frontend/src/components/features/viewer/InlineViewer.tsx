import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, Monitor, Crosshair, Loader2 } from 'lucide-react';
import { useTypeInstances } from '@/hooks/use-warehouse';
import { useInstanceDetail } from '@/hooks/useInstanceDetail';
import { useInstanceGeometry } from '@/hooks/useInstanceGeometry';
import HUDScene, { type RenderMode } from '../warehouse/instance-hud/HUDScene';
import {
  IdentityBadge,
  ViewControls,
  QuantitiesPanel,
  LocationPanel,
  InstanceNav,
  GeometryLoadingOverlay,
  NoGeometryOverlay,
} from '../warehouse/instance-hud/HUDOverlays';

// Lazy-load the heavy ThatOpen viewer for Model mode
const TypeInstanceViewer = lazy(() =>
  import('../warehouse/TypeInstanceViewer').then((m) => ({
    default: m.TypeInstanceViewer,
  }))
);

type ViewMode = 'hud' | 'model';

interface InlineViewerProps {
  modelId: string;
  typeId: string | null;
  typeName?: string | null;
  ifcType?: string | null;
  className?: string;
}

export function InlineViewer({
  modelId,
  typeId,
  typeName,
  ifcType,
  className,
}: InlineViewerProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ViewMode>('hud');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [renderMode, setRenderMode] = useState<RenderMode>('solid');
  const [resetTrigger, setResetTrigger] = useState(0);

  // Fetch instance list for type
  const { data: instanceData, error: instanceError } = useTypeInstances(typeId);
  const instances = instanceData?.instances || [];
  const totalCount = instanceData?.total_count || 0;

  // Current instance
  const currentInstance = instances[currentIndex] || null;
  const currentGuid = currentInstance?.ifc_guid || null;

  // HUD data hooks (only active in HUD mode to avoid unnecessary fetches)
  const { data: detail, isLoading: detailLoading } = useInstanceDetail(
    modelId,
    mode === 'hud' ? currentGuid : null
  );
  const { data: geometry, isLoading: geometryLoading, error: geometryError } = useInstanceGeometry(
    modelId,
    mode === 'hud' ? currentGuid : null
  );

  // Debug: log data flow
  console.log('[InlineViewer]', {
    typeId, modelId, mode,
    instanceCount: instances.length,
    currentGuid,
    hasGeometry: !!geometry,
    geometryLoading,
    geometryError: geometryError?.message,
    instanceError: instanceError?.message,
  });

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
        case 's':
        case 'S':
          if (mode === 'hud') setRenderMode('solid');
          break;
        case 'w':
        case 'W':
          if (mode === 'hud') setRenderMode('wireframe');
          break;
        case 'r':
        case 'R':
          if (mode === 'hud') handleResetCamera();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext, handleResetCamera, mode]);

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

  return (
    <div className={`relative h-full bg-zinc-950 overflow-hidden ${className || ''}`}>
      {/* Mode Toggle */}
      <ModeToggle mode={mode} onModeChange={setMode} />

      {/* HUD Mode */}
      {mode === 'hud' && (
        <>
          <HUDScene
            geometry={geometry ?? null}
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
        </>
      )}

      {/* Model Mode */}
      {mode === 'model' && (
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 text-white/40 animate-spin" />
            </div>
          }
        >
          <TypeInstanceViewer
            modelId={modelId}
            typeId={typeId}
            className="h-full"
          />
        </Suspense>
      )}

      {/* Shared Instance Navigation (both modes) */}
      {totalCount > 0 && (
        <InstanceNav
          currentIndex={currentIndex}
          totalCount={totalCount}
          onPrev={goToPrev}
          onNext={goToNext}
          onSeeInModel={() => setMode('model')}
        />
      )}
    </div>
  );
}

// --- Mode Toggle (top-center, above other overlays) ---

function ModeToggle({
  mode,
  onModeChange,
}: {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center bg-black/60 backdrop-blur-md rounded-full border border-white/10 shadow-lg p-0.5">
      <button
        onClick={() => onModeChange('hud')}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-colors ${
          mode === 'hud'
            ? 'bg-cyan-400/20 text-cyan-400'
            : 'text-white/50 hover:text-white/80'
        }`}
      >
        <Crosshair className="h-3.5 w-3.5" />
        {t('inlineViewer.hud')}
      </button>
      <button
        onClick={() => onModeChange('model')}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-colors ${
          mode === 'model'
            ? 'bg-cyan-400/20 text-cyan-400'
            : 'text-white/50 hover:text-white/80'
        }`}
      >
        <Monitor className="h-3.5 w-3.5" />
        {t('inlineViewer.model')}
      </button>
    </div>
  );
}
