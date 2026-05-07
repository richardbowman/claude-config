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
#   - meetily                   AI meeting transcription (3rd-party tap: zackriya-solutions/meetily)
#                               NOTE: tap cask is stale (broken download URL). After tapping, patch
#                               Casks/meetily.rb to v0.3.0 before installing. See patch block below.
# CLI tools:
#   - databricks                Databricks CLI (requires 3rd-party tap: databricks/tap)
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

# Databricks CLI (formula from databricks/tap)
if brew list databricks >/dev/null 2>&1; then
  ok "databricks (already installed)"
else
  log "brew tap databricks/tap && brew install databricks"
  brew tap databricks/tap
  brew install databricks
fi

# meetily — tap is stale; patch the cask to v0.3.0 before installing.
# PR #19 (https://github.com/Zackriya-Solutions/homebrew-meetily/pull/19) fixes the broken URL
# but hasn't merged yet. Remove this block once the tap is updated upstream.
if brew list --cask meetily >/dev/null 2>&1; then
  ok "meetily (already installed)"
else
  log "Installing meetily (with tap patch)"
  brew tap zackriya-solutions/meetily 2>/dev/null || true
  CASK_FILE="$(brew --prefix)/Library/Taps/zackriya-solutions/homebrew-meetily/Casks/meetily.rb"
  if [[ -f "$CASK_FILE" ]]; then
    cat > "$CASK_FILE" <<'CASK'
cask "meetily" do
  version "0.3.0"
  sha256 "84f17516418745997125e14e8455a2fdc4d87badd51806b24f3370599323c52f"

  url "https://github.com/Zackriya-Solutions/meetily/releases/download/v#{version}/meetily_#{version}_aarch64.dmg"
  name "Meetily"
  desc "Privacy-first AI meeting assistant with local transcription and summarisation"
  homepage "https://meetily.ai"

  depends_on macos: ">= :monterey"
  depends_on arch: :arm64

  app "meetily.app"

  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-cr", "#{appdir}/meetily.app"],
                   sudo: false
  end

  zap trash: [
    "~/Library/Application Support/meetily",
    "~/Library/Preferences/com.zackriya.meetily.plist",
    "~/Library/Saved Application State/com.zackriya.meetily.savedState",
    "~/Library/Logs/meetily",
    "~/Library/Caches/com.zackriya.meetily",
  ]

  caveats do
    <<~EOS
      Meetily includes an integrated transcription backend.
      Simply launch the app — no separate setup required.
    EOS
  end
end
CASK
    log "brew install --cask meetily"
    brew install --cask meetily
  else
    echo "Warning: meetily tap cask not found at expected path; skipping." >&2
  fi
fi

log "Done. Apps installed into /Applications."
