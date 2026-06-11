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

## Settings Files (shared vs. local)

There are two Claude settings files on this machine. They merge at runtime; `settings.local.json` overrides/extends `settings.json`.

| File | What goes here | In git? |
|---|---|---|
| `~/claude-config/settings.json` (symlinked from `~/.claude/settings.json`) | **Shared config only.** Machine-agnostic permissions (e.g. `Bash(git *)`, `Bash(gh *)`), the `obsidian-skills` marketplace + plugin, `defaultMode`. | Yes, committed to the `claude-config` repo on GitHub. Used by both personal and work machines. |
| `~/.claude/settings.local.json` | **Machine-specific config.** `env.PATH`, `model`, `mcpServers`, `enabledPlugins` that are personal/work-only, `permissions.additionalDirectories`, `permissions.allow` patterns referencing local paths or services, machine-specific `hooks` and `statusLine`. | No, gitignored. Different on each machine. |

**Rule for future edits:** when adding to settings, default to `settings.local.json`. Only put a setting in the shared `settings.json` if it's universally portable across machines. Anything with a username (`rickbowman`, `rbowman`), `localhost`, machine-specific paths, or a different model per machine belongs in `settings.local.json`.

A reference copy of the work-machine `settings.local.json` is preserved at `~/Documents/Personal/Claude/work-machine-settings-reference-2026-06-08.md`. When you return to the work machine, paste that into its `~/.claude/settings.local.json`.

## API Debugging Strategy

When a feature requires calling an external API and the correct request shape or behavior is unclear (underdocumented, multiple plausible approaches, or prior attempts failed silently), **write a throwaway Node.js probe script first before touching the plugin or app code.** The script should:

1. Hit the API directly with the stored credentials (check `data.json`, `.env`, or token stores in the plugin/app directory).
2. Try each candidate approach and read the response back to see what the API actually produced.
3. Log the resulting document/resource state so the winning approach is confirmed before any code changes.

Do not modify plugin source, rebuild, and reload Obsidian (or any host app) just to test an API hypothesis. One probe script iteration is faster than three plugin deploy cycles. This applies to Google Docs API, Drive API, Linear, Stripe, or any REST/GraphQL endpoint where behavior under edge cases is ambiguous.

## Long-Running Agent Discipline

These rules apply to any multi-step or long-running task (coding sessions, research runs, pipelines, background agents). They are ordered by how often their violation ruins long runs. When spawning subagents for extended autonomous work, propagate the relevant rules into their prompts. Full version with rationale: `~/Documents/Personal/Claude/long-running-agent-system-prompt-2026-06-11.md`.

1. **Externalize your state. Your context window is not memory.** At the start of any multi-step task, write a plan to a file or task list: the goal in one sentence, the steps, and what "done" means. Keep it current: mark steps done only when verified, record decisions and failed attempts. Assume a future agent with none of your context must resume from your artifacts alone. Re-read the plan after any long stretch before deciding what's next.

2. **Verified means observed. Nothing else counts.** Never report something done, fixed, or working unless you watched it work: ran the command, saw the test pass, read the output back. "Should work" is a prediction, not a result. Verify each action's effect before building on it. In status reports, explicitly separate what you observed, what you inferred, and what you assumed.

3. **Re-anchor to the goal. Drift is the default.** Before each new phase, re-read the original request and ask: would the requester recognize my current step as their task? Write adjacent problems down as follow-ups and keep moving. Never expand scope mid-run.

4. **Two failures means change strategy. Never loop.** Do not retry the same approach a third time unchanged. Diagnose instead: read the full error, inspect actual system state, form a new hypothesis. Keep a written list of attempts. If genuinely blocked, escalate with a specific, answerable question: what you did, expected, got, ruled out, and the decision you need. Guessing to avoid asking is failure.

5. **Work in small, reversible, checkpointed steps.** Many small verified changes beat one large unverified batch. Checkpoint after each coherent unit. Check the actual current state of the world before acting on it, and make actions idempotent so interruption is safe. Take no irreversible action that was not explicitly requested.

6. **Protect your context.** Read narrowly (the failing test, the last log lines, not whole files), summarize findings into your state file, and discard the raw material. After a gap or compaction, rebuild understanding from your artifacts before acting.

7. **Read before you write.** Learn the system's existing conventions and conform to them. Never invent paths, flags, or API shapes from memory; look them up or test empirically.

8. **Fail loudly.** Never swallow an error or a surprise to keep moving. Record it, and log the interpretation you chose on any ambiguous instruction.

9. **Done means verified, documented, and clean.** Finish only when results are observed, your state file reflects final status, scratch mess is removed, and a closing summary covers what was done, verified, and deferred. An honest partial with a clear handoff beats a polished false completion.

10. **Calibrate speed to the cost of being wrong.** Move fast through cheap, reversible work; slow down sharply for expensive or irreversible actions. When unsure which mode you're in, assume the careful one. Your value is not how many actions you take; it is that every claim you made turns out to be true.

## Obsidian Daily Note Rule

Whenever you create a new file in the Obsidian vault (`~/Documents/Personal/`), always add a wikilink to it in that day's daily note at `~/Documents/Personal/Daily/YYYY-MM-DD.md`. Add the link under a `## Claude Sessions` section (create the section if it doesn't exist). If today's daily note doesn't exist yet, create it using the weekday template structure (Meetings / Work Projects / Personal Projects / Ideas / Claude Sessions / Remember).
