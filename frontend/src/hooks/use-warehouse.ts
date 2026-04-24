// =============================================================================
// use-warehouse.ts - Barrel file
//
// All shared types, interfaces, and query keys live here.
// Hook implementations are split across focused files:
//   - use-type-mapping.ts  (TypeMapping CRUD, materials, dashboard, verification, global library)
//   - use-type-bank.ts     (TypeBank queries, semantic types, normalization)
//   - use-type-export.ts   (Excel export/import, Reduzer/LCA export, TypeBank export)
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface NS3451Code {
  code: string;
  name: string;
  name_en: string | null;
  guidance: string | null;
  level: number;
  parent_code: string | null;
}

export interface TypeDefinitionLayer {
  id?: string;
  type_mapping?: string;
  layer_order: number;
  material_name: string;
  // Material classification (NS3457-8)
  ns3457_code: string | null;
  ns3457_name: string | null;
  // Quantity per type unit (recipe ratio)
  quantity_per_unit: number;
  material_unit: 'm2' | 'm' | 'm3' | 'kg' | 'pcs';
  // Visual thickness for sandwich diagram (optional)
  thickness_mm: number | null;
  // EPD/LCA reference
  epd_id: string | null;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TypeMapping {
  id: string;
  ifc_type: string;
  ns3451_code: string | null;
  ns3451: string | null;
  ns3451_name: string | null;
  product: string | null;
  representative_unit: 'pcs' | 'm' | 'm2' | 'm3' | null;
  discipline: string | null;
  // Type category (generalization level)
  type_category: 'generic' | 'specific' | 'product';
  mapping_status: 'pending' | 'mapped' | 'ignored' | 'review' | 'followup';
  confidence: number | null;
  notes: string | null;
  mapped_by: string | null;
  mapped_at: string | null;
  created_at: string;
  updated_at: string;
  definition_layers?: TypeDefinitionLayer[];
  // Verification (engine)
  verification_status?: 'pending' | 'auto' | 'verified' | 'flagged';
  verification_issues?: VerificationIssue[];
  verified_engine_at?: string | null;
}

// Verification engine types
export interface VerificationIssue {
  rule_id: string;
  rule_name: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface ModelVerificationResult {
  model_id: string;
  total_types: number;
  checked: number;
  passed: number;
  warnings: number;
  failed: number;
  skipped: number;
  health_score: number;
  rules_applied: string[];
  timestamp: string;
  type_results: Array<{
    type_id: string;
    type_name: string;
    status: 'pass' | 'warning' | 'fail';
    issues: VerificationIssue[];
  }>;
}

export interface NS3451HierarchyNode {
  code: string;
  name: string;
  name_en: string | null;
  guidance: string | null;
  level: number;
  children: Record<string, NS3451HierarchyNode>;
}

export type NS3451Hierarchy = Record<string, NS3451HierarchyNode>;

export interface IFCType {
  id: string;
  model: string;
  type_guid: string | null;
  type_name: string;
  ifc_type: string;
  properties: Record<string, unknown> | null;
  mapping: TypeMapping | null;
  instance_count: number;
}

export interface MaterialMapping {
  id: string;
  material: string;
  standard_name: string | null;
  density_kg_m3: number | null;
  epd_reference: string | null;
  thermal_conductivity: number | null;
  mapping_status: 'pending' | 'mapped' | 'ignored' | 'review';
  notes: string | null;
  mapped_by: string | null;
  mapped_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Material {
  id: string;
  model: string;
  material_guid: string | null;
  name: string;
  category: string | null;
  properties: Record<string, unknown> | null;
  mapping: MaterialMapping | null;
  usage_count: number;
}

export interface MappingSummary {
  total: number;
  mapped: number;
  pending: number;
  ignored: number;
  review: number;
  progress_percent: number;
}

// Dashboard Metrics Types
export interface ModelHealthMetrics {
  id: string;
  name: string;
  discipline: string | null;
  total_types: number;
  mapped: number;
  pending: number;
  ignored: number;
  review: number;
  followup: number;
  health_score: number;
  status: 'healthy' | 'warning' | 'critical';
}

export interface DisciplineMetrics {
  total: number;
  mapped: number;
  pending: number;
  health_score: number;
}

export interface DashboardMetrics {
  project_summary: {
    total_types: number;
    mapped: number;
    pending: number;
    ignored: number;
    review: number;
    followup: number;
    progress_percent: number;
    health_score: number;
    classification_percent: number;
    unit_percent: number;
    material_percent: number;
  };
  models: ModelHealthMetrics[];
  by_discipline: Record<string, DisciplineMetrics>;
}

export interface BulkUpdateMapping {
  ifc_type_id: string;
  ns3451_code: string | null;
  mapping_status?: 'pending' | 'mapped' | 'ignored' | 'review';
}

export interface BulkUpdateResponse {
  created: number;
  updated: number;
  errors: Array<{ ifc_type_id: string; error: string }>;
}

export interface TypeInstance {
  id: string;
  ifc_guid: string;
  name: string | null;
  ifc_type: string;
  storey_id: string | null;
}

export interface TypeInstancesResponse {
  type_id: string;
  type_name: string;
  type_guid: string;
  ifc_type: string;
  model_id: string;
  total_count: number;
  offset: number;
  limit: number;
  instances: TypeInstance[];
}

// Excel Import/Export Types
export interface ExcelImportSummary {
  total_rows: number;
  updated: number;
  created: number;
  skipped: number;
  error_count: number;
}

export interface ExcelImportError {
  row: number;
  type_guid: string;
  error: string;
}

export interface ExcelImportWarning {
  row: number;
  type_guid: string;
  warning: string;
}

export interface ExcelImportResult {
  success: boolean;
  summary: ExcelImportSummary;
  errors: ExcelImportError[];
  warnings: ExcelImportWarning[];
}

// Semantic Types
export type SemanticTypeCategory =
  | 'A-Structural'
  | 'D-Openings'
  | 'E-Cladding'
  | 'F-MEP'
  | 'Z-Generic';

export interface SemanticType {
  id: string;
  code: string;
  name_no: string;
  name_en: string;
  category: SemanticTypeCategory;
  canonical_ifc_class: string | null;
  is_active: boolean;
  type_bank_entry_count: number;
}

export interface SemanticTypeFull extends SemanticType {
  alternative_ifc_classes: string[];
  suggested_ns3451_codes: string[];
  name_patterns: string[];
  description: string | null;
  ifc_mappings: SemanticTypeIFCMapping[];
  created_at: string;
  updated_at: string;
}

export interface SemanticTypeIFCMapping {
  id: string;
  semantic_type: string;
  ifc_class: string;
  predefined_type: string | null;
  is_primary: boolean;
  is_common_misuse: boolean;
  confidence_hint: number | null;
  note: string | null;
}

export interface SemanticTypeSuggestion {
  code: string;
  name_en: string;
  source: 'ifc_class' | 'name_pattern' | 'predefined_type';
  confidence: number;
  is_primary: boolean;
  is_common_misuse: boolean;
  note: string | null;
}

export interface SemanticSummary {
  total: number;
  with_semantic_type: number;
  without_semantic_type: number;
  coverage_percent: number;
  by_source: Record<string, number>;
  by_semantic_type: Record<string, number>;
}

// TypeBank entry with semantic type fields
export interface TypeBankEntry {
  id: string;
  ifc_class: string;
  type_name: string;
  predefined_type: string | null;
  material: string | null;
  ns3451_code: string | null;
  ns3451_name: string | null;
  discipline: string | null;
  canonical_name: string | null;
  representative_unit: 'pcs' | 'm' | 'm2' | 'm3' | null;
  total_instance_count: number;
  source_model_count: number;
  mapping_status: 'pending' | 'mapped' | 'ignored' | 'review';
  confidence: number | null;
  observation_count: number;
  // Semantic type fields
  semantic_type: string | null;
  semantic_type_code: string | null;
  semantic_type_name: string | null;
  semantic_type_source: 'auto_ifc_class' | 'auto_name_pattern' | 'manual' | 'verified' | null;
  semantic_type_confidence: number | null;
}

export interface TypeBankEntryFull extends TypeBankEntry {
  description: string | null;
  pct_is_external: number | null;
  pct_load_bearing: number | null;
  pct_fire_rated: number | null;
  created_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  semantic_type_data: SemanticType | null;
  observations: TypeBankObservation[];
  aliases: TypeBankAlias[];
}

export interface TypeBankObservation {
  id: string;
  type_bank_entry: string;
  source_model: string;
  source_model_name: string;
  source_model_project: string;
  source_type: string;
  source_type_name: string;
  instance_count: number;
  pct_is_external: number | null;
  pct_load_bearing: number | null;
  pct_fire_rated: number | null;
  property_variations: Record<string, unknown> | null;
  observed_at: string;
}

export interface TypeBankAlias {
  id: string;
  canonical: string;
  alias_type_name: string;
  alias_ifc_class: string | null;
  alias_source: string | null;
  created_at: string;
}

export interface TypeBankSummary {
  total: number;
  mapped: number;
  pending: number;
  ignored: number;
  review: number;
  progress_percent: number;
  by_ifc_class: Record<string, number>;
  by_discipline: Record<string, number>;
}

// Global Type Library Types
export type VerificationStatus = 'pending' | 'auto' | 'verified' | 'flagged';

export interface GlobalTypeLibraryEntry {
  id: string;
  ifc_class: string;
  type_name: string;
  predefined_type: string | null;
  material: string | null;
  // Classification
  ns3451_code: string | null;
  ns3451_name: string | null;
  discipline: string | null;
  canonical_name: string | null;
  representative_unit: 'pcs' | 'm' | 'm2' | 'm3' | null;
  // Semantic type
  semantic_type: string | null;
  semantic_type_code: string | null;
  semantic_type_name: string | null;
  semantic_type_source: string | null;
  semantic_type_confidence: number | null;
  // Statistics
  total_instance_count: number;
  source_model_count: number;
  mapping_status: 'pending' | 'mapped' | 'ignored' | 'review';
  confidence: number | null;
  observation_count: number;
  // Verification (three-tier: pending -> auto -> verified/flagged)
  verification_status: VerificationStatus;
  verified_at: string | null;
}

export interface GlobalTypeLibrarySummary {
  total: number;
  by_verification_status: Record<VerificationStatus, number>;
  by_mapping_status: Record<string, number>;
  by_ifc_class: Record<string, number>;
  by_discipline: Record<string, number>;
  empty_types_count: number;
  verification_progress_percent: number;
}

// =============================================================================
// QUERY KEYS (shared across hook files)
// =============================================================================

export const warehouseKeys = {
  all: ['warehouse'] as const,

  // NS3451 Codes
  ns3451: () => [...warehouseKeys.all, 'ns3451'] as const,
  ns3451List: (filters?: { level?: number; parent_code?: string; search?: string }) =>
    [...warehouseKeys.ns3451(), 'list', filters] as const,
  ns3451Hierarchy: () => [...warehouseKeys.ns3451(), 'hierarchy'] as const,

  // IFC Types
  types: () => [...warehouseKeys.all, 'types'] as const,
  typesList: (modelId: string, filters?: { ifc_type?: string }) =>
    [...warehouseKeys.types(), 'list', modelId, filters] as const,
  typeDetail: (id: string) => [...warehouseKeys.types(), 'detail', id] as const,
  typesSummary: (modelId: string) => [...warehouseKeys.types(), 'summary', modelId] as const,
  typeInstances: (typeId: string, options?: { limit?: number; offset?: number }) =>
    [...warehouseKeys.types(), 'instances', typeId, options] as const,

  // Type Mappings
  typeMappings: () => [...warehouseKeys.all, 'type-mappings'] as const,
  typeMappingsList: (modelId: string) =>
    [...warehouseKeys.typeMappings(), 'list', modelId] as const,
  typeMappingDetail: (id: string) => [...warehouseKeys.typeMappings(), 'detail', id] as const,

  // Materials
  materials: () => [...warehouseKeys.all, 'materials'] as const,
  materialsList: (modelId: string, filters?: { category?: string }) =>
    [...warehouseKeys.materials(), 'list', modelId, filters] as const,
  materialDetail: (id: string) => [...warehouseKeys.materials(), 'detail', id] as const,
  materialsSummary: (modelId: string) => [...warehouseKeys.materials(), 'summary', modelId] as const,

  // Material Mappings
  materialMappings: () => [...warehouseKeys.all, 'material-mappings'] as const,
  materialMappingsList: (modelId: string) =>
    [...warehouseKeys.materialMappings(), 'list', modelId] as const,

  // Dashboard Metrics
  dashboardMetrics: (projectId?: string, modelId?: string) =>
    [...warehouseKeys.all, 'dashboard-metrics', { projectId, modelId }] as const,
};

// Semantic type query keys
export const semanticTypeKeys = {
  all: ['semantic-types'] as const,
  list: () => [...semanticTypeKeys.all, 'list'] as const,
  byCategory: () => [...semanticTypeKeys.all, 'by-category'] as const,
  forIfcClass: (ifcClass: string) => [...semanticTypeKeys.all, 'for-ifc-class', ifcClass] as const,
  detail: (id: string) => [...semanticTypeKeys.all, 'detail', id] as const,
};

// TypeBank query keys
export const typeBankKeys = {
  all: ['type-bank'] as const,
  list: (filters?: { ifc_class?: string; mapping_status?: string; search?: string }) =>
    [...typeBankKeys.all, 'list', filters] as const,
  detail: (id: string) => [...typeBankKeys.all, 'detail', id] as const,
  summary: () => [...typeBankKeys.all, 'summary'] as const,
  semanticSummary: () => [...typeBankKeys.all, 'semantic-summary'] as const,
  suggestions: (id: string) => [...typeBankKeys.all, 'suggestions', id] as const,
};

// Global Type Library query keys
export const globalTypeLibraryKeys = {
  all: ['type-library'] as const,
  list: (filters?: Record<string, string>) =>
    [...globalTypeLibraryKeys.all, 'list', filters] as const,
  detail: (id: string) => [...globalTypeLibraryKeys.all, 'detail', id] as const,
  summary: (filters?: Record<string, string>) =>
    [...globalTypeLibraryKeys.all, 'summary', filters] as const,
  emptyTypes: (filters?: Record<string, string>) =>
    [...globalTypeLibraryKeys.all, 'empty-types', filters] as const,
};

// =============================================================================
// RE-EXPORTS from focused hook files
// =============================================================================

// Type Mapping hooks (NS3451, IFC Types, Materials, Dashboard, Verification, Global Library)
export {
  useNS3451Codes,
  useNS3451Hierarchy,
  useModelTypes,
  useTypeMappingSummary,
  useTypeInstances,
  useUpdateTypeMapping,
  useCreateTypeMapping,
  useBulkUpdateTypeMappings,
  useModelMaterials,
  useMaterialMappingSummary,
  useUpdateMaterialMapping,
  useCreateMaterialMapping,
  useVerifyModel,
  useDashboardMetrics,
  useGlobalTypeLibrary,
  useGlobalTypeLibrarySummary,
  useEmptyTypes,
  useVerifyType,
  useFlagType,
  useResetVerification,
} from './use-type-mapping';

// TypeBank hooks (TypeBank queries, Semantic types, Normalization)
export {
  useSemanticTypes,
  useSemanticTypesByCategory,
  useSemanticTypesForIfcClass,
  useTypeBankEntries,
  useTypeBankEntry,
  useTypeBankSummary,
  useSemanticSummary,
  useSemanticTypeSuggestions,
  useAutoNormalizeTypeBank,
  useSetSemanticType,
  useVerifySemanticType,
} from './use-type-bank';

// Export hooks (Excel, Reduzer, TypeBank Excel)
export {
  useExportTypesExcel,
  useExportTypesReduzer,
  useImportTypesExcel,
  useExportTypeBankExcel,
} from './use-type-export';
