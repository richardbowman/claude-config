#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
SKILLS_DIR="$HOME/.agents/skills"

echo "==> Claude Code config bootstrap"
echo "    repo:   $REPO_DIR"
echo "    target: $CLAUDE_DIR"

mkdir -p "$CLAUDE_DIR" "$CLAUDE_DIR/plugins" "$CLAUDE_DIR/skills" "$SKILLS_DIR"

link() {
  local src="$1" dst="$2"
  if [[ -L "$dst" ]]; then
    local current
    current="$(readlink "$dst")"
    if [[ "$current" == "$src" ]]; then
      echo "    ok   $dst"
      return
    fi
    echo "    relink $dst (was -> $current)"
    rm "$dst"
  elif [[ -e "$dst" ]]; then
    local backup="$dst.backup.$(date +%s)"
    echo "    backup $dst -> $backup"
    mv "$dst" "$backup"
  fi
  ln -s "$src" "$dst"
  echo "    link $dst -> $src"
}

echo "==> Linking settings"
link "$REPO_DIR/settings.json"                    "$CLAUDE_DIR/settings.json"
link "$REPO_DIR/plugins/installed_plugins.json"   "$CLAUDE_DIR/plugins/installed_plugins.json"
link "$REPO_DIR/plugins/known_marketplaces.json"  "$CLAUDE_DIR/plugins/known_marketplaces.json"

echo "==> Checking third-party skills"
if [[ ! -f "$REPO_DIR/skills.txt" ]]; then
  echo "    no skills.txt found, skipping"
else
  missing=()
  while IFS= read -r skill || [[ -n "$skill" ]]; do
    skill="${skill%%#*}"
    skill="${skill//[[:space:]]/}"
    [[ -z "$skill" ]] && continue
    if [[ -d "$SKILLS_DIR/$skill" || -L "$CLAUDE_DIR/skills/$skill" ]]; then
      echo "    ok      $skill"
    else
      echo "    missing $skill"
      missing+=("$skill")
    fi
  done < "$REPO_DIR/skills.txt"

  if (( ${#missing[@]} > 0 )); then
    if ! command -v npx >/dev/null 2>&1; then
      echo "!! npx not found — install Node.js to enable skill installation"
      echo "   missing: ${missing[*]}"
    else
      for skill in "${missing[@]}"; do
        echo "==> Installing skill: $skill"
        npx -y skills add "$skill" || echo "!! failed to install $skill"
      done
    fi
  fi
fi

echo "==> Done"
echo "    Review machine-specific overrides in: $CLAUDE_DIR/settings.local.json"
