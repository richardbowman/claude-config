#!/usr/bin/env node
// PreToolUse(Bash) hook: ENFORCED admission control for heavy local commands.
//
// Why: on 2026-10-27 three parallel engineer/QA agents (each running vitest, Playwright
// browsers, next dev/build) used ~36 GB on this 16 GB Mac and crashed it. Advice in CLAUDE.md
// ("check load, clean up") was not enough because nothing enforced it. This hook blocks.
//
// Policy (all tunable via env, defaults in LIMITS):
//   - deny any heavy "burst" command (test runners, builds, tsc, Playwright, browser scripts)
//     when available memory is low, swap is heavily used, another burst job is already
//     running, or a Playwright browser is already open;
//   - deny a new dev server when too many are already running;
//   - one burst slot machine-wide (a short reservation closes the start-up race).
// Contract: exit 2 + stderr message to block (the message reaches the model); exit 0 to allow.
// Fails OPEN (exit 0) on any internal error so it can never wedge normal work.
//
// CLI:  heavy-guard.ts --status   print snapshot + verdict for a burst job (exit 1 if denied)
//       heavy-guard.ts --check    quiet; exit 0 if a burst job could start now, else 1
//       (use in a Monitor until-loop:  until heavy-guard.ts --check; do sleep 20; done)
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export type Kind = "burst" | "service";

export interface Limits {
  minAvailableGB: number;
  maxSwapGB: number;
  maxBurst: number;
  maxServices: number;
  reservationSec: number;
}

export const LIMITS: Limits = {
  minAvailableGB: Number(process.env.HEAVY_GUARD_MIN_AVAILABLE_GB ?? 3),
  maxSwapGB: Number(process.env.HEAVY_GUARD_MAX_SWAP_GB ?? 6),
  maxBurst: Number(process.env.HEAVY_GUARD_MAX_BURST ?? 1),
  maxServices: Number(process.env.HEAVY_GUARD_MAX_SERVICES ?? 2),
  reservationSec: Number(process.env.HEAVY_GUARD_RESERVATION_SEC ?? 8),
};

export interface Snapshot {
  availableGB: number;
  swapUsedGB: number;
  burstRunning: number;
  servicesRunning: number;
  browsersRunning: number;
  reservedByOther: boolean;
}

