import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

// ─── Type Definitions ────────────────────────────────────────────────

export interface EIR {
  id: string;
  project: string;
  title: string;
  description: string;
  version: number;
  status: 'draft' | 'issued' | 'responded' | 'agreed' | 'superseded';
  issuer_name: string;
  issuer_organization: string;
  issued_at: string | null;
  framework: 'iso19650' | 'ns8360' | 'pofin' | 'custom';
  ifc_version: string;
  classification_system: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  requirements?: EIRRequirement[];
  ids_specifications?: IDSSpecification[];
  requirement_count?: number;
  ids_count?: number;
}

export interface EIRRequirement {
  id: string;
  eir: string;
  code: string;
  title: string;
  description: string;
  instructions: string;
  category: 'technical' | 'property' | 'classification' | 'geometry' | 'coordination' | 'naming' | 'general';
  severity: 'mandatory' | 'recommended' | 'optional';
  applies_to_disciplines: string[];
  applies_to_ifc_types: string[];
  applies_from_mmi_level: number | null;
  ids_specification: string | null;
  ids_specification_detail?: IDSSpecification;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface IDSSpecification {
  id: string;
  eir: string | null;
  title: string;
  description: string;
  author: string;
  version: string;
  ids_xml: string;
  structured_specs: Record<string, any>[];
  source: 'imported' | 'authored' | 'library';
  original_filename: string;
  ifc_versions: string[];
  specification_count: number;
  is_library: boolean;
  created_at: string;
  updated_at: string;
}

export interface BEPResponse {
  id: string;
  eir: string;
  bep_configuration: string | null;
  version: number;
  status: 'draft' | 'submitted' | 'accepted' | 'revision_requested';
  respondent_name: string;
  respondent_organization: string;
  submitted_at: string | null;
  general_notes: string;
  created_at: string;
  updated_at: string;
  items?: BEPResponseItem[];
  compliance_summary?: Record<string, number>;
}

export interface BEPResponseItem {
  id: string;
  response: string;
  requirement: string;
  requirement_code?: string;
  requirement_title?: string;
  compliance_status: 'will_comply' | 'partially' | 'cannot_comply' | 'not_applicable' | 'pending';
  method_description: string;
  issues: string;
  wishes: string;
  responsible_discipline: string;
  tool_notes: string;
  created_at: string;
  updated_at: string;
}

export interface IDSValidationRun {
  id: string;
  model: string;
  ids_specification: string;
  eir: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  overall_pass: boolean | null;
  total_specifications: number;
  specifications_passed: number;
  specifications_failed: number;
  total_checks: number;
  checks_passed: number;
  checks_failed: number;
  results_json: Record<string, any>;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  error_message: string;
  triggered_by: string;
  created_at: string;
}

export interface ComplianceItem {
  requirement_id: string;
  code: string;
  title: string;
  category: string;
  severity: string;
  has_ids: boolean;
  response_status: string | null;
  latest_validation: {
    run_id: string;
    overall_pass: boolean;
    specifications_passed: number;
    specifications_failed: number;
    completed_at: string;
  } | null;
}

// ─── Query Keys ──────────────────────────────────────────────────────

export const eirKeys = {
  all: ['eir'] as const,
  lists: () => [...eirKeys.all, 'list'] as const,
  list: (filters?: Record<string, any>) => [...eirKeys.lists(), filters] as const,
  details: () => [...eirKeys.all, 'detail'] as const,
  detail: (id: string) => [...eirKeys.details(), id] as const,
  compliance: (id: string) => [...eirKeys.all, 'compliance', id] as const,
  requirements: (eirId: string) => [...eirKeys.all, 'requirements', eirId] as const,
  ids: (eirId?: string) => [...eirKeys.all, 'ids', eirId] as const,
  responses: (eirId: string) => [...eirKeys.all, 'responses', eirId] as const,
  responseDetail: (id: string) => [...eirKeys.all, 'response-detail', id] as const,
  responseItems: (responseId: string) => [...eirKeys.all, 'response-items', responseId] as const,
  validationRuns: (filters?: Record<string, any>) => [...eirKeys.all, 'validation-runs', filters] as const,
};

// ─── EIR Queries ─────────────────────────────────────────────────────

export function useEIRs(filters?: { project?: string; status?: string }) {
  return useQuery({
    queryKey: eirKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.project) params.append('project', filters.project);
      if (filters?.status) params.append('status', filters.status);
      const response = await apiClient.get<{ results: EIR[] }>(
        `/bep/eir/?${params.toString()}`
      );
      return response.data.results || [];
    },
  });
}

