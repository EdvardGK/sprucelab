import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Tag, Layers, Package, Eye, Shield,
  Check, Flag, RotateCcw, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { VerificationBadge } from './VerificationBadge';
import {
  useVerifyType,
  useFlagType,
  useResetVerification,
  type GlobalTypeLibraryEntry,
} from '@/hooks/use-warehouse';
import { cn } from '@/lib/utils';

interface TypeDetailPanelProps {
  type: GlobalTypeLibraryEntry | null;
  onClose?: () => void;
  className?: string;
}

export function TypeDetailPanel({ type, onClose, className }: TypeDetailPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('classification');
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [flagReason, setFlagReason] = useState('');

  // Mutations
  const verifyType = useVerifyType();
  const flagType = useFlagType();
  const resetVerification = useResetVerification();

  if (!type) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <div className="text-center text-muted-foreground">
          <Box className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t('typeLibrary.selectType')}</p>
        </div>
      </div>
    );
  }

  const handleVerify = async () => {
    await verifyType.mutateAsync({ entryId: type.id });
  };

  const handleFlag = async () => {
    if (!flagReason.trim()) return;
    await flagType.mutateAsync({ entryId: type.id, flagReason: flagReason.trim() });
    setFlagDialogOpen(false);
    setFlagReason('');
  };

  const handleReset = async () => {
    await resetVerification.mutateAsync(type.id);
  };

  // Clean IFC class for display
  const displayClass = type.ifc_class.replace('Ifc', '').replace('Type', '');

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Hero Section */}
      <div className="p-4 border-b bg-gradient-to-b from-muted/50 to-background">
        {/* Close button */}
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-7 w-7"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        )}

        {/* Type Name (Primary) */}
        <h2 className="text-lg font-semibold text-foreground mb-1 pr-8">
          {type.type_name || t('typeLibrary.unnamedType')}
        </h2>

        {/* Type Metadata Line */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <Badge variant="outline" className="text-xs font-mono">
            {displayClass}
          </Badge>
          <span>&middot;</span>
          <span>{type.total_instance_count} {t('typeLibrary.instances')}</span>
          <span>&middot;</span>
          <span>{type.source_model_count} {t('typeLibrary.models')}</span>
        </div>

        {/* Material (if available) */}
        {type.material && (
          <div className="text-sm text-muted-foreground mb-3">
            <span className="text-xs uppercase tracking-wider opacity-60">
              {t('typeLibrary.primaryMaterial')}:
            </span>{' '}
            {type.material}
          </div>
        )}

        {/* Status and Actions Row */}
        <div className="flex items-center justify-between gap-3">
          <VerificationBadge
            status={type.verification_status}
            verifiedAt={type.verified_at}
            size="md"
          />

          <div className="flex items-center gap-2">
            {type.verification_status !== 'verified' && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                onClick={handleVerify}
                disabled={verifyType.isPending}
              >
                <Check className="h-3.5 w-3.5 mr-1.5" />
                {t('typeLibrary.verify')}
              </Button>
            )}

            {type.verification_status !== 'flagged' && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                onClick={() => setFlagDialogOpen(true)}
              >
                <Flag className="h-3.5 w-3.5 mr-1.5" />
                {t('typeLibrary.flag')}
              </Button>
            )}

            {type.verification_status !== 'pending' && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={handleReset}
                disabled={resetVerification.isPending}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                {t('typeLibrary.reset')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="grid grid-cols-5 mx-4 mt-3">
          <TabsTrigger value="classification" className="text-xs gap-1.5">
            <Tag className="h-3.5 w-3.5" />
            {t('typeLibrary.tabs.classification')}
          </TabsTrigger>
          <TabsTrigger value="materials" className="text-xs gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            {t('typeLibrary.tabs.materials')}
          </TabsTrigger>
          <TabsTrigger value="product" className="text-xs gap-1.5">
            <Package className="h-3.5 w-3.5" />
            {t('typeLibrary.tabs.product')}
          </TabsTrigger>
          <TabsTrigger value="observations" className="text-xs gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            {t('typeLibrary.tabs.observations')}
          </TabsTrigger>
          <TabsTrigger value="verification" className="text-xs gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            {t('typeLibrary.tabs.verification')}
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto min-h-0 p-4">
          {/* Classification Tab */}
          <TabsContent value="classification" className="mt-0 h-full">
            <ClassificationTabContent type={type} />
          </TabsContent>

          {/* Materials Tab */}
          <TabsContent value="materials" className="mt-0 h-full">
            <MaterialsTabContent />
          </TabsContent>

          {/* Product Tab */}
          <TabsContent value="product" className="mt-0 h-full">
            <ProductTabContent />
          </TabsContent>

          {/* Observations Tab */}
          <TabsContent value="observations" className="mt-0 h-full">
            <ObservationsTabContent type={type} />
          </TabsContent>

          {/* Verification Tab */}
          <TabsContent value="verification" className="mt-0 h-full">
            <VerificationTabContent type={type} />
          </TabsContent>
        </div>
      </Tabs>

      {/* Flag Dialog */}
      <Dialog open={flagDialogOpen} onOpenChange={setFlagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('typeLibrary.flagDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('typeLibrary.flagDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder={t('typeLibrary.flagDialog.placeholder')}
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFlagDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleFlag}
              disabled={!flagReason.trim() || flagType.isPending}
            >
              <Flag className="h-4 w-4 mr-2" />
              {t('typeLibrary.flag')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Classification tab content
function ClassificationTabContent({ type }: { type: GlobalTypeLibraryEntry }) {
  const { t } = useTranslation();

  const fields = [
    {
      label: t('typeLibrary.classification.ns3451'),
      value: type.ns3451_code,
      sublabel: type.ns3451_name,
    },
    {
      label: t('typeLibrary.classification.semanticType'),
      value: type.semantic_type_code,
      sublabel: type.semantic_type_name,
    },
    {
      label: t('typeLibrary.classification.discipline'),
      value: type.discipline,
    },
    {
      label: t('typeLibrary.classification.unit'),
      value: type.representative_unit,
    },
    {
      label: t('typeLibrary.classification.canonicalName'),
      value: type.canonical_name,
    },
  ];

  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <div key={field.label} className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {field.label}
          </span>
          {field.value ? (
            <div>
              <span className="text-sm font-medium">{field.value}</span>
              {field.sublabel && (
                <span className="text-sm text-muted-foreground ml-2">
                  ({field.sublabel})
                </span>
              )}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground italic">
              {t('common.notSet')}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// Materials tab content (placeholder)
function MaterialsTabContent() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <Layers className="h-12 w-12 text-muted-foreground/30 mb-3" />
      <h3 className="text-sm font-medium mb-1">{t('typeLibrary.materials.noLayers')}</h3>
      <p className="text-xs text-muted-foreground mb-4">
        {t('typeLibrary.materials.noLayersDesc')}
      </p>
      <Button size="sm" variant="outline">
        {t('typeLibrary.materials.addLayers')}
      </Button>
    </div>
  );
}

// Product tab content (placeholder)
function ProductTabContent() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <Package className="h-12 w-12 text-muted-foreground/30 mb-3" />
      <h3 className="text-sm font-medium mb-1">{t('typeLibrary.product.noProduct')}</h3>
      <p className="text-xs text-muted-foreground mb-4">
        {t('typeLibrary.product.noProductDesc')}
      </p>
      <Button size="sm" variant="outline">
        {t('typeLibrary.product.linkProduct')}
      </Button>
    </div>
  );
}

// Observations tab content (placeholder)
function ObservationsTabContent({ type }: { type: GlobalTypeLibraryEntry }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{t('typeLibrary.observations.title')}</h3>
        <Badge variant="secondary">{type.source_model_count} {t('typeLibrary.models')}</Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        {t('typeLibrary.observations.description', {
          count: type.total_instance_count,
          models: type.source_model_count,
        })}
      </p>

      {/* Placeholder for observations list */}
      <div className="text-center py-8 text-muted-foreground text-sm">
        {t('typeLibrary.observations.loadModels')}
      </div>
    </div>
  );
}

// Verification tab content
function VerificationTabContent({ type }: { type: GlobalTypeLibraryEntry }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <VerificationBadge status={type.verification_status} size="lg" />
        {type.verified_at && (
          <span className="text-sm text-muted-foreground">
            {new Date(type.verified_at).toLocaleString()}
          </span>
        )}
      </div>

      {type.verification_status === 'flagged' && (
        <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md">
          <h4 className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">
            {t('typeLibrary.verification.flagReason')}
          </h4>
          <p className="text-sm text-red-600 dark:text-red-300">
            {/* Flag reason would come from the full entry */}
            {t('typeLibrary.verification.noReasonProvided')}
          </p>
        </div>
      )}

      <div className="text-sm text-muted-foreground">
        {type.verification_status === 'pending' && t('typeLibrary.verification.pendingDesc')}
        {type.verification_status === 'auto' && t('typeLibrary.verification.autoDesc')}
        {type.verification_status === 'verified' && t('typeLibrary.verification.verifiedDesc')}
        {type.verification_status === 'flagged' && t('typeLibrary.verification.flaggedDesc')}
      </div>
    </div>
  );
}
