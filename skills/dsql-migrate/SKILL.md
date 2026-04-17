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

**Preview:**
```sh
curl -X POST https://myapp-git-feature-branch.vercel.app/api/admin/migrate \
  -H "Content-Type: application/json" \
  -d '{"name":"002_add_priority"}'
```

**Production:**
```sh
curl -X POST https://myapp.vercel.app/api/admin/migrate \
  -H "Content-Type: application/json" \
  -d '{"name":"002_add_priority"}'
```

**Response:**
```json
{
  "success": true,
  "message": "Applied 002_add_priority to \"myapp_prod\""
}
```

## Checking migration status

Get the current status for an environment:

```sh
curl https://myapp.vercel.app/api/admin/migrate
```

**Response:**
```json
{
  "schema": "myapp_prod",
  "migrations": [
    {"name": "001_init", "applied": true},
    {"name": "002_add_priority", "applied": true}
  ]
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

## Troubleshooting checklist

- [ ] `postinstall` script runs `aurora-dsql-prisma migrate`
- [ ] Generated SQL has `BEGIN; ... COMMIT;` around each DDL statement
- [ ] Generated SQL has `CREATE INDEX ASYNC` (not `CREATE INDEX`)
- [ ] No foreign key constraints in generated SQL
- [ ] `prisma.config.ts` has a `url` fallback (for dialect detection)
- [ ] `schema.prisma` has `relationMode = "prisma"`
- [ ] Migration is registered in `MIGRATIONS` array
- [ ] `VERCEL_ENV` is set correctly in deployment
- [ ] No `PGSCHEMA` environment variable is set
- [ ] `getActiveSchema()` returns the expected schema name

## Reference

Full guide at: `/Users/rbowman/Downloads/prisma-dsql-guide (8).md`
