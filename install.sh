#!/usr/bin/env bash
# install.sh — symlink bin/ scripts and Claude Code settings from this repo.
# Run from the repo root: ./install.sh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_SRC="$REPO_DIR/bin"
BIN_DST="$HOME/.local/bin"

# --- bin/ scripts -> ~/.local/bin/ ---
mkdir -p "$BIN_DST"

for script in "$BIN_SRC"/*; do
  name="$(basename "$script")"
  target="$BIN_DST/$name"
  chmod +x "$script"
  ln -sf "$script" "$target"
  echo "  linked $target -> $script"
done

# --- Claude Code settings -> ~/.claude/settings.json ---
CLAUDE_DIR="$HOME/.claude"
mkdir -p "$CLAUDE_DIR"
ln -sf "$REPO_DIR/settings.json" "$CLAUDE_DIR/settings.json"
echo "  linked $CLAUDE_DIR/settings.json -> $REPO_DIR/settings.json"

echo ""
echo "Done. Make sure $BIN_DST is on your PATH."
echo "  (already set in ~/.zshrc if you sourced it)"
