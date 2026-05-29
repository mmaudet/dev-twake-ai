#!/usr/bin/env bash
# Recreate the grist container with the env vars needed to actually
# serve OIDC traffic (see README.md for why each one is here).
# Reads secrets from ~/.grist/grist.env (gitignored).

set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE="$HOME/.grist/grist.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "missing $ENV_FILE" >&2
  exit 2
fi

# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

docker rm -f grist 2>/dev/null || true
docker volume create grist_data >/dev/null

docker run -d \
  --name grist \
  --restart unless-stopped \
  -p 6110:8484 \
  -e APP_HOME_URL=https://grist.dev-twake.maudet.cloud \
  -e GRIST_DOMAIN=grist.dev-twake.maudet.cloud \
  -e GRIST_FORCE_LOGIN=true \
  -e GRIST_SINGLE_ORG="${GRIST_SINGLE_ORG:-twake-dev}" \
  -e GRIST_DEFAULT_EMAIL="${GRIST_DEFAULT_EMAIL:-michel.maudet@gmail.com}" \
  -e GRIST_LOGIN_SYSTEM_TYPE=oidc \
  -e GRIST_SANDBOX_FLAVOR=gvisor \
  -e GRIST_IN_SERVICE=true \
  -e GRIST_OIDC_IDP_ISSUER=https://auth.maudet.cloud \
  -e GRIST_OIDC_IDP_CLIENT_ID=grist \
  -e GRIST_OIDC_IDP_CLIENT_SECRET="$GRIST_OIDC_CLIENT_SECRET" \
  -e GRIST_OIDC_IDP_SCOPES="openid profile email" \
  -e GRIST_OIDC_IDP_END_SESSION_ENDPOINT=https://auth.maudet.cloud/logout \
  -e GRIST_OAUTH_CALLBACK_URL=https://grist.dev-twake.maudet.cloud/oauth2/callback \
  -e GRIST_SESSION_SECRET="$GRIST_SESSION_SECRET" \
  -v grist_data:/persist \
  gristlabs/grist:latest

echo "Container started. Tail logs with: docker logs -f grist"
