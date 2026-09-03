#!/usr/bin/env tsx
/**
 * Claude Code PreToolUse hook — Bash matcher
 *
 * Blocks `git add` commands that would stage .env files or all files at once.
 * .env files frequently contain real secrets; staging them (even accidentally)
 * can lead to secret exposure in git history.
 *
 * Committed template files (.env.example, .env.sample, .env.template) are exempt —
 * they document expected keys and must never contain real secret values.
 *
 * Allowed:
 *   git add apps/web/lib/db.ts          (specific file, not .env)
 *   git add packages/domain/src/schema.prisma
 *   git add .env.example                (template file, no real secrets)
 *   git add apps/web/.env.sample
 *
 * Blocked:
 *   git add .env                        (direct .env staging)
 *   git add .env.local                  (any other .env variant)
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

  // Block: git add <anything>.env* — except committed template files
  // (.env.example, .env.sample, .env.template), which must never contain
  // real secret values and are meant to be checked in.
  const ALLOWED_ENV_SUFFIX = /\.env\.(example|sample|template)$/i;
  const ENV_TOKEN = /\.env(\.\S+)?$/i;

  if (/\.env/i.test(cmd)) {
    const tokens = cmd.split(/\s+/).filter(Boolean);
    const offending = tokens.filter(
      (t) => ENV_TOKEN.test(t) && !ALLOWED_ENV_SUFFIX.test(t),
    );

    if (offending.length > 0) {
      const out = {
        decision: "block",
        reason:
          `Refusing to stage .env file(s): ${offending.join(", ")} — these may contain real secrets. ` +
          "Add them to .gitignore and never commit them. " +
          "(.env.example / .env.sample / .env.template are allowed since they must never hold real secrets.)",
      };
      process.stdout.write(JSON.stringify(out) + "\n");
      process.exit(2);
    }
  }

  process.exit(0);
}

main();
