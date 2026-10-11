#!/usr/bin/env node
// PreToolUse(Bash) hook: when a heavy local command is about to run and the
// homelab is reachable, print a one-line reminder to use tq-check/dev-builder.
// Contract: ALWAYS exit 0, never block, silent when unreachable or on any error.
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = process.env.HOMELAB_NUDGE_HOST ?? "192.168.68.251"; // dev-builder
const PORT = Number(process.env.HOMELAB_NUDGE_PORT ?? 22);
const TIMEOUT_MS = 1200;
const CACHE_TTL_MS = 60_000;
const CACHE_FILE = join(tmpdir(), `homelab-nudge-${HOST}-${PORT}.cache`);

const HEAVY = [
  /^(?:pnpm|npm|yarn)\s+(?:run\s+)?test\b/,
  /^(?:pnpm\s+(?:exec\s+|dlx\s+)?|npx\s+|yarn\s+)?playwright\b/,
  /^(?:pnpm\s+(?:exec\s+)?|npx\s+)?next\s+(?:dev|build)\b/,
  /^nextdev\b/,
  /^podman\s+run\b/,
  /^(?:pnpm\s+(?:exec\s+)?|npx\s+)?tsc\b/,
];

/** True when any pipeline segment of the command starts with a heavy tool. */
export function isHeavyCommand(command: string): boolean {
  return command.split(/&&|\|\||;|\||\n/).some((raw) => {
    const seg = raw
      .trim()
      .replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, "") // leading ENV=val
      .replace(/^(?:cd\s+\S+\s*)$/, "");
    return HEAVY.some((re) => re.test(seg));
  });
}

function probe(): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ host: HOST, port: PORT });
    const done = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(TIMEOUT_MS, () => done(false));
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
  });
}

async function homelabReachable(): Promise<boolean> {
  try {
    const age = Date.now() - statSync(CACHE_FILE).mtimeMs;
    if (age < CACHE_TTL_MS) return readFileSync(CACHE_FILE, "utf8") === "1";
  } catch {
    // no cache yet
  }
  const ok = await probe();
  try {
    writeFileSync(CACHE_FILE, ok ? "1" : "0");
  } catch {
    // cache is best-effort
  }
  return ok;
}

async function main(): Promise<void> {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const command: unknown = input?.tool_input?.command;
  if (typeof command !== "string" || !isHeavyCommand(command)) return;
  if (!(await homelabReachable())) return;
  // additionalContext is what reaches the model; plain stdout would not.
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext:
          "Homelab is reachable: run this on it by default (`tq-check` / `tq submit --profile <p>` for typecheck+unit, `ssh dev-builder` for E2E/build/dev server). Local only for the narrowest checks. See CLAUDE.md \"Heavy work goes to the homelab\".",
      },
    }) + "\n",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => {}).finally(() => process.exit(0));
}
