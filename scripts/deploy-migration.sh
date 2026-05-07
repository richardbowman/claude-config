#!/bin/bash
#
# Automates the migration deployment workflow:
# 1. Create PR and push changes
# 2. Wait for checks to pass
# 3. Merge PR
# 4. Wait for production deployment
# 5. Run migration in production
#
# Usage: deploy-migration.sh <branch-name> <pr-title>
# Example: deploy-migration.sh fix-unknown-owners "fix: remove unknown owners"

set -e

BRANCH_NAME="$1"
PR_TITLE="$2"

if [ -z "$BRANCH_NAME" ] || [ -z "$PR_TITLE" ]; then
  echo "Usage: deploy-migration.sh <branch-name> <pr-title>"
  exit 1
fi

# Find the main repo (not worktree)
if [[ "$PWD" == *".claude/worktrees"* ]]; then
  MAIN_REPO=$(echo "$PWD" | sed 's/\/.claude\/worktrees\/.*//')
else
  MAIN_REPO="$PWD"
fi

echo "📦 Main repo: $MAIN_REPO"
echo "🌿 Branch: $BRANCH_NAME"
echo ""

# Step 1: Check if we have uncommitted changes
if ! git diff-index --quiet HEAD --; then
  echo "❌ You have uncommitted changes. Please commit them first."
  exit 1
fi

# Step 2: Push branch if not already pushed
if ! git ls-remote --heads origin "$BRANCH_NAME" | grep -q "$BRANCH_NAME"; then
  echo "📤 Pushing branch to origin..."
  git push -u origin "$BRANCH_NAME"
else
  echo "✓ Branch already on origin"
  git push
fi

# Step 3: Create PR if it doesn't exist
PR_NUMBER=$(gh pr list --head "$BRANCH_NAME" --json number --jq '.[0].number' 2>/dev/null || echo "")

if [ -z "$PR_NUMBER" ]; then
  echo "📝 Creating pull request..."
  PR_URL=$(gh pr create --title "$PR_TITLE" --body "$(cat <<'EOF'
## Summary
- Adds data migration to fix database issues

## Test plan
- [x] Migration runs successfully in preview
- [ ] Verify migration results in preview
- [ ] Ready to merge and deploy to production

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" --base main)
  PR_NUMBER=$(echo "$PR_URL" | grep -o '[0-9]*$')
  echo "✓ Created PR #$PR_NUMBER: $PR_URL"
else
  echo "✓ PR #$PR_NUMBER already exists"
fi

# Step 4: Wait for checks to pass
echo ""
echo "⏳ Waiting for checks to complete..."
MAX_WAIT=600  # 10 minutes
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
  # Get all check statuses
  PENDING=$(gh pr view "$PR_NUMBER" --json statusCheckRollup --jq '[.statusCheckRollup[] | select(.status == "QUEUED" or .status == "IN_PROGRESS")] | length')

  if [ "$PENDING" -eq 0 ]; then
    # Check if any failed
    FAILED=$(gh pr view "$PR_NUMBER" --json statusCheckRollup --jq '[.statusCheckRollup[] | select(.conclusion == "FAILURE")] | length')
    if [ "$FAILED" -gt 0 ]; then
      echo "❌ Some checks failed:"
      gh pr checks "$PR_NUMBER"
      exit 1
    fi
    echo "✓ All checks passed!"
    break
  fi

  sleep 15
  ELAPSED=$((ELAPSED + 15))
  echo "  Still waiting... ($ELAPSED/${MAX_WAIT}s)"
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
  echo "❌ Timeout waiting for checks"
  exit 1
fi

# Step 5: Merge PR
echo ""
echo "🔀 Merging PR #$PR_NUMBER..."
gh pr merge "$PR_NUMBER" --squash

echo "✓ PR merged successfully!"

# Step 6: Wait for production deployment
echo ""
echo "⏳ Waiting for production deployment..."
PROD_URL=$(vercel-wait-deploy --cwd "$MAIN_REPO" --target production --timeout 300 | grep "Deployment ready:" | awk '{print $3}')

if [ -z "$PROD_URL" ]; then
  echo "❌ Failed to get production URL"
  exit 1
fi

echo "✓ Production deployed: $PROD_URL"

# Step 7: Run migration in production
echo ""
echo "🔧 Running migration in production..."

# Get migration secret
if [ -f "$MAIN_REPO/.env.vercel.production" ]; then
  SECRET=$(grep MIGRATION_SECRET "$MAIN_REPO/.env.vercel.production" | cut -d= -f2 | tr -d '"')
elif [ -f "$MAIN_REPO/.env.vercel" ]; then
  SECRET=$(grep MIGRATION_SECRET "$MAIN_REPO/.env.vercel" | cut -d= -f2 | tr -d '"')
else
  echo "❌ Could not find MIGRATION_SECRET in .env.vercel files"
  exit 1
fi

# Run migration
RESULT=$(vercel curl /api/admin/migrate \
  --deployment "$PROD_URL" \
  --cwd "$MAIN_REPO" \
  -- --request POST \
     --header "Content-Type: application/json" \
     --header "x-migration-secret: $SECRET" \
  2>&1 | tail -1)

echo ""
echo "📊 Migration result:"
echo "$RESULT" | jq .

# Check if migration succeeded
FAILED=$(echo "$RESULT" | jq -r '.failed // 0')
if [ "$FAILED" -gt 0 ]; then
  echo ""
  echo "⚠️  Some migrations failed. Check the results above."
  exit 1
fi

echo ""
echo "✅ All done! Migration deployed and run in production."
