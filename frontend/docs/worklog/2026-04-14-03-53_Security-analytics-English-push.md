# Session: Plausible + security headers + English auth + two prod pushes

## Summary
Continuation of the welcome-scene session. Shipped Plausible analytics, Django security headers + DRF throttling, frosted backdrop card on the welcome page, and converted the four auth pages from hardcoded Norwegian to English for investor/user feedback. Two pushes to `origin/main` with Railway + Vercel auto-deploys — second push recovered from a `noUnusedLocals` tsc failure that took down the first Vercel build. Also wrote a plan for 8-language i18n that's now shelved in favor of English-only.

## Changes
- **Plausible Analytics** wired in `frontend/index.html:8-12` — v2 script with site-specific ID `pa-OtI5qEkXXsWykRhpNOaYh`. Fires on first page load. User signed up on plausible.io separately, no code-side credentials needed. SPA route-change pageviews still TODO (need a `useEffect` in `App.tsx` that fires `plausible('pageview')` on location changes).
- **Frosted parchment card** on welcome page panel — `frontend/src/pages/Welcome.css:138-159`. `backdrop-filter: blur(10px) saturate(120%)` with parchment tint, ink border, subtle inset highlight + soft drop shadow. Fixes the "can't read timeline over busy 3D scene" feedback.
- **Django security headers** in `backend/config/settings.py`:
  - `SECURE_CONTENT_TYPE_NOSNIFF = True`
  - `SECURE_BROWSER_XSS_FILTER = True`
  - `SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'`
  - `X_FRAME_OPTIONS = 'DENY'`
  - Production-only (`if not DEBUG`): `SECURE_SSL_REDIRECT`, `SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')`, HSTS 1yr + `includeSubDomains` + `preload`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`.
- **DRF throttling** in the same file: `DEFAULT_THROTTLE_CLASSES` = AnonRateThrottle + UserRateThrottle, `DEFAULT_THROTTLE_RATES` = `{anon: '60/min', user: '600/min'}`. Baseline protection, individual views can override.
- **Health check throttle exemption** in `backend/config/views.py` — `@throttle_classes([])` on `health_check` so Railway's probes never get rate-limited.
- **English translations** for all four auth pages. `en` is now canonical; `nb` is out of the source until i18n infrastructure lands:
  - `frontend/src/pages/Welcome.tsx` — hero ("Thanks, {name}."), timeline labels (Registered / Under review / Access granted / First sign-in), use-case form fields, footer meta, signout button, rejected state, loading state.
  - `frontend/src/pages/Login.tsx` — form labels, mode toggle (Password / Magic link), submit states, magic-link confirmation, error fallback, signup link.
  - `frontend/src/pages/Signup.tsx` — apply-for-access form, password validation message, confirmation screen, return-to-signin link.
  - `frontend/src/pages/AuthCallback.tsx` — loading + error states.
- **Build fix** — `frontend/src/components/welcome/BlueprintCityScene.ts:138` removed unused `easeOutCubic` helper that tripped `noUnusedLocals` and failed the Vercel build on the first push. Caught via `npx tsc && npx vite build` before the second push.
- **Plan file**: `docs/plans/2026-04-14-03-42_Public-pages-i18n-8-languages.md` — full spec for 8-language public pages (en/nb/es/fr/ar/zh/ko/ja) with namespace split, font loading, RTL, language picker. Shelved mid-session when user reduced scope to English-only, kept as reference for when international feedback is needed.

## Technical Details

### Security-headers push failure and recovery
First push (`10baf31..e7a232c`) went to prod immediately on both Railway and Vercel. Railway built cleanly and Django started serving with new headers. Vercel build failed at `tsc` with `TS6133: 'easeOutCubic' is declared but its value is never read` — strict mode + `noUnusedLocals`. The helper had been replaced by `smoothstep` earlier in the session but the declaration was orphaned. Fix was 1 line, pre-validated with `npx tsc && npx vite build`, pushed as second push `e7a232c..7760c0c`.

Lesson: whenever the scene file changes get committed without a local `yarn build` first, the strict-mode dead-code error catches you. Adding `tsc --noEmit` to the auto-sync hook would have caught this before pushing. Or run `yarn build` as a pre-push gate.

### Header confirmation
First push's new headers are live and verified via `curl -sS -D - https://sprucelab-production.up.railway.app/api/health/`:
```
strict-transport-security: max-age=31536000; includeSubDomains; preload
x-content-type-options: nosniff
x-frame-options: DENY
referrer-policy: strict-origin-when-cross-origin
```

