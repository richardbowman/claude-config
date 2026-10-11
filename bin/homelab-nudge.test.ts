import { test } from "node:test";
import assert from "node:assert/strict";
import { isHeavyCommand } from "./homelab-nudge.ts";

const yes = [
  "pnpm test",
  "pnpm run test:run",
  "CI=1 pnpm test -- foo",
  "cd app && pnpm exec playwright test --workers=2",
  "npx playwright test",
  "pnpm next dev -p 3001",
  "next dev",
  "nextdev start",
  "podman run -d postgres:16",
  "tsc --noEmit",
  "pnpm exec tsc --noEmit -p tsconfig.json",
  "git status; npx tsc",
];
const no = [
  "git commit -m 'fix tsc'",
  "echo pnpm test",
  "ls -la",
  "tq-check golden-wealth-unit",
  "tq submit --wait --profile hiptrip-unit",
  "ssh dev-builder 'pnpm test'",
  "pnpm install",
  "grep -r playwright .",
];

for (const c of yes) test(`matches: ${c}`, () => assert.equal(isHeavyCommand(c), true));
for (const c of no) test(`ignores: ${c}`, () => assert.equal(isHeavyCommand(c), false));
