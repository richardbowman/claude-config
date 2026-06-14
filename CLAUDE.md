# Claude Code — User-Level Guidelines

## Skills

Before writing shell commands or code, check the injected skills list and invoke the matching skill first using the `Skill` tool. Skills contain the correct recipes, gotchas, and exact flag syntax — do not improvise. Read the output and follow its recipes exactly.

## Web Browsing Escalation

Use WebSearch → WebFetch → `agent-browser` in that order. Skip straight to `agent-browser` for JS-heavy sites, retail/e-commerce, or anything that returns a 403 or empty shell via WebFetch.

## Google Workspace CLI (`gws`)

Use the `gws` CLI for **all** Google Workspace operations. Never use raw `curl`, `rclone`, or `gdrive` — `gws` is already authenticated. Use `gws schema <service>.<resource>.<method>` to discover any method's parameters before calling it. Authenticated account: `richard.bowman@gmail.com`

## Scripting Language

Always write scripts in TypeScript/Node.js. Never use Python for scripts. Node v22.6+ runs TypeScript natively (no `tsx`, `ts-node`, or compilation step needed) — use a `#!/usr/bin/env node` shebang and write `.ts` files directly.

## Settings Files

`~/.claude/settings.json` is a symlink to a per-machine file in `~/claude-config/settings/`. Edit the per-machine file directly — use `realpath ~/.claude/settings.json` to confirm which one. See [[Claude Config Architecture]] for the full setup.

## API Debugging Strategy

When an API's correct request shape is unclear, **write a throwaway Node.js probe script first** — before touching app code. The script should: (1) hit the API directly with stored credentials, (2) try each candidate approach, (3) log the response to confirm the winner. Never modify app code just to test an API hypothesis.

## Working Discipline (multi-step tasks)

Follow this procedure exactly for every multi-step task. It is not optional. When spawning subagents for extended autonomous work, propagate this section into their prompts.

1. **Before writing any code**, use `TodoWrite` to create a task list with one item per requirement in the brief, plus a final item: "End-to-end verification of every requirement against the running system". All items start `pending`.

2. **Work one item at a time.** Mark the current item `in_progress` before starting it. After implementing each item:
   a. Write an automated test for it.
   b. Run the tests and watch them pass.
   c. Only then mark it `completed` via `TodoWrite`.

3. **After all items are completed except the last:** start the system for real and verify every requirement end-to-end with real requests (curl, fetch, a browser tool if one is available, or equivalent), exactly as a user would hit it. Then re-read the original brief line by line and confirm nothing was missed or misread. Fix anything that fails and re-verify. Only then mark the final item completed.

4. **Your final report must list each requirement** with how it was verified (test name or command, plus the observed result). Any requirement you did not verify must be listed as NOT VERIFIED. Do not summarize verification you did not perform.

Two principles govern everything above:

- **Verified means observed. Nothing else counts.** Never report something done, fixed, or working unless you watched it work: ran the command, saw the test pass, read the output back. "Should work" is a prediction, not a result. A box may only be checked, and a claim only made, on observed evidence.

- **Two failures means change strategy. Never loop.** Do not retry the same approach a third time unchanged. Read the full error, inspect actual system state, form a new hypothesis. If genuinely blocked, stop and report precisely: what you did, expected, got, and ruled out. Guessing to avoid reporting is failure.

When you finish: clean up after yourself (kill processes you started, remove scratch files that are not deliverables) and leave the work tree in the state you would want to inherit.

## Obsidian Daily Note Rule

Whenever you create a new file in the Obsidian vault (`~/Documents/Personal/`), always add a wikilink to it in that day's daily note at `~/Documents/Personal/Daily/YYYY-MM-DD.md`. Add the link under a `## Claude Sessions` section (create the section if it doesn't exist). If today's daily note doesn't exist yet, create it using the weekday template structure (Meetings / Work Projects / Personal Projects / Ideas / Claude Sessions / Remember).
