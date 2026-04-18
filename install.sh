#!/usr/bin/env bash
# install.sh — symlink all bin/ scripts into ~/.local/bin/
# Run from the repo root: ./install.sh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_SRC="$REPO_DIR/bin"
BIN_DST="$HOME/.local/bin"

mkdir -p "$BIN_DST"

for script in "$BIN_SRC"/*; do
  name="$(basename "$script")"
  target="$BIN_DST/$name"
  chmod +x "$script"
  ln -sf "$script" "$target"
  echo "  linked $target -> $script"
done

echo ""
echo "Done. Make sure $BIN_DST is on your PATH."
echo "  (already set in ~/.zshrc if you sourced it)"
