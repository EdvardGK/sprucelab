export interface ClaimIssueClaimRef {
  id: string;
  statement: string;
  predicate: string;
  value: string;
  units: string;
  document_id: string | null;
  document_filename: string | null;
}

export type ClaimIssueSeverity = 'info' | 'warning' | 'error';

export interface ClaimIssue {
  rule_id: string;
  rule_name: string;
  severity: ClaimIssueSeverity;
  message: string;
  model_id: string;
  model_name: string;
  ifc_type_id: string;
  claim: ClaimIssueClaimRef | null;
}

export interface ClaimIssuesResponse {
  count: number;
  results: ClaimIssue[];
}
