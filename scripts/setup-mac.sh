#!/usr/bin/env bash
# setup-mac.sh — fresh-machine setup for macOS.
#
# Idempotent: safe to re-run. Each step no-ops if already done.
# Handles both Apple Silicon (/opt/homebrew) and Intel (/usr/local) brew.
#
# What it does:
#   1. Xcode CLI tools
#   2. Homebrew
#   3. Core brews: git, fnm, gh, podman
#   4. Node LTS via fnm
#   5. Claude Code (Homebrew cask — auto-updates via `brew upgrade`)
#   6. Vercel CLI (npm)
#   7. Clone claude-config repo if missing, then bootstrap
#   8. Write ~/.claude/settings.local.json with Mac-appropriate paths
#   9. Ensure ~/.local/bin is on PATH in ~/.zshrc
#
# Interactive steps you'll run after:
#   - claude           (first run prompts login)
#   - gh auth login
#   - vercel login
#   - podman machine init && podman machine start
set -euo pipefail

log() { printf '\n==> %s\n' "$*"; }
ok()  { printf '    ok %s\n' "$*"; }
exists() { command -v "$1" >/dev/null 2>&1; }

# Install a brew formula with explicit per-formula logging, so the user
# can see exactly what's happening during multi-minute downloads.
brew_formula() {
  local name="$1"
  if brew list --formula "$name" >/dev/null 2>&1; then
    ok "$name (already installed)"
  else
    log "brew install $name"
    brew install "$name"
  fi
}

brew_cask() {
  local name="$1"
  if brew list --cask "$name" >/dev/null 2>&1; then
    ok "$name (already installed)"
  else
    log "brew install --cask $name"
    brew install --cask "$name"
  fi
}

# Homebrew's installer prompts for your password via sudo. If this script
# was run via `curl ... | bash`, stdin is the pipe (not a TTY) and sudo
# fails with misleading "not an administrator"-style errors. Reattach
# stdin to the user's terminal if possible; otherwise error clearly.
if [[ ! -t 0 ]]; then
  if [[ -r /dev/tty ]]; then
    exec < /dev/tty
  else
    cat >&2 <<'EOF'
This script needs an interactive terminal so Homebrew can prompt for
your password via sudo. Running via `curl | bash` doesn't give it one,
and you'll see misleading "not an administrator" errors.

Either:
  1) Download the script first, then run it:
       curl -fsSL https://raw.githubusercontent.com/richardbowman/claude-config/main/scripts/setup-mac.sh -o /tmp/setup-mac.sh
       bash /tmp/setup-mac.sh

  2) Clone the repo first, then run from disk:
       xcode-select --install   # if not already installed
       git clone https://github.com/richardbowman/claude-config.git ~/claude-config
       ~/claude-config/scripts/setup-mac.sh
EOF
    exit 1
  fi
fi

REPO_URL="${REPO_URL:-https://github.com/richardbowman/claude-config.git}"
REPO_DIR="${REPO_DIR:-$HOME/claude-config}"

# ---------------------------------------------------------------------------
# 1. Xcode CLI tools
# ---------------------------------------------------------------------------
if ! xcode-select -p >/dev/null 2>&1; then
  log "Installing Xcode CLI tools (accept the GUI prompt)"
  xcode-select --install || true
  echo "Re-run this script once the Xcode CLI install finishes."
  exit 0
fi

# ---------------------------------------------------------------------------
# 2. Homebrew
# ---------------------------------------------------------------------------
if ! exists brew; then
  log "Installing Homebrew"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# brew on Apple Silicon lives in /opt/homebrew, on Intel in /usr/local
for BREW in /opt/homebrew/bin/brew /usr/local/bin/brew; do
  if [[ -x "$BREW" ]]; then
    eval "$("$BREW" shellenv)"
    # Make it permanent for future shells
    if ! grep -q "$BREW shellenv" "$HOME/.zprofile" 2>/dev/null; then
      echo "eval \"\$($BREW shellenv)\"" >> "$HOME/.zprofile"
    fi
    break
  fi
done

# ---------------------------------------------------------------------------
# 3. Core brews
# ---------------------------------------------------------------------------
log "Core brews: git, fnm, gh, podman"
for f in git fnm gh podman; do
  brew_formula "$f"
done

