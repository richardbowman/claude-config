---
name: nextjs-local-dev
description: Manage a local Next.js dev server from the shell — start, stop, restart, monitor, tail logs — with safe isolation across git worktrees. Use whenever the user asks you to run, restart, or check the status of a Next.js (or similar JS) dev server, especially when multiple worktrees of the same project may be running concurrently. Always use the nextdev CLI; never kill node processes with pkill/killall/fuser.
---

# Next.js local dev

Run Next.js natively (not in a container) and manage the dev server through the `nextdev` CLI. `nextdev` keys each instance by absolute cwd, so a git worktree has its own independent server on its own port. The script **only ever touches processes it started**.

## CRITICAL — process-safety rules for Claude

These rules exist because in past sessions the assistant has killed every node process on the box, taking down unrelated work.

- **DO NOT** run `pkill node`, `pkill -f next`, `killall node`, `fuser -k`, or any wildcard `kill $(pgrep ...)` chain.
- **DO NOT** grep `ps aux` and pipe PIDs into `kill` to "clean up". You cannot tell from `ps` which server belongs to which worktree.
- **DO** use `nextdev stop` from inside the worktree whose server you want to stop.
- **DO** use `nextdev list` to see every server this tool knows about, across worktrees.
- If `nextdev` says a pid "no longer looks like node/next", **stop** and report it to the user — don't force-kill. Something unexpected is using that pid.
- If you need to kill a server you didn't start with `nextdev`, confirm with the user first and target the single pid precisely (`kill <pid>`), never a pattern.

## Commands

All commands operate on the instance keyed by `$(pwd -P)` unless noted.

```sh
nextdev start              # auto-detect pnpm/yarn/bun/npm, pick free port ≥ 3000
nextdev start --port 3001  # pin port (fails if in use)
nextdev start --pm pnpm    # force package manager
nextdev start --cmd "pnpm dev --turbopack"  # custom command

nextdev stop               # graceful stop (TERM, then KILL after 10s)
nextdev restart            # stop + start, flags same as start

nextdev status             # current worktree's server
nextdev list               # every registered instance, across worktrees
nextdev logs               # tail 200 lines
nextdev logs -f            # follow
nextdev logs -n 1000       # more history

nextdev clean              # forget registrations whose pid is gone
nextdev doctor             # show tool versions + environment
```

State lives in `${XDG_STATE_HOME:-~/.local/state}/nextdev/<hash-of-cwd>/` — one directory per worktree, containing `pid`, `port`, `cwd`, `command`, `started_at`, and `dev.log`.

## Worktree workflow

```sh
# main checkout
cd ~/code/hiptrip
nextdev start                        # → :3000

# feature branch in a worktree
git worktree add ../hiptrip-feat-x feat/x
cd ../hiptrip-feat-x
nextdev start                        # → :3001 (auto-picked)

nextdev list
# STATE       PID     PORT    CWD
# running     12345   3000    /home/rick/code/hiptrip
# running     12399   3001    /home/rick/code/hiptrip-feat-x
```

Each worktree has its own `.next/` build cache and its own `nextdev` instance — no interference.

## Typical recipes

**User says "restart the dev server":**
```sh
nextdev restart
```

**User says "is the dev server running?":**
```sh
nextdev status
```

**User says "the server seems broken, check the logs":**
```sh
nextdev logs -n 200
```

**Checking logs after `nextdev start` (do NOT use `sleep`):**

The session blocks `sleep N` (N ≥ 2) before commands. Instead, run `nextdev logs` immediately — the log file is written by the background process and will contain whatever has been emitted so far. Use `run_in_background: true` on the Bash tool call so the tool exits quickly, then read the output file when notified:

```sh
# in the Bash tool, with run_in_background: true
nextdev logs -n 40
```

Or use Monitor to watch for the "Ready" line:
```sh
# streams until "Ready" appears (or timeout)
tail -f /home/.../.local/state/nextdev/<hash>/dev.log | grep --line-buffered -m1 "Ready"
```

The hash is the last path segment shown by `nextdev start` in the `logs:` field.

**User says "start a clean dev server":**
```sh
nextdev stop || true
rm -rf .next
nextdev start
```

**User says "what's running across all my worktrees?":**
```sh
nextdev list
```

**Port conflict with a stale server:**
```sh
nextdev list          # find which worktree owns the port
cd <that worktree>
nextdev stop
```

## Node version pinning

Next.js local dev replaces what a devcontainer would give you — but only if Node is consistent across machines. Use `fnm` (fast, cross-platform) and commit an `.nvmrc`:

```sh
echo "22" > .nvmrc           # or whatever the project targets
fnm use                       # picks up .nvmrc
```

Install `fnm`:
- **macOS**: `brew install fnm`
- **Linux**: `curl -fsSL https://fnm.vercel.app/install | bash`
- **Windows**: `winget install Schniz.fnm`

Add to shell init: `eval "$(fnm env --use-on-cd)"` — changing directory auto-switches Node.

## Don't containerize the Next.js dev server

- HMR depends on filesystem watchers; bind-mounted watchers on macOS/Windows are slow and lossy even with `CHOKIDAR_USEPOLLING=true` (which burns CPU).
- `node_modules` bind mounts have perf + permission issues.
- `.next/` cache on a bind mount is painful.

Containers are great for **stateful deps** (Postgres, Redis) — see the `podman-postgres` skill. Keep Next.js on the host.

## Cross-platform notes

- **Linux, macOS, WSL**: `nextdev` runs as-is.
- **Native Windows (PowerShell/cmd)**: use WSL2 for this script. Running Next dev directly on Windows works but `nextdev` is bash-only.
- Port check uses `ss` on Linux, `lsof` on macOS, `netstat` as fallback.
- Stopping uses a BFS of `pgrep -P` walking children before killing the parent, so dev servers spawned via `npm run dev` (npm → next-router-worker → render-workers) all come down cleanly.

## When things go wrong

- **`nextdev start` exits immediately** — check `dev.log` in the state dir; usually a missing env var or port already bound.
- **`nextdev status` says "running" but the site is down** — Next.js is crashing per-request. `nextdev logs -f` and reload the page.
- **`nextdev list` shows a ghost entry** — `nextdev clean` removes registrations whose pids no longer match node/next.
- **Port 3000 is taken by something not `nextdev`** — identify with `lsof -iTCP:3000 -sTCP:LISTEN` or `ss -tlnp | grep :3000`. Ask the user before killing an unknown process.
