# claude-config

Personal Claude Code configuration synced across machines.

## What's in here

- `settings.json` — permissions allow-list, enabled plugins, model preference
- `plugins/installed_plugins.json` — plugin installation manifest
- `plugins/known_marketplaces.json` — registered plugin marketplaces
- `skills.txt` — third-party skills to install (one per line, `#` for comments)
- `bootstrap.sh` — symlinks this repo into `~/.claude/` and installs missing skills

## Setup on a new machine

```sh
git clone git@github.com:<user>/claude-config.git ~/claude-config
~/claude-config/bootstrap.sh
```

The script symlinks files from this repo into `~/.claude/`, so any later edits in either location stay in sync. Existing non-symlink files at the target are backed up to `*.backup.<timestamp>`.

## Machine-specific overrides

Use `~/.claude/settings.local.json` for anything that shouldn't be shared (per-machine paths, private tweaks). That file is **not** managed by this repo.

## Adding a skill

1. Install it locally (`npx skills add <name>`)
2. Add its name to `skills.txt`
3. Commit and push — other machines pick it up on next bootstrap run

## Not included (intentionally)

Secrets, runtime state, and caches are never committed: `.credentials.json`, `sessions/`, `projects/`, `history.jsonl`, `shell-snapshots/`, `cache/`, `backups/`, `plugins/cache/`, `plugins/data/`, `plugins/marketplaces/`, etc.
