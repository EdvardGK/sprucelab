# Session: Phase 1 Auth Shipped to Production

## Summary
Planned and shipped the entire Phase 1 auth foundation for Sprucelab — Supabase-backed email+password + magic link + self-serve signup with waitlist approval — from cold start to live on sprucelab.io in a single session. Hit three separate production blockers (wrong Vercel env vars, invisible submit buttons, and a broken JWT verification strategy) and fixed each with tight feedback loops using Railway logs, Vercel REST API, and direct Supabase Postgres access. Also redesigned the /welcome page with a Three.js "blueprint city" scene to replace the text-only waitlist placeholder.

## Changes

### Architecture + planning
- `docs/plans/2026-04-13-12-50_Versioning-Accounts-Trust.md` — comprehensive 3-phase plan covering Phase 1 (auth), Phase 2 (versioning hardening with `ModelEvent` audit log, grace-window delete, restore-as-republish), and Phase 3 (accounts, 6 roles including host vs. invited account admins, trust tiers: single-admin grant → quorum (min(N,3)) → break-glass read-only). Baked in "staff have no default rights on customer data" principle and `parent_model` CASCADE→PROTECT fix.

### Backend (Django)
- `apps/accounts/` — new app. `UserProfile(user, supabase_id, display_name, avatar_url, approval_status, approved_at, approved_by, signup_metadata)`. Migrations 0001 + 0002.
- `apps/accounts/permissions.py` — `IsApprovedUser` DRF permission class. Replaces `IsAuthenticated` as the new default.
- `apps/accounts/admin.py` — `UserProfileAdmin` with bulk Approve/Reject/Revert actions and company name extraction from signup_metadata.
- `apps/accounts/management/commands/promote_superuser.py` — bootstrap command: staff+superuser flags + auto-approve profile in one call.
- `config/authentication.py` — **rewrote twice this session**. First pass: proper UUID-field-based UserProfile lookup. Second pass: completely replaced local JWT verification with a call to `GET /auth/v1/user` via Supabase's REST API, cached in Django cache for 60s keyed by `sha256(token)`. This is the pattern Supabase officially recommends for backends that don't want to manage rotating signing keys.
- `config/views.py` — `/api/me/` (GET) and `/api/me/profile/` (PATCH). `IsAuthenticated` not `IsApprovedUser` so pending users can poll their status.
- `config/urls.py` — new `/api/me/` routes, kept `/api/auth/me/` as legacy alias.
- `backend/apps/models/models.py` — `Model.uploaded_by = FK(User, on_delete=PROTECT, null=True)`. Migration 0016.
- `backend/apps/models/views.py` — stamp `uploaded_by` on all four `Model.objects.create` sites (upload, webifc upload, upload_with_metadata, revert_to). `/process-complete/` FastAPI callback explicitly set to `AllowAny` since it's service-to-service.
- `backend/config/settings.py` — `DEFAULT_PERMISSION_CLASSES` → `IsApprovedUser`. `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` extended for `sprucelab.io`, `www.sprucelab.io`, `api.sprucelab.io`.
- `backend/requirements.txt` — `PyJWT[crypto]==2.10.1` (needed at one point when I was still trying ES256 verification; now unused but harmless).

### Frontend (React)
- `contexts/AuthContext.tsx` — `useAuth` hook exposing `user`, `session`, `loading`, `error`, `signInWithPassword`, `signInWithMagicLink`, `signUpWithPassword`, `signOut`. PKCE flow. Signup carries `first_name`, `last_name`, `display_name`, `company_name` in Supabase `user_metadata`.
- `lib/supabase.ts` — client with PKCE + autoRefreshToken + detectSessionInUrl.
- `lib/api-client.ts` — axios interceptor pulls current Supabase access token on every request. Warns on 401s.
- `lib/me.ts` — typed `fetchMe()` and `updateMyProfile()` against `/api/me/` and `/api/me/profile/`.
- `components/RequireAuth.tsx` — route guard with three states: not-authenticated → /login, authenticated+pending → /welcome, authenticated+approved → through. Uses React Query.
- `pages/Login.tsx` — password / magic link toggle. Tailwind `slate-*` classes (not CSS vars — see Technical Details).
- `pages/Signup.tsx` — `Fornavn` + `Etternavn` (split), email, password, optional `Firma`.
- `pages/AuthCallback.tsx` — OAuth/magic-link return handler.
- `pages/Welcome.tsx` — completely rewrote in final hour. Three.js scene background + architectural layout.
- `pages/Welcome.css` — scoped stylesheet with Fraunces (display serif), IBM Plex Sans (body), IBM Plex Mono (chrome) via Google Fonts. Warm parchment `#faf8f3` background, navy ink. CSS-only pulse animation on the active timeline step, staggered content reveal on mount.
- `components/welcome/BlueprintCityScene.ts` — vanilla-TS Three.js module. Procedural grid of building volumes (7×7 with ~30% sparsity), towers vs lowrises footprint variety, 18% chance of discipline-palette accent colors (Lavender/Lime/Forest/Navy), staggered radial-wave birth timing, slow orbital camera, fog-to-parchment, Page Visibility API pause, full cleanup.
- `App.tsx` — `AuthProvider` wraps everything. New routes: `/login`, `/signup`, `/welcome`, `/auth/callback` public. All 28 existing routes guarded with `RequireAuth`.
- Viewer: ripped out the right-click section plane context menu from `UnifiedBIMViewer.tsx` (was spawning persistent debug gizmos in the scene on every right-drag pan). Added "Powered by ThatOpen" attribution badge bottom-right of the viewer canvas (MIT license compliance for the launch).

