import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers } from 'lucide-react';
import { useTypeInstances } from '@/hooks/use-warehouse';
import { useInstanceDetail } from '@/hooks/useInstanceDetail';
import { useInstanceGeometry } from '@/hooks/useInstanceGeometry';
import HUDScene, { type RenderMode } from './HUDScene';
import {
  IdentityBadge,
  ViewControls,
  QuantitiesPanel,
  LocationPanel,
  InstanceNav,
  GeometryLoadingOverlay,
  NoGeometryOverlay,
} from './HUDOverlays';

interface InstanceHUDProps {
  modelId: string;
  typeId: string | null;
  typeName?: string | null;
  ifcType?: string | null;
  className?: string;
  onSeeInModel?: (instanceGuid: string) => void;
}

export default function InstanceHUD({
  modelId,
  typeId,
  typeName,
  ifcType,
  className,
  onSeeInModel,
}: InstanceHUDProps) {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [renderMode, setRenderMode] = useState<RenderMode>('solid');
  const [resetTrigger, setResetTrigger] = useState(0);

  // Fetch instance list for type
  const { data: instanceData } = useTypeInstances(typeId);
  const instances = instanceData?.instances || [];
  const totalCount = instanceData?.total_count || 0;

  // Current instance
  const currentInstance = instances[currentIndex] || null;
  const currentGuid = currentInstance?.ifc_guid || null;

  // Fetch detail + geometry for current instance
  const { data: detail, isLoading: detailLoading } = useInstanceDetail(modelId, currentGuid);
  const { data: geometry, isLoading: geometryLoading } = useInstanceGeometry(modelId, currentGuid);

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

  const handleSeeInModel = useCallback(() => {
    if (currentGuid && onSeeInModel) {
      onSeeInModel(currentGuid);
    }
  }, [currentGuid, onSeeInModel]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
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
          setRenderMode('solid');
          break;
        case 'w':
        case 'W':
          setRenderMode('wireframe');
          break;
        case 'r':
        case 'R':
          handleResetCamera();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext, handleResetCamera]);

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
      {/* 3D Scene */}
      <HUDScene
        geometry={geometry ?? null}
        renderMode={renderMode}
        isLoading={geometryLoading}
        resetTrigger={resetTrigger}
      />

      {/* Loading / No Geometry overlays */}
      {geometryLoading && currentGuid && <GeometryLoadingOverlay />}
      {!geometryLoading && !geometry && currentGuid && <NoGeometryOverlay />}

      {/* HUD Overlays */}
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

      {totalCount > 0 && (
        <InstanceNav
          currentIndex={currentIndex}
          totalCount={totalCount}
          onPrev={goToPrev}
          onNext={goToNext}
          onSeeInModel={handleSeeInModel}
        />
      )}
    </div>
  );
}
