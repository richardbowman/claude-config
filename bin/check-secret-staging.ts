#!/usr/bin/env tsx
/**
 * Claude Code PreToolUse hook — Bash matcher
 *
 * Blocks `git add` commands that would stage .env files or all files at once.
 * .env files frequently contain real secrets; staging them (even accidentally)
 * can lead to secret exposure in git history.
 *
 * Allowed:
 *   git add apps/web/lib/db.ts          (specific file, not .env)
 *   git add packages/domain/src/schema.prisma
 *
 * Blocked:
 *   git add .env                        (direct .env staging)
 *   git add .env.local                  (any .env variant)
 *   git add -A                          (stage everything)
 *   git add .                           (stage everything in cwd)
 *   git add --all                       (stage everything)
 */

import { createInterface } from "readline";

async function main() {
  const chunks: string[] = [];
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

  await new Promise<void>((resolve) => {
    rl.on("line", (line) => chunks.push(line));
    rl.on("close", resolve);
  });

  const raw = chunks.join("\n");

  let cmd = "";
  try {
    const input = JSON.parse(raw);
    cmd = input?.tool_input?.command ?? "";
  } catch {
    // Unparseable input — let it through
    process.exit(0);
  }

  if (!cmd) process.exit(0);

  // Only examine `git add` commands
  if (!/\bgit\s+add\b/.test(cmd)) process.exit(0);

  // Block: git add -A / git add --all / git add .
  if (/\bgit\s+add\s+(-A|--all|\.\s*$|\.\s+)/.test(cmd)) {
    const out = {
      decision: "block",
      reason:
        "Refusing to stage all files (git add -A / git add .). " +
        ".env files may contain real secrets. Stage specific files by name instead.",
    };
    process.stdout.write(JSON.stringify(out) + "\n");
    process.exit(2);
  }

  // Block: git add <anything>.env*
  if (/\bgit\s+add\b.*\.env/.test(cmd)) {
    const out = {
      decision: "block",
      reason:
        "Refusing to stage .env file(s) — these files may contain real secrets. " +
        "Add them to .gitignore and never commit them.",
    };
    process.stdout.write(JSON.stringify(out) + "\n");
    process.exit(2);
  }

  process.exit(0);
}

main();