# ---------------------------------------------------------------------------
# 4. Node via fnm
# ---------------------------------------------------------------------------
if ! grep -q 'fnm env --use-on-cd' "$HOME/.zshrc" 2>/dev/null; then
  log "Adding fnm init to ~/.zshrc"
  echo 'eval "$(fnm env --use-on-cd)"' >> "$HOME/.zshrc"
fi
eval "$(fnm env --use-on-cd)"

if fnm list | grep -q 'v[0-9]'; then
  ok "Node already installed via fnm ($(fnm current 2>/dev/null || echo 'default'))"
else
  log "Installing Node LTS via fnm"
  fnm install --lts
  fnm default lts-latest
fi

# ---------------------------------------------------------------------------
# 5. Claude Code (Homebrew cask)
# ---------------------------------------------------------------------------
#   `claude-code`         — stable, ~1 week behind
#   `claude-code@latest`  — bleeding edge
# Pick one. Does NOT auto-update — run `brew upgrade claude-code` to update.
# Alternative: native installer that auto-updates:
#   curl -fsSL https://claude.ai/install.sh | bash
if exists claude; then
  ok "Claude Code already installed ($(claude --version 2>/dev/null || echo 'present'))"
else
  brew_cask claude-code
fi

# ---------------------------------------------------------------------------
# 6. Vercel CLI (npm)
# ---------------------------------------------------------------------------
if exists vercel; then
  ok "Vercel CLI already installed ($(vercel --version 2>/dev/null | head -1 || echo 'present'))"
else
  log "Installing Vercel CLI (npm install -g vercel)"
  npm install -g vercel
fi

# ---------------------------------------------------------------------------
# 7. Clone + bootstrap
# ---------------------------------------------------------------------------
if [[ ! -d "$REPO_DIR" ]]; then
  log "Cloning $REPO_URL -> $REPO_DIR"
  git clone "$REPO_URL" "$REPO_DIR"
fi

log "Running claude-config bootstrap"
"$REPO_DIR/bootstrap.sh"

# ---------------------------------------------------------------------------
# 8. settings.local.json for Mac paths
# ---------------------------------------------------------------------------
LOCAL_SETTINGS="$HOME/.claude/settings.local.json"
if [[ ! -f "$LOCAL_SETTINGS" ]]; then
  log "Writing $LOCAL_SETTINGS with additionalDirectories"
  cat > "$LOCAL_SETTINGS" <<EOF
{
  "permissions": {
    "additionalDirectories": ["$HOME"]
  }
}
EOF
else
  echo "    $LOCAL_SETTINGS exists — leaving alone (edit manually if needed)"
fi

# ---------------------------------------------------------------------------
# 9. Podman VM — start if already initialized, otherwise print instructions
# ---------------------------------------------------------------------------
# `podman machine init` pulls a ~1GB Fedora CoreOS image and some versions
# prompt for provider/resources. Both of those behave badly inside a
# non-interactive script (opaque progress, silent hangs). Leave init for
# the user; auto-start a machine that's already initialized.
if exists podman; then
  if podman machine list --format '{{.Name}}' 2>/dev/null | grep -q .; then
    if ! podman machine list --format '{{.Running}}' 2>/dev/null | grep -q true; then
      log "Starting existing Podman machine"
      podman machine start
    fi
  else
    log "Podman installed but no VM yet — run these when ready (interactive, ~1GB download):"
    echo "     podman machine init"
    echo "     podman machine start"
    echo "   Or install podman-desktop (see setup-mac-apps.sh) for a GUI with auto-start."
  fi
fi

# ---------------------------------------------------------------------------
# 10. ~/.local/bin on PATH
# ---------------------------------------------------------------------------
if ! grep -q '.local/bin' "$HOME/.zshrc" 2>/dev/null; then
  log "Adding ~/.local/bin to PATH in ~/.zshrc"
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc"
fi

# ---------------------------------------------------------------------------
# Done — print next steps
# ---------------------------------------------------------------------------
cat <<'EOF'

==> Setup complete. Next steps (interactive):

  exec zsh                           # pick up new PATH + fnm + brew env
  claude                             # first run prompts login
  gh auth login                      # authenticate GitHub CLI
  vercel login                       # authenticate Vercel CLI
  # (Podman VM was initialized + started automatically above.)

Verify:
  nextdev doctor                     # should show node, brew-installed tools
  ls -la ~/.claude/settings.json     # should be a symlink -> ~/claude-config/settings.json
  ls ~/.claude/skills/               # should list all synced skills

EOF
