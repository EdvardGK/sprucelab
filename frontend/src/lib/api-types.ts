// Core API types for BIM Coordinator Platform

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  model_count?: number;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
}

export interface Model {
  id: string;
  project: string;
  name: string;
  original_filename: string;
  ifc_schema: string | null;
  file_url: string | null;
  file_size: number;
  fragments_url: string | null;
  fragments_size_mb: number | null;
  fragments_generated_at: string | null;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  parsing_status: 'pending' | 'parsing' | 'parsed' | 'failed';
  geometry_status: 'pending' | 'extracting' | 'completed' | 'partial' | 'skipped' | 'failed';
  validation_status: 'pending' | 'validating' | 'completed' | 'failed';
  version_number: number;
  parent_model: string | null;
  is_published: boolean;
  element_count: number;
  storey_count: number;
  system_count: number;
  processing_error: string | null;
  task_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UploadModelRequest {
  project: string;
  name: string;
  version_number?: number;
  file: File;
}

export interface ProcessingReport {
  id: string;
  model: string;
  model_name: string;
  model_id: string;
  project_id: string;
  project_name: string;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  overall_status: 'success' | 'partial' | 'failed';
  ifc_schema: string | null;
  file_size_bytes: number;
  stage_results: any[];
  total_entities_processed: number;
  total_entities_skipped: number;
  total_entities_failed: number;
  errors: any[];
  catastrophic_failure: boolean;
  failure_stage: string | null;
  failure_exception: string | null;
  failure_traceback: string | null;
  summary: string | null;
}

export interface ViewerGroup {
  id: string;
  project: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  models?: ViewerGroupModel[];
}

export interface ViewerGroupModel {
  id: string;
  model: string;
  is_visible: boolean;
  color_override: string | null;
}

export interface ViewerGroupListItem {
  id: string;
  project: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  model_count: number;
}

export interface ViewerModel {
  id: string;
  group: string;
  model: string;
  is_visible: boolean;
  color_override: string | null;
}

export interface CreateViewerGroupRequest {
  project: string;
  name: string;
  description?: string;
}

export interface UpdateViewerGroupRequest {
  name?: string;
  description?: string;
}

export interface CreateViewerModelRequest {
  group: string;
  model: string;
  is_visible?: boolean;
  color_override?: string;
}

export interface UpdateViewerModelRequest {
  is_visible?: boolean;
  color_override?: string | null;
}

// Project Statistics types
export interface TopType {
  name: string;
  ifc_type: string;
  count: number;
  quantity: number;
  unit: 'pcs' | 'm' | 'm2' | 'm3';
}

export interface TopMaterial {
  name: string;
  category: string | null;
  count: number;
  volume_m3: number;
}

export interface NS3451Coverage {
  total: number;
  mapped: number;
  pending: number;
  review: number;
  ignored: number;
  followup: number;
  percentage: number;
}

export interface MMIDistributionItem {
  mmi_level: number;
  count: number;
  percentage: number;
  color: string;
}

export interface ProjectBasepoint {
  gis_x: number;
  gis_y: number;
  gis_z: number | null;
  crs: string | null;
  model_name: string;
}

export interface ProjectStatistics {
  project_id: string;
  name: string;
  model_count: number;
  element_count: number;
  type_count: number;
  type_mapped_count: number;
  material_count: number;
  material_mapped_count: number;
  top_types: TopType[];
  top_materials: TopMaterial[];
  ns3451_coverage: NS3451Coverage;
  mmi_distribution: MMIDistributionItem[];
  basepoint: ProjectBasepoint | null;
  created_at: string;
  updated_at: string;
}
