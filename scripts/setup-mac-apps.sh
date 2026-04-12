#!/usr/bin/env bash
# setup-mac-apps.sh — install personal apps via Homebrew casks.
#
# Separate from setup-mac.sh so app choices can evolve independently
# from dev tooling. Idempotent — safe to re-run.
#
# Apps installed:
#   - google-chrome       browser
#   - visual-studio-code  editor
#   - obsidian            notes
#   - 1password           password manager
#   - ghostty             terminal
#   - cmux                Ghostty-based terminal for AI coding agents
#                         (requires 3rd-party tap: manaflow-ai/cmux)
set -euo pipefail

log() { printf '\n==> %s\n' "$*"; }
exists() { command -v "$1" >/dev/null 2>&1; }

if ! exists brew; then
  echo "Homebrew not found. Run scripts/setup-mac.sh first." >&2
  exit 1
fi

# Main-repo casks
log "Installing standard casks"
brew install --cask \
  google-chrome \
  visual-studio-code \
  obsidian \
  1password \
  ghostty

# cmux lives on a 3rd-party tap (manaflow-ai/homebrew-cmux)
log "Installing cmux (3rd-party tap manaflow-ai/cmux)"
brew install --cask manaflow-ai/cmux/cmux

log "Done. Apps installed into /Applications."
