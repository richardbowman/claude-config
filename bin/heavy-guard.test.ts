import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, verdict, effectiveLimits, parseVmStat, parseSwapUsed, countProcesses, type Snapshot } from "./heavy-guard.ts";
import { parseEtime, parsePs, findOrphanBrowsers, withChildren, findWorktreeOrphans } from "./orphan-reaper.ts";

const noScript = () => null;

test("classify: burst commands", () => {
  for (const c of [
    "pnpm test",
    "pnpm run test:run",
    "CI=1 pnpm test -- foo",
    "pnpm test:e2e",
    "cd app && pnpm exec playwright test --workers=2",
    "npx playwright test",
    "pnpm exec vitest run",
    "npx vitest",
    "pnpm build",
    "next build",
    "pnpm exec tsc --noEmit --project tsconfig.build.json",
    "git status; npx tsc",
    "pnpm docs:screenshots",
  ]) assert.equal(classify(c, noScript), "burst", c);
});

test("classify: services", () => {
  for (const c of ["next dev", "pnpm next dev -p 3001", "nextdev start", "pnpm dev"]) {
    assert.equal(classify(c, noScript), "service", c);
  }
});

test("classify: not heavy", () => {
  for (const c of [
    "git commit -m 'fix tsc'",
    "echo pnpm test",
    "ls -la",
    "tq-check hiptrip-unit",
    "ssh dev-builder 'pnpm test'",
    "pnpm install",
    "grep -r playwright .",
    "nextdev stop",
    "nextdev list",
  ]) assert.equal(classify(c, noScript), null, c);
});

test("classify: separators inside quotes do not create false positives (regression)", () => {
  for (const c of [
    `ps -axo pid,command | grep -E "next-server|next dev|vitest|playwright|tsc" | head`,
    `grep -rn 'vitest|playwright' . | wc -l`,
    `echo "a && pnpm test"`,
    `git commit -m "run pnpm test; then tsc"`,
    `ssh dev-builder 'pnpm test && pnpm build'`,
  ]) assert.equal(classify(c, noScript), null, c);
  // ...while real separators outside quotes still detect heavy commands
  assert.equal(classify(`echo "hi" && pnpm test`, noScript), "burst");
  assert.equal(classify(`ls | grep foo; npx playwright test`, noScript), "burst");
  assert.equal(classify(`cd x && CI=1 pnpm exec vitest run`, noScript), "burst");
});

test("classify: heredoc bodies are data, not commands (regression: apostrophe corrupted quote tracking)", () => {
  const body = `cat > /tmp/s.ts <<'EOF'\nawait page.getByRole("button", { name: /let's plan it/i }).click()\npnpm exec playwright test\nEOF`;
  assert.equal(classify(body, noScript), null);
  // the real work after the heredoc still gets classified
  assert.equal(classify(`${body}\npnpm exec vitest run`, noScript), "burst");
  // ...and a remote run after the heredoc is not local work, even with a stray apostrophe in the body
  assert.equal(classify(`${body}\nscp /tmp/s.ts h:x && ssh dev-builder 'cd x; pnpm exec playwright test --workers=2'`, noScript), null);
  assert.equal(classify(`cat <<-EOT\n\tpnpm test\n\tEOT\nls`, noScript), null);
  // herestring (<<<) is not a heredoc
  assert.equal(classify(`cat <<< "x"\npnpm test`, noScript), "burst");
});

test("classify: ssh commands run remotely and are never local heavy work", () => {
  for (const c of [
    "ssh dev-builder pnpm test",
    "ssh -o ConnectTimeout=3 dev-builder 'pnpm exec playwright test'",
    "ssh dev-builder 'cd x; pnpm exec vitest run'",
  ]) assert.equal(classify(c, noScript), null, c);
  assert.equal(classify("rsync -a ./ dev-builder:x/ && pnpm test", noScript), "burst");
});

test("classify: node script launching a browser is burst; plain script is not", () => {
  assert.equal(classify("node /tmp/qa/run.cjs", () => "const { chromium } = require('playwright'); chromium.launch()"), "burst");
  assert.equal(classify("node scripts/foo.mjs", () => "console.log('hi')"), null);
  assert.equal(classify("node scripts/missing.mjs", noScript), null);
});

const calm: Snapshot = { availableGB: 8, swapUsedGB: 0.5, burstRunning: 0, servicesRunning: 0, browsersRunning: 0, reservedByOther: false };

test("verdict: calm machine allows", () => {
  assert.equal(verdict("burst", calm), null);
  assert.equal(verdict("service", calm), null);
});

test("verdict: low memory / swap denies both kinds", () => {
  assert.match(verdict("burst", { ...calm, availableGB: 1.2 })!, /memory available/);
  assert.match(verdict("service", { ...calm, availableGB: 1.2 })!, /memory available/);
  assert.match(verdict("burst", { ...calm, swapUsedGB: 9, availableGB: 3.5 })!, /swap/);
  assert.equal(verdict("burst", { ...calm, swapUsedGB: 9, availableGB: 8 }), null); // stale swap, plenty free
});

