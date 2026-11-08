#!/usr/bin/env node
// Reaps LEAKED Playwright/Chrome-for-Testing browsers. Wired to the Stop and SubagentStop hooks
// so every finished agent/session triggers a cleanup; also runnable by hand.
//
// Safe by design: it only ever targets browser processes launched from Playwright's browser
// cache (ms-playwright / Chrome for Testing / chrome-headless-shell) that have been orphaned
// (parent = launchd, pid 1) for at least MIN_AGE minutes. It never touches a user's real
// Chrome/Safari, the Geode app, dev servers, or anything not in that set. `--report` lists
// other orphaned dev/build processes under .claude/worktrees without killing them.
//
//   orphan-reaper.ts            kill orphaned test browsers (prints what it did)
//   orphan-reaper.ts --quiet    same, silent unless something was killed
//   orphan-reaper.ts --dry-run  list only
//   orphan-reaper.ts --report   also list orphaned node/esbuild under .claude/worktrees (no kill)
// Contract for hook use: ALWAYS exit 0.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export interface Proc {
  pid: number;
  ppid: number;
  rssMB: number;
  ageSec: number;
  command: string;
}

const BROWSER = /ms-playwright|Google Chrome for Testing|chrome-headless-shell|headless_shell/;
const WORKTREE_ORPHAN = /\.claude\/worktrees\/.*(?:node_modules|\.next)|esbuild --service/;

export function parseEtime(s: string): number {
  // [[dd-]hh:]mm:ss
  const m = s.trim().match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3]) * 60 + Number(m[4]);
}

export function parsePs(out: string): Proc[] {
  const procs: Proc[] = [];
  for (const line of out.split("\n")) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    procs.push({ pid: Number(m[1]), ppid: Number(m[2]), rssMB: Number(m[3]) / 1024, ageSec: parseEtime(m[4]), command: m[5] });
  }
  return procs;
}

/** Orphaned test browsers: reparented to launchd and older than minAgeSec. */
export function findOrphanBrowsers(procs: Proc[], minAgeSec = 600): Proc[] {
  return procs.filter((p) => p.ppid === 1 && p.ageSec >= minAgeSec && BROWSER.test(p.command));
}

/** Browser processes whose parent is a *dead-looking orphan browser parent*: children of the above. */
export function withChildren(roots: Proc[], all: Proc[]): Proc[] {
  const ids = new Set(roots.map((r) => r.pid));
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of all) {
      if (!ids.has(p.pid) && ids.has(p.ppid) && BROWSER.test(p.command)) {
        ids.add(p.pid);
        grew = true;
      }
    }
  }
  return all.filter((p) => ids.has(p.pid));
}

export function findWorktreeOrphans(procs: Proc[], minAgeSec = 1800): Proc[] {
  return procs.filter((p) => p.ppid === 1 && p.ageSec >= minAgeSec && WORKTREE_ORPHAN.test(p.command));
}

function ps(): Proc[] {
  return parsePs(execFileSync("ps", ["-axo", "pid=,ppid=,rss=,etime=,command="], { encoding: "utf8", timeout: 3000 }));
}

function fmt(p: Proc): string {
  return `  pid ${p.pid} ${p.rssMB.toFixed(0)}MB ${Math.round(p.ageSec / 60)}min ${p.command.slice(0, 110)}`;
}

function main(): void {
  const args = new Set(process.argv.slice(2));
  const all = ps();
  const targets = withChildren(findOrphanBrowsers(all, Number(process.env.ORPHAN_REAPER_MIN_AGE_MIN ?? 10) * 60), all);
  const quiet = args.has("--quiet");
  if (targets.length) {
    const mb = targets.reduce((a, p) => a + p.rssMB, 0);
    process.stdout.write(`orphan-reaper: ${args.has("--dry-run") ? "found" : "killing"} ${targets.length} leaked test-browser process(es), ~${mb.toFixed(0)} MB\n${targets.map(fmt).join("\n")}\n`);
    if (!args.has("--dry-run")) {
      for (const p of targets) {
        try {
          process.kill(p.pid, "SIGKILL");
        } catch {
          // already gone
        }
      }
    }
  } else if (!quiet) {
    process.stdout.write("orphan-reaper: no leaked test browsers\n");
  }
  if (args.has("--report")) {
    const wo = findWorktreeOrphans(all);
    process.stdout.write(`orphaned dev/build processes under .claude/worktrees (not killed): ${wo.length}\n${wo.map(fmt).join("\n")}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch {
    // never fail a hook
  }
  process.exit(0);
}
