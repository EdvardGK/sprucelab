/**
 * PlatformPanel — Left panel in the federated viewer
 *
 * Shows what Sprucelab knows about the loaded models:
 * - Model list with discipline dots + storey tree
 * - Verification summary (traffic lights)
 * - Type classification status
 */

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──

export interface ModelInfo {
  id: string;
  name: string;
  discipline?: 'ARK' | 'RIB' | 'RIV' | 'RIE';
  version?: number;
  elementCount?: number;
  visible: boolean;
  storeys?: StoreyInfo[];
}

export interface StoreyInfo {
  id: string;
  name: string;
  elementCount: number;
}

export interface VerificationSummary {
  approved: number;
  warning: number;
  error: number;
}

export interface TypeClassificationItem {
  id: string;
  name: string;
  status: 'mapped' | 'pending' | 'review' | 'ignored' | 'followup';
  instanceCount: number;
}

interface PlatformPanelProps {
  projectName: string;
  models: ModelInfo[];
  verification?: VerificationSummary;
  typeClassification?: TypeClassificationItem[];
  selectedStoreyId?: string | null;
  onBack: () => void;
  onToggleModelVisibility: (modelId: string) => void;
  onSelectStorey?: (modelId: string, storeyId: string | null) => void;
  className?: string;
}

// ── Discipline dot colors (from design tokens) ──

const DISCIPLINE_CLASSES: Record<string, string> = {
  ARK: 'bg-[var(--disc-ark-text)]',
  RIB: 'bg-[var(--disc-rib-text)]',
  RIV: 'bg-[var(--disc-riv-text)]',
  RIE: 'bg-[var(--disc-rie-text)]',
};

// ── Component ──

