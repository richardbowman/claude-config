---
name: dsql-schema
description: Validate Prisma schema files for Aurora DSQL compatibility. Checks for DSQL-incompatible features (SERIAL PKs, @updatedAt, foreign keys, synchronous indexes) and provides fix recommendations.
---

# DSQL Schema Validation

Validates Prisma schema files against Aurora DSQL constraints and provides actionable fix recommendations.

## When to use

- User asks to "check the schema", "validate DSQL compatibility", "why is my migration failing"
- Before generating migrations (proactive validation)
- After schema changes (verify DSQL compliance)
- Debugging migration errors related to unsupported features

## DSQL constraints

Aurora DSQL is PostgreSQL-compatible but has several critical limitations:

| Feature | Support | Prisma implication |
|---------|---------|-------------------|
| Sequences | ❌ None | No `SERIAL`, `BIGSERIAL`, `@default(autoincrement())` |
| Foreign keys | ❌ None | Must use `relationMode = "prisma"` |
| Indexes | ⚠️ Async only | `CREATE INDEX` must use `ASYNC` keyword |
| `@updatedAt` | ❌ None | No `ON UPDATE` triggers — set manually |
| Multi-DDL transactions | ❌ One per tx | Each statement needs its own `BEGIN; ... COMMIT;` |
| `search_path` via connection options | ❌ Ignored | Use `PrismaPg(pool, { schema })` instead |

## Validation checklist

### ✅ Required patterns

Run these checks on `prisma/schema.prisma`:

#### 1. `relationMode = "prisma"`

**Rule:** Datasource must have `relationMode = "prisma"`.

**Check:**
```sh
grep -q 'relationMode.*=.*"prisma"' prisma/schema.prisma
```

**Valid:**
```prisma
datasource db {
  provider     = "postgresql"
  relationMode = "prisma"  // Required for DSQL
}
```

**Fix if missing:** Add `relationMode = "prisma"` to the `datasource` block.

#### 2. UUID primary keys with `gen_random_uuid()`

**Rule:** All `@id` fields must use `@default(dbgenerated("gen_random_uuid()")) @db.Uuid`.

**Invalid:**
```prisma
model User {
  id    Int    @id @default(autoincrement())  // ❌ no sequences
  email String
}
```

**Valid:**
```prisma
model User {
  id    String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid  // ✅
  email String
}
```

**Check pattern:** Look for:
- `@id @default(autoincrement())`
- `@id @default(sequence())`
- `Int @id` without explicit UUID
- Any field with `@db.Serial` or `@db.BigSerial`

**Fix:** Replace with:
```prisma
id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
```

#### 3. No `@updatedAt` directive

**Rule:** DSQL has no `ON UPDATE` support. Use `@default(now())` and set manually.

**Invalid:**
```prisma
model Todo {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  title     String
  updatedAt DateTime @updatedAt  // ❌ not supported
}
```

**Valid:**
```prisma
model Todo {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  title     String
  updatedAt DateTime @default(now()) @map("updated_at")  // ✅
}
```

**Check pattern:**
```sh
grep '@updatedAt' prisma/schema.prisma
```

**Fix:** Replace `@updatedAt` with `@default(now())` and update application code to set `updatedAt: new Date()` on every create/update operation.

#### 4. `provider = "prisma-client-js"`

**Rule:** Generator must use `prisma-client-js` (not `prisma-client`).

**Invalid:**
```prisma
generator client {
  provider = "prisma-client"  // ❌ requires custom output path
}
```

**Valid:**
```prisma
generator client {
  provider = "prisma-client-js"  // ✅
}
```

**Check:**
```sh
grep 'provider.*=.*"prisma-client-js"' prisma/schema.prisma
```

**Fix:** Change generator provider to `"prisma-client-js"`.

#### 5. Prisma 7+ config location

**Rule:** In Prisma 7.6+, `url` must be in `prisma.config.ts`, not `schema.prisma`.

**Invalid (`schema.prisma`):**
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")  // ❌ throws P1012 in Prisma 7.6+
}
```

**Valid (`prisma.config.ts`):**
```typescript
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://localhost/prisma",
  },
});
```

**Check:**
```sh
grep 'url.*=.*env' prisma/schema.prisma
```

**Fix:** Move `url` to `prisma.config.ts` and remove it from `schema.prisma`.

### ❌ Anti-patterns

#### 1. Foreign key relations without `relationMode`

**Symptom:** Migration fails with "foreign key constraints not supported".

**Example:**
```prisma
datasource db {
  provider = "postgresql"
  // relationMode missing
}

model Post {
  id       String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  authorId String @db.Uuid
  author   User   @relation(fields: [authorId], references: [id])  // tries to create FK
}
```

**Fix:** Add `relationMode = "prisma"` to datasource.

#### 2. Compound primary keys with auto-increment

**Invalid:**
```prisma
model PostTag {
  postId Int
  tagId  Int  @default(autoincrement())  // ❌

  @@id([postId, tagId])
}
```

**Valid:**
```prisma
model PostTag {
  postId String @db.Uuid
  tagId  String @db.Uuid

  @@id([postId, tagId])
}
```

#### 3. `@db.Serial` or `@db.BigSerial`

**Invalid:**
```prisma
model Counter {
  id    Int @id @db.Serial  // ❌ DSQL has no sequences
  value Int
}
```

**Valid:**
```prisma
model Counter {
  id    String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  value Int
}
```

#### 4. Default values that rely on database features

**Risky:**
```prisma
model Event {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  timestamp DateTime @default(dbgenerated("NOW() + INTERVAL '1 day'"))  // ⚠️ may not work
}
```

**Safe:**
```prisma
model Event {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  timestamp DateTime @default(now())  // or set in application code
}
```

## Automated validation script

Create `scripts/validate-dsql-schema.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCHEMA="prisma/schema.prisma"
ERRORS=0

