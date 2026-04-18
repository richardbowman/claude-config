---
name: backup-vercel-secrets
description: Back up Vercel production and preview environment variables to 1Password as individual key/value fields. Use when the user wants to snapshot or archive their Vercel secrets for a project.
---

# Backup Vercel Secrets to 1Password

Pull production and preview env vars from Vercel and store them as 1Password items with individual concealed key/value fields (not raw documents).

## Prerequisites

- `vercel` CLI installed and authenticated (`vercel whoami`)
- `op` CLI installed and authenticated (`op account list`)
- Must be run from inside a Vercel-linked project directory

Check both are ready before proceeding:
```sh
vercel whoami && op account list
```

## Steps

### 1. Determine item title prefix

Default to the project folder name:
```sh
PROJECT=$(basename "$PWD")
# e.g. "my-app" → items will be "my-app - Production Secrets" and "my-app - Preview Secrets"
```

Or ask the user for a custom title prefix if the default looks wrong.

### 2. Determine 1Password vault

Ask the user which vault (default: **Private**). Common choices: Private, Employee, Personal.

### 3. Pull env vars from Vercel

```sh
vercel env pull --environment=production --yes .env.prod.backup
vercel env pull --environment=preview    --yes .env.preview.backup
```

Note: `vercel env pull` only pulls non-sensitive vars by default on newer CLI versions. If the output looks sparse, check `vercel env ls production` to see what's actually stored.

### 4. Parse .env files into op field assignments

Use Python to parse the .env files into `KEY[concealed]=value` pairs that `op` understands:

```sh
parse_env_for_op() {
  python3 - "$1" <<'EOF'
import sys

args = []
with open(sys.argv[1]) as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' not in line:
            continue
        key, _, val = line.partition('=')
        key = key.strip().removeprefix('export').strip()
        # Strip surrounding quotes
        if (val.startswith('"') and val.endswith('"')) or \
           (val.startswith("'") and val.endswith("'")):
            val = val[1:-1]
        if key:
            print(f"{key}[concealed]={val}")
EOF
}
```

### 5. Store in 1Password as structured items

Check whether items already exist (update vs. create):

```sh
VAULT="Private"
PROD_TITLE="$PROJECT - Production Secrets"
PREV_TITLE="$PROJECT - Preview Secrets"

store_env_as_op_item() {
  local title="$1"
  local envfile="$2"

  # Build array of field assignments
  mapfile -t fields < <(parse_env_for_op "$envfile")

  if op item get "$title" --vault="$VAULT" &>/dev/null; then
    # Item exists — update each field
    op item edit "$title" --vault="$VAULT" "${fields[@]}"
    echo "Updated: $title"
  else
    # Create new Secure Note item with all fields
    op item create \
      --category="Secure Note" \
      --title="$title" \
      --vault="$VAULT" \
      "${fields[@]}"
    echo "Created: $title"
  fi
}

store_env_as_op_item "$PROD_TITLE" .env.prod.backup
store_env_as_op_item "$PREV_TITLE" .env.preview.backup
```

### 6. Clean up temp files

```sh
rm .env.prod.backup .env.preview.backup
```

### 7. Verify

```sh
op item get "$PROD_TITLE" --vault="$VAULT" --fields label,concealed 2>/dev/null | head -20
```

Should show each env var as an individual concealed field.

## Restore later

To reconstruct a `.env` file from the 1Password item:

```sh
op item get "$PROJECT - Production Secrets" --vault="Private" \
  --format json \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
for f in data.get('fields', []):
    label = f.get('label', '')
    val   = f.get('value', '')
    if label and label not in ('notesPlain',):
        print(f'{label}={val}')
" > .env.local
```

## Troubleshooting

- **`vercel env pull` returns empty file**: Make sure you're in a linked project (`vercel link`).
- **`op` auth error**: Run `op signin` to re-authenticate.
- **`mapfile` not found**: `mapfile` requires bash 4+. macOS ships bash 3. Either install bash 5 (`brew install bash`) or use this fallback instead of `mapfile`:
  ```sh
  fields=()
  while IFS= read -r line; do fields+=("$line"); done < <(parse_env_for_op "$envfile")
  ```
- **`vercel env pull` missing secrets**: Vercel only pulls non-sensitive vars. Sensitive vars (marked encrypted) must be re-entered manually. Check `vercel env ls production` to audit what was pulled vs. what exists.