test("verdict: only one burst job at a time", () => {
  assert.match(verdict("burst", { ...calm, burstRunning: 1 })!, /one at a time/);
});

test("verdict: open browser or fresh reservation blocks a burst job", () => {
  assert.match(verdict("burst", { ...calm, browsersRunning: 3 })!, /browser/);
  assert.match(verdict("burst", { ...calm, reservedByOther: true })!, /just admitted/);
});

test("verdict: dev servers are capped but do not block on bursts running", () => {
  assert.match(verdict("service", { ...calm, servicesRunning: 2 })!, /dev servers/);
  assert.equal(verdict("service", { ...calm, burstRunning: 1, browsersRunning: 2 }), null);
  assert.equal(verdict("burst", { ...calm, servicesRunning: 2 }), null); // E2E needs a server
});

test("effectiveLimits: owner override lowers only the memory floor, and only while valid", () => {
  const now = Date.parse("2026-10-27T18:00:00Z");
  const good = JSON.stringify({ minAvailableGB: 1.5, expiresAt: "2026-10-27T19:00:00Z" });
  assert.equal(effectiveLimits(good, now).limits.minAvailableGB, 1.5);
  assert.equal(effectiveLimits(good, now).limits.maxBurst, 1); // other caps untouched
  assert.equal(effectiveLimits(good, now).overridden, true);
  assert.equal(effectiveLimits(good, Date.parse("2026-10-27T20:00:00Z")).overridden, false); // expired
  assert.equal(effectiveLimits(JSON.stringify({ minAvailableGB: 0.2, expiresAt: "2026-10-27T19:00:00Z" }), now).overridden, false); // too low
  assert.equal(effectiveLimits(JSON.stringify({ minAvailableGB: 5, expiresAt: "2026-10-27T19:00:00Z" }), now).overridden, false); // cannot raise
  assert.equal(effectiveLimits("garbage", now).overridden, false);
  assert.equal(effectiveLimits(null, now).overridden, false);
});

test("parseVmStat sums reclaimable pages", () => {
  const out = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                1000.
Pages inactive:                            2000.
Pages speculative:                          500.
Pages purgeable:                            500.`;
  assert.equal(parseVmStat(out), (4000 * 16384) / 1024 ** 3);
});

test("parseSwapUsed handles M and G", () => {
  assert.equal(parseSwapUsed("vm.swapusage: total = 4096.00M  used = 2048.00M  free = 2048.00M  (encrypted)"), 2);
  assert.equal(parseSwapUsed("vm.swapusage: total = 9216.00M  used = 7.50G  free = 1.50G"), 7.5);
});

test("countProcesses: counts jobs not workers, ignores tsserver, counts browsers and servers", () => {
  const psOut = [
    "100 1 node /x/node_modules/.bin/vitest run",
    "101 100 node /x/node_modules/vitest/dist/workers/forks.js",
    "102 100 node /x/node_modules/vitest/dist/workers/forks.js",
    "200 1 /Users/me/Library/Caches/ms-playwright/chromium-1217/headless_shell --headless",
    "201 200 /Users/me/Library/Caches/ms-playwright/chromium-1217/headless_shell --type=renderer",
    "300 1 next-server (v16.4.3)",
    "301 1 node /x/node_modules/typescript/lib/tsserver.js --serverMode partialSemantic",
    "302 1 /usr/bin/something else",
  ].join("\n");
  const c = countProcesses(psOut, new Set());
  assert.deepEqual(c, { burstRunning: 1, servicesRunning: 1, browsersRunning: 2 });
});

test("orphan-reaper: etime parsing", () => {
  assert.equal(parseEtime("00:07"), 7);
  assert.equal(parseEtime("01:02:03"), 3723);
  assert.equal(parseEtime("2-01:00:00"), 2 * 86400 + 3600);
});

test("orphan-reaper: only old, orphaned test browsers are targeted (never real Chrome/Safari)", () => {
  const out = [
    "10 1 100000 15:00 /Users/me/Library/Caches/ms-playwright/chromium-1217/headless_shell --headless",
    "11 10 90000 15:00 /Users/me/Library/Caches/ms-playwright/chromium-1217/headless_shell --type=renderer",
    "12 1 90000 02:00 /Users/me/Library/Caches/ms-playwright/chromium-1217/headless_shell --headless",
    "13 555 90000 20:00 /Users/me/Library/Caches/ms-playwright/chromium-1217/headless_shell --headless",
    "14 1 500000 99:00:00 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "15 1 90000 20:00 /Applications/Geode.app/Contents/MacOS/Geode",
    "16 1 4000 40:00 node /x/.claude/worktrees/foo/node_modules/.pnpm/next@16/node_modules/next/dist/bin/next dev",
  ].join("\n");
  const procs = parsePs(out);
  const roots = findOrphanBrowsers(procs, 600);
  assert.deepEqual(roots.map((p) => p.pid), [10]);
  assert.deepEqual(withChildren(roots, procs).map((p) => p.pid).sort(), [10, 11]);
  assert.deepEqual(findWorktreeOrphans(procs).map((p) => p.pid), [16]);
});
