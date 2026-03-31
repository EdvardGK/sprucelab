import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

// ─── Type Definitions ────────────────────────────────────────────────

export interface MMIScaleDefinition {
  id: string;
  bep: string;
  mmi_level: number;
  name: string;
  name_en: string;
  description: string;
  color_hex: string;
  color_rgb: string;
  geometry_requirements: Record<string, any>;
  information_requirements: Record<string, any>;
  discipline_specific_rules: Record<string, any>;
  applies_to_disciplines: string[];
  display_order: number;
}

export interface TechnicalRequirement {
  id: string;
  bep: string;
  ifc_schema: 'IFC2X3' | 'IFC4' | 'IFC4X3';
  model_view_definition: string;
  coordinate_system_name: string;
  coordinate_system_description: string;
  length_unit: 'METRE' | 'MILLIMETRE';
  area_unit: string;
  volume_unit: string;
  geometry_tolerance: number;
  max_file_size_mb: number;
  requirements_json: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ProjectCoordinates {
  id: string;
  project: string;
  horizontal_crs_epsg: number;
  horizontal_crs_name: string;
  vertical_crs: string;
  local_origin_x: string;
  local_origin_y: string;
  local_origin_z: string;
  eastings: string | null;
  northings: string | null;
  orthometric_height: string | null;
  true_north_rotation: string;
  position_tolerance_m: string;
  rotation_tolerance_deg: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectDiscipline {
  id: string;
  project: string;
  discipline_code: string;
  discipline_name: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  software: string;
  source_code_mapping: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectStorey {
  id: string;
  project: string;
  storey_name: string;
  storey_code: string;
  elevation_m: string;
  tolerance_m: string;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface BEPConfiguration {
  id: string;
  project: string;
  project_name: string;
  template: string | null;
  version: number;
  status: 'draft' | 'active' | 'archived';
  name: string;
  description: string;
  eir_document_url: string;
  bep_document_url: string;
  framework: string;
  cde_structure: Record<string, any>;
  technical_requirements?: TechnicalRequirement;
  mmi_scale?: MMIScaleDefinition[];
  created_at: string;
  updated_at: string;
  activated_at: string | null;
}

export interface BEPTemplate {
  id: string;
  name: string;
  description: string;
  framework: string;
  mmi_scale_count: number;
  features: string[];
  recommended_for: string;
}

export interface MMIScaleResponse {
  bep_id: string;
  bep_name: string;
  bep_version: number;
  scale_count: number;
  mmi_scale: MMIScaleDefinition[];
}

// ─── Query Keys ──────────────────────────────────────────────────────

export const bepKeys = {
  all: ['bep'] as const,
  lists: () => [...bepKeys.all, 'list'] as const,
  list: (filters?: Record<string, any>) => [...bepKeys.lists(), filters] as const,
  details: () => [...bepKeys.all, 'detail'] as const,
  detail: (id: string) => [...bepKeys.details(), id] as const,
  templates: () => [...bepKeys.all, 'templates'] as const,
  mmiScale: (bepId: string) => [...bepKeys.all, 'mmi-scale', bepId] as const,
  projectBEP: (projectId: string) => [...bepKeys.all, 'project', projectId] as const,
  coordinates: (projectId: string) => [...bepKeys.all, 'coordinates', projectId] as const,
  disciplines: (projectId: string) => [...bepKeys.all, 'disciplines', projectId] as const,
  storeys: (projectId: string) => [...bepKeys.all, 'storeys', projectId] as const,
  technical: (bepId: string) => [...bepKeys.all, 'technical', bepId] as const,
};

// ─── BEP Configuration Queries ───────────────────────────────────────

export function useBEPs(filters?: { project?: string; status?: string }) {
  return useQuery({
    queryKey: bepKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.project) params.append('project', filters.project);
      if (filters?.status) params.append('status', filters.status);
      const response = await apiClient.get<{ results: BEPConfiguration[] }>(
        `/bep/configs/?${params.toString()}`
      );
      return response.data.results || [];
    },
  });
}

export function useBEP(id: string) {
  return useQuery({
    queryKey: bepKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient.get<BEPConfiguration>(`/bep/configs/${id}/`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useProjectBEP(projectId: string) {
  return useQuery({
    queryKey: bepKeys.projectBEP(projectId),
    queryFn: async () => {
      const response = await apiClient.get<BEPConfiguration[]>(
        `/bep/configs/?project=${projectId}&status=active`
      );
      return response.data[0] || null;
    },
    enabled: !!projectId,
  });
}

export function useBEPTemplates() {
  return useQuery({
    queryKey: bepKeys.templates(),
    queryFn: async () => {
      const response = await apiClient.get<BEPTemplate[]>('/bep/configs/templates/');
      return response.data;
    },
  });
}

export function useMMIScale(bepId: string) {
  return useQuery({
    queryKey: bepKeys.mmiScale(bepId),
    queryFn: async () => {
      const response = await apiClient.get<MMIScaleResponse>(
        `/bep/configs/${bepId}/mmi-scale/`
      );
      return response.data;
    },
    enabled: !!bepId,
  });
}

// ─── BEP Mutations ──────────────────────────────────────────────────

export function useCreateBEP() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      project: string;
      name: string;
      framework?: string;
      description?: string;
    }) => {
      const response = await apiClient.post<BEPConfiguration>('/bep/configs/', data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bepKeys.projectBEP(data.project) });
      queryClient.invalidateQueries({ queryKey: bepKeys.lists() });
    },
  });
}

