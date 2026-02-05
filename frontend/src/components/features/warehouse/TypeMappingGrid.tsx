import { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Download, Upload } from 'lucide-react';
import {
  useModelTypes,
  useUpdateTypeMapping,
  useCreateTypeMapping,
  useExportTypesExcel,
  useImportTypesExcel,
  useExportTypesReduzer,
  warehouseKeys,
  type IFCType,
} from '@/hooks/use-warehouse';
import { DataGrid } from '@/components/ui/data-grid/DataGrid';
import type { DataGridColumn, SelectOption } from '@/components/ui/data-grid/types';

interface TypeMappingGridProps {
  modelId: string;
  modelFilename?: string;
  className?: string;
}

// Status options
const STATUS_OPTIONS: SelectOption[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'mapped', label: 'Mapped' },
  { value: 'ignored', label: 'Ignored' },
  { value: 'review', label: 'Review' },
  { value: 'followup', label: 'Follow-up' },
];

// Unit options
const UNIT_OPTIONS: SelectOption[] = [
  { value: 'pcs', label: 'pcs' },
  { value: 'm', label: 'm' },
  { value: 'm2', label: 'm\u00B2' },
  { value: 'm3', label: 'm\u00B3' },
];

export function TypeMappingGrid({ modelId, className }: TypeMappingGridProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Data
  const { data: types = [], isLoading } = useModelTypes(modelId);

  // Mutations
  const updateMapping = useUpdateTypeMapping();
  const createMapping = useCreateTypeMapping();
  const exportExcel = useExportTypesExcel();
  const importExcel = useImportTypesExcel();
  const exportReducer = useExportTypesReduzer();

  // Column definitions
  const columns = useMemo<DataGridColumn<IFCType>[]>(
    () => [
      {
        id: 'select',
        header: '',
        size: 40,
        minSize: 40,
        maxSize: 40,
        enableSorting: false,
        enableResizing: false,
      },
      {
        id: 'ifc_type',
        accessorKey: 'ifc_type',
        header: t('dataGrid.ifcClass'),
        size: 140,
        minSize: 100,
        enableSorting: true,
      },
      {
        id: 'type_name',
        accessorKey: 'type_name',
        header: t('dataGrid.typeName'),
        size: 220,
        minSize: 120,
        enableSorting: true,
        cellType: 'text' as const,
      },
      {
        id: 'instance_count',
        accessorKey: 'instance_count',
        header: t('dataGrid.instances'),
        size: 80,
        minSize: 60,
        enableSorting: true,
        cellType: 'number' as const,
      },
      {
        id: 'mapping_status',
        accessorFn: (row: IFCType) => row.mapping?.mapping_status ?? 'pending',
        header: t('dataGrid.status'),
        size: 120,
        minSize: 90,
        enableSorting: true,
        editable: true,
        cellType: 'select' as const,
        selectOptions: STATUS_OPTIONS,
      },
      {
        id: 'ns3451_code',
        accessorFn: (row: IFCType) => row.mapping?.ns3451_code ?? null,
        header: t('dataGrid.ns3451Code'),
        size: 120,
        minSize: 80,
        enableSorting: true,
        editable: true,
        cellType: 'text' as const,
      },
      {
        id: 'ns3451_name',
        accessorFn: (row: IFCType) => row.mapping?.ns3451_name ?? null,
        header: t('dataGrid.ns3451Name'),
        size: 160,
        minSize: 100,
        enableSorting: false,
        cellType: 'text' as const,
      },
      {
        id: 'product',
        accessorFn: (row: IFCType) => row.mapping?.product ?? null,
        header: t('dataGrid.product'),
        size: 160,
        minSize: 80,
        enableSorting: true,
        editable: true,
        cellType: 'text' as const,
      },
      {
        id: 'representative_unit',
        accessorFn: (row: IFCType) => row.mapping?.representative_unit ?? null,
        header: t('dataGrid.unit'),
        size: 80,
        minSize: 60,
        enableSorting: true,
        editable: true,
        cellType: 'select' as const,
        selectOptions: UNIT_OPTIONS,
      },
      {
        id: 'discipline',
        accessorFn: (row: IFCType) => row.mapping?.discipline ?? null,
        header: t('dataGrid.discipline'),
        size: 110,
        minSize: 80,
        enableSorting: true,
        editable: true,
        cellType: 'text' as const,
      },
      {
        id: 'notes',
        accessorFn: (row: IFCType) => row.mapping?.notes ?? null,
        header: t('dataGrid.notes'),
        size: 200,
        minSize: 100,
        enableSorting: false,
        editable: true,
        cellType: 'text' as const,
      },
    ],
    [t]
  );

  // Handle cell edits with optimistic updates
  const handleCellEdit = useCallback(
    async (rowId: string, columnId: string, value: unknown) => {
      const type = types.find((t) => t.id === rowId);
      if (!type) return;

      // Map column IDs to TypeMapping field names
      const fieldMap: Record<string, string> = {
        mapping_status: 'mapping_status',
        ns3451_code: 'ns3451_code',
        product: 'product',
        representative_unit: 'representative_unit',
        discipline: 'discipline',
        notes: 'notes',
      };

      const field = fieldMap[columnId];
      if (!field) return;

      // Optimistic update
      queryClient.setQueryData(
        warehouseKeys.typesList(modelId, {}),
        (old: IFCType[] | undefined) =>
          old?.map((t) =>
            t.id === rowId
              ? {
                  ...t,
                  mapping: t.mapping
                    ? { ...t.mapping, [field]: value || null }
                    : ({ [field]: value || null } as any),
                }
              : t
          )
      );

      try {
        if (type.mapping) {
          await updateMapping.mutateAsync({
            mappingId: type.mapping.id,
            [field]: value || null,
          });
        } else {
          await createMapping.mutateAsync({
            ifc_type: type.id,
            [field]: value || null,
          });
        }
      } catch {
        // Rollback: refetch on error
        queryClient.invalidateQueries({ queryKey: warehouseKeys.types() });
      }
    },
    [types, modelId, updateMapping, createMapping, queryClient]
  );

  // Excel export handler
  const handleExportExcel = () => {
    exportExcel.mutate(modelId);
  };

  // Excel import handler
  const handleImportExcel = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        importExcel.mutate({ modelId, file });
      }
    };
    input.click();
  };

  // Reduzer export handler
  const handleExportReducer = () => {
    exportReducer.mutate({ modelId });
  };

  // Toolbar extra buttons (export/import)
  const toolbarExtra = (
    <>
      <button className="dg-bulk-btn" onClick={handleExportExcel} disabled={exportExcel.isPending}>
        <Download size={12} />
        {t('dataGrid.exportExcel')}
      </button>
      <button className="dg-bulk-btn" onClick={handleImportExcel} disabled={importExcel.isPending}>
        <Upload size={12} />
        {t('dataGrid.importExcel')}
      </button>
      <button className="dg-bulk-btn" onClick={handleExportReducer} disabled={exportReducer.isPending}>
        <FileSpreadsheet size={12} />
        {t('dataGrid.exportReduzer')}
      </button>
    </>
  );

  return (
    <DataGrid
      data={types}
      columns={columns}
      groupBy="ifc_type"
      getRowId={(row) => row.id}
      onCellEdit={handleCellEdit}
      isLoading={isLoading}
      toolbarExtra={toolbarExtra}
      searchPlaceholder={t('dataGrid.search')}
      className={className}
    />
  );
}
