---
name: vercel-tools
description: Vercel CLI recipes for this project — checking migration status, applying migrations to preview/production, watching deployments go ready, debugging failed builds, and pulling historical logs. Use whenever the user asks to run migrations, check deploy status, investigate build errors, or manage Vercel deployments.
---

# Vercel Tools

All commands run from the main repo root. The project cwd flag (`--cwd $HOME/projects/golden-wealth-app`) is required for `vercel` commands when working inside a worktree — the Vercel link only exists in the main checkout.

```bash
MAIN_REPO=$HOME/projects/golden-wealth-app
SECRET=$(grep MIGRATION_SECRET $MAIN_REPO/.env.local | cut -d= -f2 | tr -d '"')
```

---

## Check migration status

```bash
vercel curl /api/admin/migrate \
  --deployment <URL> \
  --cwd $MAIN_REPO \
  -- --header "x-migration-secret: $SECRET"
```

Response includes `appliedMigrations` (already done) and `scripts` (full manifest). Diff them to find what's pending.

---

## Apply a migration

```bash
vercel curl /api/admin/migrate \
  --deployment <URL> \
  --cwd $MAIN_REPO \
  -- --request POST \
     --header "Content-Type: application/json" \
     --header "x-migration-secret: $SECRET" \
     --data '{"script":"NNN-name.sql"}'
```

To apply multiple in sequence:

```bash
for script in 009-rbac-slugs.sql 010-estate-role-presets.sql; do
  echo "=== $script ==="
  vercel curl /api/admin/migrate \
    --deployment <URL> \
    --cwd $MAIN_REPO \
    -- --request POST \
       --header "Content-Type: application/json" \
       --header "x-migration-secret: $SECRET" \
       --data "{\"script\":\"$script\"}" 2>&1 | grep -o '"message":"[^"]*"'
done
```

**Success:** all lines show `✓`. Watch for `✗ Error:` lines — the migration is still recorded as applied even on partial failure, so errors need a follow-up fix migration (not a re-run).

---

## Get the latest deployment URL

```bash
# Latest preview:
vercel ls --cwd $MAIN_REPO 2>&1 | grep "Preview" | head -1 | awk '{print $3}'

# Latest production:
vercel ls --cwd $MAIN_REPO 2>&1 | grep "Production" | head -1 | awk '{print $3}'
```

---

## Wait for a deployment to go Ready

Use after merging to main (production) or pushing a PR branch (preview). Use the pre-built `vercel-wait-deploy` script — do NOT write an inline polling loop.

```bash
# Wait for production (after merging to main):
vercel-wait-deploy --cwd $MAIN_REPO

# Wait for a specific SHA (e.g., a PR preview):
vercel-wait-deploy --cwd $MAIN_REPO --sha <commit-sha>

# Narrow to a specific target (optional):
vercel-wait-deploy --cwd $MAIN_REPO --target preview
```

Options:
- `--cwd <dir>` — project root containing `.vercel/project.json` (required when in a worktree)
- `--sha <sha>` — commit SHA to wait for (default: HEAD of `--cwd`)
- `--timeout <secs>` — max wait time in seconds (default: 600)
- `--target <target>` — `production` or `preview` (default: searches all targets by SHA)

On success, prints the stable **branch alias URL** (e.g. `https://v0-app-git-my-branch-team.vercel.app`) and writes it to `/tmp/vercel_prod_url.txt`. Falls back to the per-deploy hash URL if no alias is found.

---

## Full merge-to-prod workflow

1. `gh pr merge <N> --squash`
2. Wait for deployment (recipe above)
3. Check pending migrations (status recipe above)
4. Apply each pending migration in sequence
5. Verify by re-running status — `appliedMigrations` should match `scripts`

---

## Debug failed builds

When a deployment fails, use `vercel inspect` with `--logs` to see the full build output including errors, test failures, and dependency issues:

```bash
# From GitHub PR checks or Vercel dashboard, get the deployment ID (starts with dpl_)
# Then inspect with logs:
npx vercel inspect dpl_<DEPLOYMENT_ID> --logs --scope <SCOPE_NAME>

# Example:
npx vercel inspect dpl_Aix3L5sBTVQMRt3qM9wKkEbtYLUD --logs --scope rv-bankrate-projects

# Pipe to tail for last N lines (error usually at the end):
npx vercel inspect dpl_<ID> --logs --scope <SCOPE> 2>&1 | tail -100
```

**What this shows:**
- Full build stdout/stderr
- Test failures (unit tests, linting, type errors)
- Dependency installation errors
- Build script failures
- Environment variable issues
- Exact line where build failed

**Getting the deployment ID:**