export function useEIR(id: string) {
  return useQuery({
    queryKey: eirKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient.get<EIR>(`/bep/eir/${id}/`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useEIRCompliance(eirId: string) {
  return useQuery({
    queryKey: eirKeys.compliance(eirId),
    queryFn: async () => {
      const response = await apiClient.get<ComplianceItem[]>(`/bep/eir/${eirId}/compliance/`);
      return response.data;
    },
    enabled: !!eirId,
  });
}

// ─── EIR Mutations ───────────────────────────────────────────────────

export function useCreateEIR() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      project: string;
      title: string;
      framework?: string;
      description?: string;
      ifc_version?: string;
      classification_system?: string;
    }) => {
      const response = await apiClient.post<EIR>('/bep/eir/', data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: eirKeys.list({ project: data.project }) });
      queryClient.invalidateQueries({ queryKey: eirKeys.lists() });
    },
  });
}

export function useUpdateEIR() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<EIR>) => {
      const response = await apiClient.patch<EIR>(`/bep/eir/${id}/`, data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: eirKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: eirKeys.lists() });
    },
  });
}

export function useIssueEIR() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (eirId: string) => {
      const response = await apiClient.post(`/bep/eir/${eirId}/issue/`);
      return response.data;
    },
    onSuccess: (_data, eirId) => {
      queryClient.invalidateQueries({ queryKey: eirKeys.detail(eirId) });
      queryClient.invalidateQueries({ queryKey: eirKeys.lists() });
    },
  });
}

// ─── EIR Requirements ────────────────────────────────────────────────

export function useEIRRequirements(eirId: string) {
  return useQuery({
    queryKey: eirKeys.requirements(eirId),
    queryFn: async () => {
      const response = await apiClient.get<{ results: EIRRequirement[] }>(
        `/bep/eir-requirements/?eir=${eirId}`
      );
      return response.data.results || [];
    },
    enabled: !!eirId,
  });
}

export function useCreateRequirement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<EIRRequirement> & { eir: string; code: string; title: string }) => {
      const response = await apiClient.post<EIRRequirement>('/bep/eir-requirements/', data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: eirKeys.requirements(data.eir) });
      queryClient.invalidateQueries({ queryKey: eirKeys.detail(data.eir) });
    },
  });
}

export function useUpdateRequirement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<EIRRequirement>) => {
      const response = await apiClient.patch<EIRRequirement>(`/bep/eir-requirements/${id}/`, data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: eirKeys.requirements(data.eir) });
    },
  });
}

export function useDeleteRequirement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, eirId }: { id: string; eirId: string }) => {
      await apiClient.delete(`/bep/eir-requirements/${id}/`);
      return { eirId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: eirKeys.requirements(data.eirId) });
    },
  });
}

// ─── IDS Specifications ──────────────────────────────────────────────

export function useIDSSpecifications(filters?: { eir?: string; is_library?: boolean }) {
  return useQuery({
    queryKey: eirKeys.ids(filters?.eir),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.eir) params.append('eir', filters.eir);
      if (filters?.is_library) params.append('is_library', 'true');
      const response = await apiClient.get<{ results: IDSSpecification[] }>(
        `/bep/ids/?${params.toString()}`
      );
      return response.data.results || [];
    },
  });
}

export function useCreateIDS() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<IDSSpecification> & { title: string }) => {
      const response = await apiClient.post<IDSSpecification>('/bep/ids/', data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: eirKeys.ids(data.eir ?? undefined) });
    },
  });
}

export function useUpdateIDS() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<IDSSpecification>) => {
      const response = await apiClient.patch<IDSSpecification>(`/bep/ids/${id}/`, data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: eirKeys.ids(data.eir ?? undefined) });
    },
  });
}

export function useDeleteIDS() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, eirId }: { id: string; eirId?: string }) => {
      await apiClient.delete(`/bep/ids/${id}/`);
      return { eirId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: eirKeys.ids(data.eirId) });
    },
  });
}

export function useValidateIDS() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ idsId, modelId }: { idsId: string; modelId: string }) => {
      const response = await apiClient.post<IDSValidationRun>(
        `/bep/ids/${idsId}/validate/`,
        { model_id: modelId }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eirKeys.validationRuns() });
    },
  });
}

// ─── BEP Responses ───────────────────────────────────────────────────

