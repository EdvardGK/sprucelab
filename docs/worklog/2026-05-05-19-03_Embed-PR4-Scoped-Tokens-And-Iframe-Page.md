# Session: Embed PR 4/10 — scoped-token middleware + iframe page

## Summary
Shipped the auth plane for the forward-deployed embed surface on a feature branch (`feat/embed-scoped-tokens-iframe`), closing the `AllowAny + throttle_exempt` hole PR 3 left open. After this PR, external sites mint a project-scoped capability token (sha256 hash + per-token allowed origins + revocable + 1h TTL), drop a `/embed/:dashboard?token=…` iframe into their page, and the dashboard receives `set_filter` over postMessage while validating origin against the token's allowlist. Everything from PR 5 onward (ViewerTile, TypeBrowser tile, etc.) consumes this auth plane without re-doing it.

## Changes

**Backend (8 new files, 4 modified)**
- `apps/embed/models.py` — `EmbedToken` mirroring the `AgentRegistration` token-hash pattern (sha256 + 8-char prefix, `secrets.token_urlsafe(32)`, `secrets.compare_digest` verification)
- `apps/embed/authentication.py` — `EmbedTokenAuthentication` (reads `Authorization: Embed <raw>` or `?token=`), and the narrowly-scoped `ExpiredOkEmbedTokenAuthentication` for the refresh path (5-min grace after expiry)
- `apps/embed/throttling.py` — `ScopedTokenRateThrottle` (1000/hour per-token, IP fallback)
- `apps/embed/services/token_service.py` — pure-function issue/list/revoke/refresh, reused by mgmt cmd + admin endpoints + tests
- `apps/embed/admin_views.py` — `POST/GET /api/embed/tokens/`, `DELETE /api/embed/tokens/<id-or-prefix>/`, `POST /api/embed/tokens/refresh/` (refresh authenticates with the OLD raw token, no Supabase needed)
- `apps/embed/management/commands/embed_token.py` — `python manage.py embed_token {create,list,revoke,refresh} [--json]`
- Migration `apps/embed/0001_initial.py` (auto-generated)
- `apps/embed/views.py` flipped from `AllowAny + throttle_exempt` to token-required with inline capability gates (`_require_capability(request, 'read:instances')`); `project_id` derived from token, mismatched query-param values 403; capability manifest extended with `token` block + `protocol_version` + auth scheme
- `apps/embed/urls.py` registers the new token routes
- `config/settings.py` adds `embed_token: '1000/hour'` to `DEFAULT_THROTTLE_RATES`
- `config/views.py` extends `embed` block of `/api/capabilities/` with `iframe_path`, `token_endpoints`, `auth.scheme`

**Frontend (3 new files, 2 modified)**
- `lib/embed/types.ts` extends `EmbedHandshake` union with the four message kinds PR 2 didn't ship: `request_height`, `selection_changed`, `height`, `error`. Selection payload + error payload exported as named interfaces.
- `lib/embed/embed-api-client.ts` — separate axios instance, `Authorization: Embed <token>` interceptor, `withCredentials: false` (parent cookies must NOT leak)
- `lib/embed/messaging.ts` — `usePostMessageBus({allowedOrigins, onMessage})` hook with origin allowlist, `protocol_version` validation, validated parent-origin tracking (initial `ready` may use `*`, everything after is targeted)
- `pages/EmbedDashboard.tsx` — handshake harness: reads `?token=…`, fetches `/api/embed/capabilities/` to learn project + allowed origins, sends `ready` postMessage, listens for `set_filter`, echoes filter state as JSON pretty-print. Inline-styled (no route-level CSS). Emits `error` postMessage on capability load failure.
- `App.tsx` adds `/embed/:dashboard` route, lazy-loaded, no `RequireAuth` (token is the credential)

**CLI (1 new file, 1 modified)**
- `cli/spruce/embed.py` — `spruce embed pass {create,list,revoke,refresh}` Typer subcommand, `--json` everywhere. Reads `$SPRUCELAB_ADMIN_TOKEN` (Supabase staff access token) or `--admin-token` for CRUD; `refresh` authenticates with the old raw token directly.
- `cli.py` wires `embed_app`

