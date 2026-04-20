---
name: vercel-tools
description: Vercel CLI recipes for this project — checking migration status, applying migrations to preview/production, watching deployments go ready, and pulling historical logs. Use whenever the user asks to run migrations, check deploy status, investigate errors, or manage Vercel deployments.
---

# Vercel Tools

All commands run from the main repo root. The project cwd flag (`--cwd /Users/rickbowman/projects/golden-wealth-app`) is required for `vercel` commands when working inside a worktree — the Vercel link only exists in the main checkout.

```bash
MAIN_REPO=/Users/rickbowman/projects/golden-wealth-app
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

## Wait for a production deployment to go Ready

Use after merging to main. Use the pre-built `vercel-wait-deploy` script — do NOT write an inline polling loop.

```bash
vercel-wait-deploy --cwd $MAIN_REPO
```

Options:
- `--cwd <dir>` — project root containing `.vercel/project.json` (required when in a worktree)
- `--sha <sha>` — commit SHA to wait for (default: HEAD of `--cwd`)
- `--timeout <secs>` — max wait time in seconds (default: 600)

On success, prints the URL and writes it to `/tmp/vercel_prod_url.txt` for use in subsequent steps.

---

## Full merge-to-prod workflow

1. `gh pr merge <N> --squash`
2. Wait for deployment (recipe above)
3. Check pending migrations (status recipe above)
4. Apply each pending migration in sequence
5. Verify by re-running status — `appliedMigrations` should match `scripts`

---

## Historical logs

```bash
# Get deployment ID from URL
vercel inspect <URL> | grep '^\s*id'  # → dpl_abc123

# Pull logs
vercel logs dpl_abc123 --no-follow                    # all recent
vercel logs dpl_abc123 --no-follow --status-code 500  # errors only
vercel logs dpl_abc123 --no-follow --query "error"    # substring filter
vercel logs dpl_abc123 --no-follow --json | jq '.message'
```

`--no-follow` is required — without it, `vercel logs` tails forever and blocks the shell.

| Flag | Purpose |
|---|---|
| `--no-follow` | One-shot historical lookup |
| `--status-code <N>` | Filter by HTTP status (`500`, `4xx`) |
| `--query <str>` | Substring filter |
| `--json` | Machine-readable; pipe to `jq` |
| `--since <duration>` | e.g. `--since 1h` or `--since 2024-01-15` |

---

## Common gotchas

- **`vercel ls` output goes to stderr** — always use `2>&1`
- **Preview deployments are behind Vercel SSO** — plain `curl` gets an HTML login page; always use `vercel curl --deployment`
- **Migration errors don't block recording** — if a migration has `✗` lines, it's still marked applied; write a follow-up fix migration rather than re-running
- **DSQL: no `ADD COLUMN NOT NULL DEFAULT`** — split into nullable `ADD COLUMN` + `UPDATE ... WHERE col IS NULL` backfill
- **Worktree cwd** — always pass `--cwd $MAIN_REPO` when running Vercel CLI from a worktree
- **`--level error` doesn't exist** — use `--status-code 500` or `--query "error"` instead
