# claude-config

Personal Claude Code configuration synced across machines.

## What's in here

- `settings.json` — permissions allow-list, enabled plugins, model preference
- `plugins/known_marketplaces.json` — registered plugin marketplaces
- `skills/` — hand-authored skills (see below)
- `skills.txt` — third-party skills to install via `npx skills add`
- `bin/` — CLIs added to `~/.local/bin` on bootstrap
- `bootstrap.sh` — thin thunk that verifies Node is installed, then execs `bootstrap.js`
- `bootstrap.js` — does the real work: symlinks this repo into `~/.claude/` and `~/.local/bin/`, installs missing third-party skills

## Included skills

| Skill | Purpose |
|---|---|
| `nextjs-local-dev` | Run/monitor Next.js dev servers via the `nextdev` CLI. Per-worktree isolation, safe stop/restart, env-var recipes for worktrees. |
| `podman-postgres` | Local Postgres via Podman — cross-platform, named volumes, backup/restore, upgrades. |
| `vercel-logs` | Pull historical Vercel deployment logs; commit-pinned deploy monitoring. |

## Included CLIs

- **`nextdev`** — scoped Next.js dev-server manager. Start/stop/restart/list servers by worktree, logs, doctor. Safely avoids wildcard process kills. See `skills/nextjs-local-dev/SKILL.md` for full reference.

## Setup on a new machine

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
