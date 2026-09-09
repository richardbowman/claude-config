# Claude Code — User-Level Guidelines

## Web Browsing Escalation

Use WebSearch → WebFetch → `agent-browser` in that order. Skip straight to `agent-browser` for JS-heavy sites, retail/e-commerce, or anything that returns a 403 or empty shell via WebFetch.

## Interactive Browser Testing

**When you need to test interactive UI features** (click buttons, fill forms, verify modals open, test JavaScript interactions), do NOT run `agent-browser` inline yourself. Delegate to the `qa-engineer` subagent instead — it owns the full verification protocol (loading agent-browser skills, running the interaction steps, what counts as a pass) and reports back only a terse PASS/FAIL verdict, keeping screenshots/DOM dumps/click logs out of your context entirely.

Do NOT claim features are "fully tested" based only on:
- TypeScript compilation passing
- Dev server starting
- Checking static HTML output with `curl`
- Opening a URL in a browser without interaction

Spawn the QA subagent with a self-contained prompt: what changed, the URL/route to test, the exact interaction steps to perform, and what "pass" looks like. Skip the subagent hop only for a genuinely trivial one-off check the user is watching interactively in real time — not for routine "verify this feature works" steps in an autonomous task.

**Exception — prototype repos.** On a repo in prototype mode (see **Prototype Mode**), do not spawn `qa-engineer` for UI verification. Hand the user the route and the exact clicks instead. State plainly that you have not driven the UI yourself, so an untested claim is never mistaken for a verified one.

`qa-engineer` is defined in the **`bankrate-prototypes/agentic-pm-playbook`** repo at `agents/qa.md` — the filename is `qa.md`, and the frontmatter `name: qa-engineer` is what registers, so searching the filesystem for `*qa-engineer*` finds nothing. It reaches `~/.claude/agents/` as a symlink into that checkout, the same pattern as `bankrate.md`, `creative.md`, and `engineering.md`. The playbook's own `setup.sh` is the supported installer.

**The Skills Manager cannot deliver agents.** It renders `~/.claude/agents/` as a read-only viewer — no Save, no Delete, no install path. Registering a skill source will never make an agent appear, no matter how long you wait. Only the bootstrap installers (`claude-config/bootstrap.ts`, `br-claude-config/setup.sh`, `agent-pm-playbook/setup.sh`) or a Claude Code plugin install can do that.

> [!warning] Duplicate-registration hazard
> `~/.claude/agents/qa-engineer.md` is currently a hand-made link. The playbook's `setup.sh` symlinks by *filename*, so it would create `qa.md` pointing at the same file — two links, one agent, registered twice. If both ever exist, delete one.

If the Agent tool doesn't list `qa-engineer`, the symlink is missing or the session predates it — **fall back to `engineering` and say so.** Never report having delegated to an agent that wasn't actually available.

### Never open a visible browser window

Browser automation runs **headless**. A window appearing on screen during an autonomous task is a defect, not a convenience — it steals focus, and it means the run can't happen unattended.

`agent-browser` is already headless by default (`--headless=new`), and no config file on this machine overrides that. Windows appear *only* because an agent explicitly asked for one. **Do not use any of these** unless the user asks to watch a run live, in that message:

- `--headed` / `AGENT_BROWSER_HEADED=1` — shows a window.
- `--auto-connect` — attaches to the user's **already-running Chrome** and drives their real browser, opening tabs in front of them.
- `--profile Default` — borrows the user's live Chrome profile. Use a dedicated profile *directory* instead (`--profile ~/.agent-browser/<name>-profile`), which stays headless.
- `playwright test --headed`, `--ui`, `--debug`, and `playwright show-report` — all open windows. Use `--reporter=list`.

**Auth is the reason agents reach for `--headed`, and it is a solved problem.** Vercel Deployment Protection (SSO) bounces anonymous requests with a 302 to `vercel.com/sso-api`, and the tempting fix is a headed real-Chrome login. Escalate in this order instead, stopping at the first that works:

1. **Vercel protection-bypass secret** — fully headless, no login at all. `PATCH /v1/projects/{id}/protection-bypass` with body `{}` to generate (a caller-supplied `generatedSecret` is rejected with a 400), then pass the secret as a **query param**, not a header. Revoke when done — and note revocation takes ~20–40s to reach the edge, so re-test until you *observe* the 302 rather than trusting the control plane's `protectionBypass: {}`.
2. **Saved auth state** — `agent-browser auth save` / `--state <path>` / `--restore`. One interactive login, reused headlessly indefinitely.
3. **`--headers`** for token-authenticated endpoints.
4. **Ask the user.** If none of the above works, say so and stop. Never fall back to a headed window on your own initiative.

Same rule for Electron E2E: launch hidden/offscreen rather than letting the app window appear.

## Google Workspace CLI (`gws`)

