#!/usr/bin/env bash
# Bring up the kan.bn stack (postgres + migrate + web) on athena.
#
# Reads the env from ~/.kanbn/kanbn.env if it exists, otherwise from
# ./.env. Both are gitignored. See .env.example for the schema.

set -euo pipefail

cd "$(dirname "$0")"

ENV_FILE="$HOME/.kanbn/kanbn.env"
if [ ! -f "$ENV_FILE" ]; then
  ENV_FILE="./.env"
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "no env file found (looked at ~/.kanbn/kanbn.env and ./.env)" >&2
  exit 2
fi

docker compose --env-file "$ENV_FILE" up -d

echo
echo "Containers:"
docker compose ps
echo
echo "Tail logs with: docker compose logs -f web"
