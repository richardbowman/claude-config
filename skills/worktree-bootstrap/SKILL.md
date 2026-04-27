---
name: worktree-bootstrap
description: Bootstrap a git worktree for local Next.js development when the main repo is wired for Vercel/AWS DSQL credentials that only work server-side. Use when entering a fresh worktree and the user asks to start the dev server, or when `nextdev start` fails with missing node_modules, expired OIDC tokens, MissingSecret auth errors, or DSQL connection failures. Runs `worktree-bootstrap` which installs deps, copies .env.local from main, starts the Podman Postgres container, derives DATABASE_URL from the container, and launches nextdev with that DATABASE_URL injected so prisma.config.ts short-circuits to local Postgres.
---

# Worktree bootstrap

Fresh git worktrees miss several pieces the main checkout has:

- **No `node_modules`** — worktrees share git objects but not dependencies.
- **No `.env.local`** — `vercel env pull` only runs against a linked project, and `.vercel/project.json` lives in the main checkout, not the worktree.
- **DSQL credentials won't work locally** — if the project uses AWS Aurora DSQL via the Vercel integration, auth requires a live OIDC token exchange that only runs server-side on Vercel. Locally the SDK times out or throws `MissingSecret`/`UnauthorizedException`.

The `worktree-bootstrap` CLI handles all of this in one command.

## Command

```sh
cd /path/to/worktree      # e.g. ~/projects/myapp/.claude/worktrees/feature-x
worktree-bootstrap
```

One command, idempotent. Re-running is safe — install and .env.local copy both skip if already done.

## What it does (in order)

1. **Verify worktree** — uses `git rev-parse --git-dir` vs `--git-common-dir`; errors if run from the main checkout.
1b. **Staleness check** — runs `git fetch origin --quiet` then counts commits between the worktree's `HEAD` and `origin/main` (or the repo's default branch). If behind, emits a warning with the commit count and suggests deleting the worktree, pulling main, and re-creating with `wtadd`. Does not abort — you may have already done work — but the warning is loud.
2. **Install deps** — detects package manager from lockfile (`pnpm-lock.yaml`, `yarn.lock`, `bun.lock*`, else `package.json`+`npm ci`) and runs a frozen-lockfile install. Skipped if `node_modules/` already exists.
3. **Copy `.env.local`** from `<mainRepo>/.env.local` to `<worktree>/.env.local`. Skipped if the worktree already has one.
4. **Start Podman Postgres** — finds a container matching `*-pg` whose image name contains `postgres|pgvector|postgis`. If multiple, prefers one whose name matches the main repo's basename. `podman start` if stopped.
5. **Derive `DATABASE_URL`** from the container's env (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`) and port mapping — `postgres://<user>:<pass>@localhost:<hostPort>/<db>?sslmode=disable`. The `sslmode=disable` suffix is always appended — local Podman Postgres containers don't have SSL configured and Prisma will throw "The server does not support SSL connections" without it.
6. **Write `DATABASE_URL` to `.env.local`** in the worktree, overwriting any existing `DATABASE_URL` line. This ensures `prisma.config.ts` sees the local connection string and skips the DSQL token provider, and the value persists across server restarts.
7. **Done.** Use the `nextjs-local-dev` skill to start the dev server (`nextdev start`).

## The prisma.config.ts short-circuit pattern

This script assumes the project's `prisma.config.ts` reads `process.env.DATABASE_URL` and, when present, uses it directly **instead of** configuring the DSQL adapter/token provider. Typical shape:

```ts
// prisma.config.ts
import 'dotenv/config';
import { defineConfig } from 'prisma/config';
// … dsql adapter imports

export default defineConfig({
  schema: 'prisma/schema.prisma',

  // If DATABASE_URL is explicitly set, trust it — we're running locally.
  // Otherwise set up the DSQL adapter with token provider for Vercel.
  ...(process.env.DATABASE_URL
    ? {}
    : {
        adapter: /* dsql adapter with tokenProvider */,
      }),
});
```

The exact adapter/tokenProvider shape varies by project and Prisma version — check current `@prisma/adapter-*` docs before writing. The important invariant: **`DATABASE_URL` being set must be the "local mode" signal**, and `worktree-bootstrap` always sets it.