Railway's deployment list via CLI was stale and still showed the pre-push deploy as "latest" for several minutes after the headers were already serving — can't trust `railway deployment list` for "is my push deployed" signal, trust actual response headers instead.

### Gunicorn access logs
`railway logs` returns only ~11 lines of startup output because gunicorn isn't configured with `--access-logfile -`. Per-request errors don't flow to stdout. This means I can't debug request-level issues via the CLI. Next session: add `--access-logfile - --error-logfile -` to the gunicorn start command (Procfile or railway.toml) so `railway logs` becomes useful for debugging production errors.

## Next

### Must-fix next session (actual bugs)
1. **Construction slots overlap with landmarks.** Two of the four dedicated construction positions sit inside the Barcode Project footprint and one sits inside the park:
   - `(15, 9)` — inside Barcode (slab row at x=15 spans z=(-1, 13))
   - `(15, 3)` — inside Barcode (same range)
   - `(-9, 15)` — inside park (park spans x=(-18,-6), z=(6,18))
   - `(-15, -3)` — inside Old Town generic spec, so at minimum it replaces a static building visually
   Result: the Barcode is getting "swallowed" by construction scaffolding cycling through its footprint. Fix: enumerate all 36 grid cells, verify each is claimed by exactly one of (landmark / park / generic zone / construction slot / empty), then move the 4 slots to cells that aren't otherwise claimed. Look at the enumeration in this worklog's Notes section.

2. **Grid classification refactor** (user ask). Replace ad-hoc `tryPlace` AABB clash check with a proper 2D tile-classification pass:
   - Define a grid of tiles covering the world extent.
   - Classify each tile: `road` / `river` / `park` / `landmark-reserved` / `building-footprint` / `empty`.
   - Landmarks reserve their footprints first.
   - Roads claim the tile *boundaries* (offset grid — road centerlines sit between building tile centers, not through them). Building footprints sit entirely inside one tile with a guaranteed margin from road edges.
   - Generic buildings placed on `building-footprint` tiles, one per tile.
   - Construction slots consume specific `building-footprint` tiles that are marked up-front.
   - Result: guaranteed no overlap, guaranteed no building on a road, guaranteed no building in the river.

### Follow-ups from earlier asks (still pending)
3. **Wire `?scene=night` query param** in `Welcome.tsx` so the night palette + lightning can actually be viewed. All the code is in place, just not routed.
4. **More iconic hero buildings** — ICONSIAM terraces, CCTV Beijing loop, Shanghai WFC-style vertical hole. Willis + Petronas are already in, pattern is clear (inline block inside init, reserve footprint, render group of boxes).
5. **Entry canopies on tall buildings** — user feedback: "skyscrapers might have some type of overbuilt entry". The `buildGenericBuilding` function has the structure for modules; adding an entry canopy is a new module type (plinth bump-out or portico).
6. **Valley (Kistefos) scene variant** — deferred from the scope plan. Full brief in `~/.claude/plans/agile-mapping-pebble.md`.
7. **Dev dash** — internal admin page for approvals + KPI stats + Plausible API integration. Full spec discussed mid-session. Plan file not yet written.
8. **`?preview=1` bypass cleanup** in Welcome.tsx — still in place because `import.meta.env.DEV` gates it so it's inert in prod. Ugly but not dangerous. Revert before Phase 1 E2E.
9. **Plausible SPA pageview tracking** — currently fires only on first page load. Add `plausible('pageview')` on route change so every React Router navigation shows up as a separate page view in the dashboard.
10. **8-language i18n** — plan file at `docs/plans/2026-04-14-03-42_Public-pages-i18n-8-languages.md`. Shelved until English version has collected feedback. When we pick this up, all 4 auth pages still need the `t()` refactor (English strings stay canonical).

