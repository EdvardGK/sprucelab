import { useMemo } from 'react';

import { useDocumentsList } from './use-documents';
import { useClaimsList } from './use-claims';
import type { DocumentListItem, ClaimListItem } from '@/lib/claims-types';

export interface DocumentsKpiSpark {
  key: string;
  value: number;
  label?: string;
}

export interface ProjectDocumentsKpis {
  totalDocuments: number;
  /** Documents that have at least one claim. */
  withClaims: number;
  /**
   * Documents pending review (have unresolved claims). When no claims at
   * all yet, distinct from withClaims.
   */
  pendingReview: number;
  /**
   * Classified documents — backend doesn't have a per-document classification
   * status yet (classification lives at the type level). Returned as null
   * so UI shows amber em-dash per modelers-own-data.
   */
  classified: number | null;

  /** Uploads per week, last 8 weeks (oldest → newest). */
  uploadsPerWeek: DocumentsKpiSpark[];

  isLoading: boolean;
}

const EMPTY: ProjectDocumentsKpis = {
  totalDocuments: 0,
  withClaims: 0,
  pendingReview: 0,
  classified: null,
  uploadsPerWeek: [],
  isLoading: false,
};

/**
 * Derive the Documents-page KPI row from existing list endpoints. No
 * extra API calls beyond the two the page already issues.
 *
 * Modelers-own-data: never fabricate. The "classified" metric isn't
 * computable today (classification status lives at the type level,
 * not the document level), so we surface null and the UI renders an
 * amber em-dash.
 */
export function useProjectDocumentsKpis(projectId?: string): ProjectDocumentsKpis {
  const { data: documents, isLoading: documentsLoading } = useDocumentsList(
    projectId ? { project: projectId } : undefined,
    { enabled: !!projectId },
  );
  const { data: claims, isLoading: claimsLoading } = useClaimsList(
    projectId ? { project: projectId } : undefined,
    { enabled: !!projectId },
  );

  const isLoading = documentsLoading || claimsLoading;

  return useMemo(() => {
    if (!documents) return { ...EMPTY, isLoading };
    const docs = documents as DocumentListItem[];
    const cls = (claims ?? []) as ClaimListItem[];

    const totalDocuments = docs.length;

    // Build per-source-file claim summaries so we can compute
    // "with claims" + "pending review" without an N+1.
    const totalBySource = new Map<string, number>();
    const unresolvedBySource = new Map<string, number>();
    for (const c of cls) {
      const sf = c.source_file;
      totalBySource.set(sf, (totalBySource.get(sf) ?? 0) + 1);
      if (c.status === 'unresolved') {
        unresolvedBySource.set(sf, (unresolvedBySource.get(sf) ?? 0) + 1);
      }
    }

    let withClaims = 0;
    let pendingReview = 0;
    for (const d of docs) {
      const t = totalBySource.get(d.source_file) ?? 0;
      if (t > 0) withClaims += 1;
      const u = unresolvedBySource.get(d.source_file) ?? 0;
      if (u > 0) pendingReview += 1;
    }

    // Uploads per week — no per-document upload date exposed in the
    // list payload (DocumentListItem has no `created_at`). Surface an
    // 8-bucket empty sparkline rather than fabricating distribution.
    const uploadsPerWeek: DocumentsKpiSpark[] = Array(8).fill(0).map((_, i) => ({
      key: `w-${i}`,
      value: 0,
      label: `Week ${i + 1}`,
    }));

    return {
      totalDocuments,
      withClaims,
      pendingReview,
      classified: null,
      uploadsPerWeek,
      isLoading,
    };
  }, [documents, claims, isLoading]);
}
