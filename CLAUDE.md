# Claude Code — User-Level Guidelines

Lean rules plus triggers. Detail lives in vault runbooks (`Agent How-Tos/`, index: [[Agent How-Tos/Agent How-Tos]]). When a trigger below matches, read the note **before** acting. The condensed rule is binding even if you skip the note.

## Asking Questions
Use `AskUserQuestion` for genuine forks that reduce to 2-4 mutually exclusive options (first option = recommended; batch up to 4). Otherwise pick the sensible default, say so, and proceed. Never use it for plan approval.
Before asking the user anything, read [[Agent How-Tos/Task Procedure and Gates]].

## Gates Are Not Questions
- **Never ask whether to run or waive a gate** (QA, pr-checklist, E2E, screenshots). There is no waiver; `BLOCKED: no QA on record` is a to-do list, not a decision. On `Repo mode: prototype` repos the gate does not apply.
- List all verification (tsc, tests, build, E2E, screenshots, QA) in the plan at the start.
- Ask every real question in one batch in the first turn; mid-task stops only for the genuinely unforeseeable.
- Subagents inherit this: put it in their prompts.
Before planning a coding task, opening a PR, or spawning a subagent, read [[Agent How-Tos/Task Procedure and Gates]].

## Task Procedure
Substantial production work: check skills first; `TaskCreate` one item per requirement plus a final "End-to-end verification of every requirement"; one item at a time; final report lists each requirement with how it was verified.
- **Verified means observed.** Never report done unless you watched it work.
- **Two failures means change strategy.** Do not retry a third time; form a new hypothesis.
Details and full steps: [[Agent How-Tos/Task Procedure and Gates]].

## Prototype Mode
A repo with the line `Repo mode: prototype` in its `CLAUDE.md`/`AGENTS.md` (or declared in chat): no per-change test/lint/E2E/screenshots, write code directly (no engineer subagent), no `qa` subagent; user is the QA loop. Full gate only at milestones. Failing tests go to `PROTOTYPE_PUNCHLIST.md`. Another live thread in the same checkout: stop and tell the user.
Before working in a prototype repo, read [[Agent How-Tos/Prototype Mode]].

## Machine Capacity (10 cores, 16 GB; 15 sessions once hit load 44 and crashed it)
- **Heavy work (full tests, large typecheck, E2E, builds, dev servers) goes to the homelab first:** `tq submit --repo <org/repo> --sha <40-hex> --profile <p> --wait` (check `tq workers`; exit 0 = pass) or `ssh dev-builder`. Run locally only if unreachable, and say so in the report.
- Local runs: check `uptime; sysctl -n hw.ncpu` first. Load >= cores means **wait, do not skip** — load delays a gate, never shrinks it. Never "just try it anyway".
- Playwright: cap with `--workers=2` or `workers: '20%'` in config (no env var exists).
- Prefer the narrowest command; reuse a running dev server (`nextdev list`); no unattended background builds.
- Clean up before finishing: `nextdev stop` (never `pkill`), `browser_close`, no leftover Playwright workers.
Before any expensive local run or homelab decision, read [[Agent How-Tos/Machine Capacity Details]] (also [[Agent How-Tos/Test Worker Pool]]).

## Browsing and Browser Testing
Ladder: WebSearch, then WebFetch/`defuddle`, then the in-app browser (`browser_*`, when listed). Never open a visible/headed browser window; ask the user rather than improvising for gaps (Electron apps, bot evasion, saved auth, iframes, uploads, multiple tabs). Test interactive UI by delegating to the `qa` subagent (not prototype repos); TypeScript passing, dev server up, `curl` HTML, or an un-interacted page load is not "tested". Use the Agent tool's actual agent names (`architect`, `engineer`, `pm`, `qa`, `release-manager`, `reviewer`) and name the one you used.
Before browsing, browser testing, or delegating to `qa`, read [[Agent How-Tos/Web Browsing and Browser QA]].

## Vercel
Sensitive env vars show `""` via CLI by design — never conclude one is missing from CLI output. Protected deployments (302 to `vercel.com/sso-api`): use the protection-bypass secret; 1Password stores it under field `credential`, not `password`.
Before touching Vercel protection, bypass secrets, or env vars, read [[Agent How-Tos/Vercel Protection Bypass and Env Vars]].

## 1Password CLI (`op`)
Every `op` call can raise a Touch ID dialog. Check env vars first (`env | grep -i <name>`); **never run `op` in parallel, enumerate, or retry a failed/timed-out call**; one call per secret, use `timeout 20`.
Before any `op` command, read [[Agent How-Tos/1Password CLI Rules]].

## Google Workspace
Prefer `mcp__google-*` tools for Drive/Docs/Sheets/Slides; use `gws` for everything else (Gmail, Calendar, Tasks, etc.) and for sharing, deletes, comments, revisions. Never raw `curl`, `rclone`, or `gdrive`.
Before using Google Workspace, read [[Agent How-Tos/Google Workspace Tools]].

## Scripts and API Probing
**Write scripts in TypeScript/Node.js, never Python** (Node 22.6+ runs `.ts` natively). If an API's request shape is unclear, write a throwaway Node probe script first; don't edit app code to test a hypothesis.
Before writing a script or probing an API, read [[Agent How-Tos/Scripting and API Probing]].

## Repos, PRs, Settings
Repo is the source of truth for repo-owned files: isolated worktree on a feature branch, normal commits/PRs, preserve unrelated changes; vault copies are optional mirrors (no bridge publishing unless asked). After opening a PR on a Vercel project, watch the preview deploy and smoke-test it without asking. `~/.claude/settings.json` and `CLAUDE.md` are symlinks into the `claude-config` repo (`realpath` to find it).
Before editing repo-owned files, opening a PR, or changing settings, read [[Agent How-Tos/Repository and PR Workflow]].

## Vault
**Never hard-code a vault root** (it comes from session context; use vault-relative paths; quote it in shell). **Whenever you create a vault file, link it from today's `Daily/YYYY-MM-DD.md` under `## Claude Sessions`.** An empty vault lookup means re-check the path, not that the file is missing.
Before creating or looking up vault files, read [[Agent How-Tos/Vault Conventions]].
