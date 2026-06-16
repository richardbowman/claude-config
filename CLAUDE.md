# Claude Code — User-Level Guidelines

## Web Browsing Escalation

Use WebSearch → WebFetch → `agent-browser` in that order. Skip straight to `agent-browser` for JS-heavy sites, retail/e-commerce, or anything that returns a 403 or empty shell via WebFetch.

## Interactive Browser Testing

**When you need to test interactive UI features** (click buttons, fill forms, verify modals open, test JavaScript interactions), use the `agent-browser` skill. Do NOT claim features are "fully tested" based only on:
- TypeScript compilation passing
- Dev server starting
- Checking static HTML output with `curl`
- Opening a URL in a browser without interaction

Use `agent-browser` for:
- Clicking UI elements and verifying results
- Testing modals, dropdowns, form submissions
- Verifying JavaScript-driven behavior
- Taking screenshots after interactions
- Testing multi-step user flows

Example: After building a modal component, use `agent-browser` to click the trigger button, verify the modal opens, test the close button, and confirm no console errors.

## Google Workspace CLI (`gws`)

Use the `gws` CLI for **all** Google Workspace operations. Never use raw `curl`, `rclone`, or `gdrive` — `gws` is already authenticated. Use `gws schema <service>.<resource>.<method>` to discover any method's parameters before calling it.

## Scripting Language

Always write scripts in TypeScript/Node.js. Never use Python for scripts. Node v22.6+ runs TypeScript natively (no `tsx`, `ts-node`, or compilation step needed) — use a `#!/usr/bin/env node` shebang and write `.ts` files directly.

## Settings Files

`~/.claude/settings.json` is a symlink to a per-machine file in `~/claude-config/settings/`. Edit the per-machine file directly — use `realpath ~/.claude/settings.json` to confirm which one. See [[Claude Config Architecture]] for the full setup.

## API Probing

When an API's correct request shape is unclear, **write a throwaway Node.js probe script first** — before touching app code. The script should: (1) hit the API directly with stored credentials, (2) try each candidate approach, (3) log the response to confirm the winner. Never modify app code just to test an API hypothesis.

## Task Procedure

Follow this procedure for every substantial task. It is not optional. When spawning subagents for extended autonomous work, propagate this section into their prompts.

1. **Check the skills list** and invoke any matching skill before writing commands or starting work.

2. **Before starting work**, use `TodoWrite` to create a task list with one item per requirement, plus a final item: "End-to-end verification of every requirement". All items start `pending`.

3. **Work one item at a time.** Mark it `in_progress` before starting. After completing each item, verify it against its requirement (observed output, not assumption), then mark it `completed`.

4. **After all items are completed except the last:** verify every requirement end-to-end exactly as a user would encounter it. Re-read the original brief line by line. Fix anything that fails and re-verify. Only then mark the final item completed.

5. **Your final report must list each requirement** with how it was verified and the observed result. Any requirement not verified must be listed as NOT VERIFIED.

Two principles govern everything above:

- **Verified means observed.** Never report something done unless you watched it work. "Should work" is a prediction, not a result.

- **Two failures means change strategy.** Do not retry the same approach a third time. Read the error, inspect actual state, form a new hypothesis. If blocked, report precisely: what you did, expected, got, and ruled out.

When you finish: clean up (kill processes you started, remove scratch files) and leave the work tree as you'd want to inherit it.

## Obsidian Daily Note Rule

Whenever you create a new file in the Obsidian vault (`~/Documents/Personal/`), always add a wikilink to it in that day's daily note at `~/Documents/Personal/Daily/YYYY-MM-DD.md`. Add the link under a `## Claude Sessions` section (create the section if it doesn't exist). If today's daily note doesn't exist yet, create it using the weekday template structure (Meetings / Work Projects / Personal Projects / Ideas / Claude Sessions / Remember).