Use the `gws` CLI for **all** Google Workspace operations. Never use raw `curl`, `rclone`, or `gdrive` — `gws` is already authenticated. Use `gws schema <service>.<resource>.<method>` to discover any method's parameters before calling it.

## Scripting Language

Always write scripts in TypeScript/Node.js. Never use Python for scripts. Node v22.6+ runs TypeScript natively (no `tsx`, `ts-node`, or compilation step needed) — use a `#!/usr/bin/env node` shebang and write `.ts` files directly.

## Settings Files

`~/.claude/settings.json` is a symlink to a per-machine file in this repo's `settings/` directory. The repo's own clone path varies by machine (e.g. `~/claude-config` on one machine, `~/GitHub/claude-config` on another) — use `realpath ~/.claude/settings.json` (or `realpath ~/.claude/CLAUDE.md` for this file) to confirm the actual location on the machine you're on before assuming a path. Edit the per-machine file directly. See [[Claude Config Architecture]] for the full setup.

## Vercel Sensitive Env Vars Show Empty via CLI

`vercel env ls` and `vercel env pull` always show `""` for env vars flagged "Sensitive" in the Vercel dashboard — this is by design (write-only, unreadable via CLI/API for security), not evidence the variable is unset. **Never conclude a Vercel env var is "missing" or "empty" from CLI output alone.** To check whether a sensitive var actually has a value, either: ask the user, check the Vercel dashboard UI (shows "Value is sensitive" vs no value at all), or test behaviorally (hit the deployed endpoint that depends on it and see if it functions).

## API Probing

When an API's correct request shape is unclear, **write a throwaway Node.js probe script first** — before touching app code. The script should: (1) hit the API directly with stored credentials, (2) try each candidate approach, (3) log the response to confirm the winner. Never modify app code just to test an API hypothesis.

## Prototype Mode

Some repos are prototypes: demo surfaces, spikes, v0 experiments, throwaway UI. The full lifecycle flow below is calibrated for production code and is **actively harmful** on a prototype — it turns a one-line copy change into a 30-minute round trip through nested subagents.

**A repo is in prototype mode when its `CLAUDE.md` or `AGENTS.md` contains the line `Repo mode: prototype`.** Check for it before starting work. The user can also declare it for a session in chat.

In prototype mode, these four things change:

1. **No gating on individual changes.** Make the edit, confirm the affected route compiles and renders in the running dev server, report in 2–3 lines with the URL. Do **not** run the test suite, lint, E2E, or screenshots for a routine change. The user is looking at the browser; that is the feedback loop.

   **A failing test is not a stop-and-fix signal.** If a unit or component test happens to be running already (a watch-mode runner, a test file the edit touched, anything incidental to the rev loop) and it fails, do not pause to investigate or fix it inline — chasing it is exactly the slowness this mode exists to avoid. Append one line to `PROTOTYPE_PUNCHLIST.md` at the repo root (create it if missing) with the test name/file and a one-line description of the failure, then keep moving and show the user the result immediately, same as any other routine change. Never let a failing test delay showing the user what they asked to see.

2. **Full gate at milestones only.** When the user signals the work is going in front of someone — "ready to show", "ship it", "commit this", "demo this", "open a PR" — *then* run everything: typecheck, lint, unit, E2E, screenshot regeneration — including resolving every item in `PROTOTYPE_PUNCHLIST.md`, then clearing the file. One thorough pass at the end beats twelve partial ones along the way.

3. **Write the code directly.** Do not spawn an engineer subagent for prototype code (see the prototype exception in the `chief-of-staff` skill). Each hop re-reads the repo from cold, which is most of the 30 minutes.

4. **The user is the QA loop.** Do not spawn `qa-engineer` to drive prototype UI. Point at the route and the exact clicks; they will verify in the browser in front of them.

**Screenshots in a prototype are disposable output, never a test oracle.** Regenerate them only on request or at a milestone. A pixel diff against a committed PNG is *not* a regression signal — the committed artifact is at least as likely to be stale. Never build a worktree, reinstall dependencies, or run a bisect to explain a screenshot diff on a prototype; say the artifact looks stale and move on.

**What prototype mode does NOT relax:** the task list and the final report (steps 2–5 below still apply), "verified means observed" for whatever you *do* claim, "two failures means change strategy", and every confirmation boundary in `chief-of-staff`. Moving faster never means reporting something as working that you did not watch work.

### One thread per checkout

Before editing, if another thread is already running against the same working directory, **stop and tell the user** rather than editing alongside it. Concurrent agents in one checkout produce half-finished intermediate states.

Corollary: a red typecheck or failing test in a tree another live thread is editing is **someone's in-flight edit, not a bug.** Report it as a collision. Do not investigate it, and do not fix it — the owning thread will.

## Task Procedure

Follow this procedure for every substantial task on production code. It is not optional. On prototype repos, see **Prototype Mode** above — steps 2–5 still apply, but the per-change verification in step 3 collapses to "does the page render", and the full gate moves to milestones. When spawning subagents for extended autonomous work, propagate this section into their prompts.

