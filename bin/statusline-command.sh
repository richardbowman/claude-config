#!/usr/bin/env bash
#
# Reference status-line script for the Claude Threads "Context footer command".
#
# Emits a JSON array of status tags (see the StatusTag type / ADR-0001), so the
# plugin can render typed pills and derive the thread's PR url from a kind:"pr"
# tag — no prose scanning. Plaintext output still works (legacy fallback), but
# JSON lets you split branch/PR/dev/AWS into distinct, clickable pills.
#
# stdin: { "cwd": "...", "workspace": { "current_dir": "..." } }
# stdout: [{ "label": "...", "url": "...", "kind": "...", "tone": "..." }, ...]
#
# Requires: jq, git, gh (and optionally aws). The plugin prepends the common
# Homebrew/local bin dirs to PATH, so these resolve under Obsidian's exec env.

input=$(cat)
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // empty')
provider=$(echo "$input" | jq -r '.provider // empty')

branch=""; remote=""
if [ -n "$cwd" ]; then
  branch=$(git -C "$cwd" --no-optional-locks symbolic-ref --short HEAD 2>/dev/null)
  remote=$(git -C "$cwd" --no-optional-locks remote get-url origin 2>/dev/null)
fi

tags='[]'
add() { tags=$(jq -c --argjson t "$1" '. + [$t]' <<<"$tags"); }

# dev url — nextdev port lookup with an alive check
if [ -n "$cwd" ]; then
  abs_cwd=$(cd "$cwd" && pwd -P 2>/dev/null)
  if [ -n "$abs_cwd" ]; then
    hash=$(printf '%s' "$abs_cwd" | shasum | cut -c1-12)
    sd="${XDG_STATE_HOME:-$HOME/.local/state}/nextdev/$hash"
    if [ -f "$sd/port" ] && [ -f "$sd/pid" ]; then
      pid=$(cat "$sd/pid"); port=$(cat "$sd/port")
      if kill -0 "$pid" 2>/dev/null; then
        add "$(jq -nc --arg u "http://localhost:$port" '{label:$u,url:$u,kind:"dev"}')"
      fi
    fi
  fi
fi

# branch
[ -n "$branch" ] && add "$(jq -nc --arg b "$branch" '{label:$b,kind:"branch"}')"

# PR for the branch — emit a url so the plugin derives prUrl correctly
if [ -n "$branch" ] && [ -n "$remote" ]; then
  pr_json=$(gh pr view "$branch" --repo "$remote" --json number,url 2>/dev/null)
  if [ -n "$pr_json" ]; then
    n=$(jq -r '.number' <<<"$pr_json"); u=$(jq -r '.url' <<<"$pr_json")
    add "$(jq -nc --arg l "PR #$n" --arg u "$u" '{label:$l,url:$u,kind:"pr"}')"
  fi
fi