**Tests** — 247/247 unit tests pass (was 196 → 247, +51 embed-related)
- `test_embed_token_model.py` — generate/verify/origin/capability/lifecycle (revoked, expired, both)
- `test_embed_token_auth.py` — header parsing, query-param fallback, revoked/expired rejection, capability gate, project-scope derivation, mismatched-query-param 403, `last_used_at` update
- `test_embed_token_endpoints.py` — issue/list/revoke/refresh round-trip, prefix-based revoke, refresh rotation atomicity, 5-min grace window, staff/anonymous gates
- `test_embed_throttle.py` — per-token bucketing, IP fallback, rate parsing
- `test_embed_resolver.py` rewritten to authenticate via the new token surface; added a project-isolation regression (token for project A doesn't leak project B types)

**Docs**
- `docs/knowledge/API_SURFACE.md` — new "Embed" section documenting the 5 endpoints + `Authorization: Embed` scheme + the 7 postMessage kinds + operator surfaces

## Technical Details

**Architecture deviation from the approved plan file**: dropped the proposed `EmbedFrameAncestorsMiddleware`. The iframe HTML at `/embed/:dashboard` is served by Vite/Vercel, not Django — a Django middleware setting CSP `frame-ancestors` would never run on the request that loads the iframe. Origin enforcement is JS-side only via `usePostMessageBus`, which is what the plan doc itself specifies in the Auth model section. One fewer file, equivalent security posture, and the iframe HTML stays a static-bundled SPA route (Vercel rewrites all paths to `index.html` already).

**Capability gate inlined, not class-based**: initial implementation used `HasEmbedCapability(BasePermission)` reading `view.required_capability`, but `@api_view`-wrapped functions don't propagate function attributes onto the dynamically-created `WrappedAPIView` class. So `getattr(view, 'required_capability', None)` always returned `None` and the gate never fired. Fix was to inline `_require_capability(request, 'read:instances')` at the top of each protected view body. More readable, pinned at the call site, no DRF wrapper magic. The `permissions.py` file was deleted.

**Refresh path uses a separate auth class**: `ExpiredOkEmbedTokenAuthentication` allows tokens that expired up to 5 minutes ago through, so the iframe can rotate near the boundary. Still rejects revoked tokens and unknown tokens. Wired only on `POST /api/embed/tokens/refresh/` — the regular `EmbedTokenAuthentication` rejects expired tokens normally everywhere else.

**Test harness gotcha**: the autouse `_open_permissions` fixture in `tests/conftest.py` clears `DEFAULT_AUTHENTICATION_CLASSES` and `DEFAULT_PERMISSION_CLASSES`. Tests that need to exercise the actual auth surface re-enable it via a `embed_auth_settings` fixture (or pass settings overrides per-test). The IsStaff gate on token CRUD endpoints uses `client.force_authenticate(user=staff_user)` instead of running the full Supabase round-trip.

**`spruce embed pass` auth model**: the existing `SprucelabClient` is wired for agent auth (Bearer + agent api_key). Embed token CRUD is operator-only and requires Supabase staff. Rather than overload the CLI's auth, `embed.py` reads `$SPRUCELAB_ADMIN_TOKEN` (Supabase access token) or accepts `--admin-token` per command. Locally, `DEV_AUTH_BYPASS=1` makes the dev user auto-staff so no token is needed in development.

**Smoke-tested end-to-end**: created a token via `python manage.py embed_token create`, listed it, revoked it. Token endpoint surfaces verified by 51 passing unit tests including a project-isolation test that proves a project-A token cannot list project-B types through the resolver.

## Next
- **Live iframe handshake test** (Open Q #6 in the embed plan) — repo has no `dev/embed-host.html` harness yet; PR 10 (skiplum-pages integration) will exercise the bus end-to-end in a real browser. For now the contract is exercised at the unit-test layer + manual mgmt-cmd round-trip.
- **PR 5/10** — `embed: ViewerTile + filter→isolation wiring`. `UnifiedBIMViewer` wraps as a `DashboardFilterProvider` consumer; the resolver's `type_ids` drive isolation; highlight/filter mode toggle lands here.
- **Branch is uncommitted.** When ready: `git add` + commit with message like `embed: scoped token middleware + iframe page (PR 4/10)`. Per CONTRIBUTING.md the PR title format is `embed: <one-liner>`.
- **Production deploy** after merge: only requires the embed migration (`apps/embed/0001_initial`) + a Vercel rebuild for the new `/embed/:dashboard` route. No env-var changes.

## Notes
- The plan file at `/home/edkjo/.claude/plans/whats-next-on-the-optimized-balloon.md` is now done; it can stay as audit trail or be removed. The PR-actual implementation matches the plan modulo the frame-ancestors-middleware drop noted above.
- `permissions.py` was deleted mid-session — keep an eye out for stale imports (none should exist; the file was never referenced outside views.py and the plan).
- Smoke-test token (`prefix=VqTAUb0E`, project `b117…`) was issued + revoked during this session; DB is left in a clean state.
- The plan-doc Open Q #1 (skiplum-pages layout primitives) is not blocking PR 4/5/6. It only matters for PRs 8-10 when real dashboards land.
- All 247 unit tests pass. No frontend unit tests by design (per the project's `feedback-frontend-no-unit-tests.md` memory) — verification was `yarn type-check && yarn build`.
