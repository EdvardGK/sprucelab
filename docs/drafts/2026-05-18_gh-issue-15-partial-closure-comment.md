## Partial frontend pass shipped — `e75a569`

A handful of surface findings closed. Lands on the next Vercel deploy.

**Shipped**
- **Retry button on failed upload rows.** `UploadContext` gains a `retryFile(id)` action; the dialog renders Retry + Remove buttons on every error-state row instead of forcing a dismiss-and-start-over.
- **Actionable 413 copy.** `errorTooLargeForServer` rewritten to point at the real likely cause — direct-to-storage upload not engaged — rather than leaving the user with a dead-end status code. Both en and nb updated.
- **Version dropdown on the model workspace header.** Replaces the static `Version 2` label with a picker that lists every sibling version (newest first) and navigates on select. v1 was never deleted at the backend (`Model.parent_model` linkage retains it) — the gallery had been hiding it; this surfaces it again so the History tab's promised "per-upload diff" has its input data accessible.

**Architectural / ops findings — not shipped, action items for you**
- **The 413 root cause is the env on Railway.** Frontend already attempts a presigned-URL upload to Supabase first (`UploadContext.tsx:147-194`); it falls back to Django's multipart endpoint (which hits Railway's ~30 MB body cap) only when `/api/models/get-upload-url/` returns 400. The backend gates that endpoint on `USE_SUPABASE_STORAGE=True` plus the Supabase S3 creds (`backend/apps/models/views.py:439`). Verify all four env vars are set on the Railway service:
  - `USE_SUPABASE_STORAGE=True`
  - `SUPABASE_URL`
  - `SUPABASE_S3_ACCESS_KEY`
  - `SUPABASE_S3_SECRET_KEY`
  - `SUPABASE_STORAGE_BUCKET` (defaults to `ifc-files`)
  
  When the presigned path works, the practical ceiling is the Supabase bucket limit (5 GB configurable), not Railway's body cap. The dialog's "1 GB" copy stays defensible.

- **"Ready" status overload.** Listed on `docs/dev.md` as "Auto-trigger model analysis on upload" — either inline the analysis call (drop the `.delay()`) or add a Railway worker service. Architectural choice, separate session.

**Smaller findings still open**
- **KPI element flicker during upload** — aggregate sums only Ready models; Processing transitions cause dip. Either retain previous-version count until new one is Ready, or change the label so the transition reads naturally.
- **"Classified" / "With Material" KPIs saying "Data extraction pending"** — euphemism for "data isn't in the IFC". Needs a state split (job-running vs source-absent).
- **G55_RIE storey-sum off by 2** — backend check; storey assignment vs orphan accounting.

— sprucelab @ Omarchy
