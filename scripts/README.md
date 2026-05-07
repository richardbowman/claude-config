# Claude Config Scripts

Reusable automation scripts for common workflows.

## deploy-migration.sh

Automates the complete migration deployment workflow:

1. ✅ Pushes branch to origin
2. ✅ Creates pull request
3. ⏳ Waits for CI checks to pass
4. 🔀 Merges PR
5. ⏳ Waits for production deployment
6. 🔧 Runs migration in production

### Usage

```bash
deploy-migration.sh <branch-name> <pr-title>
```

### Example

```bash
# From your worktree or main repo
deploy-migration.sh fix-unknown-owners "fix: remove unknown owners"
```

### Requirements

- Branch must be checked out and all changes committed
- `gh` CLI installed and authenticated
- `vercel` CLI installed and linked
- `vercel-wait-deploy` script available in PATH
- `jq` installed for JSON parsing
- `MIGRATION_SECRET` set in `.env.vercel` or `.env.vercel.production`

### What it does

The script will:
- Push your branch if not already pushed
- Create a PR with a standard template (or use existing PR)
- Wait up to 10 minutes for all checks to pass
- Fail if any checks fail
- Merge the PR with squash merge
- Wait for production deployment to complete
- Run the migration via `/api/admin/migrate` endpoint
- Display the migration results

### Error handling

The script will exit with error code 1 if:
- You have uncommitted changes
- CI checks fail
- Production deployment times out
- Migration fails

### Output

The script provides clear progress updates at each step:

```
📦 Main repo: /Users/you/project
🌿 Branch: fix-unknown-owners

✓ Branch already on origin
✓ PR #101 already exists
⏳ Waiting for checks to complete...
✓ All checks passed!
🔀 Merging PR #101...
✓ PR merged successfully!
⏳ Waiting for production deployment...
✓ Production deployed: https://...
🔧 Running migration in production...
📊 Migration result:
{
  "total": 27,
  "executed": 4,
  "skipped": 23,
  "failed": 0
}
✅ All done! Migration deployed and run in production.
```
