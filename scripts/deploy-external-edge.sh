#!/usr/bin/env bash
set -euo pipefail

QSO_TRAILS_DIR="${QSO_TRAILS_DIR:-/opt/qso-trails}"
BRANCH="${QSO_TRAILS_BRANCH:-main}"
ENV_FILE="${QSO_TRAILS_ENV_FILE:-$QSO_TRAILS_DIR/.env.external-edge}"
COMPOSE_FILE="${QSO_TRAILS_COMPOSE_FILE:-$QSO_TRAILS_DIR/compose.external-edge.yaml}"

cd "$QSO_TRAILS_DIR"

for command in git docker; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Missing required command: $command" >&2
    exit 1
  }
done

[[ -f "$ENV_FILE" ]] || { echo "Missing environment file: $ENV_FILE" >&2; exit 1; }
[[ -f "$COMPOSE_FILE" ]] || { echo "Missing compose file: $COMPOSE_FILE" >&2; exit 1; }

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing deployment: $QSO_TRAILS_DIR has uncommitted changes." >&2
  exit 1
fi

git fetch --prune origin "$BRANCH"

current="$(git rev-parse HEAD)"
target="$(git rev-parse "origin/$BRANCH")"

if ! git merge-base --is-ancestor "$current" "$target"; then
  echo "Refusing deployment: local HEAD cannot fast-forward to origin/$BRANCH." >&2
  exit 1
fi

container_id="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps -q app 2>/dev/null || true)"

if [[ "$current" == "$target" && -n "$container_id" ]]; then
  echo "QSO Trails already current at $current."
  exit 0
fi

if [[ "$current" != "$target" ]]; then
  git pull --ff-only origin "$BRANCH"
fi

docker compose \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  up -d --build

echo "QSO Trails deployed at $(git rev-parse HEAD)."
