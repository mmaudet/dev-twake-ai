#!/usr/bin/env bash
# Re-create the openproject container with the patched image and the SSO env.
#
# Reads the Authelia OIDC client secret from ~/.openproject/op_oidc.env
# (gitignored). Run `docker build -t openproject-patched:13 .` from this
# directory beforehand.

set -euo pipefail

cd "$(dirname "$0")"

# shellcheck disable=SC1091
. "$HOME/.openproject/op_oidc.env"
: "${OPENPROJECT_OIDC_CLIENT_SECRET:?missing OPENPROJECT_OIDC_CLIENT_SECRET in ~/.openproject/op_oidc.env}"

IMAGE="openproject-patched:13"
docker image inspect "$IMAGE" >/dev/null 2>&1 || docker build -t "$IMAGE" .

docker rm -f openproject 2>/dev/null || true

docker run -d \
  --name openproject \
  --restart unless-stopped \
  -p 6080:80 \
  -e OPENPROJECT_HOST__NAME=openproject.dev-twake.maudet.cloud \
  -e OPENPROJECT_HTTPS=true \
  -e OPENPROJECT_DEFAULT__LANGUAGE=fr \
  -e OPENPROJECT_RAILS__CACHE__STORE=memcache \
  -e OPENPROJECT_SELF__REGISTRATION=3 \
  -e OPENPROJECT_OPENID__CONNECT_AUTHELIA_DISPLAY__NAME="Authelia" \
  -e OPENPROJECT_OPENID__CONNECT_AUTHELIA_HOST="auth.maudet.cloud" \
  -e OPENPROJECT_OPENID__CONNECT_AUTHELIA_IDENTIFIER="openproject" \
  -e OPENPROJECT_OPENID__CONNECT_AUTHELIA_SECRET="$OPENPROJECT_OIDC_CLIENT_SECRET" \
  -e OPENPROJECT_OPENID__CONNECT_AUTHELIA_AUTHORIZATION__ENDPOINT="/api/oidc/authorization" \
  -e OPENPROJECT_OPENID__CONNECT_AUTHELIA_TOKEN__ENDPOINT="/api/oidc/token" \
  -e OPENPROJECT_OPENID__CONNECT_AUTHELIA_USERINFO__ENDPOINT="/api/oidc/userinfo" \
  -e OPENPROJECT_OPENID__CONNECT_AUTHELIA_END__SESSION__ENDPOINT="/api/oidc/logout" \
  -e OPENPROJECT_OPENID__CONNECT_AUTHELIA_SCOPE="openid profile email" \
  -v openproject_data:/var/openproject/assets \
  -v openproject_pgdata:/var/openproject/pgdata \
  -v openproject_logs:/var/log/supervisor \
  "$IMAGE"

echo "Container started. Tail logs with: docker logs -f openproject"
