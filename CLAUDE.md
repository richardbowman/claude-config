# Claude Code — User-Level Guidelines

## Web Browsing Escalation

Use WebSearch → WebFetch → `agent-browser` in that order. Skip straight to `agent-browser` for JS-heavy sites, retail/e-commerce, or anything that returns a 403 or empty shell via WebFetch.

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

2. **Before starting work**, use `TaskCreate` to create a task list with one item per requirement, plus a final item: "End-to-end verification of every requirement". All items start `pending`. Use `TaskUpdate` to mark items `in_progress` and `completed` as you go. (In standard Claude Code outside this plugin, the equivalent tool is `TodoWrite`/`TodoRead`.)

3. **Work one item at a time.** Mark it `in_progress` before starting. After completing each item, verify it against its requirement (observed output, not assumption), then mark it `completed`.

4. **After all items are completed except the last:** verify every requirement end-to-end exactly as a user would encounter it. Re-read the original brief line by line. Fix anything that fails and re-verify. Only then mark the final item completed.

5. **Your final report must list each requirement** with how it was verified and the observed result. Any requirement not verified must be listed as NOT VERIFIED.

Two principles govern everything above:

- **Verified means observed.** Never report something done unless you watched it work. "Should work" is a prediction, not a result.

- **Two failures means change strategy.** Do not retry the same approach a third time. Read the error, inspect actual state, form a new hypothesis. If blocked, report precisely: what you did, expected, got, and ruled out.

When you finish: clean up (kill processes you started, remove scratch files) and leave the work tree as you'd want to inherit it.

## Obsidian Daily Note Rule

Whenever you create a new file in the Obsidian vault (`~/Documents/Personal/`), always add a wikilink to it in that day's daily note at `~/Documents/Personal/Daily/YYYY-MM-DD.md`. Add the link under a `## Claude Sessions` section (create the section if it doesn't exist). If today's daily note doesn't exist yet, create it using the weekday template structure (Meetings / Work Projects / Personal Projects / Ideas / Claude Sessions / Remember).

## Database Stack — Aurora DSQL (Non-Negotiable)

This stack uses **Aurora DSQL with Vercel OIDC authentication**. This is the decided, permanent choice.

- **Never recommend Neon, PlanetScale, Railway, Supabase, or any other managed Postgres provider** as an alternative to Aurora DSQL — not as a "simpler option", not as a fallback, not as anything.
- If database issues arise (connection errors, IAM failures, migration problems), **fix the DSQL/IAM setup**. Diagnose the root cause: trust policy conditions, OIDC subject claims, adapter configuration, schema issues. Do not suggest switching providers.
- The env vars (`PGHOST`, `PGUSER`, `PGDATABASE`, `PGPORT`, `PGSSLMODE`, `AWS_ROLE_ARN`, `AWS_REGION`) are set correctly for Aurora DSQL. If they seem unusual compared to other stacks, that is expected — Aurora DSQL uses IAM/OIDC auth, not a connection string.

## Vault Bridge Sync

Some vault folders are backed by git repos via the Vault Bridges plugin. After writing or editing any file in a bridged vault folder, invoke the `vault-bridge` skill to push the change to the git repo. Never manually `cp` between vault and repo. Never use raw `git` commands against the repo after writing to the vault — the bridge command handles commit and push.

## QA / Visual Verification Reporting

The built-in `qa` subagent persona defaults to **not** writing report files — its
own instructions say to return findings only in its final message. That's fine
when it runs in the foreground, but when it runs as a background subagent (via
the `Agent` tool), its final message is invisible to the user unless I relay
it — and none of its intermediate work (screenshots, viewport checks, live
verification steps) survives at all. Confirmed by direct test: creating a
custom `~/.claude/agents/qa.md` does **not** override this persona — the fixed
agent roster (`qa`, `engineer`, `reviewer`, etc.) is hardcoded in the host, not
read from `.claude/agents/*.md`. Don't retry that approach.

The fix has to happen at call time, every time:

- Whenever spawning **any** subagent (qa, engineer, or otherwise) to run
  tests, do visual/screenshot verification, or smoke-test a live URL, the
  prompt I give it must explicitly override the default and instruct it to
  write a persistent report before returning — do not rely on the subagent's
  own judgment to do this unprompted.
- Report goes in the project's per-run vault note:
  `~/Documents/Personal/Products/<Project>/Runs/<project-slug>-<YYYY-MM-DD>-*.md`
  (today's date; append to the existing note for today if one exists, else
  create one) — under a `## QA Report — <HH:MM>` section: what was tested,
  method (automated command + pass/fail counts, or manual/visual tool used),
  explicit pass/fail per item, and anything not verified called out as NOT
  VERIFIED.
- Screenshots must be **embedded as actual images**, not described in prose.
  Save under `~/Documents/Personal/Attachments/QA/<Project>/<YYYY-MM-DD>-<slug>/`
  and embed with `![[Attachments/QA/<Project>/.../file.png]]`.
- The subagent's final message back to me must state the exact vault path it
  wrote to — that path is the only durable evidence the work happened.
- The `pr-checklist` skill's visual-verification and screenshot steps already
  encode these mechanics — when a subagent is running that skill, tell it to
  follow those steps as written rather than re-deriving the report format.

## PR Deploy Monitoring

After opening a PR on a Vercel-deployed project, automatically watch for the preview deploy and smoke-test it once it's ready — do not ask for permission first. This is standing approval, consistent with the `vercel-tools` skill's proactive-invoke rule. Only interrupt the user if the smoke test surfaces a real problem (deploy failed, route errors, a migration is needed, etc.); otherwise just report the result once it's done.