## CLI tools in worktrees — always use `npx`

In a git worktree, the shell PATH does not include the main repo's `node_modules/.bin`. Any CLI tool installed as a project dependency (Prisma, ESLint, tsc, etc.) must be invoked via `npx`:

```sh
# ❌ Fails in worktrees — "Command not found"
pnpm prisma generate
pnpm tsc --noEmit

# ✅ Works — npx finds the tool from the nearest node_modules
npx prisma generate
npx tsc --noEmit
```

This is true even if `node_modules/` exists. The `pnpm` binary forwarding and shell PATH setup only work from the main checkout, not from a worktree subdirectory.

## Trigger signals

Run `worktree-bootstrap` when:

- User enters a worktree and says "start the dev server" / "get this up and running".
- `nextdev start` exits immediately with one of:
  - `Cannot find module` or `MODULE_NOT_FOUND` → no `node_modules`.
  - `MissingSecret`, `NEXTAUTH_SECRET`, `Invalid environment variables` → `.env.local` not copied.
  - `UnauthorizedException`, `OIDC`, `token expired`, `DsqlSigner` → DSQL auth; need local Postgres override.
  - `ECONNREFUSED` on `:5432` → Podman container stopped.
- User mentions they just did `git worktree add …` or `switched to a new worktree`.

## Customizing per project

The script uses conventions that work for most of Rick's projects:

- Container naming: `<something>-pg`. Rename existing containers if they don't match.
- Postgres image: anything matching `postgres|pgvector|postgis`.
- Main repo discovered via git, not hardcoded paths.

If a project needs something different, run the pieces manually:

```sh
# deps
pnpm install --frozen-lockfile

# env
cp ../main-repo/.env.local .

# postgres
podman start myproject-pg

# write DATABASE_URL to .env.local (overwrite any existing line)
grep -v '^DATABASE_URL=' .env.local > .env.local.tmp && mv .env.local.tmp .env.local
echo 'DATABASE_URL="postgres://postgres:postgres@localhost:5432/myproject?sslmode=disable"' >> .env.local

# then start via nextjs-local-dev skill
nextdev start
```

## cmux tab management

`wtcc` automatically tags the cmux workspace on launch:
- Tab **title** → branch name
- Tab **description** → full worktree path

Two companion commands live in `~/claude-config/bin/`:

**`wtcc-status`** — list all cmux workspaces with their current working directory:
```sh
wtcc-status
```

**`wtcc-recover`** — after a cmux crash, reopen all worktree tabs at once with Claude already launching:
```sh
wtcc-recover
# then type /resume in each tab to continue
```

`wtcc-recover` reads live cmux workspace state via `cmux rpc workspace.list` and opens a new tab for every workspace whose `current_directory` contains `.claude/worktrees/`. Non-worktree tabs are ignored.

## Creating worktrees safely

Use the `wtadd` shell function (in `~/.zshrc`) instead of bare `git worktree add`. It fetches origin, fast-forwards local main if behind, then creates the worktree — so the base is always current.

```sh
# instead of: git worktree add ../feature-x -b feature-x
wtadd ../feature-x -b feature-x
```

If the fast-forward fails (local commits diverged from remote), `wtadd` aborts and tells you to resolve it first.

## Not covered

- **Seeding / migrating** — add `prisma migrate deploy` or equivalent to your workflow if the worktree needs schema changes applied.
- **Non-Prisma ORMs** — the short-circuit pattern applies to any ORM that reads `DATABASE_URL`; adjust the config file name in your head.
- **Pulling fresh env vars** — if `.env.local` in main is stale, `cd <main> && vercel env pull` first, then re-run `worktree-bootstrap`.

## After adding a new migration

If the worktree introduces new tables/columns, apply the migration before running E2E or testing locally:

1. Apply via the `/api/admin/migrate` endpoint (GET to check status, POST with `{"script":"your-migration.sql"}` to apply)
2. Confirm the tables exist under the active schema (check `lib/prisma.ts` to see which schema local dev targets)
3. **Do not manually apply DDL to `public`** — if local dev queries `public` but the migration goes to `myapp_dev`, the fix is in `lib/prisma.ts`, not in patching `public` (see `dsql-migrate` skill)
