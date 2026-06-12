# Claude Code — User-Level Guidelines

## Skills

Before writing shell commands or code, check the injected skills list and invoke the matching skill first using the `Skill` tool. Skills contain the correct recipes, gotchas, and exact flag syntax — do not improvise. Read the output and follow its recipes exactly.

## Web Browsing Escalation

When fetching live web content, follow this hierarchy in order:

1. **WebSearch** — for broad queries where you need a list of URLs to evaluate
2. **WebFetch** — for simple, static pages (docs, blogs, plain HTML)
3. **agent-browser** — use immediately, without trying WebFetch first, for:
   - Any major e-commerce or retail site (Amazon, Walmart, Target, Home Depot, etc.)
   - Any page that returns a 403, CAPTCHA, timeout, or a JS shell with no real content via WebFetch
   - Live stock levels, prices, or account data rendered client-side by JavaScript
   - Any SPA where the content you need isn't in the initial HTML response

Never retry WebFetch after a clear bot-block or empty JS shell. Go straight to `agent-browser`. The `web-search` skill workflow step "use WebFetch on the most relevant URLs" means WebFetch for static pages only — use agent-browser for anything on a retail or heavily JS-rendered site.

## Google Workspace CLI (`gws`)

Use the `gws` CLI for **all** Google Workspace operations — Drive, Gmail, Calendar, Sheets, etc. Never improvise with raw `curl` against Google APIs or attempt to configure `rclone`, `gdrive`, or ADC for Workspace tasks. `gws` is already authenticated and handles token refresh automatically.

```bash
# Pattern: gws <service> <resource> <method> [flags]
gws drive files list --params '{"pageSize": 10}'
gws drive files create --json '{"name": "My Folder", "mimeType": "application/vnd.google-apps.folder"}'
gws drive files create --json '{"name": "file.mp4", "parents": ["<folderId>"]}' --upload path/to/file.mp4
gws gmail users messages list --params '{"userId": "me", "maxResults": 10}'
gws calendar events list --params '{"calendarId": "primary"}'
gws sheets spreadsheets get --params '{"spreadsheetId": "<id>"}'

# Discover a method's schema before using it:
gws schema drive.files.create
```

Authenticated account: `rbcodelabs@gmail.com`

## Scripting Language

Always write scripts in TypeScript/Node.js. Never use Python for scripts. Node v25 runs TypeScript natively (no `tsx`, `ts-node`, or compilation step needed) — use a `#!/usr/bin/env node` shebang and write `.ts` files directly.

## Settings Files (per-machine, fully committed)

Claude Code only supports **one** user-level settings file: `~/.claude/settings.json`. There is no user-level `settings.local.json` (only project-level). To support multiple machines without conflicts, this repo keeps a **complete settings file per machine** under `settings/`, and `bootstrap.js --machine <name>` symlinks the right one into `~/.claude/settings.json`.

| File | Purpose |
|---|---|
| `~/claude-config/settings/personal.json` | Full settings for the personal machine (`rickbowman`). Has helio MCP, `model: sonnet`, `bypassPermissions`, the `require-worktree.sh` hook, personal Bash patterns. |
| `~/claude-config/settings/work.json` | Full settings for the work machine (`rbowman`). Has Bedrock model ID, branch-protect + secret-staging hooks, bankrate plugins. |
| `~/.claude/settings.json` | Symlink to whichever per-machine file `bootstrap.js --machine <name>` was last run with. |

**Rule for future edits:** edit `settings/<machine>.json` for the machine you're on (use `realpath ~/.claude/settings.json` to confirm which one). If a setting should apply to **both** machines, edit both files. Some duplication of common permissions across the two files is the explicit tradeoff for not relying on undocumented merge behavior.

**Bootstrapping a new machine:** clone the repo to `~/claude-config`, then run `./bootstrap.sh --machine personal` (or `work`). Add a new machine by writing a new `settings/<name>.json` and running bootstrap with that name.

**Work machine note:** the work machine has the repo at `~/GitHub/claude-config`, not `~/claude-config`. Create a symlink there so `$HOME/claude-config/bin/...` paths resolve:
```bash
ln -s ~/GitHub/claude-config ~/claude-config
```

## API Debugging Strategy

When a feature requires calling an external API and the correct request shape or behavior is unclear (underdocumented, multiple plausible approaches, or prior attempts failed silently), **write a throwaway Node.js probe script first before touching the plugin or app code.** The script should:

1. Hit the API directly with the stored credentials (check `data.json`, `.env`, or token stores in the plugin/app directory).
2. Try each candidate approach and read the response back to see what the API actually produced.
3. Log the resulting document/resource state so the winning approach is confirmed before any code changes.

Do not modify plugin source, rebuild, and reload Obsidian (or any host app) just to test an API hypothesis. One probe script iteration is faster than three plugin deploy cycles. This applies to Google Docs API, Drive API, Linear, Stripe, or any REST/GraphQL endpoint where behavior under edge cases is ambiguous.

## Working Discipline (multi-step tasks)

Follow this procedure exactly for every multi-step task. It is not optional. When spawning subagents for extended autonomous work, propagate this section into their prompts.

1. **Before writing any code**, create `TODO.md` in the repository root with one unchecked checkbox (`- [ ]`) per requirement in the brief, plus a final item: `- [ ] End-to-end verification of every requirement against the running system`.

2. **Work one item at a time.** After implementing each item:
   a. Write an automated test for it.
   b. Run the tests and watch them pass.
   c. Only then check the box (`- [x]`) in `TODO.md`.

3. **After all items are checked except the last:** start the system for real and verify every requirement end-to-end with real requests (curl, fetch, a browser tool if one is available, or equivalent), exactly as a user would hit it. Then re-read the original brief line by line and confirm nothing was missed or misread. Fix anything that fails and re-verify. Only then check the final box.

4. **Your final report must list each requirement** with how it was verified (test name or command, plus the observed result). Any requirement you did not verify must be listed as NOT VERIFIED. Do not summarize verification you did not perform.

Two principles govern everything above:

- **Verified means observed. Nothing else counts.** Never report something done, fixed, or working unless you watched it work: ran the command, saw the test pass, read the output back. "Should work" is a prediction, not a result. A box may only be checked, and a claim only made, on observed evidence.

- **Two failures means change strategy. Never loop.** Do not retry the same approach a third time unchanged. Read the full error, inspect actual system state, form a new hypothesis. If genuinely blocked, stop and report precisely: what you did, expected, got, and ruled out. Guessing to avoid reporting is failure.

When you finish: clean up after yourself (kill processes you started, remove scratch files that are not deliverables) and leave the work tree in the state you would want to inherit.

## Obsidian Daily Note Rule

Whenever you create a new file in the Obsidian vault (`~/Documents/Personal/`), always add a wikilink to it in that day's daily note at `~/Documents/Personal/Daily/YYYY-MM-DD.md`. Add the link under a `## Claude Sessions` section (create the section if it doesn't exist). If today's daily note doesn't exist yet, create it using the weekday template structure (Meetings / Work Projects / Personal Projects / Ideas / Claude Sessions / Remember).
