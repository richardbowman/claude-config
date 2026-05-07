---
name: dsql-migrate
description: Generate and apply Prisma migrations for Aurora DSQL with proper multi-schema isolation. Handles DSQL-specific transformations (ASYNC indexes, one DDL per transaction, no FKs) and applies migrations to the correct environment schema (dev/preview/prod).
---

# DSQL Migrate

Manages the full migration lifecycle for Aurora DSQL projects using Prisma 7 and the multi-schema pattern.

## When to use

- User asks to "create a migration", "apply migrations", "update the schema"
- Schema changes need to be deployed to DSQL
- Setting up a new environment (dev/preview/prod) after deployment
- Checking migration status across environments

## Two-phase process

### Phase 1: Generate migration SQL

DSQL requires special SQL transformations that vanilla Prisma doesn't provide:
- Wrap each DDL statement in its own `BEGIN; ... COMMIT;`
- Convert `CREATE INDEX` → `CREATE INDEX ASYNC`
- Remove foreign key constraints

The `aurora-dsql-prisma migrate` CLI handles this automatically.

**Command:**

```sh
npx aurora-dsql-prisma migrate prisma/schema.prisma -o prisma/migrations/001_init/migration.sql
```

**This runs automatically in `postinstall`** — you rarely need to run it manually unless:
- You've disabled the postinstall script
- You're debugging migration generation
- You're creating a new migration (not covered by postinstall)

### Phase 2: Apply migrations at runtime

Migrations are applied via `POST /api/admin/migrate` after deployment. Each environment (dev/preview/prod) maintains its own schema and migration history.

## How the multi-schema pattern works

Every Vercel deployment resolves the active schema based on:
- `NODE_ENV === "development"` → `myapp_dev`
- `VERCEL_ENV === "preview"` → `myapp_preview`
- `VERCEL_ENV === "production"` → `myapp_prod`

The migration runner:
1. Issues `SET search_path TO <schema>` before running any SQL
2. Creates the schema if it doesn't exist (`CREATE SCHEMA IF NOT EXISTS`)
3. Creates a `_prisma_migrations` tracking table in that schema
4. Checks if the migration has already been applied to that schema
5. Runs the generated SQL (unqualified table names resolve into the active schema)
6. Records the migration in `_prisma_migrations`

This means:
- Each environment has its own isolated set of tables
- Migrations can be applied independently to each environment
- No risk of preview deployments affecting production data

## Workflow: Adding a new migration

### 1. Update the schema

Edit `prisma/schema.prisma`:

```diff
 model Todo {
   id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
   title       String   @db.VarChar(255)
   completed   Boolean  @default(false)
+  priority    Int      @default(0)
   createdAt   DateTime @default(now()) @map("created_at")
   updatedAt   DateTime @default(now()) @map("updated_at")

   @@map("todos")
 }
```

### 2. Generate the migration SQL

```sh
npx aurora-dsql-prisma migrate prisma/schema.prisma -o prisma/migrations/002_add_priority/migration.sql
```

The output will be DSQL-compatible SQL:

```sql
-- CreateColumn
BEGIN;
ALTER TABLE "todos" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;
COMMIT;
```

### 3. Register the migration

Update `app/api/admin/migrate/route.ts`:

```diff
 const MIGRATIONS = [
   {
     name: "001_init",
     filePath: path.join(process.cwd(), "prisma/migrations/001_init/migration.sql"),
   },
+  {
+    name: "002_add_priority",
+    filePath: path.join(process.cwd(), "prisma/migrations/002_add_priority/migration.sql"),
+  },
 ];
```

### 4. Commit and deploy

```sh
git add prisma/schema.prisma prisma/migrations/002_add_priority app/api/admin/migrate/route.ts
git commit -m "Add priority field to todos"
git push
```

### 5. Apply to each environment

After deployment finishes:

> **Preview deployments are behind Vercel SSO protection.** Plain `curl` will return an HTML login page, not JSON. Use `vercel curl` which handles authentication automatically. Note the `--` separator — curl flags go after it.

**Preview (use `vercel curl`):**
```sh
SECRET="your-migration-secret"
vercel curl /api/admin/migrate \
  --deployment https://myapp-git-feature-branch.vercel.app \
  -- --request POST \
     --header "Content-Type: application/json" \
     --header "x-migration-secret: $SECRET" \
     --data '{"script":"002_add_priority"}'
```

**Production (also use `vercel curl` — per-deployment `*.vercel.app` URLs are behind Vercel auth too):**
```sh
vercel curl /api/admin/migrate \
  --deployment https://myapp-abc123.vercel.app \
  --cwd /path/to/main-repo \
  -- --request POST \
     --header "Content-Type: application/json" \
     --header "x-migration-secret: $SECRET" \
     --data '{"script":"002_add_priority"}'
```

> Only a custom domain (e.g. `myapp.com`) would be reachable via plain `curl`. All `*.vercel.app` URLs require `vercel curl`.

**Response:**
```json
{
  "message": "Migration completed successfully.\n\nUsing schema: myapp_prod\n✓ ...",
  "schema": "myapp_prod"
}
```

