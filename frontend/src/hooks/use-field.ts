import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import type {
  ChecklistTemplate,
  Checklist,
  CheckItem,
  CheckItemStatus,
  DeviationResponsible,
  DeviationAction,
} from '@/components/features/field/types';

// ─── Query Keys ────────────────────────────────────────────────────

export const fieldKeys = {
  all: ['field'] as const,
  templates: () => [...fieldKeys.all, 'templates'] as const,
  templateList: (filters?: Record<string, string>) => [...fieldKeys.templates(), filters] as const,
  templateDetail: (id: string) => [...fieldKeys.templates(), id] as const,
  checklists: () => [...fieldKeys.all, 'checklists'] as const,
  checklistList: (filters?: Record<string, string>) => [...fieldKeys.checklists(), filters] as const,
  checklistDetail: (id: string) => [...fieldKeys.checklists(), id] as const,
  items: () => [...fieldKeys.all, 'items'] as const,
  itemList: (filters?: Record<string, string>) => [...fieldKeys.items(), filters] as const,
};

// ─── Template Queries ──────────────────────────────────────────────

export function useChecklistTemplates(filters?: { project?: string; category?: string }) {
  return useQuery({
    queryKey: fieldKeys.templateList(filters as Record<string, string>),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.project) params.append('project', filters.project);
      if (filters?.category) params.append('category', filters.category);
      // Also include system templates
      const response = await apiClient.get<{ results: ChecklistTemplate[] }>(
        `/field/templates/?${params.toString()}`
      );
      return response.data.results || [];
    },
  });
}

export function useChecklistTemplate(id: string) {
  return useQuery({
    queryKey: fieldKeys.templateDetail(id),
    queryFn: async () => {
      const response = await apiClient.get<ChecklistTemplate>(`/field/templates/${id}/`);
      return response.data;
    },
    enabled: !!id,
  });
}

// ─── Checklist Queries ─────────────────────────────────────────────

export function useChecklists(filters?: { project?: string; status?: string }) {
  return useQuery({
    queryKey: fieldKeys.checklistList(filters as Record<string, string>),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.project) params.append('project', filters.project);
      if (filters?.status) params.append('status', filters.status);
      const response = await apiClient.get<{ results: Checklist[] }>(
        `/field/checklists/?${params.toString()}`
      );
      return response.data.results || [];
    },
    enabled: !!filters?.project,
  });
}

export function useChecklist(id: string) {
  return useQuery({
    queryKey: fieldKeys.checklistDetail(id),
    queryFn: async () => {
      const response = await apiClient.get<Checklist>(`/field/checklists/${id}/`);
      return response.data;
    },
    enabled: !!id,
  });
}

// ─── Checklist Mutations ───────────────────────────────────────────

export function useInstantiateChecklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      template_id: string;
      project_id: string;
      name?: string;
      location?: string;
    }) => {
      const response = await apiClient.post<Checklist>('/field/checklists/instantiate/', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fieldKeys.checklists() });
    },
  });
}

export function useUpdateChecklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<Checklist>) => {
      const response = await apiClient.patch<Checklist>(`/field/checklists/${id}/`, data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: fieldKeys.checklistDetail(data.id) });
      queryClient.invalidateQueries({ queryKey: fieldKeys.checklists() });
    },
  });
}

// ─── Check Item Mutations ──────────────────────────────────────────

export function useRecordCheckItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: {
      id: string;
      status?: CheckItemStatus;
      measured_value?: number;
      notes?: string;
    }) => {
      const response = await apiClient.patch<CheckItem>(`/field/items/${id}/record/`, data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: fieldKeys.checklistDetail(data.checklist) });
    },
  });
}

export function useRecordDeviation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: {
      id: string;
      deviation_description: string;
      deviation_responsible: DeviationResponsible;
      deviation_action: DeviationAction;
    }) => {
      const response = await apiClient.patch<CheckItem>(`/field/items/${id}/deviate/`, data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: fieldKeys.checklistDetail(data.checklist) });
    },
  });
}

export function useResolveDeviation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, resolved_by }: { id: string; resolved_by?: string }) => {
      const response = await apiClient.patch<CheckItem>(`/field/items/${id}/resolve/`, { resolved_by });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: fieldKeys.checklistDetail(data.checklist) });
    },
  });
}
