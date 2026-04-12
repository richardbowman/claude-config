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
2. **Install deps** — detects package manager from lockfile (`pnpm-lock.yaml`, `yarn.lock`, `bun.lock*`, else `package.json`+`npm ci`) and runs a frozen-lockfile install. Skipped if `node_modules/` already exists.
3. **Copy `.env.local`** from `<mainRepo>/.env.local` to `<worktree>/.env.local`. Skipped if the worktree already has one.
4. **Start Podman Postgres** — finds a container matching `*-pg` whose image name contains `postgres|pgvector|postgis`. If multiple, prefers one whose name matches the main repo's basename. `podman start` if stopped.
5. **Derive `DATABASE_URL`** from the container's env (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`) and port mapping — `postgres://<user>:<pass>@localhost:<hostPort>/<db>`. No hardcoded values.
6. **Launch `nextdev start`** with the derived `DATABASE_URL` in `process.env`. This overrides whatever the copied `.env.local` had (which would be the DSQL URL from `vercel env pull`), so `prisma.config.ts` sees the local connection string and skips the DSQL token provider.
7. **Scan the dev log** after 3s for common failure patterns (`MissingSecret`, `OIDC`/`token expired`, `ECONNREFUSED :5432`, Prisma connect errors) and flag them.

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

# dev server with override
DATABASE_URL="postgres://postgres:postgres@localhost:5432/myproject" nextdev start
```

## Not covered

- **Seeding / migrating** — add `prisma migrate deploy` or equivalent to your workflow if the worktree needs schema changes applied.
- **Non-Prisma ORMs** — the short-circuit pattern applies to any ORM that reads `DATABASE_URL`; adjust the config file name in your head.
- **Pulling fresh env vars** — if `.env.local` in main is stale, `cd <main> && vercel env pull` first, then re-run `worktree-bootstrap`.