export function useUpdateBEP() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<BEPConfiguration>) => {
      const response = await apiClient.patch<BEPConfiguration>(`/bep/configs/${id}/`, data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bepKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: bepKeys.projectBEP(data.project) });
    },
  });
}

export function useActivateBEP() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (bepId: string) => {
      const response = await apiClient.post(`/bep/configs/${bepId}/activate/`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bepKeys.all });
    },
  });
}

// ─── Project Coordinates ─────────────────────────────────────────────

export function useProjectCoordinates(projectId: string) {
  return useQuery({
    queryKey: bepKeys.coordinates(projectId),
    queryFn: async () => {
      const response = await apiClient.get<ProjectCoordinates[]>(
        `/bep/coordinates/?project=${projectId}`
      );
      return response.data[0] || null;
    },
    enabled: !!projectId,
  });
}

export function useSaveCoordinates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<ProjectCoordinates> & { project: string }) => {
      if (data.id) {
        const { id, ...rest } = data;
        const response = await apiClient.patch<ProjectCoordinates>(
          `/bep/coordinates/${id}/`, rest
        );
        return response.data;
      }
      const response = await apiClient.post<ProjectCoordinates>(
        '/bep/coordinates/', data
      );
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bepKeys.coordinates(data.project) });
    },
  });
}

// ─── Project Disciplines ─────────────────────────────────────────────

export function useProjectDisciplines(projectId: string) {
  return useQuery({
    queryKey: bepKeys.disciplines(projectId),
    queryFn: async () => {
      const response = await apiClient.get<ProjectDiscipline[]>(
        `/bep/disciplines/?project=${projectId}&include_inactive=true`
      );
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useCreateDiscipline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<ProjectDiscipline> & { project: string; discipline_code: string; discipline_name: string }) => {
      const response = await apiClient.post<ProjectDiscipline>(
        '/bep/disciplines/', data
      );
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bepKeys.disciplines(data.project) });
    },
  });
}

export function useUpdateDiscipline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<ProjectDiscipline>) => {
      const response = await apiClient.patch<ProjectDiscipline>(
        `/bep/disciplines/${id}/`, data
      );
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bepKeys.disciplines(data.project) });
    },
  });
}

export function useDeleteDiscipline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      await apiClient.delete(`/bep/disciplines/${id}/`);
      return { projectId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bepKeys.disciplines(data.projectId) });
    },
  });
}

// ─── Project Storeys ─────────────────────────────────────────────────

export function useProjectStoreys(projectId: string) {
  return useQuery({
    queryKey: bepKeys.storeys(projectId),
    queryFn: async () => {
      const response = await apiClient.get<ProjectStorey[]>(
        `/bep/storeys/?project=${projectId}`
      );
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useCreateStorey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<ProjectStorey> & { project: string; storey_name: string; elevation_m: string }) => {
      const response = await apiClient.post<ProjectStorey>(
        '/bep/storeys/', data
      );
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bepKeys.storeys(data.project) });
    },
  });
}

export function useUpdateStorey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<ProjectStorey>) => {
      const response = await apiClient.patch<ProjectStorey>(
        `/bep/storeys/${id}/`, data
      );
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bepKeys.storeys(data.project) });
    },
  });
}

export function useDeleteStorey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      await apiClient.delete(`/bep/storeys/${id}/`);
      return { projectId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bepKeys.storeys(data.projectId) });
    },
  });
}

// ─── Technical Requirements ──────────────────────────────────────────

export function useTechnicalRequirement(bepId: string) {
  return useQuery({
    queryKey: bepKeys.technical(bepId),
    queryFn: async () => {
      const response = await apiClient.get<TechnicalRequirement[]>(
        `/bep/technical/?bep=${bepId}`
      );
      return response.data[0] || null;
    },
    enabled: !!bepId,
  });
}

