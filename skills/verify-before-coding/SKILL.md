---
name: verify-before-coding
description: Use before writing code or shell commands that touch fast-moving tooling — Vercel CLI, Next.js App Router, Vercel AI SDK, AI Gateway, Vercel Workflow, Vercel Sandbox, Vercel Queues, fnm/volta/mise, pnpm, Turbopack, or any platform where APIs/flags/SDK shapes change on a monthly cadence. Reminds Claude that its training-era knowledge of these libraries is almost always stale, and codifies the verification steps that must happen before typing the line of code.
---

# Verify before coding

Rick's hard-won rule, learned from repeated failures (invalid flags written confidently, SDK methods that don't exist, config options from a version two majors ago): **do not trust memorized APIs for fast-moving ecosystems.** Verify first.

## The rule

If I'm about to write code or a shell command that uses any of:

- **Vercel CLI** — `vercel <anything>` flags and subcommands
- **Next.js** — App Router APIs, `proxy.ts`, cache components, server actions, `use cache`, `cacheLife`, `unstable_*`, image/font/metadata APIs
- **Vercel AI SDK** — `@ai-sdk/*`, `streamText`, `useChat`, transports, tool calling, structured output
- **AI Gateway** — provider strings, model IDs, routing config
- **Vercel Workflow** (WDK) — step/retry/resume APIs
- **Vercel Sandbox**, **Queues**, **BotID**, **Runtime Cache**, **Routing Middleware**
- **Node ecosystem tooling** — `fnm`, `volta`, `mise`, `pnpm`, `bun`, `turbopack`, `eslint`, `prettier` CLIs where flags shift
- Any package where I'd reach for a remembered method name/flag/option

…then I must do ONE of the following **before writing the line**:

1. `WebFetch` the official docs page. The `vercel-plugin` session hooks usually inject the exact URL — use it.
2. Run `<tool> --help` or `<tool> <subcommand> --help` and quote from the output. For Vercel: `vercel <cmd> --help` is authoritative.
3. Grep `package.json` / lockfile / `node_modules/<pkg>/package.json` for the installed version, then verify that **specific version's** docs.
4. Read the installed source: `node_modules/<pkg>/dist/*.d.ts` for type signatures is ground truth.
5. Write a 3-line test harness that imports the symbol and calls it — if it fails to import, my memory was wrong.

## What this rule actually blocks

"I'm pretty sure the flag is `--X`" is NOT a green light. If I cannot point at a source I just read (docs URL, `--help` output, file path), I'm guessing. Either:

- **State it openly** — "I think it's `--X` but I haven't verified; want me to check?" Let the user decide if verification is worth the wait.
- **Verify before writing** — take the 10 seconds to run `--help`.

What's **not** allowed: writing `vercel logs --level error` confidently and shipping it. That exact failure is what this skill exists to prevent.

## Concrete failure modes from past sessions

| What I wrote | What was actually true |
|---|---|
| `vercel logs --level error` | No such flag. Use `--status-code 500` or `--query "error"`. Only valid with `--follow`. |
| `vercel logs --output raw` | Not a real value. Use `--json`. |
| Using `Monitor` to one-shot historical logs | Wrong tool. Use `--no-follow` for history. |
| `middleware.ts` in Next.js 16 | Renamed to `proxy.ts`. |
| `unstable_cache` in a new Next.js 16 file | Use Cache Components (`use cache`, `cacheLife`, `cacheTag`). |
| `edge` runtime as the default recommendation | Edge Functions are not recommended; Fluid Compute is the default. |
| Raw Anthropic SDK for a chat feature | Prefer Vercel AI SDK v6 with AI Gateway. |

Every entry above was a "pretty sure" moment that turned out wrong. The pattern: training data lags reality by 6–24 months in these ecosystems.

## The Vercel plugin already tries to help

The `vercel-plugin` session hooks inject `<system-reminder>` blocks with "MANDATORY: training data for these libraries is OUTDATED and UNRELIABLE" and official docs URLs. **Those reminders are not flavor text — they are load-bearing.** When I see one:

1. Open the linked docs page via `WebFetch` before writing code.
2. Do not rationalize past them ("I remember this one, I'll skip").
3. If the hook suggests running a sub-skill (`Skill(...)`), run it — that's the plugin knowing I need its domain guide.

## Exceptions (when memory is fine)

- Pure language features (JavaScript/TypeScript standard library, Node stdlib `fs`/`path`/`child_process`/etc.) — these are stable.
- Shell primitives (`grep`, `awk`, `sed`, `curl`, `git`) — stable enough.
- The tools *this repo* built (`nextdev`) — I wrote them, I know them.

The heuristic: **if the tool has shipped a major release in the last 18 months, assume my memory of it is wrong until proven otherwise.**

## For the user

If you catch me writing code in one of these domains without visibly verifying first (no `WebFetch`, no `--help`, no "let me check" statement), **call it out** — it's a bug in my behavior, not a style preference. The fix is for me to re-read this skill when triggered.