## Checking migration status

**Preview:**
```sh
vercel curl /api/admin/migrate \
  --deployment https://myapp-git-feature-branch.vercel.app \
  -- --header "x-migration-secret: $SECRET"
```

**Production:**
```sh
vercel curl /api/admin/migrate \
  --deployment https://myapp-abc123.vercel.app \
  --cwd /path/to/main-repo \
  -- --header "x-migration-secret: $SECRET"
```

To find the latest production deployment URL: `vercel list --cwd /path/to/main-repo` — it's the first result.

**Response:**
```json
{
  "schema": "myapp_prod",
  "appliedMigrations": ["001_init", "002_add_priority"],
  "manifest": [...]
}
```

## Common issues

### ❌ Migration generates no output

**Cause:** No `DATABASE_URL` in `prisma.config.ts` — `prisma migrate diff` can't determine the SQL dialect.

**Fix:** Ensure `prisma.config.ts` has:

```typescript
datasource: {
  url: process.env.DATABASE_URL ?? "postgresql://localhost/prisma",
}
```

The `?? "postgresql://localhost/prisma"` fallback is essential — it's only used for dialect detection, never for actual connections.

### ❌ Migration applied to wrong schema

**Symptom:** Tables appear in `myapp_dev` when you expected `myapp_prod`.

**Cause 1:** `PGSCHEMA` environment variable is set, overriding automatic schema resolution.

**Fix:** Remove `PGSCHEMA` from Vercel project settings.

**Cause 2:** `VERCEL_ENV` is not set correctly during deployment.

**Fix:** Check the deployment logs — `VERCEL_ENV` should be `preview` or `production`, not `development`.

### ❌ Local dev / E2E tests say "table X does not exist" after migration

**Symptom:** Migration applied successfully (confirmed via `/api/admin/migrate` status), but local dev or E2E tests crash with `The table 'public.X' does not exist in the current database`.

**Root cause:** The migration runner targets `getActiveSchema()` (e.g. `myapp_dev`). But `lib/prisma.ts` may have two code paths — one for `DATABASE_URL` (local) and one for DSQL. If the local path creates `PrismaPg(pool)` without a `{ schema }` option, Prisma queries `public` instead of `myapp_dev`. The tables never meet.

**Fix — update `lib/prisma.ts`** to pass the schema on the local path too:

```ts
import { getActiveSchema } from './schema'

// Before:
if (process.env.DATABASE_URL) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)  // ← queries public
  return new PrismaClient({ adapter })
}

// After:
if (process.env.DATABASE_URL) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool, { schema: getActiveSchema() })  // ← same schema everywhere
  return new PrismaClient({ adapter })
}
```

**Do NOT** work around this by manually applying DDL to `public`. That creates a silent schema split: local dev queries one place, DSQL queries another, and the two drift apart silently.

### ❌ `CREATE INDEX ASYNC IF NOT EXISTS` syntax error on local Postgres

**Symptom:** Migration applied via `/api/admin/migrate` shows `✗ Error: syntax error at or near "IF"` for index creation lines, but table and column DDL succeeds.

**Cause:** Local Postgres doesn't support the `ASYNC` keyword (it's DSQL-specific). Postgres parses `CREATE INDEX ASYNC IF NOT EXISTS idx ON ...` as "create an index named ASYNC, then see unexpected IF".

**This is safe to ignore for local dev.** The table and column DDL still applied correctly. The `ASYNC` indexes are a DSQL performance optimization; regular Postgres doesn't need them and will use its own indexing.

**If you need local indexes** (e.g. for query performance testing), apply them separately without the `ASYNC` keyword:
```sh
podman exec <container> psql -U postgres -d <db> \
  -c "SET search_path TO myapp_dev;" \
  -c "CREATE INDEX IF NOT EXISTS idx_name ON table_name (column_name);"
```

### ❌ DSQL says "unsupported mode, please use CREATE INDEX ASYNC"

**Symptom:** Running a migration against preview or production returns `✗ Error: unsupported mode. please use CREATE INDEX ASYNC.` for every index creation.

**Cause:** The migration runner has logic to strip `ASYNC` from index statements for local Postgres compatibility, but it's running unconditionally — including on DSQL, which *requires* `ASYNC`.

**Fix:** Gate the strip on `process.env.DATABASE_URL` being set. That env var is only set in local dev (via `worktree-bootstrap`); on Vercel/DSQL it's absent.

```ts
// WRONG — unconditional strip breaks DSQL
const stmt = sql.replace(/\bINDEX ASYNC\b/gi, 'INDEX')

// RIGHT — only strip when running against local Postgres
const stmt = process.env.DATABASE_URL
  ? sql.replace(/\bINDEX ASYNC\b/gi, 'INDEX')
  : sql
```

**Watch for two execution paths.** The migration `route.ts` often has both an inline POST handler loop and a `runSqlScript()` helper function. Both need this fix independently — it's easy to fix one and miss the other. Search for all occurrences of `INDEX ASYNC` in the file before committing.

