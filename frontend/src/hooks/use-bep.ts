import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

// Type definitions for BEP data
export interface MMIScaleDefinition {
  id: string;
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

export interface BEPConfiguration {
  id: string;
  project: string;
  project_name: string;
  version: number;
  status: 'draft' | 'active' | 'archived';
  name: string;
  description: string;
  framework: string;
  mmi_scale?: MMIScaleDefinition[];
  created_at: string;
  updated_at: string;
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

// Query keys
export const bepKeys = {
  all: ['bep'] as const,
  lists: () => [...bepKeys.all, 'list'] as const,
  list: (filters?: Record<string, any>) => [...bepKeys.lists(), filters] as const,
  details: () => [...bepKeys.all, 'detail'] as const,
  detail: (id: string) => [...bepKeys.details(), id] as const,
  templates: () => [...bepKeys.all, 'templates'] as const,
  mmiScale: (bepId: string) => [...bepKeys.all, 'mmi-scale', bepId] as const,
  projectBEP: (projectId: string) => [...bepKeys.all, 'project', projectId] as const,
};

/**
 * Fetch all BEP configurations
 */
export function useBEPs(filters?: { project?: string; status?: string }) {
  return useQuery({
    queryKey: bepKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.project) params.append('project', filters.project);
      if (filters?.status) params.append('status', filters.status);

      const response = await apiClient.get<BEPConfiguration[]>(
        `/bep/?${params.toString()}`
      );
      return response.data;
    },
  });
}

/**
 * Fetch single BEP configuration with all nested data
 */
export function useBEP(id: string) {
  return useQuery({
    queryKey: bepKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient.get<BEPConfiguration>(`/bep/${id}/`);
      return response.data;
    },
    enabled: !!id,
  });
}

/**
 * Fetch active BEP for a project
 */
export function useProjectBEP(projectId: string) {
  return useQuery({
    queryKey: bepKeys.projectBEP(projectId),
    queryFn: async () => {
      const response = await apiClient.get<BEPConfiguration[]>(
        `/bep/?project=${projectId}&status=active`
      );
      // Return first active BEP (there should only be one)
      return response.data[0] || null;
    },
    enabled: !!projectId,
  });
}

/**
 * Fetch available BEP templates
 */
export function useBEPTemplates() {
  return useQuery({
    queryKey: bepKeys.templates(),
    queryFn: async () => {
      const response = await apiClient.get<BEPTemplate[]>('/bep/templates/');
      return response.data;
    },
  });
}

/**
 * Fetch MMI scale definitions for a BEP
 */
export function useMMIScale(bepId: string) {
  return useQuery({
    queryKey: bepKeys.mmiScale(bepId),
    queryFn: async () => {
      const response = await apiClient.get<MMIScaleResponse>(
        `/bep/${bepId}/mmi-scale/`
      );
      return response.data;
    },
    enabled: !!bepId,
  });
}

/**
 * Helper function to convert hex color to Tremor color name
 *
 * Maps official MMI-veileder 2.0 hex colors to closest Tremor color.
 */
export function hexToTremorColor(hex: string): string {
  const colorMap: Record<string, string> = {
    '#CCCCCC': 'gray',      // MMI 0
    '#BE2823': 'red',       // MMI 100
    '#ED9D3D': 'orange',    // MMI 200
    '#FCE74E': 'yellow',    // MMI 300
    '#B0D34E': 'lime',      // MMI 350
    '#5DB94B': 'green',     // MMI 400
    '#004C41': 'emerald',   // MMI 500-600
  };

  return colorMap[hex.toUpperCase()] || 'blue';
}

/**
 * Helper function to map MMI level to Tremor color
 */
export function mmiLevelToTremorColor(
  mmiLevel: number,
  mmiScale?: MMIScaleDefinition[]
): string {
  if (!mmiScale || mmiScale.length === 0) {
    // Fallback to generic mapping if no BEP scale available
    if (mmiLevel <= 100) return 'red';
    if (mmiLevel <= 200) return 'orange';
    if (mmiLevel <= 300) return 'yellow';
    if (mmiLevel <= 350) return 'lime';
    if (mmiLevel <= 400) return 'green';
    return 'emerald';
  }

  // Find the MMI definition for this level
  const definition = mmiScale.find((def) => def.mmi_level === mmiLevel);
  if (definition && definition.color_hex) {
    return hexToTremorColor(definition.color_hex);
  }

  // Find closest level
  const sorted = [...mmiScale].sort((a, b) => a.mmi_level - b.mmi_level);
  const closest = sorted.reduce((prev, curr) =>
    Math.abs(curr.mmi_level - mmiLevel) < Math.abs(prev.mmi_level - mmiLevel)
      ? curr
      : prev
  );

  return hexToTremorColor(closest.color_hex);
}

/**
 * Get maximum MMI level from scale
 */
export function getMaxMMILevel(mmiScale?: MMIScaleDefinition[]): number {
  if (!mmiScale || mmiScale.length === 0) return 7; // Fallback
  return Math.max(...mmiScale.map((def) => def.mmi_level));
}

/**
 * Get minimum MMI level from scale
 */
export function getMinMMILevel(mmiScale?: MMIScaleDefinition[]): number {
  if (!mmiScale || mmiScale.length === 0) return 1; // Fallback
  return Math.min(...mmiScale.map((def) => def.mmi_level));
}
