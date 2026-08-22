#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 user@server [local-port]" >&2
  exit 2
fi

TARGET="$1"
LOCAL_PORT="${2:-3300}"
REMOTE_PORT="${QSO_ADMIN_REMOTE_PORT:-3300}"

if [[ ! "$LOCAL_PORT" =~ ^[0-9]+$ ]] || (( LOCAL_PORT < 1 || LOCAL_PORT > 65535 )); then
  echo "Invalid local port: $LOCAL_PORT" >&2
  exit 2
fi

if [[ ! "$REMOTE_PORT" =~ ^[0-9]+$ ]] || (( REMOTE_PORT < 1 || REMOTE_PORT > 65535 )); then
  echo "Invalid remote port: $REMOTE_PORT" >&2
  exit 2
fi

echo "Opening QSO Trails admin tunnel:"
echo "  http://127.0.0.1:${LOCAL_PORT}/admin"
echo "Press Ctrl-C to close it."

exec ssh \
  -N \
  -o ExitOnForwardFailure=yes \
  -L "127.0.0.1:${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}" \
  "$TARGET"