const SERVICE = [
  /^(?:pnpm\s+(?:exec\s+)?|npx\s+)?next\s+dev\b/,
  /^nextdev\s+start\b/,
  /^(?:pnpm|npm|yarn)\s+(?:run\s+)?dev\b/,
];
const BURST = [
  /^(?:pnpm|npm|yarn)\s+(?:run\s+)?(?:test|build)\b[^\s]*/,
  /^(?:pnpm|npm|yarn)\s+(?:run\s+)?docs:screenshots\b/,
  /^(?:pnpm\s+(?:exec\s+|dlx\s+)?|npx\s+|yarn\s+)?(?:playwright|vitest)\b/,
  /^(?:pnpm\s+(?:exec\s+)?|npx\s+)?next\s+build\b/,
  /^(?:pnpm\s+(?:exec\s+)?|npx\s+)?tsc\b/,
];
// `ssh [opts] host ...` executes on the remote box (homelab), so it costs this Mac nothing.
const REMOTE = /^ssh\s/;
const SCRIPT_RUN = /^(?:node|tsx|pnpm\s+exec\s+tsx|npx\s+tsx)\s+(?:--?\S+\s+)*(\S+\.(?:cjs|mjs|js|ts))\b/;
// Real browser use only (an import/require of a browser library, or a .launch call) — not a mere mention
// of the word, so scripts that merely talk about Playwright are not misclassified.
const BROWSER_SCRIPT =
  /(?:require\(\s*|from\s+|import\(\s*)["'](?:@playwright\/test|playwright(?:-core)?|puppeteer(?:-core)?)["']|\b(?:chromium|webkit|firefox)\.launch\b/;

/** Split on shell separators (&&, ||, ;, |, newline) that are OUTSIDE quotes, so `grep -E "a|vitest"` stays one segment. */
export function splitOutsideQuotes(command: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      cur += ch;
      if (ch === "\\" && quote === '"' && i + 1 < command.length) cur += command[++i];
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "\\" && i + 1 < command.length) {
      cur += ch + command[++i];
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "&" && command[i + 1] === "&") {
      out.push(cur);
      cur = "";
      i++;
    } else if (ch === "|" && command[i + 1] === "|") {
      out.push(cur);
      cur = "";
      i++;
    } else if (ch === ";" || ch === "|" || ch === "\n") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Drop heredoc bodies (`cmd <<'EOF' ... EOF`). The body is data written to a file or stdin, not shell
 * commands, and may contain apostrophes / separators / tool names that would otherwise corrupt quote
 * tracking and be misread as heavy commands. The command line that opens the heredoc is kept.
 */
export function stripHeredocBodies(command: string): string {
  const lines = command.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    const m = lines[i].match(/(?<!<)<<(-?)\s*(["']?)([A-Za-z_][A-Za-z0-9_]*)\2/);
    if (!m) continue;
    const dash = m[1] === "-";
    let j = i + 1;
    while (j < lines.length && (dash ? lines[j].trim() : lines[j]) !== m[3]) j++;
    if (j < lines.length) out.push(lines[j]); // keep the terminator line (harmless, a bare word)
    i = j;
  }
  return out.join("\n");
}

function segments(command: string): string[] {
  return splitOutsideQuotes(stripHeredocBodies(command))
    .map((raw) =>
      raw
        .trim()
        .replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, "")
        .replace(/^(?:cd\s+\S+\s*)$/, ""),
    )
    .filter(Boolean);
}

/** Classify a shell command. Burst wins over service. `readScript` is injectable for tests. */
export function classify(
  command: string,
  readScript: (path: string) => string | null = defaultReadScript,
): Kind | null {
  let kind: Kind | null = null;
  for (const seg of segments(command)) {
    if (REMOTE.test(seg)) continue; // ssh <host> ...: runs on another machine, not this Mac
    if (BURST.some((re) => re.test(seg))) return "burst";
    if (SERVICE.some((re) => re.test(seg))) kind = "service";
    const m = seg.match(SCRIPT_RUN);
    if (m && !/\.(?:test|spec)\.[cm]?[jt]s$/.test(m[1])) {
      const src = readScript(m[1]);
      if (src && BROWSER_SCRIPT.test(src)) return "burst";
    }
  }
  return kind;
}

function defaultReadScript(path: string): string | null {
  try {
    const p = path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
    if (!existsSync(p) || statSync(p).size > 400_000) return null;
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/** Pure verdict. Returns null when allowed, otherwise a human-readable reason. */
export function verdict(kind: Kind, s: Snapshot, l: Limits = LIMITS): string | null {
  if (s.availableGB < l.minAvailableGB) {
    return `only ${s.availableGB.toFixed(1)} GB memory available (need >= ${l.minAvailableGB} GB)`;
  }
  // Swap alone can be stale (macOS keeps swapfiles after pressure clears), so only treat heavy swap
  // as pressure while available memory is also below 1.25x the minimum.
  if (s.swapUsedGB > l.maxSwapGB && s.availableGB < l.minAvailableGB * 1.25) {
    return `swap is ${s.swapUsedGB.toFixed(1)} GB used and only ${s.availableGB.toFixed(1)} GB is available: the machine is under memory pressure`;
  }
  if (kind === "burst") {
    if (s.burstRunning >= l.maxBurst) {
      return `${s.burstRunning} heavy job(s) already running (test runner/build/tsc/Playwright); heavy jobs run one at a time`;
    }
    if (s.browsersRunning > 0) {
      return `${s.browsersRunning} Playwright browser process(es) are still open; close them first (another QA/E2E run is active or leaked)`;
    }
    if (s.reservedByOther) {
      return "another heavy job was just admitted a few seconds ago; retry shortly";
    }
  } else if (s.servicesRunning >= l.maxServices) {
    return `${s.servicesRunning} dev servers already running (limit ${l.maxServices}); reuse one (nextdev list) or stop one (nextdev stop)`;
  }
  return null;
}

// ---- system snapshot -------------------------------------------------------------------

export function parseVmStat(out: string): number {
  const page = Number(out.match(/page size of (\d+) bytes/)?.[1] ?? 16384);
  const n = (label: string) => Number(out.match(new RegExp(`${label}:\\s+(\\d+)`))?.[1] ?? 0);
  const pages = n("Pages free") + n("Pages inactive") + n("Pages speculative") + n("Pages purgeable");
  return (pages * page) / 1024 ** 3;
}

export function parseSwapUsed(out: string): number {
  const m = out.match(/used = ([\d.]+)([MG])/);
  if (!m) return 0;
  return m[2] === "G" ? Number(m[1]) : Number(m[1]) / 1024;
}

const RE_BROWSER = /ms-playwright|chrome-headless-shell|headless_shell|Google Chrome for Testing/;
const RE_BURST_PROC = [
  /playwright(?:-core)?\/(?:cli|lib\/cli|lib\/runner|lib\/common)|\bplaywright test\b|test\/cli\.js/,
  /\bvitest\b|vitest\/dist/,
  /next(?:\/dist\/bin\/next)? build\b|next-build/,
  /typescript\/lib\/tsc\.js|\btsc\b.*--noEmit/,
];
const RE_SERVICE_PROC = /next-server|next(?:\/dist\/bin\/next)? dev\b|\/next\/dist\/server\/lib\/start-server/;

export function countProcesses(psOut: string, selfPids: Set<number>): Pick<Snapshot, "burstRunning" | "servicesRunning" | "browsersRunning"> {
  let browsers = 0;
  const burstRoots = new Set<string>();
  let services = 0;
  for (const line of psOut.split("\n")) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    const pid = Number(m[1]);
    const cmd = m[3];
    if (selfPids.has(pid) || /tsserver|typingsInstaller|heavy-guard/.test(cmd)) continue;
    if (RE_BROWSER.test(cmd)) {
      browsers++;
      continue;
    }
    if (RE_SERVICE_PROC.test(cmd) && !/next build/.test(cmd)) {
      // count only the server process itself (the `next-server` child), not wrapper shells
      if (/next-server/.test(cmd)) services++;
      continue;
    }
    if (RE_BURST_PROC.some((re) => re.test(cmd))) burstRoots.add(String(pid));
  }
  // vitest/playwright spawn workers with the same marker; treat them as one job per parent chain
  // by counting distinct parents rather than every worker.
  const parents = new Set<string>();
  for (const line of psOut.split("\n")) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (m && burstRoots.has(m[1])) parents.add(burstRoots.has(m[2]) ? m[2] : m[1]);
  }
  return { burstRunning: parents.size, servicesRunning: services, browsersRunning: browsers };
}

const STATE_DIR = join(process.env.HEAVY_GUARD_STATE_DIR ?? join(homedir(), ".cache", "heavy-guard"));
const RESERVATION = join(STATE_DIR, "reservation");
const LOG = join(STATE_DIR, "log.jsonl");

/**
 * Owner-authorized, time-limited relaxation of the memory floor (file: ~/.cache/heavy-guard/override.json,
 * `{ "minAvailableGB": 1.5, "expiresAt": "<ISO>", "reason": "..." }`). Only the memory floor/swap rule is
 * relaxed — the one-job-at-a-time, browser and dev-server caps always apply. Expired/invalid = ignored.
 */
export function effectiveLimits(raw: string | null, now: number = Date.now(), base: Limits = LIMITS): { limits: Limits; overridden: boolean } {
  if (!raw) return { limits: base, overridden: false };
  try {
    const o = JSON.parse(raw);
    const exp = Date.parse(o?.expiresAt);
    const min = Number(o?.minAvailableGB);
    if (!Number.isFinite(exp) || exp <= now || !Number.isFinite(min) || min < 1 || min >= base.minAvailableGB) {
      return { limits: base, overridden: false };
    }
    return { limits: { ...base, minAvailableGB: min }, overridden: true };
  } catch {
    return { limits: base, overridden: false };
  }
}

function readOverride(): string | null {
  try {
    return readFileSync(join(STATE_DIR, "override.json"), "utf8");
  } catch {
    return null;
  }
}

function reservedByOther(ttlSec: number, me: string): boolean {
  try {
    const age = (Date.now() - statSync(RESERVATION).mtimeMs) / 1000;
    if (age >= ttlSec) return false;
    return readFileSync(RESERVATION, "utf8").trim() !== me;
  } catch {
    return false;
  }
}

function sh(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: "utf8", timeout: 2500 });
}

export function takeSnapshot(me: string): Snapshot {
  const selfPids = new Set<number>([process.pid, process.ppid]);
  const ps = sh("ps", ["-axo", "pid=,ppid=,command="]);
  return {
    availableGB: parseVmStat(sh("vm_stat", [])),
    swapUsedGB: parseSwapUsed(sh("sysctl", ["-n", "vm.swapusage"])),
    ...countProcesses(ps, selfPids),
    reservedByOther: reservedByOther(LIMITS.reservationSec, me),
  };
}

function log(entry: Record<string, unknown>): void {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), ...entry }) + "\n");
  } catch {
    // best effort
  }
}

