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

## Monitoring a deployment until Ready (commit-pinned)

Use this after `git push` to watch a specific commit's build reach Ready — not the next deployment that happens to show up at the top of `vercel ls`.

### Key gotchas discovered in testing

- **`vercel ls` table goes to stderr, not stdout** — always use `2>&1`, otherwise you only get bare URLs with no status column.
- **`awk '{print $N}'` breaks on variable column widths** — use `grep -oE '(Ready|Building|Error)'` to extract the status word instead.
- **Pinning to the commit SHA via the REST API** is the reliable approach for git-push-triggered deploys; `vercel inspect` does not expose the commit SHA in CLI output.

### Recipe

```bash
# Read token from CLI auth store
TOKEN=$(cat ~/.local/share/com.vercel.cli/auth.json | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
TEAM_ID="team_xxxx"       # from .vercel/project.json → orgId
PROJECT_ID="prj_xxxx"     # from .vercel/project.json → projectId
SHA=$(git rev-parse HEAD)

# 1. Wait for Vercel to register the deployment for this commit
while true; do
  DEPLOY_URL=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "https://api.vercel.com/v6/deployments?teamId=$TEAM_ID&projectId=$PROJECT_ID&target=production&limit=5" \
    | python3 -c "
import sys, json
data = json.load(sys.stdin)
for d in data['deployments']:
  if d.get('meta', {}).get('githubCommitSha') == '$SHA':
    print(d['url'])
    break
")
  [[ -n "$DEPLOY_URL" ]] && break
  echo "waiting for deployment to appear..."
  sleep 10
done

# 2. Monitor that URL until Ready or Error
while true; do
  ROW=$(vercel ls 2>&1 | grep "$DEPLOY_URL")
  STATUS=$(echo "$ROW" | grep -oE '(Ready|Building|Error)')
  echo "$DEPLOY_URL — ${STATUS:-unknown}"
  [[ "$STATUS" == "Ready" ]] && echo "READY — deployment live" && exit 0
  [[ "$STATUS" == "Error" ]] && echo "BUILD FAILED" && exit 1
  sleep 15
done
```

Run step 2 via the `Monitor` tool so notifications land in the chat automatically.

## When not to use this

- Very old deployments may have logs outside the retention window — Vercel's Observability / log drains persist longer. If `vercel logs --no-follow` returns empty for a known-failed deploy, check the dashboard or any configured log drain (Datadog, Axiom, etc.).
