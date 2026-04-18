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
#   - claude                    Claude AI desktop app (GUI companion to claude-code CLI)
#   - podman-desktop            tray app; auto-starts the podman machine at login
#   - keepingyouawake           prevents Mac from sleeping
#   - alt-tab                   Windows-style alt-tab switcher
#   - cmux                      Ghostty-based terminal for AI coding agents
#                               (requires 3rd-party tap: manaflow-ai/cmux)
#   - google-drive              Google Drive for Desktop (file sync)
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
    # Some apps might be manually installed in /Applications — ignore those errors
    brew install --cask "$name" || {
      if [[ $? -eq 1 ]] && [[ -d "/Applications/$(brew info --cask "$name" | grep -m1 'Artifacts' -A1 | tail -n1 | sed 's/ (App)//')" ]]; then
        ok "$name (already exists in /Applications)"
      else
        return 0 # Continue even if one fails
      fi
    }
  fi
}

# Standard apps — installed on all machines
apps_standard=(visual-studio-code ghostty handy claude podman-desktop keepingyouawake alt-tab google-drive)

# Personal apps — skipped on work machines
apps_personal=(google-chrome obsidian 1password)

# Detection: Is this a work machine?
IS_WORK=0
if [[ -d "/Applications/Okta Verify.app" ]] || [[ -d "/Applications/GlobalProtect.app" ]]; then
  IS_WORK=1
fi

# Override via env vars
if [[ "${SKIP_PERSONAL:-}" == "1" ]]; then IS_WORK=1; fi
if [[ "${FORCE_PERSONAL:-}" == "1" ]]; then IS_WORK=0; fi

if [[ "$IS_WORK" -eq 1 ]]; then
  log "Work machine detected — skipping personal apps: ${apps_personal[*]}"
  apps=("${apps_standard[@]}")
else
  apps=("${apps_standard[@]}" "${apps_personal[@]}")
fi

# Main-repo casks — installed one at a time so the user can see progress
log "Installing apps: ${apps[*]}"
for c in "${apps[@]}"; do
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
