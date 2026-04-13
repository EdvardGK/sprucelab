# Versioning, Accounts, and Trust Model

**Status**: Plan
**Date**: 2026-04-13
**Owner**: edkjo
**Goal**: Get the platform ready to onboard real test users — versioning is tight, identity is real, trust is auditable.

---

## Why now

Versioning is the gate. Before any user touches the platform, accidental and malicious destruction of model history must be impossible by default and recoverable by design. That requires real user identity (so we know who did what), a tight versioning UX (so users trust that "delete" doesn't mean "gone forever"), and an account/RBAC layer (so a 5-person team can self-manage without sprucelab staff intervention).

The trust model (Tier 1/2/3) is cross-cutting and gets baked into the permission predicates from day one, so we never ship a version where staff have implicit destructive rights on customer data.

---

## Sequencing

Three phases, each independently shippable. ~2.5 weeks total.

### Phase 1 — Auth foundation (~2 days)
Goal: real user identity, no roles yet.
- Install `@supabase/supabase-js` in frontend, wire `AuthContext`
- Configure Microsoft (Azure AD) provider in Supabase dashboard. Google is v2.
- Django: `SupabaseJWTAuthentication` DRF auth class verifying JWT with `SUPABASE_JWT_SECRET` (already in env)
- `UserProfile` model: `user = OneToOne(User)`, `supabase_id = UUIDField(unique=True)`, `display_name`, `avatar_url`
- Auto-create `User` + `UserProfile` on first authenticated request
- `Model.uploaded_by = ForeignKey(User, on_delete=PROTECT, null=True)` (null for legacy rows)
- Migration: backfill `uploaded_by = admin` for existing dev rows
- Frontend: login screen, session refresh, logout
- All API requests now require auth (except `/api/auth/*` and health check)

**Out of scope**: accounts, roles, invites, permissions beyond "authenticated".

### Phase 2 — Versioning hardening (~1 week)
Goal: model history is trustworthy. Permission check is temporarily simple ("uploader OR superuser").

- **Schema**:
  - `ModelEvent(actor, verb, model, project, version_number, metadata, created_at)`
    - Verbs: `uploaded`, `published`, `unpublished`, `restored`, `deleted`, `archived`, `forked`
  - `Model.parent_model`: change `on_delete=CASCADE` → `PROTECT` (migration + data check that no orphans exist)
  - `Model.deleted_at` (soft delete marker, NULL = active)
  - `Model.archived_at` (post-grace soft delete)
- **Grace window**:
  - Constant: `MODEL_DELETE_GRACE_WINDOW = timedelta(hours=1)` (configurable per account in v2)
  - During grace: hard delete allowed for uploader. Removes `Model` row AND deletes IFC blob from Supabase Storage. Synchronous, fail-loud if blob deletion fails.
  - After grace: hard delete blocked. Soft delete (`archived_at`) is the only option, and is grant-gated for v1.
- **Restore-as-republish**:
  - `POST /api/models/{id}/publish/` already exists (`models.py:339`). Confirms it unpublishes siblings.
  - Add audit event on every publish/unpublish.
  - No new rows on restore — the older version just becomes published. Cheap, reversible, no IFC blob duplication.
- **Storage cleanup**:
  - Audit `services_storage.py` (or wherever uploads land) — confirm Supabase Storage blob deletion on row delete. Wire explicitly if not.
  - Hard delete during grace = sync delete of row + blob. No Celery, file is small enough that 1-2s is fine.
- **Timeline UI**:
  - New endpoint `GET /api/models/{id}/events/` returning `ModelEvent` log
  - Notion-style vertical feed in model workspace: avatar, actor, verb, version, relative timestamp, diff summary from `version_diff` JSONField
  - Same data backs the future `events tail` CLI command and platform notifications
- **Permission predicate (interim, Phase 2)**:
  ```python
  def can_delete_model(user, model):
      if user.is_superuser: return True
      if model.uploaded_by == user and model.in_grace_window: return True
      return False
  ```
- **Frontend**:
  - Model card shows grace countdown when applicable
  - "Restore this version" button on older versions in timeline
  - Confirmation dialog with explicit "this will unpublish v5 and republish v3"
  - Error states inline (honest UI principle from existing design)

### Phase 3 — Accounts, RBAC, trust model (~1.5 weeks)
Goal: multi-tenant, multi-role, with Tier 1/2/3 trust mechanics.

#### Schema

```python
class Account(models.Model):
    name = CharField(max_length=255)
    slug = SlugField(unique=True)
    type = CharField(choices=['customer', 'platform'])  # 'platform' = sprucelab staff account
    created_at = DateTimeField(auto_now_add=True)
    soft_deleted_at = DateTimeField(null=True)  # 30-day grace before hard delete

class Membership(models.Model):
    user = ForeignKey(User)
    account = ForeignKey(Account)
    role = CharField(choices=['admin', 'member'])
    joined_at = DateTimeField(auto_now_add=True)
    class Meta:
        unique_together = [('user', 'account')]

class Project(models.Model):  # existing, gains:
    host_account = ForeignKey(Account, on_delete=PROTECT)
    # ... existing fields

class ProjectAccountInvite(models.Model):
    project = ForeignKey(Project)
    invited_account = ForeignKey(Account)
    invited_by = ForeignKey(User)  # must be host account admin or project admin
    status = CharField(choices=['pending', 'accepted', 'declined', 'revoked'])
    approved_by = ForeignKey(User, null=True)  # invited account admin who approved
    created_at = DateTimeField(auto_now_add=True)

class ProjectMembership(models.Model):
    user = ForeignKey(User)
    project = ForeignKey(Project)
    role = CharField(choices=['admin', 'member'])
    via_account = ForeignKey(Account)  # which company this user represents on this project
    added_by = ForeignKey(User)
    class Meta:
        unique_together = [('user', 'project', 'via_account')]

class SupportGrant(models.Model):
    granted_by_user = ForeignKey(User, null=True)  # null when break_glass=True
    granted_to_user = ForeignKey(User)  # specific staff member
    scope_account = ForeignKey(Account, null=True)
    scope_project = ForeignKey(Project, null=True)
    scope_model = ForeignKey(Model, null=True)
    permissions = JSONField()  # ['read'] | ['read','write'] | ['read','write','delete']
    reason = TextField()  # required, structured
    incident_ref = CharField(null=True)  # required when break_glass=True
    expires_at = DateTimeField()
    revoked_at = DateTimeField(null=True)
    break_glass = BooleanField(default=False)
    notification_acked_at = DateTimeField(null=True)  # access blocked until set
    created_at = DateTimeField(auto_now_add=True)

class QuorumRequest(models.Model):
    requested_by = ForeignKey(User)  # could be customer admin OR sprucelab staff
    account = ForeignKey(Account)
    action = CharField()  # 'hard_delete_after_grace', 'account_delete', 'recover_lost_admin', etc.
    target = JSONField()  # references the resource(s)
    reason = TextField()
    required_approvals = IntegerField()  # min(N, 3)
    status = CharField(choices=['pending', 'approved', 'denied', 'expired'])
    expires_at = DateTimeField()  # 24h
    created_at = DateTimeField(auto_now_add=True)

class QuorumApproval(models.Model):
    request = ForeignKey(QuorumRequest, related_name='approvals')
    approver = ForeignKey(User)
    decision = CharField(choices=['approve', 'deny'])
    created_at = DateTimeField(auto_now_add=True)
    class Meta:
        unique_together = [('request', 'approver')]
```

#### Roles (6)

| Role | Scope | Granted via |
|---|---|---|
| **Sprucelab Staff** | Platform-wide | `Membership(account=platform_account, role=admin)` |
| **Account Admin** | One customer account | `Membership(role=admin)` |
| **Account Member** | One customer account | `Membership(role=member)` |
| **Project Admin (host)** | One project | `ProjectMembership(role=admin, via_account=project.host_account)` |
| **Project Admin (invited)** | One project, scoped to own company's stake | `ProjectMembership(role=admin, via_account != project.host_account)` |
| **Project Member** | One project | `ProjectMembership(role=member)` |
| **File Owner** | One model | `Model.uploaded_by == user` |

`is_superuser` → "Sprucelab Staff" via membership in the platform account, not via Django's `is_superuser` flag. Every action has a real account attribution.

#### Permission matrix

Legend: ✓ = allowed, G = single-admin grant required, Q = quorum required, B = break-glass allowed (read only), – = not allowed.

| Action | Sprucelab Staff | Host Acct Admin | Project Admin (host) | Invited Acct Admin | Project Admin (invited) | Project Member | File Owner |
|---|---|---|---|---|---|---|---|
| Create project under account | ✓ | ✓ | – | – | – | – | – |
| Hard-delete project | – | – ¹ | – | – | – | – | – |
| Soft-delete project (30d grace) | G | ✓ | ✓ | – | – | – | – |
| Invite company to project | – | ✓ | ✓ | – | – | – | – |
| Approve company invite (own co) | – | – | – | ✓ | – | – | – |
| Add user to project (own company) | – | ✓ | ✓ | ✓ | ✓ ² | – | – |
| Remove user from project (own co) | – | ✓ | ✓ | ✓ | ✓ ² | – | – |
| Edit project settings (verification rules, etc.) | G | – | ✓ | – | – | – | – |
| Upload model | – | – | ✓ | – | ✓ | ✓ | – |
| Read model metadata | B | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Read IFC file content | B | – | ✓ | – | ✓ | ✓ | ✓ |
| Hard-delete model (in grace) | – | – | ✓ | – | – | – | ✓ |
| Soft-delete model (after grace) | G | G | G | – | – | – | G |
| Hard-delete model (after grace) | – | Q | Q | – | – | – | – |
| Restore older version | – | ✓ | ✓ | – | – | – | ✓ ³ |
| Edit type classifications | G | – | ✓ | – | ✓ | ✓ | – |
| Edit verification results | – | – | ✓ | – | – | – | – |
| Hard-delete account | – | – | – | – | – | – | – |
| Account-delete request | – | Q ⁴ | – | – | – | – | – |
| Recover lost admin | Q ⁵ | – | – | – | – | – | – |

¹ Account admins can soft-delete projects (30d grace), not hard-delete. Hard delete after grace requires quorum.
² Invited project admin can only add/remove users from their own company, never the host's or another invited company's.
³ File owner can restore older versions of files they uploaded.
⁴ Account deletion requires quorum from the customer side, then 30-day grace, then hard delete.
⁵ When the only account admin is gone: any 3 remaining members of the account can approve recovery (reset admin role onto a new user).

#### Trust tiers (the three mechanisms)

**Tier 1 — Single-admin grant** (routine support, ~95% of staff actions)
- Customer admin issues `SupportGrant` via UI: "Grant edkjo@sprucelab read access to Project Alpha for 24h. Reason: debugging upload failure (ticket #1234)."
- Staff user can act within scope until `expires_at` or until customer revokes.
- Notification: only the granting admin is notified (low noise for routine support).
- Audit: every action under the grant logged in customer's `ModelEvent` feed and staff-internal grant-usage log.
- Used for: read access for support, write access for support, soft-delete after grace, edit settings on customer's behalf.

**Tier 2 — Quorum** (irreversible / high-impact)
- `QuorumRequest` created: scope, action, reason, required_approvals = `min(N, 3)`.
- Notification to ALL members of the account.
- Approvers must be project members or above. First-to-click wins (v1). Random sample is v2 hardening if collusion proves real.
- Status flips to `approved` when threshold met. Action executes (or unlocks) at that moment.
- Expires after 24h if threshold not reached. Forces re-justification.
- Used for: hard delete after grace, account deletion, recovery from lost admin, mass operations.

**Tier 3 — Break-glass READ** (incident response)
- Staff creates `SupportGrant` with `break_glass=True`, scope, reason, `incident_ref`, expires_at ≤ 4h.
- Permissions are READ-ONLY. Hard rule, no exceptions, enforced at the model level.
- Notification queued to ALL account members; access blocked until queue acks (`notification_acked_at`). If notification system is down, break-glass is blocked. This is load-bearing — without it, "all members will be notified" silently degrades to "no one was notified" the day Postmark goes down.
- Customer-readable audit event in `ModelEvent`: "edkjo (Sprucelab Staff) used emergency read access to Project Alpha — 14:32, reason: incident #4521, expires in 4h."
- Repeat detection: 3+ break-glass uses on same account in 7 days triggers internal alarm.
- Used for: production incident response, urgent debugging when customer is unreachable.

**Total lockout** (no remaining users in account at all): no automated path. Manual procedure: legal verification, signed authorization, multi-staff sign-off, fully documented. Rare enough to be a procedure, not a feature.

#### Permission predicate (final, Phase 3)

```python
def can_act(user, action, resource):
    # Sprucelab staff: NO implicit rights on customer data
    if user.is_sprucelab_staff:
        # Platform-scope actions allowed without grant
        if action in PLATFORM_SCOPE_ACTIONS:
            return True
        # Customer-scope: requires active grant
        return active_grant_covers(user, resource, action)

    # Customer users: role-based
    if user.is_file_owner(resource) and action in OWNER_ACTIONS:
        if action == 'hard_delete' and not resource.in_grace_window:
            return False  # owner loses hard-delete after grace
        return True

    role = user.effective_role_on(resource)
    return action in ROLE_PERMISSIONS[role]
```

#### Versioning permission upgrade (Phase 2 → Phase 3)

```python
# Phase 2 (interim):
def can_delete_model(user, model):
    if user.is_superuser: return True
    if model.uploaded_by == user and model.in_grace_window: return True
    return False

# Phase 3 (final):
def can_delete_model(user, model):
    if user.is_file_owner(model) and model.in_grace_window:
        return True
    pm = user.project_membership(model.project)
    if pm and pm.role == 'admin' and pm.via_account == model.project.host_account:
        return model.in_grace_window  # host project admin: hard delete only in grace
    return False  # everyone else: needs grant or quorum

def can_hard_delete_after_grace(user, model):
    return active_quorum_approval(user, 'hard_delete', model) is not None
```

#### Invite flow

1. Host project admin: `POST /api/projects/{id}/invitations/` with `invited_account_email` or existing account slug.
2. Sprucelab sends email to invited account's admins (or creates an in-app notification).
3. Invited account admin approves: `POST /api/invitations/{id}/approve/` → `ProjectAccountInvite.status = 'accepted'`.
4. Invited account admin then assigns their users: `POST /api/projects/{id}/memberships/` with `user_ids` and `role`. `via_account` is set to the invited account automatically.
5. Users see the project in their workspace, scoped by `via_account`.

For new users (email doesn't have an account yet): the invite creates a pending `Account` and admin invitation. First user to sign up with that email becomes the new account's admin and inherits the project invite.

#### Migration of existing data

- Create `Account(name='Sprucelab Internal', slug='sprucelab', type='platform')` for staff.
- Create `Account(name='Skiplum', slug='skiplum', type='customer')` for the existing dev project.
- Assign all existing projects: `host_account = skiplum`.
- Create `Membership(user=admin, account=sprucelab, role=admin)` — edkjo as staff.
- Create `Membership(user=edkjo_supabase, account=skiplum, role=admin)` once edkjo logs in via Supabase the first time.
- Existing `Model.uploaded_by` (set in Phase 1) carries through.

---

## Norwegian terminology (for i18n)

| English | Norwegian | i18n key |
|---|---|---|
| Account | Konto | `roles.account` |
| Account Admin | Kontoadministrator | `roles.account_admin` |
| Account Member | Kontomedlem | `roles.account_member` |
| Project | Prosjekt | (existing) |
| Project Admin | Prosjektadministrator | `roles.project_admin` |
| Project Member | Prosjektmedlem | `roles.project_member` |
| File Owner | Filansvarlig | `roles.file_owner` |
| Sprucelab Staff | Sprucelab-ansatt | `roles.staff` |
| Host account | Vertskonto | `accounts.host` |
| Invited account | Invitert konto | `accounts.invited` |
| Grace window | Angrefrist | `versioning.grace_window` |
| Restore version | Gjenopprett versjon | `versioning.restore` |
| Quorum approval | Flertallsgodkjenning | `trust.quorum` |
| Break-glass access | Nødtilgang | `trust.break_glass` |
| Support grant | Supporttilgang | `trust.grant` |

---

## Sharp edges to track

1. **`parent_model` CASCADE → PROTECT** — must happen in Phase 2. Without this, restore-then-delete-head wipes the chain. Migration: assert no orphaned chains exist before applying.
2. **Storage blob retention** — confirm Supabase Storage actually deletes IFC blobs on row delete. Wire explicit cleanup if not. Validate in Phase 2 with a real upload→delete→check-bucket cycle.
3. **Concurrent uploads during restore** — `unique_together = ['project', 'name', 'version_number']` (`models.py:307`) handles the race naturally. Verify with a test that two simultaneous uploads can't claim the same version number.
4. **Supabase JWT secret rotation** — the secret is in env. Rotation invalidates all sessions. Document the procedure; no code work needed for v1.
5. **First Supabase user becomes Skiplum admin** — when edkjo first logs in via Supabase, the JWT auth class needs a one-time bootstrap that links the Supabase identity to the existing Django superuser admin row OR creates a new edkjo user and assigns Skiplum admin. Easiest: pre-seed `UserProfile` with edkjo's Supabase UUID before first login.
6. **Auto-sync hook noise** — every model save during Phase 2/3 will trigger `[auto]` commits. Audit log writes will be heavy. Consider muting auto-sync for `ModelEvent`/`SupportGrant` writes or batching.

---

## What's explicitly NOT in this plan

- **OAuth providers beyond Microsoft** — Google added in v2 if needed.
- **Multi-account user context switcher** — v1 forbids one user belonging to two accounts simultaneously. v2 if real consultants need it.
- **Cross-account project invite UI** — schema is built, UI ships in v2. Closed beta is single-account-per-project initially.
- **Branch visualization for forks** — linear timeline with "forked from v3" badge in v1. Tree visualization is v2 if anyone asks.
- **Custom grace window per account** — hardcoded 1h in v1, configurable in v2.
- **Webhooks / external integrations** — separate plan.
- **CLI** — separate plan, depends on Phase 1 (Supabase JWT auth) being live.

---

## Ordered task list

### Phase 1 — Auth foundation
- [ ] Configure Microsoft (Azure AD) provider in Supabase dashboard
- [ ] Add redirect URLs (localhost:5173, Vercel preview, Vercel production)
- [ ] Frontend: install `@supabase/supabase-js`, create `lib/supabase.ts`
- [ ] Frontend: `AuthContext` with `signInWithOAuth`, `signOut`, session persistence
- [ ] Frontend: login page, route guards, logout button
- [ ] Backend: `UserProfile` model + migration
- [ ] Backend: `SupabaseJWTAuthentication` DRF auth class (verify JWT with `SUPABASE_JWT_SECRET`)
- [ ] Backend: auto-create `User` + `UserProfile` on first authenticated request
- [ ] Backend: add `Model.uploaded_by` field + migration + backfill
- [ ] Backend: enforce auth on all API endpoints except `/api/auth/*` and health check
- [ ] Pre-seed edkjo `UserProfile` with Supabase UUID for bootstrap
- [ ] Test end-to-end: log in via Microsoft, upload model, see `uploaded_by` recorded

### Phase 2 — Versioning hardening
- [ ] Schema: `ModelEvent` model + migration
- [ ] Schema: `Model.deleted_at`, `Model.archived_at` fields + migration
- [ ] Schema: `Model.parent_model` CASCADE → PROTECT migration (with orphan check)
- [ ] Service: `model_events.py` — emit functions for each verb
- [ ] Wire emit: upload, publish, unpublish, delete, archive, restore (publish-old), fork
- [ ] Endpoint: `GET /api/models/{id}/events/` returning timeline
- [ ] Endpoint: `DELETE /api/models/{id}/` — grace window check, blob deletion, audit
- [ ] Service: Supabase Storage blob cleanup (verify or wire explicit)
- [ ] Frontend: timeline component (Notion-style vertical feed)
- [ ] Frontend: grace countdown on model card
- [ ] Frontend: restore button with confirmation dialog
- [ ] Frontend: inline error states (no console-only errors)
- [ ] Test: upload → delete in grace → blob gone, row gone, event logged
- [ ] Test: upload → wait past grace → delete blocked
- [ ] Test: publish v3 → v5 → restore v3 → v5 still in timeline as superseded

### Phase 3 — Accounts, RBAC, trust
- [ ] Schema: `Account`, `Membership` + migrations
- [ ] Schema: `Project.host_account` + migration with default assignment
- [ ] Schema: `ProjectAccountInvite`, `ProjectMembership` + migrations
- [ ] Schema: `SupportGrant`, `QuorumRequest`, `QuorumApproval` + migrations
- [ ] Migration: create `Sprucelab Internal` and `Skiplum` accounts, assign existing project, link edkjo
- [ ] Service: `permissions.py` — `can_act(user, action, resource)` predicate
- [ ] Update all DRF ViewSets: `get_queryset` filters by user's accessible accounts/projects
- [ ] Update versioning permissions to Phase 3 final form
- [ ] Endpoint: account CRUD, member management
- [ ] Endpoint: project membership management
- [ ] Endpoint: invite flow (`POST /api/projects/{id}/invitations/`, approve, decline)
- [ ] Endpoint: support grant CRUD
- [ ] Endpoint: quorum request CRUD + approval
- [ ] Endpoint: break-glass create (with notification ack gate)
- [ ] Service: notification system (in-app + email) — load-bearing for break-glass
- [ ] Service: repeat-detection alarm for break-glass
- [ ] Frontend: account settings page, member management
- [ ] Frontend: project member management, invite UI (host side only in v1)
- [ ] Frontend: support grant management (customer side: see active grants, revoke; staff side: request, act)
- [ ] Frontend: quorum approval UI (notification → approve/deny)
- [ ] Frontend: break-glass usage banner in customer's project view ("staff has emergency read access until 18:32")
- [ ] i18n: all role/permission strings in nb.json and en.json
- [ ] Test: full role matrix — each role attempts each action, expected outcome verified
- [ ] Test: trust tiers — single-admin grant flow, quorum flow, break-glass flow including notification block
- [ ] Test: invited account admin cannot delete files in host's project
- [ ] Test: file owner cannot delete after grace window
- [ ] Test: hard delete after grace requires quorum

---

## Open questions before starting Phase 3

These don't block Phase 1 or 2, but need answers before Phase 3 implementation:

1. **Quorum: first-to-click vs random sample?** Plan assumes first-to-click for v1. Confirm.
2. **Invited project admin: can they appoint sub-admins within their own company's stake?** Plan assumes yes (they can promote their own company's members to project admin). Confirm.
3. **Sprucelab staff account: who's in it initially?** Just edkjo? Or seed multiple staff accounts now for the multi-party approval mechanics to be testable?
4. **Notification channels for v1**: in-app only, in-app + email, or in-app + email + Slack? Email is probably required for break-glass to be defensible. Slack is later.
5. **Soft-delete retention for archived models**: how long until truly gone? 90 days? Forever (manual cleanup only)? Affects storage cost projections.

---

**Next**: confirm open questions, start Phase 1.
