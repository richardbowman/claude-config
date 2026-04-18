---
name: e2e-local
description: Run Playwright E2E tests locally for this project. Use whenever the user asks to run E2E tests, integration tests, or Playwright tests locally. Handles .env.e2e setup, ensures the dev server is pointing at local Postgres, and runs pnpm test:e2e.
---

# E2E local test runner

Running E2E tests locally requires three things to line up:

1. **`.env.e2e`** — exists and has secrets that match the running dev server
2. **Dev server** — running with `DATABASE_URL` pointing at local Postgres (not DSQL)
3. **Run tests** — `pnpm test:e2e`

## Step 1 — ensure `.env.e2e` exists

Check if `.env.e2e` exists in the worktree root:

```sh
ls .env.e2e 2>/dev/null && echo "exists" || echo "missing"
```

If missing, create it by pulling `AUTH_SECRET` and `ENCRYPTION_KEY` from `.env.local` (these must match the running dev server):

```sh
AUTH_SECRET=$(grep '^AUTH_SECRET=' .env.local | cut -d= -f2- | tr -d '"')
ENCRYPTION_KEY=$(grep '^ENCRYPTION_KEY=' .env.local | cut -d= -f2- | tr -d '"')

cat > .env.e2e <<EOF
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/localdb?sslmode=disable

AUTH_SECRET=${AUTH_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}

E2E_USER_EMAIL=e2e-test@example.local
E2E_USER_PASSWORD=E2eTestPassword123!

PLAYWRIGHT_BASE_URL=http://localhost:3000

SCREENSHOTS_USER_EMAIL=screenshots@example.local
SCREENSHOTS_USER_PASSWORD=ScreenshotPassword123!
EOF
```

> **Why these must match the dev server:** The E2E global-setup seeds a user directly into the DB and then logs in via the browser. If `AUTH_SECRET` differs, NextAuth can't verify the session token and login fails with a `CredentialsSignin` error. If `ENCRYPTION_KEY` differs, any encrypted data written during seeding won't decrypt at runtime.

> **Why `?sslmode=disable`:** Local Podman Postgres doesn't have SSL configured. Without this suffix Prisma throws "The server does not support SSL connections".

## Step 2 — ensure dev server is on local Postgres

The dev server must be connected to the same local Postgres that the E2E seed writes to. If it's running against DSQL (the default from `.env.local`), the seeded user won't exist when the browser tries to log in.

Check what the running server is connected to:

```sh
nextdev status
nextdev logs -n 20
```

If the server is running without `DATABASE_URL` set (i.e., it's using DSQL from `.env.local`), restart it:

```sh
nextdev restart --cmd "DATABASE_URL=postgresql://postgres:postgres@localhost:5433/localdb?sslmode=disable pnpm dev"
```

Or if it's not running at all, use `worktree-bootstrap` which handles everything (deps, .env.local, Postgres container, DATABASE_URL injection):

```sh
worktree-bootstrap
```

Wait for the "Ready" line before proceeding:

```sh
nextdev logs -n 30
```

## Step 3 — run the tests

```sh
pnpm test:e2e
```

All tests should pass. If they don't, check:

- `nextdev logs -n 50` — look for auth errors or DB connection failures during the test run
- The `CredentialsSignin` error means `.env.e2e`'s `AUTH_SECRET` doesn't match the server's — re-check step 1
- `ECONNREFUSED` on `:5433` means the Podman Postgres container isn't running — `podman start localdb-pg` (or whatever the container is named; check with `podman ps -a`)
- If the browser times out waiting for `/dashboard`, the login failed — check the dev server logs for what the credentials auth handler returned

## All together (clean run from scratch)

```sh
# 1. Bootstrap the worktree (installs deps, copies .env.local, starts Postgres, starts nextdev with local DB)
worktree-bootstrap

# 2. Create .env.e2e if missing (copy secrets from .env.local, point to local Postgres)
#    … see Step 1 above

# 3. Run tests
pnpm test:e2e
```

## Keeping `.env.e2e` in sync

`.env.e2e` is gitignored. If `.env.local` changes (e.g. after a `vercel env pull`), the `AUTH_SECRET` and `ENCRYPTION_KEY` in `.env.e2e` may become stale. If tests start failing with auth errors after a pull, regenerate `.env.e2e` using the step 1 commands above.
