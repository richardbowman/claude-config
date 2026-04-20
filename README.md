# claude-config

Personal Claude Code configuration synced across machines.

## What's in here

- `settings.json` — permissions allow-list, enabled plugins, model preference
- `plugins/known_marketplaces.json` — registered plugin marketplaces
- `skills/` — hand-authored skills (see below)
- `skills.txt` — third-party skills to install via `npx skills add`
- `rules/` — custom CLAUDE.md-style rules synced to `~/.claude/rules/` (e.g., context7.md)
- `bin/` — CLIs added to `~/.local/bin` on bootstrap
- `bootstrap.sh` — thin thunk that verifies Node is installed, then execs `bootstrap.js`
- `bootstrap.js` — does the real work: symlinks this repo into `~/.claude/` and `~/.local/bin/`, installs missing third-party skills

## Included skills

| Skill | Purpose |
|---|---|
| `nextjs-local-dev` | Run/monitor Next.js dev servers via the `nextdev` CLI. Per-worktree isolation, safe stop/restart, env-var recipes for worktrees. |
| `podman-postgres` | Local Postgres via Podman — cross-platform, named volumes, backup/restore, upgrades. |
| `vercel-logs` | Pull historical Vercel deployment logs; commit-pinned deploy monitoring. |
| `verify-before-coding` | Forces Claude to verify APIs/flags before writing code in fast-moving ecosystems (Vercel, Next.js, AI SDK, Node tooling). |
| `worktree-bootstrap` | Prep a git worktree for local Next.js dev when the project uses Vercel/DSQL — installs deps, copies .env.local, starts Podman Postgres, injects DATABASE_URL, launches nextdev. |

**Third-party skills** (installed via `npx skills add`, listed in `skills.txt`):

| Skill | Purpose |
|---|---|
| `find-skills` | Discover and search available skills in the marketplace. |
| `defuddle` | Parse and extract clean content from web pages. |
| `json-canvas` | Create and edit Obsidian JSON Canvas files. |
| `obsidian-bases` | Work with Obsidian Bases (database views). |
| `obsidian-cli` | Control Obsidian via CLI commands. |
| `obsidian-markdown` | Obsidian-flavored Markdown — callouts, embeds, properties. |

## Included CLIs

- **`nextdev`** — scoped Next.js dev-server manager. Start/stop/restart/list servers by worktree, logs, doctor. Safely avoids wildcard process kills. See `skills/nextjs-local-dev/SKILL.md` for full reference.
- **`worktree-bootstrap`** — one-command prep for a fresh git worktree (install deps, copy `.env.local`, start Podman Postgres, inject `DATABASE_URL`, launch `nextdev`). See `skills/worktree-bootstrap/SKILL.md`.
- **`wtcc [name]`** — fetch + fast-forward main, then launch Claude Code in a new git worktree. Defaults to a timestamped branch name (`work-YYYYMMDD-HHMMSS`) so each invocation always gets its own branch. Runs `/worktree-bootstrap` on entry.
- **`wtadd <path> [branch] [...]`** — safe wrapper around `git worktree add`: fast-forwards main first, then creates the worktree. Prevents branching off a stale base.
- **`wt-ff-main`** — fetch origin and fast-forward local main if behind. Used internally by `wtcc` and `wtadd`; can also be run standalone.

## Setup on a new machine

### macOS — one-shot

**Recommended: clone first.** Homebrew's installer needs an interactive TTY to prompt for your password (piped `curl | bash` can't give it one, which surfaces as misleading "not an administrator" errors):

```sh
xcode-select --install   # if not already installed
git clone https://github.com/richardbowman/claude-config.git ~/claude-config
~/claude-config/scripts/setup-mac.sh
~/claude-config/scripts/setup-mac-apps.sh   # optional: personal apps
```

One-liner (the script now detects piped-stdin and reattaches to `/dev/tty` when possible):

```sh
curl -fsSL https://raw.githubusercontent.com/richardbowman/claude-config/main/scripts/setup-mac.sh | bash
```

Installs Xcode CLI tools, Homebrew, git, fnm + Node LTS, Claude Code, gh, podman, Vercel CLI, and runs `bootstrap.sh`. Idempotent — safe to re-run.

**After the script finishes** (interactive steps, one-time per machine):