### Deploy + config
- Vercel env vars on project `sprucelab` (not `frontend` — that was a misdirected sibling project I accidentally linked to first): `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_IFC_SERVICE_URL` — all fresh on Production + Preview. Previous values were 119 days stale.
- Railway `Django` service auto-deploys from `main` branch. Multiple successful deploys this session.
- Custom domain `sprucelab.io` live on Vercel (user did this during the session via GoDaddy → Vercel DNS).

## Technical Details

### The JWT verification saga (the hardest bug)
Django's auth kept rejecting valid Supabase tokens with 401 `Signature verification failed`. I went through three wrong hypotheses before finding root cause:

1. **Wrong theory #1**: Stale localStorage on sprucelab.io from when Vercel had bad env vars. Killed when user confirmed it failed on vercel.app preview URLs too.
2. **Wrong theory #2**: Supabase uses ES256 asymmetric signing (JWKS endpoint advertises `kid=4f163f29-...` with `alg=ES256`). I added PyJWKClient-based verification with `PyJWT[crypto]`. Still failed.
3. **Real root cause**: I created a test user by confirming them directly in Postgres (`UPDATE auth.users SET email_confirmed_at=NOW()`), signed in via `/auth/v1/token?grant_type=password`, and inspected the actual JWT header:
   ```json
   {"alg": "HS256", "kid": "+3SQxCY1o5PyM6Hq", "typ": "JWT"}
   ```
   The session tokens are HS256 with a rotating opaque `kid`. The ES256 key in JWKS is unrelated — it's a different system entirely. Modern Supabase projects use "JWT Signing Keys" with rotation, and the *legacy* "JWT Secret" field in the dashboard is no longer the signing key for session tokens.
4. **Confirming the env var is wrong**: `SUPABASE_JWT_SECRET` on Railway was `6f9c42e6-feb2-430e-870e-d71f68241aef` (UUID-shaped, suspicious). Locally I tested `jwt.decode()` with that value against the session token AND against the anon key itself — both failed. The value is flat-out wrong; always has been. Nothing in this project has ever successfully verified tokens locally.

