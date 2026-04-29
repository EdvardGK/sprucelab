# Session: Claim Inbox Frontend

## Summary
Built the user-visible loop on top of the Phase 6 claim API that shipped earlier today. `ProjectDocuments.tsx` was a one-card placeholder; it now renders a TypeBrowser-style two-pane Claim Inbox where users can review extracted normative statements and promote/reject/supersede them with keyboard shortcuts. This closes the user-facing half of the PDF→Claim→Rule→Verified pipeline; the backend half had no UI consumer until this session.

## Changes
- **New types**: `frontend/src/lib/claims-types.ts` — `Claim`, `ClaimListItem`, `ClaimNormalized`, `ClaimSourceLocation`, `ClaimStatus`, `ClaimType`, document shapes, mutation result envelopes. Match backend serializers in `apps/entities/serializers.py:801-892`.
- **New hooks**:
  - `frontend/src/hooks/use-claims.ts` — `claimsKeys` factory, `useClaimsList`/`useClaimDetail`/`useClaimConflicts` queries, `usePromoteClaim`/`useRejectClaim`/`useSupersedeClaim` mutations. Each mutation passes `?dry_run=true` through unchanged so the affordance is reserved for a future "preview" UI.
  - `frontend/src/hooks/use-documents.ts` — `documentsKeys` factory, list/detail/content (`?as=markdown|json`).
  - `frontend/src/hooks/use-claim-navigation.ts` — fork of `use-type-navigation.ts`. ←/→ navigates, A approves with auto-advance, R/S open dialogs, `/` focuses search. Same input-focus guard as the type-navigation original.
- **New components** (`frontend/src/components/features/claims/`): `ClaimInbox` (319 LOC container), `ClaimList`, `ClaimCard`, `ClaimDetail` (with provenance + decision history + conflicts panel), `ClaimFilterBar`, `ClaimRejectDialog`, `ClaimSupersedeDialog`. Two-pane layout (45/55), sticky tabs (Inbox/Promoted/Rejected/All) with count badges. URL state via `?tab=&claim=` for warehouse deep-linking.
- **Page**: `frontend/src/pages/ProjectDocuments.tsx` placeholder stripped; renders `<ClaimInbox/>`. Reads `?claim=<id>` for deep-link support.
- **i18n**: full `claims.*` namespace in `en.json` + `nb.json` (proper Norwegian æ/ø/å). Sidebar nav label updated to "Documents & Claims" / "Dokumenter og krav".
- **Deferred**: warehouse-side info-issue surfacing in `TypeDetailPanel` — see Technical Details.

## Technical Details
- **Plan was approved** as `~/.claude/plans/what-are-next-steps-delegated-hedgehog.md`. Two parallel Explore agents validated the API surface and the TypeBrowser idiom up front; no surprises during implementation.
- **Optimistic updates skipped**. Default invalidation matches `use-type-mapping.ts` warehouse hooks; React Query refetches on success. Avoids inventing optimistic logic for a state machine where 409 conflicts are real (claim can flip to terminal between list-load and POST).
- **Error envelope handling**: 409 ClaimStateError, 400 missing-reason, 404 not-found all surface as `error.response.data.error`. `extractApiError()` in `ClaimInbox.tsx` reads it via `axios.isAxiosError()` and falls back to a localized toast string.
- **Selection ↔ navigation sync**: two `useEffect` hooks bidirectionally bind `selectedClaimId` (URL-driven, click-driven) ↔ `nav.currentClaim.id` (keyboard-driven). The pair is guarded against re-firing and is the only place where eslint-disable was used (matches the existing convention in `TypeBrowser.tsx`).
- **Status counts** are derived from the unfiltered `useClaimsList({project})` payload so tab badges always show project-wide totals, not filtered subset totals.
- **Predicate options** are derived from the actual claim corpus, not hardcoded — `flow_rate`/`pressure` show up if extracted, even though they're deferred in the rule translator.
- **Deferred — warehouse info-issue surfacing**: the verification engine writes `claim_subject_match` info-issues to `TypeMapping.verification_issues` (per-IFCType, per-model). `TypeDetailPanel` consumes `GlobalTypeLibraryEntry` (cross-project TypeBank rollup) which doesn't carry that field. Two viable paths — extend the TypeBank serializer with project-scoped issues, or add a dedicated `/api/types/types/claim-issues/?project=&type_name=` endpoint — both are real backend+frontend changes, not one-liners. Data persists correctly today; this is presentation-only. Punted to next session with full rationale in `next-steps.md`.
- **Static checks**: `tsc --noEmit` clean, eslint clean (one warning fixed inline-disable), `vite build` green (4101 modules, 12.5s). No tests added — frontend test harness is absent and introducing one was explicitly out of scope.
- **Not exercised**: end-to-end runtime smoke (PDF upload → extract → promote in a browser). Requires the full stack (Postgres + Redis + Celery + FastAPI + Django + Vite) and `just` is not installed in this environment. Static guarantees are the strongest signal available without that.

## Next
- **Browser smoke** before declaring inbox "done": upload a claim-rich PDF (use `tests/fixtures/document_factory.py:build_pdf_claim_corpus`), exercise approve/reject/supersede + the keyboard shortcuts + i18n toggle.
- **Warehouse-side info-issue surfacing** is the obvious follow-up. Pick path (a) serializer extension or (b) dedicated endpoint.
- Other open threads (still pinned): Sprint 6.3 LLM extraction, agent-first hardening, TypeBank empirical validation. Same as before this session.

## Notes
- The plan file at `~/.claude/plans/what-are-next-steps-delegated-hedgehog.md` was approved as-is and held up through implementation — the only deviation was the deferred TypeDetailPanel surfacing, which the plan flagged but didn't acknowledge as a backend+frontend change.
- The supersede-candidate picker filters to same-predicate, same-project, same-status (unresolved/promoted) and caps at 50 results client-side. Works for current claim corpus density; if a project ever has >50 candidates of a single predicate, this needs a server-side search.
- Sidebar `nav.documents` label was changed from "Documents" → "Documents & Claims" to reflect the page's expanded scope. If document-library browsing lands later, a separate `/projects/:id/documents/library` route may be cleaner than tabs.
