#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook — Edit | Write | NotebookEdit
 *
 * Denies edits to files inside a git repo's MAIN checkout. Work must happen in
 * a linked worktree on a feature branch (EnterWorktree / enter_worktree).
 *
 * Allowed:
 *   - files outside any git repo (vault notes, ~/.claude, /tmp)
 *   - linked worktrees (git-dir !== git-common-dir)
 *   - repos whose CLAUDE.md or AGENTS.md contains the line `Repo mode: prototype`
 *   - escape hatches: env ALLOW_MAIN_CHECKOUT=1, or a `.allow-main-checkout`
 *     file at the repo root (use for a chat-declared prototype session)
 *
 * Fails open: any unexpected error allows the edit rather than wedging the session.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

function git(dir: string, ...args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function nearestExistingDir(path: string): string | null {
  let dir = dirname(path);
  while (!existsSync(dir)) {
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return dir;
}

function isPrototype(root: string): boolean {
  for (const name of ["CLAUDE.md", "AGENTS.md"]) {
    try {
      if (/^\s*Repo mode:\s*prototype\s*$/m.test(readFileSync(join(root, name), "utf8"))) {
        return true;
      }
    } catch {
      /* file absent */
    }
  }
  return false;
}

function deny(reason: string): never {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

function main(): void {
  if (process.env.ALLOW_MAIN_CHECKOUT === "1") return;

  const input = JSON.parse(readFileSync(0, "utf8"));
  const ti = input?.tool_input ?? {};
  let file: string | undefined = ti.file_path ?? ti.filePath ?? ti.notebook_path;
  if (!file) return;
  if (file.startsWith("~/")) file = join(homedir(), file.slice(2));
  file = resolve(input?.cwd ?? process.cwd(), file);

  const dir = nearestExistingDir(file);
  if (!dir) return;

  const root = git(dir, "rev-parse", "--show-toplevel");
  if (!root) return; // not a git repo

  const gitDir = git(dir, "rev-parse", "--path-format=absolute", "--git-dir");
  const common = git(dir, "rev-parse", "--path-format=absolute", "--git-common-dir");
  if (!gitDir || !common || gitDir !== common) return; // linked worktree (or unknown)

  if (isPrototype(root)) return;
  if (existsSync(join(root, ".allow-main-checkout"))) return;

  deny(
    `BLOCKED: ${file} is in the main checkout of ${root}, not a worktree.\n\n` +
      "Create a worktree first, with no edits in the same turn:\n" +
      "  - Geode: call enter_worktree (load via ToolSearch select:EnterWorktree) with an explicit " +
      "`branch` and `baseBranch` (usually main). The cwd switches next turn.\n" +
      `  - No EnterWorktree (terminal/scheduled): git -C ${root} worktree add <path> -b <branch>\n\n` +
      "If this repo is a prototype, add the line `Repo mode: prototype` to its CLAUDE.md, " +
      "or touch .allow-main-checkout at the repo root, or set ALLOW_MAIN_CHECKOUT=1.",
  );
}

try {
  main();
} catch {
  process.exit(0); // fail open
}