export function useSaveTechnicalRequirement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<TechnicalRequirement> & { bep: string }) => {
      if (data.id) {
        const { id, ...rest } = data;
        const response = await apiClient.patch<TechnicalRequirement>(
          `/bep/technical/${id}/`, rest
        );
        return response.data;
      }
      const response = await apiClient.post<TechnicalRequirement>(
        '/bep/technical/', data
      );
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bepKeys.technical(data.bep) });
      queryClient.invalidateQueries({ queryKey: bepKeys.detail(data.bep) });
    },
  });
}

// ─── MMI Scale Mutations ─────────────────────────────────────────────

export function useCreateMMILevel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<MMIScaleDefinition, 'id'> & { bep: string }) => {
      const response = await apiClient.post<MMIScaleDefinition>(
        '/bep/mmi-scale/', data
      );
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bepKeys.mmiScale(data.bep) });
    },
  });
}

export function useUpdateMMILevel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<MMIScaleDefinition>) => {
      const response = await apiClient.patch<MMIScaleDefinition>(
        `/bep/mmi-scale/${id}/`, data
      );
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bepKeys.mmiScale(data.bep) });
    },
  });
}

export function useDeleteMMILevel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, bepId }: { id: string; bepId: string }) => {
      await apiClient.delete(`/bep/mmi-scale/${id}/`);
      return { bepId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bepKeys.mmiScale(data.bepId) });
    },
  });
}

// ─── Helper Functions ────────────────────────────────────────────────

export function hexToTremorColor(hex: string): string {
  const colorMap: Record<string, string> = {
    '#CCCCCC': 'gray',
    '#BE2823': 'red',
    '#ED9D3D': 'orange',
    '#FCE74E': 'yellow',
    '#B0D34E': 'lime',
    '#5DB94B': 'green',
    '#004C41': 'emerald',
  };
  return colorMap[hex.toUpperCase()] || 'blue';
}

export function mmiLevelToTremorColor(
  mmiLevel: number,
  mmiScale?: MMIScaleDefinition[]
): string {
  if (!mmiScale || mmiScale.length === 0) {
    if (mmiLevel <= 100) return 'red';
    if (mmiLevel <= 200) return 'orange';
    if (mmiLevel <= 300) return 'yellow';
    if (mmiLevel <= 350) return 'lime';
    if (mmiLevel <= 400) return 'green';
    return 'emerald';
  }

  const definition = mmiScale.find((def) => def.mmi_level === mmiLevel);
  if (definition && definition.color_hex) {
    return hexToTremorColor(definition.color_hex);
  }

  const sorted = [...mmiScale].sort((a, b) => a.mmi_level - b.mmi_level);
  const closest = sorted.reduce((prev, curr) =>
    Math.abs(curr.mmi_level - mmiLevel) < Math.abs(prev.mmi_level - mmiLevel)
      ? curr
      : prev
  );
  return hexToTremorColor(closest.color_hex);
}

export function getMaxMMILevel(mmiScale?: MMIScaleDefinition[]): number {
  if (!mmiScale || mmiScale.length === 0) return 7;
  return Math.max(...mmiScale.map((def) => def.mmi_level));
}

export function getMinMMILevel(mmiScale?: MMIScaleDefinition[]): number {
  if (!mmiScale || mmiScale.length === 0) return 1;
  return Math.min(...mmiScale.map((def) => def.mmi_level));
}

/** Standard Norwegian discipline codes */
export const STANDARD_DISCIPLINES = [
  { code: 'ARK', name: 'Arkitekt' },
  { code: 'LARK', name: 'Landskapsarkitekt' },
  { code: 'IARK', name: 'Interiørarkitekt' },
  { code: 'RIB', name: 'Rådg. ing. bygg' },
  { code: 'RIBp', name: 'Rådg. ing. bygg prefab' },
  { code: 'RIV', name: 'Rådg. ing. VVS' },
  { code: 'RIVr', name: 'Rådg. ing. rør' },
  { code: 'RIVv', name: 'Rådg. ing. ventilasjon' },
  { code: 'RIVspr', name: 'Rådg. ing. sprinkler' },
  { code: 'RIE', name: 'Rådg. ing. elektro' },
  { code: 'RIVA', name: 'Rådg. ing. VA' },
  { code: 'RIG', name: 'Rådg. ing. geoteknikk' },
  { code: 'RIBr', name: 'Rådg. ing. brann' },
  { code: 'RIA', name: 'Rådg. ing. akustikk' },
] as const;