echo "🔍 Validating DSQL schema compatibility..."

# Check 1: relationMode = "prisma"
if ! grep -q 'relationMode.*=.*"prisma"' "$SCHEMA"; then
  echo "❌ Missing relationMode = \"prisma\" in datasource block"
  ERRORS=$((ERRORS + 1))
fi

# Check 2: No @updatedAt
if grep -q '@updatedAt' "$SCHEMA"; then
  echo "❌ Found @updatedAt directive (not supported by DSQL)"
  grep -n '@updatedAt' "$SCHEMA"
  ERRORS=$((ERRORS + 1))
fi

# Check 3: No autoincrement
if grep -q '@default(autoincrement())' "$SCHEMA"; then
  echo "❌ Found @default(autoincrement()) (no sequences in DSQL)"
  grep -n '@default(autoincrement())' "$SCHEMA"
  ERRORS=$((ERRORS + 1))
fi

# Check 4: No url in schema.prisma
if grep -q 'url.*=.*env' "$SCHEMA"; then
  echo "⚠️  Found 'url' in schema.prisma (should be in prisma.config.ts for Prisma 7+)"
  ERRORS=$((ERRORS + 1))
fi

# Check 5: Provider is prisma-client-js
if ! grep -q 'provider.*=.*"prisma-client-js"' "$SCHEMA"; then
  echo "❌ Generator provider should be \"prisma-client-js\""
  ERRORS=$((ERRORS + 1))
fi

# Check 6: All @id fields use UUID
if grep '@id' "$SCHEMA" | grep -v '@db.Uuid'; then
  echo "⚠️  Found @id fields without @db.Uuid:"
  grep -n '@id' "$SCHEMA" | grep -v '@db.Uuid'
  ERRORS=$((ERRORS + 1))
fi

if [ $ERRORS -eq 0 ]; then
  echo "✅ Schema is DSQL-compatible"
  exit 0
else
  echo "❌ Found $ERRORS compatibility issue(s)"
  exit 1
fi
```

**Usage:**
```sh
chmod +x scripts/validate-dsql-schema.sh
./scripts/validate-dsql-schema.sh
```

Add to CI pipeline:
```yaml
# .github/workflows/validate-schema.yml
name: Validate Schema
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/validate-dsql-schema.sh
```

## Manual validation workflow

### 1. Read the schema

```sh
cat prisma/schema.prisma
```

### 2. Check critical patterns

Run each validation check from the checklist above.

### 3. Attempt migration generation

```sh
npx aurora-dsql-prisma migrate prisma/schema.prisma -o /tmp/test-migration.sql
```

If this fails, the error message usually points to the incompatibility.

### 4. Inspect generated SQL

```sh
cat /tmp/test-migration.sql
```

Look for:
- Each DDL wrapped in `BEGIN; ... COMMIT;`
- `CREATE INDEX ASYNC` (not `CREATE INDEX`)
- No `FOREIGN KEY` constraints
- No `SERIAL` types

### 5. Test in preview environment

Deploy and apply migration to preview schema first:

```sh
git push
# wait for preview deployment
curl -X POST https://preview-url.vercel.app/api/admin/migrate -d '{"name":"001_init"}'
```

If it fails, check the response and Vercel logs for DSQL-specific errors.

## Common validation errors

### Error: P1012 - "Unexpected datasource field"

**Cause:** `url` is in `schema.prisma` instead of `prisma.config.ts` (Prisma 7.6+).

**Fix:** Move `datasource.url` to `prisma.config.ts`.

### Error: "foreign key constraints are not supported"

**Cause:** `relationMode = "prisma"` is missing.

**Fix:** Add to datasource block.

### Error: "sequence does not exist"

**Cause:** Using `@default(autoincrement())` or `SERIAL`.

**Fix:** Replace with UUID PK.

### Error: "synchronous indexes not supported"

**Cause:** `CREATE INDEX` without `ASYNC`.

**Fix:** Ensure `aurora-dsql-prisma migrate` ran correctly. It should add `ASYNC` automatically.

### Error: "cannot execute multiple DDL statements in a single transaction"

**Cause:** Multiple DDL statements in one transaction.

**Fix:** Ensure each statement is wrapped in its own `BEGIN; ... COMMIT;` — the migration tool should handle this.

## Quick reference: Schema template

A fully DSQL-compatible Prisma schema:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider     = "postgresql"
  relationMode = "prisma"
}

model User {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email     String   @unique @db.VarChar(255)
  name      String?  @db.VarChar(255)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @default(now()) @map("updated_at")  // set manually in code

  posts Post[]

  @@map("users")
}

model Post {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  title      String   @db.VarChar(500)
  content    String?  @db.Text
  published  Boolean  @default(false)
  authorId   String   @db.Uuid
  author     User     @relation(fields: [authorId], references: [id])  // emulated by Prisma
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @default(now()) @map("updated_at")  // set manually in code

  @@index([authorId])  // becomes CREATE INDEX ASYNC automatically
  @@map("posts")
}
```

**Application code must set `updatedAt`:**

```typescript
// Creating
await prisma.post.create({
  data: {
    title: "Hello",
    authorId: userId,
    updatedAt: new Date(),  // required
  },
});

// Updating
await prisma.post.update({
  where: { id: postId },
  data: {
    title: "Updated title",
    updatedAt: new Date(),  // required
  },
});
```

## Reference

Full guide at: `/Users/rbowman/Downloads/prisma-dsql-guide (8).md`
