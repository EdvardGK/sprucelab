# Working in Sprucelab

This is a solo project with one operator working across two machines
(**omarchy** for primary dev, **edkjo** for Skiplum-adjacent work and
skiplum-pages). Both run Claude Code under the same license. PRs exist for
self-review — they make work discoverable to a future me, to either machine's
Claude session, and to anyone who might collaborate later.

The conventions below are mine; they're not gates you have to argue past.
They're just the cheapest way to keep change-history readable.

If you're a Claude session on the edkjo box reading this for the first time,
the [Working from the edkjo box](#working-from-the-edkjo-box) section is the
relevant context. The rest applies on either machine.

---

## Current mission (2026-Q2)

Extract a subset of Sprucelab as a **forward-deployable api/cli + dashboard
surface**: hosted by Sprucelab, embeddable from any website. The goal is to let
external pages (starting with skiplum-pages) render Sprucelab dashboards with a
small client-side include and a scoped API token.

Concretely, "in scope" for this mission:

- A **public, scoped, agent-friendly API** subset — read-only first, dry-run
  mutations later. Returns structured JSON, finite-enum statuses, paginated lists.
- A **CLI** that exercises the same surface (`cli/spruce` is the foothold —
  see `cli/README.md`).
- An **embeddable dashboard** pattern (iframe + JS shim, or web component — TBD;
  the first PR in this track should propose the choice with a short plan doc in
  `docs/plans/`).
- Documentation per endpoint in `docs/knowledge/API_SURFACE.md`.

"Out of scope" for this mission: the authoring side of the app (uploads, viewer
internals, classification UI). Touch those only if a forward-deployed dashboard
genuinely depends on them.

---

## Read this first

Before opening a PR, skim these in order:

1. `CLAUDE.md` (repo root) — non-negotiable rules: i18n, layout, fail-loudly,
   types-only IFC architecture, no rm.
2. `docs/knowledge/2026-04-15-16-30_Agent-Workflows.md` — operating manual for
   working in this repo: env map, mutation/endpoint/component checklists, known
   gaps.
3. `docs/plans/PRD_v2.md` — product north star.
4. The **latest** file in `docs/worklog/` — what just happened and what's queued.
5. `docs/todos/current.md` if present — outstanding tasks.

Don't replicate what those docs already say in your PR description; link to them.

---

## Branching model

```
main  ── production. Deploys to Railway (Django + FastAPI) and Vercel (frontend).
 │
 ├── dev  ── owner's solo integration branch. Receives auto-commits from the
 │           Edit/Write hooks and gets squash-merged to main periodically.
 │           **Do not branch off dev** for PR contributions.
 │
 └── feat/<short-slug>   ── PR branches. Branch off main, PR back to main.
     fix/<short-slug>
     docs/<short-slug>
```

**For PR-style work** (anything you want to land as a self-reviewable unit):

- Branch off **`main`**, not `dev`.
- One logical change per branch. If you find yourself writing "and also" in the
  description, split.
- Rebase onto `main` before opening the PR if `main` has moved; merge commits in
  PR branches are fine but not required.

The `dev` branch keeps its session-start auto-snapshot cadence (see CLAUDE.md +
auto-memory). PR branches are exempt: commit normally, no `[session-start]`
snapshots.

Not every change needs a PR — small, low-risk fixes can still go straight to
`dev` the way they always have. PRs are for work where the diff benefits from
being read in one sitting: feature slices, mission-track work, anything you'd
want to find again by title six months later.

---

## Opening a PR with `gh`

Prereq: `gh auth login` once on the machine you're working from.

```bash
# 1. Branch off main
git checkout main
git pull --ff-only origin main
git checkout -b feat/embed-dashboard-shim

# 2. Make changes. Commit normally; no auto-commit hooks needed on PR branches.
git add backend/apps/embed/ frontend/src/embed/
git commit -m "embed: scoped dashboard shim + token middleware"

# 3. Push and open PR
git push -u origin feat/embed-dashboard-shim
gh pr create --base main --fill   # uses commit + .github/PULL_REQUEST_TEMPLATE.md
```

The repo has a PR template at `.github/PULL_REQUEST_TEMPLATE.md` — `gh pr create
--fill` pre-populates it. Replace the placeholders before publishing.

---

## PR scope rules

A PR should be **mergeable in one read**. Concretely:

- **One concern.** Bug fix, feature slice, docs, or refactor — pick one.
- **Reversible.** Mutating commands ship `--dry-run` + `--clear` (see seed
  command pattern in Agent-Workflows §Reference patterns). Mutating endpoints
  accept `?dry_run=true` where it makes sense.
- **No silent data loss.** Every extraction or transform writes a structured
  log line. Dropped/skipped/coerced data shows up in the response, not in
  stdout-only.
- **No production data destruction without confirmation in the PR body.** Do
  PR-track work against the Docker-local Postgres (`just up`, `.env.dev`).
  `backend/.env.local` points at the production Supabase pooler — it exists for
  ad-hoc maintenance work, not for active development. The Justfile's
  `_safety-check` and `tests/conftest.py` both refuse to run against a
  non-localhost host, so accidents are hard. If a PR could still affect prod
  (migration that production picks up on next deploy, data backfill, external
  API call), call it out in the PR body so future-you can find it.
- **No bypass commits.** No `--no-verify`, no `git push --force` to `main`. If
  hooks fail, fix the cause.

If a PR touches more than one of {backend, FastAPI, frontend}, that's fine —
many features cross all three. The "one concern" rule is about *intent*, not
file count.

---

## Required checks before publishing

CI runs backend unit tests + frontend type-check on every PR
(`.github/workflows/pr.yml`). Run them locally first — same commands, faster
feedback:

```bash
just test                  # backend unit tests (CI runs this)
cd frontend && yarn tsc --noEmit    # type check (CI runs this)
cd frontend && yarn test:e2e smoke  # public smoke — local-only for now
```

For mission-track work specifically:

```bash
just routes                # confirm new routes show up flat (agent-friendly)
just api GET /capabilities/    # does the new surface advertise itself?
```

If you add a new API endpoint, **also update `docs/knowledge/API_SURFACE.md`**
in the same PR. An undocumented endpoint is the same as no endpoint for the
forward-deployed use case.

If you add user-facing strings, **add keys to BOTH `en.json` AND `nb.json`**.
Norwegian is primary. CI does not currently catch missing translations — the
review does.

---

## PR title + body conventions

**Title** — one line, under 70 chars, present tense, no trailing period.

Format:
```
<area>: <what changed>
```

Where `<area>` is one of:
`embed`, `api`, `cli`, `viewer`, `warehouse`, `entities`, `projects`, `field`,
`ifc-service`, `frontend`, `backend`, `docs`, `infra`, `deps`.

Examples (good):
- `embed: scoped token middleware + iframe shim`
- `api: paginate /api/types/ list endpoint`
- `cli: spruce dashboard render --project <id>`
- `docs: forward-deployed dashboard plan`

Examples (bad):
- `Various fixes` — no area, no signal
- `Update files` — what changed?
- `WIP` — don't open a PR for WIP; use a draft PR with a real title

**Body** — use the template. Keep it tight:

- **Why** — the user-visible reason. Skip if the title says it.
- **What changed** — bullet list, file-level if the change is large.
- **Out of scope / follow-ups** — known unfinished pieces, tracked elsewhere.
- **Test plan** — checkboxes the reviewer can run. Be specific:
  `[ ] just test passes` is fine; `[ ] tested locally` is not.
- **Risk** — touch production data? Hit an external API? Deploy gate? Say so.

Don't paste long log dumps. Link to a gist or attach a file if needed.

---

## Cross-machine comms (issues + PR comments)

When the omarchy session and the edkjo session are coordinating through
GitHub issues or PRs, use a lightweight metadata header so threads stay
parseable across sessions and across time. Convention adopted from
spruceforge:

```
**From:** edkjo
**To:** omarchy
**Type:** proposal | question | decision | update
**Priority:** low | normal | high
```

Header on the first message of a thread (issue body or first PR
comment); subsequent comments on the same thread skip the header but
sign off with `*Signed: **<machine>** at <yyyy-mm-dd hh:mm>*`. This
makes it trivial to skim-read who said what when, and lets either
session pick up a thread cold.

For solo work where no cross-machine coordination is happening, skip the
metadata — it's overhead for a one-author thread.

---

## Review + merge

Self-review. A PR is ready when CI is green and the body answers
"why, what, how-tested" well enough that you'd be happy reading it cold in six
months.

- Default merge strategy: **squash**. The PR title becomes the squash commit
  subject — make it useful (it's the only line `git log --oneline` will show).
- After merge, delete the branch: `gh pr merge --squash --delete-branch`.
- If a Claude session opens a PR on one box and you want the session on the
  other box to take a pass before merging, leave a draft PR open and pick it up
  there. Cross-machine review is the main reason to bother with PRs at all on a
  solo project — use it when the change deserves it.

---

## Working from the edkjo box

The edkjo machine is where the forward-deployed embed track mostly lives,
because that's where **skiplum-pages** is checked out — a GitHub Pages setup
that originated as a Sprucelab dashboard mirror and has since matured into a
tactical UI framework (layout + wireframing, not the Python renderer). The
embed track's first consumer is skiplum-pages itself.

Suggested order of work for that track:

1. **Plan doc** at `docs/plans/yyyy-mm-dd-hh-mm_Forward-Deployed-Embed.md`,
   landed as `docs: forward-deployed dashboard plan`. Cover:
   - Embed mechanism choice (iframe + postMessage vs. web component vs. JS SDK)
     with a short pros/cons matrix grounded in how skiplum-pages actually
     consumes UI today.
   - Authentication model — scoped tokens (capability tokens, see Agent-Workflows
     §Roadmap #2), CORS allowlist, token rotation.
   - The minimum viable dashboard set to ship first (1–3 screens).
   - Whether skiplum-pages contributes layout primitives back into
     `frontend/src/components/` or stays as an external reference.
   - Open questions, called out as such.
2. **Read-only API capability surface** — a `/api/capabilities/` extension or
   a new `/api/embed/` namespace that lists exactly what an embedded dashboard
   can ask for. Dry-run only, no mutations.
3. **Embed POC** — one Sprucelab dashboard rendering inside skiplum-pages via
   the chosen mechanism, behind a scoped token.

Don't skip the plan doc — embedding decisions are hard to reverse, and
skiplum-pages is a real consumer with its own layout opinions worth surfacing
before they get encoded as iframe assumptions.

When a Sprucelab assumption doesn't survive contact with the skiplum-pages
reality, write it down in the PR. The cross-machine view is exactly the value
of doing this work from the edkjo box.

---

## Maintaining this guide

This file lives at the repo root so GitHub surfaces it on every PR. Keep it
that way.

Update it when:

- The branching model changes (new long-lived branch, new auto-commit policy).
- A new mission supersedes the current one — replace the "Current mission"
  section, don't append.
- The PR template at `.github/PULL_REQUEST_TEMPLATE.md` changes shape.
- A consistently-missed convention shows up in review feedback twice — codify it
  here so the third time isn't needed.

Don't update it for one-off gotchas; those belong in `docs/knowledge/` or in
auto-memory. This file is for rules that apply to every PR.

Aim for under 250 lines forever. If it grows past that, something belongs
elsewhere.

**Last updated:** 2026-05-03 (initial — solo PR conventions + forward-deployed embed track context)
