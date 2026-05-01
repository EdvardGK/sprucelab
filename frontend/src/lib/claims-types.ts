// Phase 6 entity types: documents and claims.
// Shapes match backend serializers in apps/entities/serializers.py.

export type ClaimStatus = 'unresolved' | 'promoted' | 'rejected' | 'superseded';
export type ClaimType = 'rule' | 'spec' | 'requirement' | 'constraint' | 'fact' | 'storey_list';

export interface ClaimNormalized {
  predicate?: string;
  subject?: string;
  value?: string | number;
  units?: string;
  lang?: string;
  // storey_list claims carry a `floors` array — see StoreyListClaimPanel.
  floors?: StoreyListProposal[];
  [key: string]: unknown;
}

export interface StoreyListProposal {
  name: string;
  elevation_m?: number | null;
  source_guid?: string;
}

export interface ClaimSourceLocation {
  page?: number;
  paragraph?: number;
  char_start?: number;
  char_end?: number;
  bbox?: [number, number, number, number];
  [key: string]: unknown;
}

export interface ClaimListItem {
  id: string;
  project: string | null;
  source_file: string;
  document: string | null;
  scope: string | null;
  snippet: string;
  normalized: ClaimNormalized;
  claim_type: ClaimType;
  confidence: number;
  status: ClaimStatus;
  extracted_at: string;
}

export interface Claim {
  id: string;
  source_file: string;
  document: string | null;
  extraction_run: string;
  scope: string | null;
  project: string | null;
  original_filename: string;
  statement: string;
  normalized: ClaimNormalized;
  source_location: ClaimSourceLocation;
  claim_type: ClaimType;
  confidence: number;
  status: ClaimStatus;
  promoted_to_config: string | null;
  config_section: string;
  config_payload: Record<string, unknown>;
  superseded_by: string | null;
  rejected_reason: string;
  extracted_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

export interface ClaimPromoteRequest {
  section?: string;
  rule_payload?: Record<string, unknown>;
}

export interface ClaimPromoteResult {
  dry_run: boolean;
  status?: ClaimStatus;
  would_set_status?: ClaimStatus;
  config_id?: string;
  config_section?: string;
  rule_entry?: Record<string, unknown>;
  next_config?: Record<string, unknown>;
}

export interface ClaimRejectResult {
  dry_run: boolean;
  status?: ClaimStatus;
  would_set_status?: ClaimStatus;
  rejected_reason?: string;
  would_set_reason?: string;
}

export interface ClaimSupersedeResult {
  dry_run: boolean;
  status?: ClaimStatus;
  would_set_status?: ClaimStatus;
  superseded_by?: string;
  would_set_superseded_by?: string;
}

export interface ClaimConflictsResponse {
  count: number;
  results: ClaimListItem[];
}

export type DocumentFormat = 'pdf' | 'docx' | 'xlsx' | 'pptx';
export type DocumentExtractionMethod = 'text_layer' | 'ocr' | 'structured';

export interface DocumentListItem {
  id: string;
  source_file: string;
  scope: string | null;
  page_index: number;
  page_count: number;
  extraction_method: DocumentExtractionMethod;
  format: DocumentFormat;
  original_filename: string;
  char_count: number;
}

export interface DocumentDetail extends DocumentListItem {
  extraction_run: string;
  markdown_content: string;
  structured_data: Record<string, unknown>;
  structure: Record<string, unknown>;
  extracted_images: unknown[];
}

export interface ClaimsFilters {
  project?: string;
  scope?: string;
  source_file?: string;
  document?: string;
  status?: ClaimStatus;
  claim_type?: ClaimType;
  min_confidence?: number;
}

export interface DocumentsFilters {
  project?: string;
  scope?: string;
  source_file?: string;
  format?: DocumentFormat;
  extraction_method?: DocumentExtractionMethod;
}
