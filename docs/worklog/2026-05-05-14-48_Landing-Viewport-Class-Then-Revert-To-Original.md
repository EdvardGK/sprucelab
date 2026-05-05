# Session: Landing viewport-class redesign, then revert to original on user direction

## Summary
Built and shipped a 5-class viewport composition system for the public landing (commit `c9bbe23` — Fibonacci spacing + golden modular type + per-breakpoint geometry + per-class Three.js camera framing), then reverted everything to the original `661ac5c` state on direct user feedback ("you're overcomplicating this. Set up dividers/containers. Have padding. Place content inside containers" → "tbh, the original was the best one"). Net session result: a one-line WONK=0 typography fix on the original landing, plus three feedback memories that should prevent the over-engineering from recurring.

## Changes

### Landing redesign shipped + reverted
- Commit `c9bbe23` (shipped to prod, then superseded): 5-class viewport system with `--bp-xs/sm/md/lg/xl` breakpoint tokens, distinct per-class compositions (XS/SM pocket backdrop, MD vertical hero with 38vh art band, LG editorial 2-col with golden split, XL editorial baseline, 2XL theatrical with scene scaling to `min(2400, available)`), `setFraming()` on `DioramaScene.ts` with 4 camera positions lerping over 300ms via rAF, `useViewportClass()` matchMedia hook on `Welcome.tsx` driving `data-vp` attribute and camera framing, header hairline + form right-border at LG+, footer 3-cell at 2XL with optional build-hash slot (+367 lines)
- Commit `692c5c9` (current state on main): forward-revert of the 3 landing files (`Welcome.tsx`, `Welcome.css`, `DioramaScene.ts`) to their state at `661ac5c`. Drops everything from `c9bbe23` and the prior Editorial Architecture work. Keeps git history intact (the abandoned commits `08e8624` → `c9bbe23` are still reachable). Restored composition: `.welcome-scene` as `position: fixed; inset: 0; left: 20%` (full-bleed diorama anchored to right 80% of viewport), `.welcome-veil` as soft radial gradient overlay, form panel at `min(560px, 100%)` floating left over the veil. (-367 +54 vs `c9bbe23`)
- Commit `087227c`: One-line typography fix — added `'WONK' 0` to `font-variation-settings` on `.welcome-wordmark` and `.welcome-heading` so Fraunces drops its swashy alternate glyphs (curly `f` descender, etc.). The WONK axis is on by default in Google Fonts' Fraunces delivery.

### Memory updates (the actually durable session output)
- New: `feedback-keep-layouts-simple.md` — "Layouts use containers + padding, not exotic ratio systems." Tagged as `SUPERSEDES ratio-system instinct` in MEMORY.md so future sessions don't reach for Fibonacci/golden/per-class compositions as the first move.
- Updated: `feedback-fibonacci-golden-ratio-design.md` — added the "white space ≠ gap between anchored elements" nuance the user clarified mid-session ("there shouldn't be a wide gap in between"). Then this whole memory becomes secondary to the `keep-layouts-simple` one.
- MEMORY.md index updated.

## Technical Details
**Forward-revert pattern (preserves history) used instead of git revert / hard reset:** `git checkout 661ac5c -- frontend/src/pages/Welcome.{tsx,css} frontend/src/components/welcome/DioramaScene.ts && git commit -m "..."`. Touches only the 3 landing files; leaves worklog, memory, plan, and infra files alone. The dropped work is still reachable in git log (commits `08e8624` through `c9bbe23` plus the Editorial Architecture `e3f7e40`). If the user later wants any piece back (e.g. just the camera framing system), it can be cherry-picked.

**Vercel chunk-cache observation:** Welcome.css is in a separate Vite chunk (`Welcome-{hash}.css`), lazy-loaded via the Welcome.tsx route. After a CSS-only change, the index.js bundle hash also changes (because it embeds the CSS chunk URL in the chunk manifest), but the verify-on-prod monitor needs to grep the *Welcome chunk* for the actual change signature, not the index bundle. Memorized this in the Welcome chunk hash hunting logic.

**WONK axis behavior:** Google Fonts' CSS2 API for Fraunces serves the full variable font (all axes baked in: opsz, wght, SOFT, WONK, etc.) regardless of which axes are declared in the URL. So `font-variation-settings: 'WONK' 0` works without any change to the font import URL. Previous Fraunces output was using WONK=1 (the file's default) which produces the alternate glyphs (curly `f`, swashy `g`).

## Next
- **User-facing**: Refresh `https://www.sprucelab.io/` to confirm the curly `f` is gone. Original full-bleed diorama composition is what's live.
- **No pending implementation**: The session ended on a clean state. Open question is whether the simple original is good enough or if the next pass should do a small, *contained* refinement (e.g. tighten panel padding, adjust veil opacity, swap headline copy).
- **Embed sequence not advanced this session**: PR 4/10 (scoped-token middleware) and PR 5/10 (ViewerTile + filter→isolation) still pending. Priority is whatever the user picks.

## Notes
- The user explicitly course-corrected away from elaborate design systems after seeing the iteration depth. Sprucelab's public surfaces should default to standard container-based composition. Reach for ratio systems only on explicit request.
- The Editorial Architecture work (`e3f7e40`, `c9bbe23`) is preserved in git history but considered over-engineered. Don't extend it; if a future session wants distinct breakpoint compositions, start from minimal containers + padding.
- The drift from `661ac5c` ate ~12 hours across two sessions for net-zero design value. Build the simplest version, ship, get user feedback BEFORE iterating into a system. Especially for marketing surfaces where "good enough simple" beats "over-thought elaborate."
- All three commits this session were pushed and verified on prod (`c9bbe23` → chunk `CYzSNphi`, `692c5c9` → chunk `DTLRxLy6`, `087227c` → chunk `BdRDuHJZ`). Django healthcheck 200 + healthy throughout.