function describe(s: Snapshot): string {
  return `available=${s.availableGB.toFixed(1)}GB swapUsed=${s.swapUsedGB.toFixed(1)}GB burstJobs=${s.burstRunning} devServers=${s.servicesRunning} browsers=${s.browsersRunning}`;
}

const WAIT_HINT =
  "Wait, do not bypass: poll with a Monitor until-loop, e.g. `until node ~/claude-config/bin/heavy-guard.ts --check; do sleep 20; done`, then retry. Run heavy work one job at a time; close browsers (browser_close / browser.close()) and `nextdev stop` when done.";

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes("--status") || args.includes("--check")) {
    const s = takeSnapshot("cli");
    const eff = effectiveLimits(readOverride());
    const why = verdict("burst", s, eff.limits);
    if (eff.overridden && args.includes("--status")) process.stdout.write(`(owner override active: min available ${eff.limits.minAvailableGB} GB)\n`);
    if (args.includes("--status")) {
      process.stdout.write(`${describe(s)}\n${why ? `DENY: ${why}` : "ALLOW"}\n`);
    }
    return why ? 1 : 0;
  }
  const input = JSON.parse(readFileSync(0, "utf8"));
  const command: unknown = input?.tool_input?.command;
  if (typeof command !== "string") return 0;
  if (existsSync(join(STATE_DIR, "off"))) return 0; // owner kill-switch: touch ~/.cache/heavy-guard/off
  const kind = classify(command);
  if (!kind) return 0;
  const me = String(input?.agent_id ?? input?.session_id ?? "unknown");
  const s = takeSnapshot(me);
  const forced = existsSync(join(STATE_DIR, "force-deny")); // test hook: deny all heavy commands
  const { limits, overridden } = effectiveLimits(readOverride());
  const why = forced ? "force-deny flag set (testing)" : verdict(kind, s, limits);
  log({ kind, allow: !why, why, overridden, snap: s, session: input?.session_id, agent: input?.agent_id, cmd: command.slice(0, 160) });
  if (!why) {
    if (kind === "burst") {
      try {
        mkdirSync(STATE_DIR, { recursive: true });
        writeFileSync(RESERVATION, me);
      } catch {
        // reservation is best effort
      }
    }
    return 0;
  }
  process.stderr.write(
    `BLOCKED by heavy-guard: ${why}.\nMachine state: ${describe(s)}\nThis Mac has 16 GB; an earlier unguarded parallel run used ~36 GB and crashed it.\n${WAIT_HINT}\n`,
  );
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => process.exit(code))
    .catch(() => process.exit(0)); // fail open
}
