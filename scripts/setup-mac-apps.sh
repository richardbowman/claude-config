#!/usr/bin/env bash
# setup-mac-apps.sh — install personal apps via Homebrew casks.
#
# Separate from setup-mac.sh so app choices can evolve independently
# from dev tooling. Idempotent — safe to re-run.
#
# Apps installed:
#   - google-chrome             browser
#   - visual-studio-code        editor
#   - obsidian                  notes
#   - 1password                 password manager
#   - ghostty                   terminal
#   - handy                     offline speech-to-text (push-to-talk dictation)
#   - podman-desktop            tray app; auto-starts the podman machine at login
#   - cmux                      Ghostty-based terminal for AI coding agents
#                               (requires 3rd-party tap: manaflow-ai/cmux)
# Fonts:
#   - font-source-code-pro      Adobe's Source Code Pro (programmer font)
set -euo pipefail

log() { printf '\n==> %s\n' "$*"; }
ok()  { printf '    ok %s\n' "$*"; }
exists() { command -v "$1" >/dev/null 2>&1; }

if ! exists brew; then
  echo "Homebrew not found. Run scripts/setup-mac.sh first." >&2
  exit 1
fi

brew_cask() {
  local name="$1"
  if brew list --cask "$name" >/dev/null 2>&1; then
    ok "$name (already installed)"
  else
    log "brew install --cask $name"
    brew install --cask "$name"
  fi
}

# Main-repo casks — installed one at a time so the user can see progress
log "Standard casks"
for c in google-chrome visual-studio-code obsidian 1password ghostty handy podman-desktop; do
  brew_cask "$c"
done

# Fonts (casks in the main homebrew-cask repo since Homebrew 4.0 — no tap needed)
log "Fonts"
for f in font-source-code-pro; do
  brew_cask "$f"
done

# cmux lives on a 3rd-party tap (manaflow-ai/homebrew-cmux)
if brew list --cask cmux >/dev/null 2>&1; then
  ok "cmux (already installed)"
else
  log "brew install --cask manaflow-ai/cmux/cmux"
  brew install --cask manaflow-ai/cmux/cmux
fi

log "Done. Apps installed into /Applications."
