#!/usr/bin/env bash
echo "install.sh is no longer used. Run bootstrap instead:" >&2
echo "  node --experimental-strip-types $(dirname "$0")/bootstrap.ts --machine <name>" >&2
exit 1