```sh
exec zsh -l          # login shell — sources .zprofile so brew, fnm, etc. resolve
claude               # first run prompts login
gh auth login        # authenticate GitHub CLI
vercel login         # authenticate Vercel CLI
podman machine init  # ~1GB download — skip if podman-desktop will manage this
podman machine start
```

**Verify everything wired up:**

```sh
ls -la ~/.claude/settings.json            # should be a symlink -> ~/claude-config/settings.json
ls ~/.claude/skills/                      # should list all synced skills
nextdev doctor                            # should report node + brew-installed tools
```

### Linux / manual

```sh
git clone git@github.com:<user>/claude-config.git ~/claude-config
~/claude-config/bootstrap.sh
```

**Prereq: Node 18+.** If `node` isn't on PATH, `bootstrap.sh` prints install instructions and exits. Recommended:

```sh
# macOS
brew install fnm && fnm install --lts && fnm default lts-latest

# Linux
curl -fsSL https://fnm.vercel.app/install | bash
fnm install --lts && fnm default lts-latest

# Windows (native)
winget install Schniz.fnm
fnm install --lts && fnm default lts-latest

# add to ~/.bashrc, ~/.zshrc, or PowerShell $PROFILE
eval "$(fnm env --use-on-cd)"
```

The script symlinks files from this repo into `~/.claude/` (settings, marketplaces, skills) and into `~/.local/bin/` (CLIs), so later edits in either location stay in sync. Existing non-symlink files at the target are backed up to `*.backup.<timestamp>`.

Make sure `~/.local/bin` is on your `PATH` (add `export PATH="$HOME/.local/bin:$PATH"` to `~/.bashrc` or `~/.zshrc` if not).

## Status line

The status line is configured in `settings.json` to run `~/.claude/statusline-command.sh` (symlinked from this repo via `bootstrap.sh`).

It shows:
- **nextdev URL** — dynamically looks up the running `nextdev` port for the current workspace (e.g. `http://localhost:3001`). Hidden if no server is running.
- **Git branch** — current branch name.
- **PR number** — if a GitHub PR exists for the branch (via `gh`), appended as `PR #123`.

The script hashes the workspace's absolute path with SHA1 to find the right `nextdev` state dir under `~/.local/state/nextdev/`, so it correctly tracks per-worktree servers.

## Machine-specific overrides

Use `~/.claude/settings.local.json` for anything that shouldn't be shared (per-machine paths, private tweaks). That file is **not** managed by this repo.

Typical contents on a fresh machine — adjust paths for macOS (`/Users/<you>`) or Windows (`C:\\Users\\<you>`):

```json
{
  "permissions": {
    "additionalDirectories": [
      "/home/<you>"
    ]
  }
}
```

`additionalDirectories` grants read/edit access outside the current project root without prompting. Paths are absolute and differ per OS, so they can't live in the synced `settings.json`.

## Adding a skill

1. Install it locally (`npx skills add <name>`)
2. Add its name to `skills.txt`
3. Commit and push — other machines pick it up on next bootstrap run

Repo-local skills (hand-authored) live under `skills/<name>/SKILL.md`. `bootstrap.sh` symlinks every `skills/*/` directory into `~/.claude/skills/`.

## Adding a plugin

Plugins sync via two pieces, both already handled by `bootstrap.sh`:

1. **Enable the plugin** — add it to `enabledPlugins` in `settings.json`:
   ```jsonc
   "enabledPlugins": {
     "vercel-plugin@vercel": true,
     "some-plugin@some-marketplace": true
   }
   ```
2. **Register the marketplace** in `plugins/known_marketplaces.json` if it isn't there yet. Easiest: install the plugin once with `/plugin install <id>@<marketplace>` in Claude Code; it writes the marketplace entry, and since that file is symlinked, the change flows back to the repo.

**Not synced**: `~/.claude/plugins/installed_plugins.json` (machine cache — absolute paths, timestamps) and `~/.claude/plugins/cache/` / `marketplaces/` (downloaded content). Claude Code re-fetches on first run based on enabled + known marketplaces.

## Not included (intentionally)

Secrets, runtime state, and caches are never committed: `.credentials.json`, `sessions/`, `projects/`, `history.jsonl`, `shell-snapshots/`, `cache/`, `backups/`, `plugins/cache/`, `plugins/data/`, `plugins/marketplaces/`, etc.