### Security follow-ups (user-approved, not urgent)
11. **GitHub Dependabot + Secret Scanning** — two toggles in the repo Settings → Code security. No code change, no new accounts.
12. **Supabase MFA** — toggle in Supabase Auth Providers. No code change.
13. **Audit log extension** — Phase 2 plan has `ModelEvent`; extend to cover auth events (login, approve, role_change). Doesn't need a new accounts/services.

### Infrastructure (small)
14. **Gunicorn access + error log flags** — add `--access-logfile - --error-logfile -` so `railway logs` becomes useful. Tiny change to Procfile / railway.toml.
15. **Pre-push lint/build hook** — prevent the `noUnusedLocals` failure mode that ate one deploy tonight. Either run `tsc --noEmit` in the auto-sync flow, or gate pushes on `yarn build`.

## Notes

### 36-cell grid enumeration (for next session's construction-slot fix)

Grid cell centers at x,z ∈ {-15, -9, -3, 3, 9, 15}. 36 cells total. Current claims:

| Cell | Claim |
|---|---|
| (-15, -15) | old town |
| (-15, -9) | old town |
| (-15, -3) | old town |
| (-15, 3) | residential |
| (-15, 9) | park |
| (-15, 15) | park |
| (-9, -15) | old town |
| (-9, -9) | old town |
| (-9, -3) | old town |
| (-9, 3) | residential |
| (-9, 9) | park |
| (-9, 15) | park |
| (-3, -15) | waterfront west |
| (-3, -9) | waterfront west |
| (-3, -3) | waterfront west |
| (-3, 3) | waterfront west |
| (-3, 9) | waterfront west |
| (-3, 15) | waterfront west |
| (3, -15) | waterfront east |
| (3, -9) | **Opera landmark** |
| (3, -3) | waterfront east |
| (3, 3) | waterfront east |
| (3, 9) | waterfront east |
| (3, 15) | waterfront east |
| (9, -15) | civic |
| (9, -9) | civic |
| (9, -3) | **Willis landmark** |
| (9, 3) | CBD |
| (9, 9) | **Petronas landmark** |
| (9, 15) | CBD |
| (15, -15) | civic |
| (15, -9) | civic |
| (15, -3) | civic |
| (15, 3) | **Barcode landmark** |
| (15, 9) | **Barcode landmark** |
| (15, 15) | CBD |

Zero unclaimed cells. Construction slots must either:
- (a) replace 4 existing generic cells — cleanest, reduces static count by 4, each "replaced" cell becomes a dynamic construction site, OR
- (b) be placed on the street boundaries/interstitial tiles if we enlarge the grid.

Recommended (a): remove `(3, 15)`, `(9, 3)`, `(-3, -15)`, `(-9, -9)` from their generic specs and make them construction slots instead. Spread across 4 quadrants so the camera orbit always has one visible.

### Session pacing
The session kept expanding with user creative direction in ~40 messages ("push the animation", "see-through card", "Willis Tower", "Petronas", "construction scaffolding overlapping"). The design philosophy crystallized mid-way: "if you're going to populate the view you better have an idea — copy-paste is not interesting, too much chaos is also hard on the eyes". That principle is what shaped the Willis + Petronas hero-landmark approach. Worth preserving it as a design principle in MEMORY.md.

### Plan files
Two plan files written this session, both shelved without full execution:
- `~/.claude/plans/agile-mapping-pebble.md` — 3-variant welcome scene (City Day / City Night / Valley). City Day got built, Night palette code is in but not wired, Valley fully deferred.
- `docs/plans/2026-04-14-03-42_Public-pages-i18n-8-languages.md` — 8-language public i18n. Shelved for English-only.

Both are valuable for future sessions — reading them will save a lot of rediscovery time.