From GitHub PR:
```bash
gh pr checks <PR_NUMBER> | grep "Vercel.*fail"  # Shows failing check with URL
# Extract dpl_* from the URL
```

From Vercel dashboard URL:
```
https://vercel.com/.../dpl_Aix3L5sBTVQMRt3qM9wKkEbtYLUD
                        ^-- deployment ID starts here
```

**Troubleshooting tip:** Scroll to the end of the logs first — the error is usually in the last 50-100 lines. Look for:
- `Error:` or `ERROR` lines
- Test suite failures
- `Command "..." exited with 1`
- Stack traces

---

## Historical logs

```bash
# Get deployment ID from URL
vercel inspect <URL> | grep '^\s*id'  # → dpl_abc123

# Pull runtime logs (after deployment is live)
vercel logs dpl_abc123 --no-follow                    # all recent
vercel logs dpl_abc123 --no-follow --status-code 500  # errors only
vercel logs dpl_abc123 --no-follow --query "error"    # substring filter
vercel logs dpl_abc123 --no-follow --json | jq '.message'
```

**Note:** `vercel logs` shows **runtime logs** (requests, function invocations). For **build logs**, use `vercel inspect --logs` (see "Debug failed builds" above).

`--no-follow` is required — without it, `vercel logs` tails forever and blocks the shell.

| Flag | Purpose |
|---|---|
| `--no-follow` | One-shot historical lookup |
| `--status-code <N>` | Filter by HTTP status (`500`, `4xx`) |
| `--query <str>` | Substring filter |
| `--json` | Machine-readable; pipe to `jq` |
| `--since <duration>` | e.g. `--since 1h` or `--since 2024-01-15` |

---

## Secrets workflow: Password Manager → Vercel

Always fetch secrets from the project's password manager rather than guessing or relying on `.env.local` (which may be stale or empty for encrypted vars). Check project memory for which password manager applies — work projects use Keeper, personal projects use 1Password.

**Keeper (work projects):**
```bash
keeper list
keeper search "myproject"
keeper add --title "MyProject MY_SECRET" --pass "$(openssl rand -hex 32)" --notes "MY_SECRET for <project>"
SECRET=$(keeper get <record-uid> --format password)
```

**1Password (personal projects):**
```bash
op item list --vault <vault>
op item get "MyProject MY_SECRET" --fields password
SECRET=$(op item get "MyProject MY_SECRET" --fields password)
```

**Full new-secret workflow:**
1. Generate + store in password manager (commands above)
2. Push to Vercel production: `vercel env add MY_SECRET production --value "$SECRET" --yes --cwd $MAIN_REPO`
3. Push to Vercel preview branch: `vercel env add MY_SECRET preview <branch> --value "$SECRET" --yes --cwd $MAIN_REPO`
4. Write to `.env.local`: `grep -v '^MY_SECRET=' .env.local > /tmp/e && mv /tmp/e .env.local && echo 'MY_SECRET="'"$SECRET"'"' >> .env.local`

**Setting same value on production + preview:** CLI requires two calls — no "all environments" shorthand in non-interactive mode. For preview, a branch name is required with `--yes`; omit `--yes` to apply to all preview branches interactively. Add `--force` to overwrite existing values.

**New env var not live until redeployed** — existing deployments don't pick up new env vars; `vercel redeploy <url> --cwd $MAIN_REPO` or push a new commit.

---

## Adding env vars via CLI

Use `printf '%s'` instead of `echo` to avoid a trailing newline being stored in the value — a newline in the value causes `403 Forbidden` errors at runtime:

```bash
# Correct — no trailing newline:
printf '%s' "$MY_SECRET" | vercel env add MY_SECRET production

# Wrong — echo appends \n which gets stored in the value:
echo "$MY_SECRET" | vercel env add MY_SECRET production
```

---

## Common gotchas

- **`vercel ls` output goes to stderr** — always use `2>&1`
- **Env var trailing newline** — always use `printf '%s'` (not `echo`) when piping values to `vercel env add`; a stored newline causes `403 Forbidden` at runtime
- **Preview deployments are behind Vercel SSO** — plain `curl` gets an HTML login page; always use `vercel curl --deployment`
- **Migration errors don't block recording** — if a migration has `✗` lines, it's still marked applied; write a follow-up fix migration rather than re-running
- **DSQL: no `ADD COLUMN NOT NULL DEFAULT`** — split into nullable `ADD COLUMN` + `UPDATE ... WHERE col IS NULL` backfill
- **Worktree cwd** — always pass `--cwd $MAIN_REPO` when running Vercel CLI from a worktree
- **`--level error` doesn't exist** — use `--status-code 500` or `--query "error"` instead
