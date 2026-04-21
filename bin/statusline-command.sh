#!/usr/bin/env bash
input=$(cat)
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // empty')

# Get current git branch from the session's working directory
branch=""
if [ -n "$cwd" ]; then
  branch=$(git -C "$cwd" --no-optional-locks symbolic-ref --short HEAD 2>/dev/null)
fi

# Get PR number for the branch (suppress errors silently)
pr_info=""
if [ -n "$branch" ]; then
  pr_num=$(gh pr view "$branch" --repo "$(git -C "$cwd" --no-optional-locks remote get-url origin 2>/dev/null)" --json number --jq '.number' 2>/dev/null)
  if [ -n "$pr_num" ]; then
    pr_info=" PR #${pr_num}"
  fi
fi

# Look up nextdev port for the current cwd
dev_url=""
if [ -n "$cwd" ]; then
  abs_cwd=$(cd "$cwd" && pwd -P 2>/dev/null)
  if [ -n "$abs_cwd" ]; then
    hash=$(printf '%s' "$abs_cwd" | shasum | cut -c1-12)
    state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/nextdev/$hash"
    port_file="$state_dir/port"
    pid_file="$state_dir/pid"
    if [ -f "$port_file" ] && [ -f "$pid_file" ]; then
      pid=$(cat "$pid_file" 2>/dev/null)
      port=$(cat "$port_file" 2>/dev/null)
      # Only show URL if the process is still alive
      if [ -n "$pid" ] && [ -n "$port" ] && kill -0 "$pid" 2>/dev/null; then
        dev_url="http://localhost:$port"
      fi
    fi
  fi
fi

# Build output
parts=""
if [ -n "$dev_url" ]; then
  parts="${parts}${dev_url}"
fi

if [ -n "$branch" ]; then
  if [ -n "$parts" ]; then
    parts="${parts}  ${branch}${pr_info}"
  else
    parts="${parts}${branch}${pr_info}"
  fi
fi

printf "%s" "$parts"
