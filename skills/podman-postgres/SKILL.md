---
name: podman-postgres
description: Run and manage local Postgres for development using Podman. Use when the user wants to start/stop/reset a local Postgres, create a per-project database, connect via psql, back up or restore data, or set up Postgres on a new machine (Linux, macOS, Windows). Covers cross-platform gotchas including podman machine on Mac/Windows.
---

# Podman Postgres

Opinionated recipe for running Postgres locally with Podman. One container per app, named volume for data, published to `localhost:5432`.

## Cross-platform prerequisites

Podman runs everywhere, but Mac/Windows need a VM first.

**Linux** — native, no VM:
```sh
# Fedora / RHEL:  sudo dnf install podman
# Debian/Ubuntu:  sudo apt install podman
podman --version
```

**macOS** — via `podman machine` (Apple Virtualization or QEMU):
```sh
brew install podman
podman machine init          # one-time
podman machine start
```

**Windows** — via `podman machine` backed by WSL2:
```powershell
winget install RedHat.Podman
podman machine init           # one-time; sets up WSL2 distro
podman machine start
```

After `podman machine start`, the `podman` CLI on Mac/Windows transparently talks to the VM. Commands below work identically on all three platforms.

**If the machine seems dead** (common after sleep/reboot on Mac/Win):
```sh
podman machine stop && podman machine start
```

## Canonical run recipe

One-liner to start a named Postgres tied to a named volume:

```sh
APP=myapp                                   # e.g. hiptrip
podman run -d \
  --name "${APP}-pg" \
  --restart=unless-stopped \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB="${APP}" \
  -p 5432:5432 \
  -v "${APP}-pgdata:/var/lib/postgresql/data" \
  docker.io/library/postgres:16
```

Why each flag:
- `--name ${APP}-pg` — predictable name per project; lets you run multiple DBs on different ports.
- `--restart=unless-stopped` — comes back after host reboot (Linux) or `podman machine start` (Mac/Win).
- `-v ${APP}-pgdata:/var/lib/postgresql/data` — **named** volume; survives `podman rm` and container recreation. Never use anonymous volumes for data you care about.
- `-p 5432:5432` — publishes to host loopback. If host has Postgres already, use `-p 5433:5432` and connect on `:5433`.
- `postgres:16` — pin the major version. Upgrading major versions requires `pg_dump` (see Upgrades below).

**Connection string**: `postgres://postgres:postgres@localhost:5432/${APP}`

## Running more than one database

Run a second app on a different host port — same recipe, change `APP` and port:

```sh
APP=other
podman run -d --name "${APP}-pg" --restart=unless-stopped \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB="${APP}" \
  -p 5433:5432 -v "${APP}-pgdata:/var/lib/postgresql/data" \
  docker.io/library/postgres:16
```

## Lifecycle

```sh
podman ps                                   # what's running
podman ps -a                                # including stopped
podman logs -f myapp-pg                     # tail logs
podman stop myapp-pg
podman start myapp-pg
podman restart myapp-pg
podman rm -f myapp-pg                       # remove container (data survives in the named volume)
```

## Connecting with psql

Inside the container (no local psql needed):
```sh
podman exec -it myapp-pg psql -U postgres -d myapp
```

From the host (requires `psql` installed locally):
```sh
psql postgres://postgres:postgres@localhost:5432/myapp
```

One-off query:
```sh
podman exec -i myapp-pg psql -U postgres -d myapp -c 'select version();'
```

## Reset the database

Two levels, pick what you need:

**Wipe one database, keep the container:**
```sh
podman exec -i myapp-pg psql -U postgres -c 'DROP DATABASE myapp;'
podman exec -i myapp-pg psql -U postgres -c 'CREATE DATABASE myapp;'
```

**Nuke everything — volume and all:**
```sh
podman rm -f myapp-pg
podman volume rm myapp-pgdata
# then re-run the canonical recipe above
```

## Backup and restore

```sh
# Backup to host file
podman exec -i myapp-pg pg_dump -U postgres -d myapp > myapp.sql

# Restore from host file (into an empty DB)
podman exec -i myapp-pg psql -U postgres -d myapp < myapp.sql

# Full cluster backup
podman exec -i myapp-pg pg_dumpall -U postgres > cluster.sql
```

## Major version upgrades

Postgres data directories are **not** compatible across majors (e.g., 16 → 17). Steps:

```sh
# 1. Dump from old container
podman exec -i myapp-pg pg_dumpall -U postgres > backup.sql

# 2. Stop old, rename volume so you still have a fallback
podman stop myapp-pg
podman volume create myapp-pgdata-v17

# 3. Start new container on the new volume
podman run -d --name myapp-pg-new --restart=unless-stopped \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=myapp \
  -p 5432:5432 -v myapp-pgdata-v17:/var/lib/postgresql/data \
  docker.io/library/postgres:17

# 4. Load the dump
podman exec -i myapp-pg-new psql -U postgres < backup.sql

# 5. Once verified, remove old container + volume
podman rm -f myapp-pg
podman volume rm myapp-pgdata   # irreversible — keep backup.sql
```

## Autostart on host boot

**Linux (systemd user unit)** — the proper way:
```sh
mkdir -p ~/.config/containers/systemd
cat > ~/.config/containers/systemd/myapp-pg.container <<'EOF'
[Unit]
Description=myapp Postgres
After=network-online.target

[Container]
Image=docker.io/library/postgres:16
ContainerName=myapp-pg
Environment=POSTGRES_PASSWORD=postgres
Environment=POSTGRES_DB=myapp
PublishPort=5432:5432
Volume=myapp-pgdata:/var/lib/postgresql/data

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user start myapp-pg
loginctl enable-linger "$USER"         # so the unit runs without an active login
```

**Mac/Windows** — `--restart=unless-stopped` on the container plus `podman machine set --rootful=false --now` covers most cases. The machine itself must be running; set it to autostart:
```sh
# macOS (once) — machine starts on login:
podman machine set --rootful=false
# Then start it in Login Items or via launchd if you want fully hands-off.
```

## Common gotchas

- **Port already in use**: host Postgres running on 5432. Use `-p 5433:5432` and connect on `:5433`. Check with `ss -tlnp | grep 5432` (Linux) / `lsof -i :5432` (Mac).
- **"no such image" on first run**: first `podman run` pulls from Docker Hub; requires network.
- **Podman machine uses a lot of disk on Mac/Win**: `podman machine info` shows VM disk; `podman system prune -a --volumes` cleans images/volumes you actually don't need (careful — read before running).
- **Bind mounts are slow on Mac/Win**: named volumes live inside the VM and are fast. Avoid `-v /host/path:/var/lib/postgresql/data` for the data dir on Mac/Windows.
- **SELinux (Fedora/RHEL) denies bind mounts**: append `:Z` to the mount (`-v /host/path:/container/path:Z`). Named volumes don't hit this.
- **`podman-compose` vs `docker compose`**: podman-compose is a separate Python tool and lags behind. For dev Postgres, the single `podman run` above is simpler and portable.
- **Connecting from another container on the same host**: use `--network=host` or create a user network (`podman network create dev; podman run --network=dev ...`) and reference by container name.

## When NOT to use this

- Production — use a managed service (RDS, Neon, Supabase, etc.). This recipe has a default password and no backup automation.
- Needing extensions beyond what the official image ships — build a derived image or use `postgis/postgis:16-3.4` style variants.
