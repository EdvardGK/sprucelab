import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Copy,
  Check,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import type { ElementDetail } from '@/lib/ifc-service-client';

const hudPanel = 'bg-black/60 backdrop-blur-md rounded-lg border border-white/10 shadow-lg';

// --- Identity Badge (top-left) ---

interface IdentityBadgeProps {
  ifcType: string | null;
  typeName: string | null;
  instanceName: string | null;
  guid: string | null;
}

function IdentityBadge({ ifcType, typeName, instanceName, guid }: IdentityBadgeProps) {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();

  const copyGuid = () => {
    if (!guid) return;
    navigator.clipboard.writeText(guid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`absolute top-3 left-3 z-10 ${hudPanel} px-3 py-2 max-w-[280px]`}>
      {ifcType && (
        <span className="inline-block text-[10px] font-mono uppercase tracking-wider text-cyan-400/80 bg-cyan-400/10 px-1.5 py-0.5 rounded mb-1">
          {ifcType}
        </span>
      )}
      <div className="text-white/90 text-sm font-medium truncate">
        {typeName || instanceName || t('typeLibrary.unnamedType')}
      </div>
      {instanceName && typeName && instanceName !== typeName && (
        <div className="text-white/50 text-xs truncate">{instanceName}</div>
      )}
      {guid && (
        <button
          onClick={copyGuid}
          className="flex items-center gap-1 mt-1 text-[10px] font-mono text-white/40 hover:text-white/70 transition-colors"
          title={t('instanceHUD.copyGuid')}
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-400" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          {guid.slice(0, 12)}...
        </button>
      )}
    </div>
  );
}

// --- Reset Camera Button (top-right) ---

interface ResetCameraButtonProps {
  onResetCamera: () => void;
}

function ResetCameraButton({ onResetCamera }: ResetCameraButtonProps) {
  const { t } = useTranslation();

  return (
    <button
      onClick={onResetCamera}
      className={`absolute top-3 right-3 z-10 ${hudPanel} p-2 text-white/50 hover:text-white/80 transition-colors`}
      title={t('instanceHUD.resetCamera')}
    >
      <RotateCcw className="h-3.5 w-3.5" />
    </button>
  );
}

// --- Quantities Panel (bottom-left) ---

interface QuantitiesPanelProps {
  detail: ElementDetail | null;
  isLoading: boolean;
}

function QuantitiesPanel({ detail, isLoading }: QuantitiesPanelProps) {
  const { t } = useTranslation();
  const quantities = detail?.quantities;

  if (isLoading) {
    return (
      <div className={`absolute bottom-14 left-3 z-10 ${hudPanel} px-3 py-2`}>
        <Loader2 className="h-4 w-4 text-cyan-400/50 animate-spin" />
      </div>
    );
  }

  if (!quantities || Object.keys(quantities).length === 0) return null;

  // Map common quantity names
  const displayKeys: [string, string][] = [
    ['area', t('instanceHUD.area')],
    ['volume', t('instanceHUD.volume')],
    ['length', t('instanceHUD.length')],
    ['height', t('instanceHUD.height')],
  ];

  // Find matching quantities (case-insensitive, also check NetArea, GrossArea etc.)
  const found: { label: string; value: number; unit: string }[] = [];
  for (const [key, label] of displayKeys) {
    for (const [qName, qData] of Object.entries(quantities)) {
      const lower = qName.toLowerCase();
      if (lower === key || lower.endsWith(key) || lower.includes(key)) {
        found.push({ label, value: qData.value, unit: qData.unit });
        break;
      }
    }
  }

  if (found.length === 0) return null;

  return (
    <div className={`absolute bottom-14 left-3 z-10 ${hudPanel} px-3 py-2`}>
      <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1">
        {t('instanceHUD.quantities')}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {found.map((q) => (
          <div key={q.label} className="flex items-baseline gap-1.5">
            <span className="text-[10px] text-white/40">{q.label}</span>
            <span className="text-xs text-cyan-400 font-mono">
              {q.value < 0.01 ? q.value.toExponential(1) : q.value.toFixed(2)}
            </span>
            <span className="text-[10px] text-white/30">{q.unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Location Panel (bottom-right) ---

interface LocationPanelProps {
  storey: string | null;
  detail: ElementDetail | null;
}

function LocationPanel({ storey, detail }: LocationPanelProps) {
  const { t } = useTranslation();
  const displayStorey = storey || detail?.storey;

  if (!displayStorey) return null;

  return (
    <div className={`absolute bottom-14 right-3 z-10 ${hudPanel} px-3 py-2`}>
      <div className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">
        {t('instanceHUD.location')}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[10px] text-white/40">{t('instanceHUD.storey')}</span>
        <span className="text-xs text-white/80">{displayStorey}</span>
      </div>
    </div>
  );
}

// --- Instance Navigator (bottom-center) ---

interface InstanceNavProps {
  currentIndex: number;
  totalCount: number;
  onPrev: () => void;
  onNext: () => void;
  onSeeInModel: () => void;
}

function InstanceNav({ currentIndex, totalCount, onPrev, onNext, onSeeInModel }: InstanceNavProps) {
  const { t } = useTranslation();

  return (
    <div className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-10 ${hudPanel} px-2 py-1.5 flex items-center gap-2`}>
      <button
        onClick={onPrev}
        disabled={currentIndex <= 0}
        className="p-1 rounded text-white/60 hover:text-white/90 disabled:text-white/20 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <span className="text-xs text-white/70 font-mono min-w-[80px] text-center">
        {t('instanceHUD.instanceOf', {
          current: currentIndex + 1,
          total: totalCount,
        })}
      </span>

      <button
        onClick={onNext}
        disabled={currentIndex >= totalCount - 1}
        className="p-1 rounded text-white/60 hover:text-white/90 disabled:text-white/20 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      <div className="w-px h-4 bg-white/10" />

      <button
        onClick={onSeeInModel}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-white/60 hover:text-cyan-400 transition-colors"
      >
        <ExternalLink className="h-3 w-3" />
        {t('instanceHUD.seeInModel')}
      </button>
    </div>
  );
}

// --- Geometry Loading Indicator ---

function GeometryLoadingOverlay() {
  const { t } = useTranslation();
  return (
    <div className="absolute inset-0 z-5 flex items-center justify-center pointer-events-none">
      <div className={`${hudPanel} px-4 py-3 flex items-center gap-2`}>
        <Loader2 className="h-4 w-4 text-cyan-400 animate-spin" />
        <span className="text-xs text-white/60">{t('instanceHUD.loading3D')}</span>
      </div>
    </div>
  );
}

// --- No Geometry State ---

function NoGeometryOverlay() {
  const { t } = useTranslation();
  return (
    <div className="absolute inset-0 z-5 flex items-center justify-center pointer-events-none">
      <div className={`${hudPanel} px-4 py-3`}>
        <span className="text-xs text-white/40">{t('instanceHUD.noGeometry')}</span>
      </div>
    </div>
  );
}

export {
  IdentityBadge,
  ResetCameraButton,
  QuantitiesPanel,
  LocationPanel,
  InstanceNav,
  GeometryLoadingOverlay,
  NoGeometryOverlay,
};
