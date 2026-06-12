# Claude Code — User-Level Guidelines

## Skills

I have a skills library at `~/.claude/skills/`. **Before writing shell commands or code for any of the triggers below, invoke the matching skill first using the Skill tool.** Skills contain the correct recipes, gotchas, and flag syntax — do not improvise.

| Trigger | Skill |
|---|---|
| User reports a bug, broken feature, or unexpected behavior in production | `debug` |
| Apply or check migrations on preview or production | `dsql-migrate` + `vercel-tools` |
| Start, stop, restart, or check the dev server | `nextjs-local-dev` |
| Enter a fresh git worktree, bootstrap local dev | `worktree-bootstrap` |
| Run E2E / Playwright tests locally | `e2e-local` |
| Check Vercel deploy status, logs, wait for deploy | `vercel-tools` |
| Write code using Vercel CLI, Next.js App Router, Vercel AI SDK, Turbopack | `verify-before-coding` |
| New project needs Aurora DSQL + Prisma setup | `dsql-setup` |
| Validate Prisma schema for DSQL compatibility | `dsql-schema` |
| Execute DSQL queries or manage schemas directly | `dsql` |
| Run local Postgres via Podman | `podman-postgres` |
| Backup Vercel env vars to 1Password | `backup-vercel-secrets` |
| Rick asks about email, newsletters, travel planning | `rb-personal-assistant` |
| Mark roadmap items as shipped after merging a feature | `roadmap-ship` |
| Plan a NEW Remotion video — script, storyboard, scene breakdown before any code | `video-storyboard` |
| Build or update a Remotion video ad (TTS, Whisper sync, landing page embed) | `remotion-video-ads` |
| Acting as a HipTrip editor — generating trips, curating hip places, publishing | `hiptrip-editor` |
| Capture knowledge, brain dump, extract a workflow, strategy, or mental model into Obsidian | `brain-dump` |
| Brainstorm, ideate, explore a concept, get outside-the-box ideas with rigor | `brainstorm` |
| Consolidate memory, mine conversation logs for friction/feedback, run /dream | `dream` |
| PM coaching, product discovery, thinking through outcomes vs output | `pm-coach` |
| Build, review, or health-check an Opportunity Solution Tree (OST) | `ost-workflow` |
| Synthesize user research, interviews, support tickets into OST-ready opportunities | `pm-signal-synthesis` |
| Feature is done, about to open a PR, or marking a Linear issue In Review | `pr-checklist` |
| Triage, merge, and ship open PRs on a repo (web app or plugin/distributable) | `release-manager` |
| Automating a website, filling a form, or fetching live data from a JS-heavy or bot-protected site | `agent-browser` |

Skills are invoked with the `Skill` tool, e.g. `skill: "vercel-tools"`. Read the output and follow its recipes exactly — don't substitute your own approach.

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

Follow this procedure for any multi-step task: a feature, a bug with an unknown cause, a refactor, a pipeline, a background run. Skip the ceremony for trivial single-step edits, but the two principles at the bottom always apply. When spawning subagents for extended autonomous work, propagate this section into their prompts.

1. **Before writing any code**, create a checklist with one unchecked item per requirement, plus a final item: "End-to-end verification of every requirement against the running system." Use the built-in task-list tool when available; otherwise write `TODO.md` in the working directory. `TODO.md` is scratch: never commit it unless asked to.

2. **Work one item at a time.** After implementing each item: (a) write an automated test for it, (b) run the tests and watch them pass, (c) only then check the item off.

3. **Before reporting done:** run the system for real and verify every requirement end-to-end (curl, fetch, a browser tool if available, or equivalent), exactly as a user would hit it. Then re-read the original request line by line and confirm nothing was missed or misread. Fix anything that fails and re-verify. Only then check the final item.

4. **The final report lists each requirement** with how it was verified (test name or command, plus the observed result). Anything not verified is listed as NOT VERIFIED. Never summarize verification you did not perform.

5. **Clean up:** kill processes you started, remove scratch files that are not deliverables, and leave the work tree in the state you would want to inherit.

Two principles govern everything above:

- **Verified means observed. Nothing else counts.** Never report something done, fixed, or working unless you watched it work: ran the command, saw the test pass, read the output back. "Should work" is a prediction, not a result. An item may only be checked off, and a claim only made, on observed evidence.

- **Two failures means change strategy. Never loop.** Do not retry the same approach a third time unchanged. Read the full error, inspect actual system state, form a new hypothesis. If genuinely blocked, stop and escalate precisely: what you did, expected, got, and ruled out. Guessing to avoid asking is failure.

## Obsidian Daily Note Rule

Whenever you create a new file in the Obsidian vault (`~/Documents/Personal/`), always add a wikilink to it in that day's daily note at `~/Documents/Personal/Daily/YYYY-MM-DD.md`. Add the link under a `## Claude Sessions` section (create the section if it doesn't exist). If today's daily note doesn't exist yet, create it using the weekday template structure (Meetings / Work Projects / Personal Projects / Ideas / Claude Sessions / Remember).