export function PlatformPanel({
  projectName,
  models,
  verification,
  typeClassification,
  selectedStoreyId,
  onBack,
  onToggleModelVisibility,
  onSelectStorey,
  className,
}: PlatformPanelProps) {
  const { t } = useTranslation();

  const visibleCount = models.filter(m => m.visible).length;
  const totalElements = models
    .filter(m => m.visible)
    .reduce((sum, m) => sum + (m.elementCount ?? 0), 0);

  return (
    <div className={cn(
      'bg-card border-r border-border flex flex-col overflow-hidden',
      className,
    )}>
      {/* Header: back + project name */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border bg-surface-muted flex-shrink-0">
        <button
          onClick={onBack}
          className="w-6 h-6 flex items-center justify-center border border-border rounded bg-white text-text-secondary hover:border-primary hover:text-primary transition-colors flex-shrink-0"
          title={t('common.back')}
        >
          <ChevronLeft className="w-3 h-3" />
        </button>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-text-primary truncate">
            {projectName}
          </div>
          <div className="text-[9.5px] text-text-tertiary">
            {models.length} {t('viewer.platform.models').toLowerCase()} &middot; {totalElements.toLocaleString('nb-NO')} {t('viewer.platform.elements')}
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Models section */}
        <SectionHeader label={t('viewer.platform.models')} count={models.length} />
        <div>
          {models.map(model => (
            <ModelRow
              key={model.id}
              model={model}
              selectedStoreyId={selectedStoreyId}
              onToggleVisibility={onToggleModelVisibility}
              onSelectStorey={onSelectStorey}
            />
          ))}
        </div>

        <div className="h-px bg-border mx-0 my-0.5" />

        {/* Verification summary */}
        {verification && (
          <>
            <SectionHeader label={t('viewer.platform.verification')} />
            <div className="grid grid-cols-3 gap-px bg-black/[0.03] mx-2.5 mb-2 rounded overflow-hidden">
              <VerifCell value={verification.approved} label={t('viewer.platform.approved')} variant="ok" />
              <VerifCell value={verification.warning} label={t('viewer.platform.warning')} variant="warn" />
              <VerifCell value={verification.error} label={t('viewer.platform.error')} variant="fail" />
            </div>
            <div className="h-px bg-border mx-0 my-0.5" />
          </>
        )}

        {/* Type classification */}
        {typeClassification && typeClassification.length > 0 && (
          <>
            <SectionHeader label={t('viewer.platform.typeClassification')} count={typeClassification.length} />
            <div>
              {typeClassification.map(item => (
                <TypeRow key={item.id} item={item} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-2.5 py-1 border-t border-border text-[9px] text-text-tertiary bg-surface-muted flex-shrink-0">
        <span>
          <strong className="text-text-secondary font-semibold">{visibleCount}</strong> {t('viewer.platform.visible')} &middot;{' '}
          <strong className="text-text-secondary font-semibold">{totalElements.toLocaleString('nb-NO')}</strong> {t('viewer.platform.elements')}
        </span>
      </div>
    </div>
  );
}

// ── Sub-components ──

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-1 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider text-text-tertiary border-b border-black/[0.04] cursor-pointer select-none">
      <ChevronDown className="w-[9px] h-[9px]" />
      {label}
      {count != null && (
        <span className="ml-auto text-[9px] font-semibold bg-surface-muted text-text-tertiary px-1.5 rounded leading-4">
          {count}
        </span>
      )}
    </div>
  );
}

function ModelRow({
  model,
  selectedStoreyId,
  onToggleVisibility,
  onSelectStorey,
}: {
  model: ModelInfo;
  selectedStoreyId?: string | null;
  onToggleVisibility: (id: string) => void;
  onSelectStorey?: (modelId: string, storeyId: string | null) => void;
}) {
  const handleEyeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleVisibility(model.id);
  }, [model.id, onToggleVisibility]);

  return (
    <>
      <div className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 cursor-pointer text-[10.5px] transition-colors group',
        !model.visible && 'opacity-40',
      )}>
        {/* Discipline dot */}
        {model.discipline && (
          <span className={cn('w-[7px] h-[7px] rounded-full flex-shrink-0', DISCIPLINE_CLASSES[model.discipline])} />
        )}
        {/* Model name */}
        <span className="flex-1 font-medium text-text-primary truncate">
          {model.name}
        </span>
        {/* Version badge */}
        {model.version && (
          <span className="text-[9px] font-semibold text-primary bg-primary/10 px-1 rounded leading-[15px]">
            v{model.version}
          </span>
        )}
        {/* Element count */}
        {model.elementCount != null && (
          <span className="text-[9px] text-text-tertiary tabular-nums">
            {model.elementCount.toLocaleString('nb-NO')}
          </span>
        )}
        {/* Eye toggle */}
        <button
          onClick={handleEyeClick}
          className={cn(
            'w-3.5 h-3.5 flex items-center justify-center flex-shrink-0 transition-opacity',
            model.visible
              ? 'text-text-tertiary opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:!text-primary'
              : 'text-red-500 opacity-50',
          )}
        >
          {model.visible ? <Eye className="w-[11px] h-[11px]" /> : <EyeOff className="w-[11px] h-[11px]" />}
        </button>
      </div>

      {/* Storey tree */}
      {model.storeys && model.storeys.length > 0 && model.visible && (
        <div className="pb-1">
          {model.storeys.map(storey => (
            <div
              key={storey.id}
              onClick={() => onSelectStorey?.(model.id, selectedStoreyId === storey.id ? null : storey.id)}
              className={cn(
                'flex items-center gap-1 pl-[22px] pr-2.5 py-[2.5px] text-[10px] cursor-pointer transition-colors text-text-secondary',
                selectedStoreyId === storey.id && 'bg-primary/10 text-primary font-medium',
                selectedStoreyId !== storey.id && 'hover:bg-black/[0.02]',
              )}
            >
              <span className="flex-1 truncate">{storey.name}</span>
              <span className="text-[9px] text-text-tertiary tabular-nums">{storey.elementCount.toLocaleString('nb-NO')}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function VerifCell({ value, label, variant }: { value: number; label: string; variant: 'ok' | 'warn' | 'fail' }) {
  const colorClass = {
    ok: 'text-[var(--tl-green-text)]',
    warn: 'text-[var(--tl-yellow-text)]',
    fail: 'text-[var(--tl-red-text)]',
  }[variant];

  return (
    <div className="p-1.5 text-center bg-card">
      <div className={cn('text-sm font-bold', colorClass)}>{value}</div>
      <div className="text-[8px] text-text-tertiary uppercase tracking-wide mt-px">{label}</div>
    </div>
  );
}

function TypeRow({ item }: { item: TypeClassificationItem }) {
  const { t } = useTranslation();

  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    mapped: { bg: 'bg-[var(--st-mapped-bg)]', text: 'text-[var(--st-mapped-text)]', label: t('viewer.platform.classified') },
    pending: { bg: 'bg-[var(--st-pending-bg)]', text: 'text-[var(--st-pending-text)]', label: t('viewer.platform.pending') },
    review: { bg: 'bg-[var(--st-review-bg)]', text: 'text-[var(--st-review-text)]', label: t('viewer.platform.review') },
    ignored: { bg: 'bg-[var(--st-ignored-bg)]', text: 'text-[var(--st-ignored-text)]', label: t('common.ignored') },
    followup: { bg: 'bg-[var(--st-followup-bg)]', text: 'text-[var(--st-followup-text)]', label: t('common.followUp') },
  };

  const config = statusConfig[item.status] ?? statusConfig.pending;
  const dotVar = `var(--st-${item.status}-dot)`;

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-[3px] text-[10.5px] cursor-pointer hover:bg-black/[0.02] transition-colors">
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dotVar }} />
      <span className="flex-1 text-text-primary font-medium truncate">{item.name}</span>
      <span className={cn('text-[8.5px] font-semibold px-1 rounded leading-[15px]', config.bg, config.text)}>
        {config.label}
      </span>
      <span className="text-[9px] text-text-tertiary tabular-nums">{item.instanceCount}</span>
    </div>
  );
}
