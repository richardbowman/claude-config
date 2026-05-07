# Production readiness checklist

Use this before merging any feature PR on the golden-wealth-app. Work through every section in order. Each section lists what to check and how.

---

## 1. Tests

### Unit + integration (Vitest)

```sh
npx vitest run
```

- All tests must pass — no skips, no `.only`, no commented-out assertions
- New API routes need an integration test in `__tests__/integration/api/`
- New server actions need a test in `__tests__/integration/actions/`
- New pure logic (utils, lib functions) needs a unit test in `__tests__/unit/`
- New client components need a component test in `__tests__/components/`
- Coverage thresholds are enforced (80% statements/functions/lines, 70% branches) — don't exempt new files without a reason

### TypeScript

```sh
npx tsc --noEmit
```

Must be clean. Fix errors; don't cast them away with `as any` unless there's a documented reason.

### E2E screenshots (Playwright)

If the feature changes any visible UI on a page that has a screenshot spec:

```sh
npx dotenv-cli -e .env.e2e -- npx playwright test --config=playwright.screenshots.config.ts --reporter=line
```

Regenerate affected screenshots and commit them. Stale screenshots in `public/help-images/` make the help center misleading.

---

## 2. Permissions

Every new API route or server action that touches estate data must:

- Call `const session = await auth()` and return 401 if no session
- Call `getEstateAccess(estateId)` and return 404 if null
- Call `hasPermission(access, PERMISSIONS.X)` and return 403 if false
- Have an integration test that covers the 401 and 403 cases explicitly

**Never** assume the caller is authorized just because they're logged in. Check the permission for the specific operation.

---

## 3. Database migrations

If the feature adds or changes schema:

- Migration file exists in `scripts/` with the next sequential number (check `scripts/manifest.json` for the last entry)
- Migration is listed in `scripts/manifest.json`
- Every DDL statement is followed by `COMMIT;` on its own line
- `CREATE INDEX` uses `ASYNC`
- No `DEFAULT` in `ALTER TABLE ADD COLUMN`
- No foreign keys, no SERIAL, no JSONB, no TIMESTAMPTZ (DSQL constraints — see CLAUDE.md)
- `prisma/schema.prisma` has been updated to match
- `npx prisma generate` has been run and the generated client is committed

Apply to the preview environment before marking the PR ready:

```sh
# Check status
curl -s -X GET "$PREVIEW_URL/api/admin/migrate" \
  -H "x-migration-secret: $MIGRATION_SECRET"

# Apply
curl -s -X POST "$PREVIEW_URL/api/admin/migrate" \
  -H "x-migration-secret: $MIGRATION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"script": "020-my-migration.sql"}'
```

See `dsql-migrate` skill for the full recipe.

---

## 4. Help documentation

Every user-facing feature needs a help article or an update to an existing one.

- Help articles live in `lib/help-content/articles/` as Markdown files
- Article must be registered in `lib/help-content/articles.ts` with slug, title, description, and category
- If the feature adds or changes a visible UI element, regenerate the relevant screenshot and reference it in the article with `![alt text](/help-images/filename.png)`
- Screenshots live in `public/help-images/`
- **Never use camelCase permission names** (`canViewFinancials`) in help articles — use plain English ("members who can view financials")
- Check that the article renders correctly at `/dashboard/help/<slug>` before merging

---

## 5. PR description

The PR description must reflect what was actually built, not what was originally planned. Before merging:

- Summary describes the current implementation (not a deleted page, not a refactored approach)
- Key files table is accurate
- Test plan checklist is actionable — specific things to click and verify, not vague "confirm it works"
- No references to deleted files, routes, or components

---

## 6. Preview deployment smoke test

After Vercel builds the preview:

```sh
# Wait for the preview to be ready
vercel ls --cwd /path/to/main-repo   # or check Vercel dashboard
```

Walk through the test plan in the PR description manually on the preview URL. At minimum:

- Golden path: the feature works end-to-end for the estate owner
- Permission boundary: a member without the relevant permission gets blocked (403 or UI message), not an error
- Empty state: the feature degrades gracefully when there's no data
- No regressions on adjacent pages (e.g. if you touched the Accounts tab, check that Plaid linking still works)

---

## 7. Code quality quick checks

Before marking ready:

- No unused imports (`Legend`, dead variables, etc.)
- No duplicated logic that should be shared — if the same function appears in two files, extract it
- No `console.log` left in production paths (dev-only logging is fine)
- No hardcoded IDs, emails, or credentials
- Seed data uses realistic account types — e.g. `'investment'` not `'brokerage'` (which falls to Other in bucket mapping)

---

## 8. Final gate

```sh
# Full suite one more time from a clean state
npx vitest run && npx tsc --noEmit && echo "✓ Ready"
```

If both pass and all sections above are green: mark the PR ready for review and merge.
