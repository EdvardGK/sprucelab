# E2E tests (Playwright)

End-to-end tests for sprucelab, run against a local dev server against the
shared Supabase dev DB.

## First-time setup (one command per machine)

Install browsers:
```bash
yarn playwright install chromium
```

Create credentials file (gitignored) at `frontend/.env.playwright.local`:
```
PLAYWRIGHT_EMAIL=you@example.com
PLAYWRIGHT_PASSWORD=your-password
```

Capture the auth state (runs once, reused forever until your session expires):
```bash
yarn test:e2e:setup
```

This logs in through the real Supabase flow and saves the session to
`tests/e2e/.auth/user.json` (gitignored). All subsequent test runs reuse that
saved state.

## Running

```bash
yarn test:e2e                          # all tests
yarn test:e2e smoke                    # just public smoke tests
yarn test:e2e materials                # just materials browser tests
yarn test:e2e --headed                 # visible browser (watch it work)
yarn test:e2e --debug                  # Playwright inspector
yarn test:e2e --ui                     # Playwright UI mode
yarn test:e2e:report                   # open the last HTML report
```

## Test structure

- `auth.setup.ts` — one-time auth capture (runs automatically before other tests)
- `smoke.spec.ts` — public pages, no auth required
- `materials-browser.spec.ts` — requires auth + seeded G55 data

## Data dependencies

Materials Browser tests assume the G55 project has seeded TypeDefinitionLayer data.
Seed it (and clear it) via:

```bash
cd ../../backend
python manage.py seed_type_definition_layers --project 4d9eb7fe-852f-4722-9202-9039bfbfb0d9           # seed
python manage.py seed_type_definition_layers --project 4d9eb7fe-852f-4722-9202-9039bfbfb0d9 --clear   # cleanup
python manage.py seed_type_definition_layers --project 4d9eb7fe-852f-4722-9202-9039bfbfb0d9 --dry-run # preview
```

The seed is realistic synthetic data (Norwegian building recipes: betong, stål,
mineralull, gips, etc.) tagged `notes='__claude_seed__'` so it's always removable.

## Troubleshooting

**Tests skip with "storageState missing"**
→ Run `yarn test:e2e:setup` first. If that skips too, your
`.env.playwright.local` is missing or incomplete.

**"Authentication failed" during setup**
→ Your credentials don't work. Check you can log in manually at
http://localhost:5173/login with the same email/password.

**"Expected Betong to be visible" fails**
→ G55 has no TypeDefinitionLayer data. Run the seed command above.

**Tests work against production data**
→ Yes. `.env.local` points at the Supabase production DB. The seed
command tags everything with `__claude_seed__` and is reversible via
`--clear`. Don't run tests that mutate data other than through the seed
command path.

## CI notes

These tests are not wired into CI yet. When they are, `PLAYWRIGHT_EMAIL` +
`PLAYWRIGHT_PASSWORD` must be provisioned as CI secrets, and the setup project
needs to run once per job.
