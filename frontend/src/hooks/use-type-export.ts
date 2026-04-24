import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import {
  warehouseKeys,
  type ExcelImportResult,
} from './use-warehouse';

// =============================================================================
// EXCEL EXPORT/IMPORT
// =============================================================================

/**
 * Export types to Excel template for batch mapping.
 * Triggers file download.
 */
export function useExportTypesExcel() {
  return useMutation({
    mutationFn: async (modelId: string) => {
      const response = await apiClient.get(
        `/types/types/export-excel/?model=${modelId}`,
        {
          responseType: 'blob',
        }
      );

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers['content-disposition'];
      let filename = `types_${modelId}.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+)"?/);
        if (match) {
          filename = match[1];
        }
      }

      // Create download link
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      return { success: true, filename };
    },
  });
}

/**
 * Export types to Reduzer-compatible format for LCA import.
 * Triggers file download.
 *
 * @param includeUnmapped - If true, includes types without NS3451 mapping
 */
export function useExportTypesReduzer() {
  return useMutation({
    mutationFn: async ({
      modelId,
      includeUnmapped = false,
    }: {
      modelId: string;
      includeUnmapped?: boolean;
    }) => {
      const params = new URLSearchParams();
      params.append('model', modelId);
      if (includeUnmapped) {
        params.append('include_unmapped', 'true');
      }

      const response = await apiClient.get(
        `/types/types/export-reduzer/?${params}`,
        {
          responseType: 'blob',
        }
      );

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers['content-disposition'];
      let filename = `reduzer_${modelId}.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+)"?/);
        if (match) {
          filename = match[1];
        }
      }

      // Create download link
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      return { success: true, filename };
    },
  });
}

/**
 * Import type mappings from Excel file.
 */
export function useImportTypesExcel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ modelId, file }: { modelId: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('model_id', modelId);

      const response = await apiClient.post<ExcelImportResult>(
        '/types/types/import-excel/',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      return response.data;
    },
    onSuccess: () => {
      // Invalidate types queries to refresh the list
      queryClient.invalidateQueries({ queryKey: warehouseKeys.types() });
      queryClient.invalidateQueries({ queryKey: warehouseKeys.typeMappings() });
    },
  });
}

/**
 * Export TypeBank entries to Excel for batch classification.
 * Supports optional filtering by mapping_status and ifc_class.
 */
export function useExportTypeBankExcel() {
  return useMutation({
    mutationFn: async (filters?: { mappingStatus?: string; ifcClass?: string }) => {
      const params = new URLSearchParams();
      if (filters?.mappingStatus) params.append('mapping_status', filters.mappingStatus);
      if (filters?.ifcClass) params.append('ifc_class', filters.ifcClass);
      const query = params.toString();

      const response = await apiClient.get(
        `/types/type-bank/export-excel/${query ? `?${query}` : ''}`,
        { responseType: 'blob' }
      );

      const contentDisposition = response.headers['content-disposition'];
      let filename = 'type_bank.xlsx';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+)"?/);
        if (match) filename = match[1];
      }

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      return { success: true, filename };
    },
  });
}
