# Session: docs/dev.md as shared devhub + 2026-05-16 feedback stream absorbed

## Summary
User dropped a comprehensive structured feedback stream covering 16 surfaces/primitives (cross-filter regression, rules editor, events module, scopes, workspaces, viewer UX, point clouds, etc.). Captured verbatim under `docs/plans/` and translated into the `docs/dev.md` punch list — that file is now the canonical project tracker every Claude session and agent must read first. Reinforced discoverability across CLAUDE.md, project memory, and the repo README so no future session lands without seeing the pointer.

## Changes

### Verbatim feedback stream preserved
- `docs/plans/2026-05-16_user-feedback-stream-finish-line.md` — every line of the user's 16-point stream quoted under topic headings. Used as the authoritative reference; the dev.md punch list is the translation.

### `docs/dev.md` rebuilt around the new feedback (commit `d35142a`)
- **Punch list reorganized** — Cross-filter "feels right" elevated to P0, led by the treemap→viewer regression user has flagged "a million times". 12 new sections added: Project rules editor + verification + GIS site map; Sidebar IA (Files/Data/Project/Workspace); Event module + Meetings + version-locking on events; Scopes (sub-project containers, lifecycle stages); My Workspace + Company Workspaces; Project admin page; Viewer UX overhaul (HUDs/toolbars/section/annotation→issue/isolate); Drawings gallery toggle; Point clouds; Materials breathing-room overhaul; Claims AI engine + LLM key + agent framework.
- **Page coverage table** picked up 11 new rows (Events, Meetings, Teams, admin/rules, admin overview, site map, point clouds, My Workspace, Company workspace, EIR builder split admin-vs-front).
- **Deprecate-or-Develop** got a new "Design-with-in-mind" tier for integration targets (Reduzer first per the user's partnership context; then Autodesk/Dalux/Solibri/Speckle/BCF/Propely/Cobuilder/Diplom). Design the data shapes; build only when the real-world relationship exists.

### docs/dev.md picked up the May 12 audit residue earlier in session (commit `0d3e949`)
- Type-page hero discipline (recurring user complaint).
- EIR builder full visual overhaul (separate from Phase 7 archive restore).
- New Reference section pointing at the May 12 audit plan and 8-session closeout worklog.

### "Why Sprucelab" anchor added to dev.md (commit `de5fea4`)
- Lead paragraphs explaining the data-stranded thesis, agent-first lock-in, and the "projects are the unit" framing (isolated containers; federation via TypeBank + embed links is opt-in on top).

### Shared-devhub discoverability (this session)
- `README.md` — pointer block at the top sending anyone touching the codebase to `docs/dev.md`.
- `CLAUDE.md` — pointer block already at the top (from earlier commit `1919bf6`).
- Project memory — `dev-md-canonical-tracker.md` is the first entry in MEMORY.md.

### Working-tree leftovers committed (commit `bcc973f`)
- Chore batch from a prior session: QTO not-configured state, upload error UX with i18n, Search nav disabled with tooltip, PlatformPanel eye-icon affordance. Diff inspected via Explore agents before commit so the message described what actually changed.

## Technical Details

**Captured before translating.** The verbatim stream lives untouched in `docs/plans/` so the user's framing stays authoritative. Anyone disagreeing with my translation in dev.md can compare to the original.

**Treemap → viewer cross-filter is P0.** User has reported this repeatedly. The data-extraction (TYPE class) vs fragments-runtime (ENTITY class) mismatch was patched backend-side in commit `4215e1d` (added `entity_ifc_type` field on IFCType). The remaining work is confirming the frontend uses the prefixed `IfcWall` form through `typeVisibility` AND that `useTypesInstancesByClass` returns matching GUIDs. Document the diagnosis as the first finish-line item.

**Reduzer-first integration posture.** User flagged Reduzer as the highest-priority partnership target (existing working relationship; they own the LCA reporting; Sprucelab's pitch is "cleaner data going in"). All other integration targets (Autodesk, Dalux, Solibri, Speckle, BCF, Propely, Cobuilder, Diplom) are "design with in mind" — shape the data so it could flow there; do not build connectors until the relationship is real.

**Pushback discipline this session.** Twice I reflexively reached for "cut" in the complexity audit; user corrected both times. Captured the rule in `feedback-deprecate-or-develop-never-default-cut.md` — default is develop or deprecate, never cut without positive evidence.

## Next

1. **Treemap → viewer cross-filter regression.** P0. Diagnose end-to-end on the Type page; confirm `entity_ifc_type` flows through `typeVisibility` AND `useTypesInstancesByClass` returns matching GUIDs.
2. **Annotations / proposals primitive + Issues primitive.** New first-class models. Distinct from Claims. Required before LCA proposals, material substitutions, instance overrides, drawing annotations.
3. **Auto-analysis trigger fix.** Drop `.delay()` and run synchronously in `processing-complete`, or add a Railway Celery worker. Pick one.
4. **Project rules editor + verification + GIS site map.** Big block. Lives under project admin (limited visibility); user-facing EIR/BEP page surfaces the front of it.
5. **"Copy view link" share button.** `?d=base64` encoder is shipped, affordance is missing.

## Notes

- `docs/dev.md` is the contract for future sessions. Read it first; update it on every ship.
- Working tree still carries `frontend/src/App.tsx` mods (QtoWorkbenchWireframe lazy import + `/dev/qto-workbench` route) and the new `pages/dev/QtoWorkbenchWireframe.tsx` file from a parallel session. Not committed this session — flagged for next session to characterize and absorb.
- `40ffd42` ("docs(worklog): adopt system-wide agent-signature header convention") landed from a parallel session between my commits; clean fast-forward, no conflict.
- The verbatim stream itself is what makes the punch list trustworthy — if anyone disagrees with how I translated it, they can read the user's words at `docs/plans/2026-05-16_user-feedback-stream-finish-line.md`.