1. **Check the skills list** and invoke any matching skill before writing commands or starting work.

2. **Before starting work**, use `TaskCreate` to create a task list with one item per requirement, plus a final item: "End-to-end verification of every requirement". All items start `pending`. Use `TaskUpdate` to mark items `in_progress` and `completed` as you go. (In standard Claude Code outside this plugin, the equivalent tool is `TodoWrite`/`TodoRead`.)

3. **Work one item at a time.** Mark it `in_progress` before starting. After completing each item, verify it against its requirement (observed output, not assumption), then mark it `completed`.

4. **After all items are completed except the last:** verify every requirement end-to-end exactly as a user would encounter it. Re-read the original brief line by line. Fix anything that fails and re-verify. Only then mark the final item completed.

5. **Your final report must list each requirement** with how it was verified and the observed result. Any requirement not verified must be listed as NOT VERIFIED.

Two principles govern everything above:

- **Verified means observed.** Never report something done unless you watched it work. "Should work" is a prediction, not a result.

- **Two failures means change strategy.** Do not retry the same approach a third time. Read the error, inspect actual state, form a new hypothesis. If blocked, report precisely: what you did, expected, got, and ruled out.

When you finish: clean up (kill processes you started, remove scratch files) and leave the work tree as you'd want to inherit it.

## Vault Path

The vault — opened in Geode — is:

```
/Users/rickbowman/Library/Mobile Documents/com~apple~CloudDocs/Documents/Personal
```

It is the folder containing `.obsidian/`, `Daily/`, and `Products/`. The path
contains spaces — quote it in shell commands.

**`~/Documents/Personal` is NOT the vault.** A directory does exist there, and it
is a partial shadow: it has `X Bookmarks/` and a `.geode/` config dir, but no
`Daily/`, no `Products/`, and no `.obsidian/`. So a lookup there fails with
`No such file or directory` rather than an obvious wrong-place error, and writes
land somewhere nothing else reads. If a vault lookup comes back empty,
**re-check the path before concluding the file is missing** — treating a failed
lookup as evidence of absence has already produced a false "this work was never
verified" claim that had to be retracted from Compass.

This path is specific to the machine where the "Personal" vault lives under iCloud.
On a different machine (or a different vault entirely, e.g. the BankRate
consulting vault, which has its own project-level `CLAUDE.md` and lives at a
different, non-iCloud path), confirm the actual vault root rather than assuming
this one — the underlying lesson (verify before concluding a lookup miss means
"missing") generalizes even where the literal path doesn't.

## Daily Note Rule

Whenever you create a new file in the vault, always add a wikilink to it in that day's daily note at `<vault>/Daily/YYYY-MM-DD.md`. Add the link under a `## Claude Sessions` section (create the section if it doesn't exist). If today's daily note doesn't exist yet, create it using the weekday template structure (Meetings / Work Projects / Personal Projects / Ideas / Claude Sessions / Remember).

## Database Stack — Aurora DSQL (Non-Negotiable)

This stack uses **Aurora DSQL with Vercel OIDC authentication**. This is the decided, permanent choice.

- **Never recommend Neon, PlanetScale, Railway, Supabase, or any other managed Postgres provider** as an alternative to Aurora DSQL — not as a "simpler option", not as a fallback, not as anything.
- If database issues arise (connection errors, IAM failures, migration problems), **fix the DSQL/IAM setup**. Diagnose the root cause: trust policy conditions, OIDC subject claims, adapter configuration, schema issues. Do not suggest switching providers.
- The env vars (`PGHOST`, `PGUSER`, `PGDATABASE`, `PGPORT`, `PGSSLMODE`, `AWS_ROLE_ARN`, `AWS_REGION`) are set correctly for Aurora DSQL. If they seem unusual compared to other stacks, that is expected — Aurora DSQL uses IAM/OIDC auth, not a connection string.

## Repository Workflows

Use the backing Git repository as the canonical source for repository-owned files. Make changes in an isolated worktree on a feature branch, then use normal Git commits, pushes and pull requests. Preserve unrelated changes. Vault copies are optional reference mirrors; Vault Bridges is not required for editing, publication or delivery. Do not block work on bridge availability or automatically publish via bridge commands. Invoke vault-bridge only when explicitly asked to synchronize a mirror; older mandatory bridge instructions are superseded. Ordinary vault notes remain editable in the vault. Reconcile vault-only repository edits into the worktree deliberately before committing.

## PR Deploy Monitoring

After opening a PR on a Vercel-deployed project, automatically watch for the preview deploy and smoke-test it once it's ready — do not ask for permission first. This is standing approval, consistent with the `vercel-tools` skill's proactive-invoke rule. Only interrupt the user if the smoke test surfaces a real problem (deploy failed, route errors, a migration is needed, etc.); otherwise just report the result once it's done.
