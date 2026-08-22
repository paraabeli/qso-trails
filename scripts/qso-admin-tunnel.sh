#!/bin/sh
set -eu

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 user@server [local-port]" >&2
  exit 2
fi

TARGET="$1"
LOCAL_PORT="${2:-3300}"
REMOTE_PORT="${QSO_ADMIN_REMOTE_PORT:-3300}"

case "$LOCAL_PORT" in
  ''|*[!0-9]*) echo "Invalid local port: $LOCAL_PORT" >&2; exit 2 ;;
esac
case "$REMOTE_PORT" in
  ''|*[!0-9]*) echo "Invalid remote port: $REMOTE_PORT" >&2; exit 2 ;;
esac

if [ "$LOCAL_PORT" -lt 1 ] || [ "$LOCAL_PORT" -gt 65535 ]; then
  echo "Invalid local port: $LOCAL_PORT" >&2
  exit 2
fi

if [ "$REMOTE_PORT" -lt 1 ] || [ "$REMOTE_PORT" -gt 65535 ]; then
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