### ❌ Table exists but is missing columns

**Symptom:** App throws `column "xyz" does not exist` at runtime. The table exists in the schema but was created from an older migration before the column was added.

**Cause:** A new migration that adds the column was never applied to this environment. Common when a DB was seeded from a stale full schema, or when an incremental migration was skipped.

**Fix:** Write the missing column as a migration (`ADD COLUMN IF NOT EXISTS`) and apply it via the API:
```sh
vercel curl /api/admin/migrate --deployment <URL> \
  -- --request POST \
     --header "x-migration-secret: $SECRET" \
     --header "Content-Type: application/json" \
     --data '{"script":"NNN-add-missing-column.sql"}'
```

**Do NOT** apply DDL directly to the database. Direct changes bypass the migration tracker, create environment drift (preview has it, prod doesn't), and won't be reproducible. Always create a migration file and run it through the API.

### ❌ Foreign key constraint errors

**Symptom:** Migration fails with "foreign key constraints are not supported".

**Cause:** `relationMode = "prisma"` is missing from `schema.prisma`.

**Fix:** Add to datasource block:

```prisma
datasource db {
  provider     = "postgresql"
  relationMode = "prisma"  // Required for DSQL
}
```

Then regenerate the migration.

### ❌ `CREATE INDEX` fails

**Symptom:** Migration fails with "synchronous indexes not supported".

**Cause:** The `aurora-dsql-prisma migrate` tool didn't run, so indexes are missing the `ASYNC` keyword.

**Fix:** Run the migration generator manually:

```sh
npx aurora-dsql-prisma migrate prisma/schema.prisma -o prisma/migrations/XXX/migration.sql
```

Or ensure `postinstall` script is working correctly.

### ❌ Multiple DDL statements fail

**Symptom:** Migration fails with "cannot execute multiple DDL statements".

**Cause:** Raw SQL contains multiple DDL statements not wrapped in separate transactions.

**Fix:** The `aurora-dsql-prisma` tool should handle this automatically. If you're writing raw SQL manually, wrap each statement:

```sql
BEGIN;
CREATE TABLE foo (...);
COMMIT;

BEGIN;
CREATE INDEX ASYNC idx_foo ON foo(bar);
COMMIT;
```

## Schema evolution strategy

### Development workflow

1. Make schema changes in a feature branch
2. Generate migration: `npx aurora-dsql-prisma migrate ...`
3. Test locally (see `worktree-bootstrap` skill for local DSQL fallback)
4. Deploy to preview environment
5. Apply migration to preview schema
6. Test in preview
7. Merge to main
8. Deploy to production
9. Apply migration to production schema

### Production safety

- Always test migrations in preview first
- Each environment is isolated — preview changes don't affect production
- Migrations are idempotent — re-running after failure is safe
- Track applied migrations in `_prisma_migrations` table

### Zero-downtime changes

For breaking changes (dropping columns, renaming tables):

1. **Deploy new code that reads both old and new columns** (backward compatible)
2. **Run migration to add new column**
3. **Backfill data** (write to both old and new columns)
4. **Deploy code that only reads new column**
5. **Run migration to drop old column** (after verifying step 4 works)

## Full schema vs. incrementals

Many projects maintain both an authoritative full schema (e.g. `001-full-schema.sql`) for fresh DB bootstrapping AND incremental migrations for patching existing DBs. Keep these facts in mind:

- The full schema should use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX ASYNC IF NOT EXISTS` so it's safe to re-run on an existing DB.
- The full schema may reference columns that are added by later incrementals (e.g. an index on `tasks.task_list_id` where that column is added by `task-lists.sql`). If the full schema runs first, that index creation will fail with "column does not exist". This is **non-fatal** — the index will be created when the incremental runs.
- Apply order: full schema first, then incrementals in sequence.
- Never use the full schema as a substitute for incrementals on existing DBs. Always apply the targeted incremental; the full schema is only for fresh environments.

## Troubleshooting checklist

- [ ] `postinstall` script runs `aurora-dsql-prisma migrate`
- [ ] Generated SQL has `BEGIN; ... COMMIT;` around each DDL statement
- [ ] Generated SQL has `CREATE INDEX ASYNC` (not `CREATE INDEX`)
- [ ] No foreign key constraints in generated SQL
- [ ] `prisma.config.ts` has a `url` fallback (for dialect detection)
- [ ] `schema.prisma` has `relationMode = "prisma"`
- [ ] Migration is registered in manifest / MIGRATIONS array
- [ ] `VERCEL_ENV` is set correctly in deployment
- [ ] No `PGSCHEMA` environment variable is set
- [ ] `getActiveSchema()` returns the expected schema name
- [ ] `INDEX ASYNC` stripping in migration runner is gated on `DATABASE_URL` being set, not unconditional
- [ ] If migration runner has both an inline loop and a helper function, both have the same SQL transformation logic
- [ ] Using `vercel curl --deployment <URL>` for protected preview environments, not plain `curl`

## Reference

Full guide at: `/Users/rbowman/Downloads/prisma-dsql-guide (8).md`
