<!--
Thanks for opening a PR. Read CONTRIBUTING.md once if you haven't.
Title format: `<area>: <what changed>` (under 70 chars, no trailing period).
Areas: embed, api, cli, viewer, warehouse, entities, projects, field,
       ifc-service, frontend, backend, docs, infra, deps.
-->

## Why

<!-- One or two sentences. Skip if the title says it. -->

## What changed

<!-- Bullet list. File-level if the change is large. -->

-

## Out of scope / follow-ups

<!-- Known unfinished pieces, tracked elsewhere. -->

-

## Test plan

<!-- Checkboxes the reviewer can actually run. Be specific. -->

- [ ] `just test` passes
- [ ] `cd frontend && yarn tsc --noEmit` passes
- [ ] `cd frontend && yarn test:e2e smoke` passes
- [ ]

## Risk

<!--
Tick any that apply, then explain.
- [ ] Touches production data (local dev → prod Supabase pooler)
- [ ] Adds/changes a public API endpoint (also update docs/knowledge/API_SURFACE.md)
- [ ] Adds user-facing strings (en.json + nb.json both updated)
- [ ] Deploy gate: needs Railway/Vercel env var change
- [ ] None of the above
-->

-