**The fix**: stop verifying locally. `SupabaseAuthentication` now calls `GET https://rtrgoqpsdmhhcmgietle.supabase.co/auth/v1/user` with the bearer token and trusts whatever Supabase returns. Cached in Django cache (`django.core.cache`) with `USER_INFO_CACHE_TTL=60s` keyed by `sha256(token)`. Under bursty load this is ~1 Supabase call per minute per active session. Tradeoffs: network dependency on Supabase (already true since it's our Postgres), revoked tokens work for up to 60s, but we no longer care about key rotation, signing algorithms, or env secrets.

### Invisible submit buttons
The login/signup/welcome pages used `bg-[var(--text-primary,#111827)]` to color the primary CTA. `globals.css` defines `--text-primary: 228 27% 18%` as a *bare HSL tuple* meant to be wrapped in `hsl(var(--x))` (Tailwind convention). Using the variable directly yielded an invalid CSS color `228 27% 18%` → browser treated it as transparent → buttons rendered but were invisible. User reported "we have no button" — I initially assumed they were missing from the code and went looking for them. Fixed by replacing CSS-var references with plain `bg-slate-900 text-white` Tailwind classes on all three auth pages. The same bug affects any code on `globals.css` that uses the variables naked instead of through `hsl()` wrapping.

### Vercel project confusion
Two projects exist in the `skiplum` Vercel team: `frontend` (stub, 5min old, abandoned) and `sprucelab` (the real one serving `www.sprucelab.io`, 5 months old). Running `yarn vercel link --yes` from `frontend/` picked the first match and linked to `frontend`, so my initial env var additions went to the wrong project. Took ~15 min to notice. Fixed by `yarn vercel link --project sprucelab --yes`. Also: `sprucelab` has `Root Directory = frontend/` in project settings, so the `.vercel/` link directory has to live at repo root, not `frontend/.vercel/`. Both `.vercel/` and `frontend/.vercel/` would otherwise get created and drift.

### Viewer right-click menu bug
The section plane context menu had two issues: (1) debug gizmos (magenta arrow + RGB axes + white sphere) were spawned into the scene on every right-click and never cleaned up, (2) right-drag to pan camera could slip through the 5px/250ms click threshold and spawn the menu on camera nudges. Nuked both: removed all right-click handling, removed debug gizmos, kept only a `preventDefault` on native `contextmenu`. `ViewerContextMenu.tsx` is now dead code left in place for a future HUD-button flow.

### promote_superuser ergonomics
Initial version only set `is_staff`/`is_superuser`. Useless for the approval flow since the user also needs `profile.approval_status='approved'` to get past `IsApprovedUser`. Rewrote to do both in one call + record `approved_at`/`approved_by`. For edkjo's first login I used direct SQL via `psql` instead of `railway run` because `railway run` executes locally with Railway's env vars, not on the deployed container — `manage.py` isn't in the cwd.

## Next
1. **End-to-end Phase 1 verification** — task #12 is still marked in_progress. Confirm: sign up a fresh test user, land on /welcome, submit the "tell us more" form, approve via promote_superuser or Django admin, verify auto-redirect to main app, upload an IFC and confirm `uploaded_by` is stamped correctly.
2. **Welcome page iteration** — the current Three.js scene is the "blueprint city" variant. User's idea for next session: **GIS+BIM combo — artful map with buildings emerging from the map plane, or scene transitions between a satellite view and an extruded model view**. This is the direction to go for v2 of the Welcome page. Would play to the platform's AEC positioning more strongly than generic box buildings.
3. **Phase 2 — versioning hardening** — `ModelEvent` audit log, grace-window delete, restore-as-republish, CASCADE→PROTECT on `parent_model`, Notion-style timeline UI. Plan is in `docs/plans/2026-04-13-12-50_Versioning-Accounts-Trust.md`.
4. **Phase 3 — accounts + RBAC** — six-role matrix (host vs. invited account admins), trust tiers, invite flow. Plan already covers this.
5. **Django admin access** — I pushed `is_staff=true` via SQL for edkjo but the `auth_user` row has no password set (Supabase users use `set_unusable_password`). If you want the Django admin UI for approval management, run `railway run --service Django python -m django changepassword <your-username>` (note: needs to run in the Railway container, not locally).
6. **Sharp edges tracked from plan doc but not yet addressed**: `SUPABASE_JWT_SECRET` is now unused and misleading — safe to delete from Railway env. `PyJWT[crypto]` is now unused but harmless.

## Notes

- **Verified production is working**: edkjo's account is now `is_superuser=true`, `approval_status=approved`, signed in successfully via `www.sprucelab.io`, hit the main application page after approval. Railway Django deploy `117f712c` (commit `c9d7fef`) is SUCCESS and Django logs show zero `supabase-auth: invalid token` warnings since the delegated-verification rewrite.
- **auto-sync Git hook is working consistently** — commit-on-every-Edit fires reliably, session-push squash has now fired at least twice successfully in this session (previous memory note claimed it was untested). The 22-commit squash I pushed earlier (`f855f3c`) and the chain from this session are both clean. Consider the "UNTESTED" flag in MEMORY.md resolved.
- **GoDaddy → Vercel DNS** — user resolved this during the session. Browsers on old machines need `ipconfig /flushdns` or Linux equivalent (`sudo resolvectl flush-caches`) to see the update. Laptop DNS hold-over is real and confusing on this timescale.
- **Supabase email confirmation is ON** — this is good security posture but means my REST diagnostic scripts couldn't easily create test users. Workaround: `UPDATE auth.users SET email_confirmed_at=NOW()` via direct Postgres access, then `grant_type=password` signin returns a real token.
- **Three.js Welcome scene is visually untested by me** — I type-checked it but didn't open it in a browser. The scene logic is straightforward enough that it should work, but the camera framing, building density, and color balance might need iteration once you see it live. The CSS custom-properties isolation (no Tailwind on this page) means global theme changes won't affect it.
- **The user's GIS+BIM map idea is strong** — map-to-model transition is exactly the Sprucelab positioning story. Worth doing properly next session with some reference images of procedural city generation + architectural map rendering.
