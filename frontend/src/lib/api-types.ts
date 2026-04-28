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
  type_count: number;
  mapped_type_count: number;
  processing_error: string | null;
  discipline: string | null;
  task_id: string | null;
  created_at: string;
  updated_at: string;
  first_version_created_at: string;
}

export interface UploadModelRequest {
  project: string;
  name: string;
  version_number?: number;
  file: File;
}

/** Layer 1 extraction run (replaces the legacy ProcessingReport shape). */
export type ExtractionRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ExtractionRunLogEntry {
  ts?: string;
  level?: string;
  stage?: string;
  message?: string;
  details?: Record<string, unknown>;
}

export interface ExtractionRunListItem {
  id: string;
  source_file: string;
  status: ExtractionRunStatus;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  discovered_crs: string | null;
  extractor_version: string;
  error_message: string | null;
}

export interface ExtractionRun extends ExtractionRunListItem {
  crs_source: string | null;
  crs_confidence: number | null;
  discovered_units: Record<string, string>;
  quality_report: Record<string, unknown>;
  log_entries: ExtractionRunLogEntry[];
  task_id: string | null;
}

export interface SourceFileListItem {
  id: string;
  project: string;
  project_name: string;
  original_filename: string;
  format: string;
  file_size: number;
  checksum_sha256: string;
  mime_type: string;
  version_number: number;
  parent_file: string | null;
  is_current: boolean;
  uploaded_by: string | null;
  uploaded_at: string;
  latest_extraction_status: ExtractionRunStatus | null;
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

// Model Analysis types (type_analysis output)

export interface AnalysisStorey {
  name: string;
  elevation: number | null;
  height: number | null;
  element_count: number;
}

export interface AnalysisTypeStoreyDist {
  storey: string;
  elevation: number | null;
  instance_count: number;
}

export interface AnalysisTypeRecord {
  type_class: string;
  type_name: string | null;
  element_class: string;
  predefined_type: string | null;
  instance_count: number;
  is_empty: boolean;
  is_proxy: boolean;
  is_untyped: boolean;
  loadbearing_true: number;
  loadbearing_false: number;
  loadbearing_unset: number;
  is_external_true: number;
  is_external_false: number;
  is_external_unset: number;
  fire_rating_set: number;
  fire_rating_unset: number;
  primary_representation: string;
  mapped_item_count: number;
  mapped_source_count: number;
  reuse_ratio: number | null;
  properties: Record<string, unknown>;
  storey_distribution: AnalysisTypeStoreyDist[];
}

export interface ModelAnalysis {
  id: string;
  model: string;
  created_at: string;
  ifc_schema: string;
  file_size_mb: number | null;
  application: string;
  total_types: number;
  total_products: number;
  total_storeys: number;
  total_spaces: number;
  duplicate_guid_count: number;
  units: Record<string, unknown>;
  coordinates: Record<string, unknown>;
  project_name: string;
  site_name: string;
  building_name: string;
  storeys: AnalysisStorey[];
  types: AnalysisTypeRecord[];
  spatial_data: {
    bounding_box: { min_x: number; max_x: number; min_y: number; max_y: number } | null;
    positions: Array<{ x: number; y: number; cls: string }>;
    origin: { x: number; y: number };
  } | null;
}