export function useBEPResponses(eirId: string) {
  return useQuery({
    queryKey: eirKeys.responses(eirId),
    queryFn: async () => {
      const response = await apiClient.get<{ results: BEPResponse[] }>(
        `/bep/responses/?eir=${eirId}`
      );
      return response.data.results || [];
    },
    enabled: !!eirId,
  });
}

export function useBEPResponse(id: string) {
  return useQuery({
    queryKey: eirKeys.responseDetail(id),
    queryFn: async () => {
      const response = await apiClient.get<BEPResponse>(`/bep/responses/${id}/`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateBEPResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { eir: string; bep_configuration?: string; respondent_name?: string; respondent_organization?: string }) => {
      const response = await apiClient.post<BEPResponse>('/bep/responses/', data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: eirKeys.responses(data.eir) });
    },
  });
}

export function useUpdateBEPResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<BEPResponse>) => {
      const response = await apiClient.patch<BEPResponse>(`/bep/responses/${id}/`, data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: eirKeys.responseDetail(data.id) });
      queryClient.invalidateQueries({ queryKey: eirKeys.responses(data.eir) });
    },
  });
}

export function useSubmitBEPResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (responseId: string) => {
      const response = await apiClient.post(`/bep/responses/${responseId}/submit/`);
      return response.data;
    },
    onSuccess: (_data, responseId) => {
      queryClient.invalidateQueries({ queryKey: eirKeys.responseDetail(responseId) });
      queryClient.invalidateQueries({ queryKey: eirKeys.all });
    },
  });
}

export function useAutoPopulateResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (responseId: string) => {
      const response = await apiClient.post(`/bep/responses/${responseId}/auto-populate/`);
      return response.data;
    },
    onSuccess: (_data, responseId) => {
      queryClient.invalidateQueries({ queryKey: eirKeys.responseDetail(responseId) });
    },
  });
}

// ─── Response Items ──────────────────────────────────────────────────

export function useResponseItems(responseId: string) {
  return useQuery({
    queryKey: eirKeys.responseItems(responseId),
    queryFn: async () => {
      const response = await apiClient.get<{ results: BEPResponseItem[] }>(
        `/bep/response-items/?response=${responseId}`
      );
      return response.data.results || [];
    },
    enabled: !!responseId,
  });
}

export function useUpdateResponseItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<BEPResponseItem>) => {
      const response = await apiClient.patch<BEPResponseItem>(`/bep/response-items/${id}/`, data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: eirKeys.responseItems(data.response) });
    },
  });
}

export function useBulkUpdateResponseItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ items, responseId }: { items: Partial<BEPResponseItem>[]; responseId: string }) => {
      const response = await apiClient.post('/bep/response-items/bulk/', items);
      return { ...response.data, responseId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: eirKeys.responseItems(data.responseId) });
    },
  });
}

// ─── Validation Runs ─────────────────────────────────────────────────

export function useValidationRuns(filters?: { model?: string; ids_specification?: string; eir?: string }) {
  return useQuery({
    queryKey: eirKeys.validationRuns(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.model) params.append('model', filters.model);
      if (filters?.ids_specification) params.append('ids_specification', filters.ids_specification);
      if (filters?.eir) params.append('eir', filters.eir);
      const response = await apiClient.get<{ results: IDSValidationRun[] }>(
        `/bep/ids-runs/?${params.toString()}`
      );
      return response.data.results || [];
    },
  });
}

// ─── Constants ───────────────────────────────────────────────────────

export const EIR_CATEGORIES = [
  'technical', 'property', 'classification', 'geometry',
  'coordination', 'naming', 'general',
] as const;

export const SEVERITY_LEVELS = ['mandatory', 'recommended', 'optional'] as const;

export const COMPLIANCE_STATUSES = [
  'will_comply', 'partially', 'cannot_comply', 'not_applicable', 'pending',
] as const;

export const COMPLIANCE_COLORS: Record<string, string> = {
  will_comply: 'bg-green-100 text-green-800',
  partially: 'bg-yellow-100 text-yellow-800',
  cannot_comply: 'bg-red-100 text-red-800',
  not_applicable: 'bg-gray-100 text-gray-600',
  pending: 'bg-blue-100 text-blue-800',
};

export const SEVERITY_COLORS: Record<string, string> = {
  mandatory: 'bg-red-100 text-red-800',
  recommended: 'bg-yellow-100 text-yellow-800',
  optional: 'bg-gray-100 text-gray-600',
};