# Vercel preview URL for the current branch — reads .vercel/project.json from repo root
if [ -n "$branch" ] && [ -n "$cwd" ]; then
  # .vercel/ is gitignored — not present in worktrees. Walk up via git-common-dir
  # to find it in the main repo root instead.
  git_common=$(git -C "$cwd" --no-optional-locks rev-parse --git-common-dir 2>/dev/null)
  repo_root=""
  if [ -n "$git_common" ]; then
    case "$git_common" in
      /*) repo_root=$(dirname "$git_common") ;;  # absolute path → worktree case
      *)  repo_root="$cwd" ;;                    # relative ".git" → already main repo
    esac
  fi
  vercel_proj="${repo_root:+$repo_root/}.vercel/project.json"
  if [ -f "$vercel_proj" ]; then
    v_project_id=$(jq -r '.projectId // empty' "$vercel_proj" 2>/dev/null)
    v_org_id=$(jq -r '.orgId // empty' "$vercel_proj" 2>/dev/null)
    # Token lives in macOS Application Support; fall back to XDG path on Linux
    vercel_token=""
    for tf in \
      "$HOME/Library/Application Support/com.vercel.cli/auth.json" \
      "$HOME/.config/vercel/auth.json" \
      "${XDG_CONFIG_HOME:-$HOME/.config}/vercel/auth.json"; do
      if [ -f "$tf" ]; then
        vercel_token=$(jq -r '.token // empty' "$tf" 2>/dev/null)
        [ -n "$vercel_token" ] && break
      fi
    done

    if [ -n "$v_project_id" ] && [ -n "$vercel_token" ]; then
      cache_key=$(printf '%s/%s' "$v_project_id" "$branch" | shasum | cut -c1-12)
      cache_file="/tmp/statusline-vercel-$cache_key"
      preview_url=""

      # Use cached result if < 5 min old
      if [ -f "$cache_file" ]; then
        age=$(( $(date +%s) - $(stat -f%m "$cache_file" 2>/dev/null || stat -c%Y "$cache_file" 2>/dev/null || echo 0) ))
        [ "$age" -lt 300 ] && preview_url=$(cat "$cache_file")
      fi

      if [ -z "$preview_url" ]; then
        enc_branch=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$branch" 2>/dev/null || printf '%s' "$branch")
        team_param=""
        case "$v_org_id" in team_*) team_param="&teamId=$v_org_id" ;; esac

        # Step 1: find the deployment UID for this branch
        api_resp=$(curl -sf --max-time 4 \
          -H "Authorization: Bearer $vercel_token" \
          "https://api.vercel.com/v6/deployments?projectId=${v_project_id}&meta.githubCommitRef=${enc_branch}&limit=1&state=READY&target=preview${team_param}" \
          2>/dev/null)
        dep_uid=$(printf '%s' "$api_resp" | jq -r '.deployments[0].uid // empty' 2>/dev/null)
        fallback_url=$(printf '%s' "$api_resp" | jq -r '.deployments[0].url // empty' 2>/dev/null)

        if [ -n "$dep_uid" ]; then
          # Step 2: fetch full deployment via v13 to get the alias array —
          # same approach as vercel-wait-deploy.ts: pick shortest alias,
          # which is the stable branch alias (not the per-commit hash URL).
          team_q=""
          case "$v_org_id" in team_*) team_q="?teamId=$v_org_id" ;; esac
          dep_resp=$(curl -sf --max-time 4 \
            -H "Authorization: Bearer $vercel_token" \
            "https://api.vercel.com/v13/deployments/${dep_uid}${team_q}" \
            2>/dev/null)
          alias_url=$(printf '%s' "$dep_resp" | jq -r '
            if (.alias | length) > 0
            then (.alias | sort_by(length) | .[0])
            else ""
            end' 2>/dev/null)
          if [ -n "$alias_url" ]; then
            preview_url="https://$alias_url"
          elif [ -n "$fallback_url" ]; then
            preview_url="https://$fallback_url"
          fi
        elif [ -n "$fallback_url" ]; then
          preview_url="https://$fallback_url"
        fi

        if [ -n "$preview_url" ]; then
          printf '%s' "$preview_url" > "$cache_file"
        else
          # Cache empty result so we don't hammer the API for branches with no deploy
          printf '' > "$cache_file"
        fi
      fi

      [ -n "$preview_url" ] && add "$(jq -nc --arg u "$preview_url" '{label:"Preview",url:$u,kind:"preview"}')"
    fi
  fi
fi

# AWS SSO status with tone — only relevant when Claude routes through Bedrock.
# The plugin passes the active provider on stdin; skip the check otherwise so a
# logged-out AWS session doesn't show a spurious "AWS expired" pill.
if [ "$provider" = "bedrock" ] && command -v aws >/dev/null 2>&1; then
  if aws sts get-caller-identity --query Account --output text >/dev/null 2>&1; then
    add "$(jq -nc '{label:"AWS ok",kind:"aws"}')"
  else
    add "$(jq -nc '{label:"AWS expired",tone:"warn",kind:"aws"}')"
  fi
fi

printf '%s' "$tags"
