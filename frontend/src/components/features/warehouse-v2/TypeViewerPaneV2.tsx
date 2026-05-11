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
    <DashboardTile id="viewer-pane" className="p-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <Box className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <h2 className="text-xs font-medium truncate">
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
            className="h-5 w-5 p-0"
            title={t('typesV2.viewer.clear')}
          >
            <X className="h-3 w-3" />
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
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2 px-4 text-center">
            <Box className="h-8 w-8 opacity-30" />
            <p className="text-xs">{t('typesV2.viewer.hint')}</p>
          </div>
        )}
      </div>
    </DashboardTile>
  );
}
