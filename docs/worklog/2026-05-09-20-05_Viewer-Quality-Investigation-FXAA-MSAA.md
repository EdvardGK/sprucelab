# Session: Viewer-quality investigation — click semantics, spatial-classifier guard, DPR cap, outline thickness, FXAA + MSAA

## Summary
Phase 1 PR 1.2 (viewer onto `useProjectFilter`) shipped earlier in the
day; this session is a single-PR-each cascade of findings that came
out of user review. Not a roadmap-aligned phase — pure visual/perf
debt clean-up. Commits are direct to `main` per trunk-based rule.

The user initially said "we don't invest more into the viewer" after
the click-fix (memory `feedback-viewer-perf-rabbithole.md` saved), then
re-opened it explicitly when low-res rendering became apparent.

## Commits, in order

| SHA | What |
|-----|------|
| `2416b14` | Click handler — collapse three-branch logic to "plain click always replaces inclusion + shift-click toggles". Linux compositors leak `ctrlKey: true` into plain clicks, demoting our metaKey/ctrlKey check into the additive branch — surfaced as "second click does nothing" |
| `5a58806` | Spatial-classifier guard — `if (group.hasProperties)` around `IfcRelationsIndexer.process(group)`. Fragments fast path loads geometry only; properties never ship as a sidecar so the indexer threw "FragmentsGroup properties not found" five times per federated load |
| `1ab5a0d` | Pixel-ratio cap 1.5 → 2.0 + `?dpr=N` override. Helped on DPR=2 (retina/4K@200%) displays. No-op on DPR=1, which the user has |
| `3254918` | Outline thickness 1.0 → 0.4. ThatOpen Outliner's `MeshBasicMaterial.opacity` controls THICKNESS, not transparency — `opacity: 1` was max thickness |
| `de7d4f2` | Outline thickness 0.4 → 0.2 (still too thick at 0.4 per review) |
| `50f47cb` | FXAA postprocessing pass. Cheap (~0.5-1ms) safety net for shader-stage aliasing |
| `d9f1a31` | **MSAA samples=4 on the EffectComposer's ping-pong RTs.** The decisive AA fix — see "GL-level diagnosis" below |

All seven commits pushed direct to `main`; Vercel rolled through six
bundle hashes; Railway healthcheck stayed 200 throughout.

## GL-level diagnosis (chrome-devtools)

User pointed at the `FragmentsModels` ThatOpen tutorial after I noted
the resolution was "unchanged" by the DPR cap bump. Spun up a
chrome-devtools session against the live viewer
(`/projects/4d9.../viewer/0816...`) and probed the canvas.

**Findings**:
- `windowDPR: 1` — Linux 1080p/1440p native, no scaling
- `effectiveDPR: 1` — buffer matches CSS 1:1
- GPU: `ANGLE Intel Iris Xe (TGL GT2)`, `MAX_SAMPLES: 16`
- `WebGL 2.0`
- WebGLRenderer is constructed with `antialias: true` (verified in
  ThatOpen's compiled bundle), but the `PostproductionRenderer` pipes
  the scene through an `EffectComposer` whose default
  `WebGLRenderTargets` have `samples: 0` — **so the GL driver's MSAA
  is bypassed for the entire offscreen postpro chain.** This is the
  classic "EffectComposer kills antialiasing" pitfall.

After MSAA fix, post-reload probe returned `canvasSamples: 4` on the
bound framebuffer — deterministic confirmation MSAA is live.

## Why MSAA over the alternatives

Three choices were on the table:

1. **FXAA pass at end of composer** — single fragment shader,
   ~0.5-1ms, blurs edge gradients. Cheap. Mild softness on fine
   details. (Shipped alongside MSAA as a safety net.)
2. **MSAA on the composer RTs** (chosen) — true hardware AA on the
   geometry side; samples=4 is the Iris Xe sweet spot. Three.js
   reads `WebGLRenderTarget.samples` at GL allocation only, so we
   swap both ping-pong RTs for samples=4 equivalents right after
   `setPasses()`. Subsequent `setSize()` preserves samples.
3. **Supersampling via `setPixelRatio(window.devicePixelRatio * N)`** —
   cleanest result but 4× fragment shading at 2x. Iris Xe couldn't
   take it.

MSAA wins on quality + perf simultaneously. FXAA is kept on top
because it catches shader-emitted edges (the custom-effects pass) the
MSAA RT doesn't see.

## Files touched

- `frontend/src/components/features/viewer/UnifiedBIMViewer.tsx` —
  six edits across the day:
  - Outliner config (color/opacity)
  - Spatial-classifier guard
  - DPR cap + `?dpr=` override
  - FXAA pass + ResizeObserver
  - MSAA RT swap + `?msaa=` override
  - `postproDisposablesRef` for tracking ResizeObserver / RT disposal
- `frontend/src/components/features/viewer/ViewerFilterPanel.tsx` —
  click-handler rewrite (PR 1.2 follow-up)
- `~/.claude/projects/.../memory/feedback-viewer-perf-rabbithole.md`
  (NEW) + `MEMORY.md` index update

## URL escape hatches (existing + new)

- `?ao=off` — disable SSAO (largest postpro cost; pre-existing)
- `?dpr=N` — explicit pixel-ratio cap (default 2.0)
- `?fxaa=off` — disable FXAA pass (added today)
- `?msaa=N` — sample count for composer RTs (0-8; default 4; added today)
- `?culler=off` — disable MeshCullerRenderer (pre-existing)

## Verification

- `yarn tsc --noEmit` clean across all seven commits
- `yarn build` clean (only the preexisting UnifiedBIMViewer chunk-size warning)
- chrome-devtools post-MSAA: `canvasSamples=4`, `MAX_SAMPLES=16`,
  no errors/warnings in console
- Vercel + Railway healthy throughout

## Next

Phase 1 PR 1.3 (`<DrillTarget>` + interactive `CanvasStatusPanel`
chips + DrillModal demote) is still the planned next step. Or:

- **`FragmentsModels` migration** (the tutorial the user linked):
  worker-based loader, off-thread culling, built-in LOD. ~1-2 days,
  cross-cutting refactor of the load path + Classifier + Hider +
  Highlighter. Promised wins: smoother frames, lower memory, proper
  LOD for distant geometry.
- **Properties sidecar pipeline (PR-B)** still parked. PR-A guard
  silenced the warning; no pressing reason to push PR-B unless storey
  filtering is needed.

User's call which one to take next.

## Notes

- The viewer-perf-rabbithole memory got saved early in the session and
  then partially superseded by the user re-opening the lane. Memory
  still stands — *don't volunteer* viewer fixes when adjacent issues
  surface; act when the user explicitly opens the door (which they
  did here twice).
- Per `feedback-frontend-no-unit-tests.md`, no automated tests added
  — verification = chrome-devtools live probes + type-check + build.
- Plan files: PR 1.2 detail
  `~/.claude/plans/lets-pick-up-where-happy-popcorn.md`. No new plan
  file for this session — every commit stood on its own.
