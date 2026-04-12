#!/usr/bin/env bash
# Thin thunk: verify Node is present, then hand off to bootstrap.js.
# All real logic lives in bootstrap.js.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Node.js 18+ is required. Install via one of:

  macOS:   brew install fnm && fnm install --lts && fnm default lts-latest
  Linux:   curl -fsSL https://fnm.vercel.app/install | bash
  Windows: winget install Schniz.fnm   # (or use WSL and run this script there)

Then add to your shell rc:
  eval "$(fnm env --use-on-cd)"

Reopen your shell and re-run this script.
EOF
  exit 1
fi

exec node "$DIR/bootstrap.js" "$@"
