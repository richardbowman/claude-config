---
name: vercel-logs
description: Retrieve and filter historical Vercel deployment logs (errors, 500s, specific queries) using the Vercel CLI. Use whenever the user asks to investigate a past production issue on Vercel, find out why a request failed, inspect logs for a specific deployment URL, or filter by status code / substring. Covers the correct flag combinations and the invalid flags that silently (or loudly) fail.
---

# Vercel historical logs

Recipe for pulling **historical** logs from Vercel deployments — i.e., one-shot investigations of past errors, not live tailing.

## The working recipe

```sh
# 1. Resolve the deployment ID from a URL
vercel inspect https://myapp-xyz123.vercel.app
#   → prints metadata including `id  dpl_abc123...`

# 2. Pull historical logs, filtered as needed
vercel logs dpl_abc123 --no-follow                          # all recent logs
vercel logs dpl_abc123 --no-follow --status-code 500        # errors only
vercel logs dpl_abc123 --no-follow --query "error"          # substring filter
vercel logs dpl_abc123 --no-follow --json | jq '.message'   # structured
```

Key detail: **`--no-follow` is required for historical lookups.** Without it, `vercel logs` streams forever and blocks the shell.

## Flag cheat sheet

| Flag | Purpose |
|---|---|
| `--no-follow` | One-shot; returns historical logs and exits. Default is to tail. |
| `--status-code <N>` | Filter by HTTP status (e.g. `500`, `4xx`). Only valid historically. |
| `--query <str>` | Substring filter against log messages. |
| `--json` | Machine-readable output — pipe to `jq`. |
| `--follow` | Live tail. Use for debugging in-progress issues, not history. |
| `--since <duration>` | e.g. `--since 1h`, `--since 2024-01-15`. |
| `--output <raw\|short>` | Display format. |

## Things that don't work (save yourself the guessing)

- **`--level error`** — not a flag for `vercel logs`. Silently errors out unless combined with `--follow` (even then, misleading). Use `--status-code 500` or `--query "error"` instead.
- **`--output raw`** — not a real value. Use `--json` for raw structured output, or omit for human-readable.
- **Streaming a historical lookup with Monitor / background tasks** — wrong tool. `--follow` is for active debugging; `--no-follow` exits cleanly and is what you want for "what errored yesterday."
- **`vercel logs <url>`** directly — works sometimes but resolves ambiguously; `vercel inspect <url>` to get the `dpl_` ID first is more reliable, especially for older deployments.

## Typical investigations

**"Why did this production deploy throw 500s yesterday?"**
```sh
DPL=$(vercel inspect https://prod-url --token=... 2>&1 | awk '/^\s*id\s/ {print $2}')
vercel logs "$DPL" --no-follow --status-code 500 --since 24h
```

**"Find all logs mentioning 'PrismaClientKnownRequestError' on the latest prod deployment":**
```sh
vercel logs $(vercel inspect --yes $(vercel ls --prod | head -2 | tail -1 | awk '{print $2}') | awk '/^\s*id\s/ {print $2}') \
  --no-follow --query "PrismaClientKnownRequestError" --json | jq '.message'
```

**"Which route is erroring?"**
```sh
vercel logs "$DPL" --no-follow --status-code 500 --json \
  | jq -r '[.path, .statusCode, .message] | @tsv' \
  | sort | uniq -c | sort -rn | head
```

## Live debugging (separate flow)

When the user wants to *watch* logs as an issue unfolds, `--follow` is right, and run it in the background so the shell stays usable:

```sh
vercel logs "$DPL" --follow --status-code 500
```

From Claude Code: start this as a background Bash command and use `BashOutput` / `Monitor` to stream lines. For **historical** investigations, do NOT use background streaming — use `--no-follow` and read the one-shot output.

## Prereqs

- `vercel` CLI installed (`npm i -g vercel`) and authenticated (`vercel login` or `VERCEL_TOKEN`).
- Project linked (`vercel link`) or pass `--scope <team>` when outside a linked repo.

## When not to use this

- Very old deployments may have logs outside the retention window — Vercel's Observability / log drains persist longer. If `vercel logs --no-follow` returns empty for a known-failed deploy, check the dashboard or any configured log drain (Datadog, Axiom, etc.).
