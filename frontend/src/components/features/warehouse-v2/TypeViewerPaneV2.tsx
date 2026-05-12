import { useTranslation } from 'react-i18next';
import { Box, X } from 'lucide-react';

import { DashboardTile } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { InlineViewer } from '@/components/features/viewer/InlineViewer';
import type { IFCType } from '@/hooks/use-warehouse';

interface TypeViewerPaneV2Props {
  modelId: string;
  selectedType: IFCType | null;
  onClearSelection: () => void;
}

export function TypeViewerPaneV2({
  modelId,
  selectedType,
  onClearSelection,
}: TypeViewerPaneV2Props) {
  const { t } = useTranslation();

  return (
    <DashboardTile id="viewer-pane" className="p-0 flex flex-col h-full">
      <div className="flex items-center justify-between px-[clamp(0.5rem,1vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] border-b border-border/60 flex-shrink-0">
        <div className="flex items-center gap-[clamp(0.375rem,0.5vw,0.625rem)] min-w-0">
          <Box className="h-[clamp(0.75rem,1vw,1rem)] w-[clamp(0.75rem,1vw,1rem)] text-muted-foreground shrink-0" />
          <h2 className="text-[clamp(0.7rem,0.9vw,0.95rem)] font-medium truncate">
            {selectedType
              ? selectedType.type_name || t('typesV2.table.unnamed')
              : t('typesV2.viewer.empty')}
          </h2>
        </div>
        {selectedType && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            className="h-[clamp(1rem,1.5vw,1.5rem)] w-[clamp(1rem,1.5vw,1.5rem)] p-0"
            title={t('typesV2.viewer.clear')}
          >
            <X className="h-[clamp(0.625rem,0.9vw,0.875rem)] w-[clamp(0.625rem,0.9vw,0.875rem)]" />
          </Button>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {selectedType ? (
          <InlineViewer
            key={selectedType.id}
            modelId={modelId}
            typeId={selectedType.id}
            typeName={selectedType.type_name}
            ifcType={selectedType.ifc_type}
            definitionLayers={selectedType.mapping?.definition_layers}
            className="h-full w-full"
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-[clamp(0.375rem,0.6vh,0.75rem)] px-[clamp(0.75rem,1.5vw,1.5rem)] text-center">
            <Box className="h-[clamp(1.5rem,3vw,3rem)] w-[clamp(1.5rem,3vw,3rem)] opacity-30" />
            <p className="text-[clamp(0.65rem,0.85vw,0.9rem)]">{t('typesV2.viewer.hint')}</p>
          </div>
        )}
      </div>
    </DashboardTile>
  );
}
