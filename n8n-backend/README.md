# n8n backend

[n8n](https://n8n.io/) (workflow automation) running in Docker on
`athena`, with native OIDC SSO against Authelia, exposed publicly
through the nginx vhost on `hermes` at `https://n8n.dev-twake.maudet.cloud/`.

## Authentication

n8n's native OIDC SSO is gated by the Enterprise license flag
`feat:oidc` (the module is decorated `@BackendModule({ name: 'sso-oidc',
licenseFlag: 'feat:oidc' })` and every `/rest/sso/oidc/*` route has a
runtime `@Licensed('feat:oidc')` check). We bypass both by patching
the compiled `isLicensed` methods to return `true` for that feature —
see `Dockerfile` and `patch-license.js`. The image is built as
`n8n-patched:latest`.

The actual SSO wiring uses these env vars:

- `N8N_SSO_MANAGED_BY_ENV=true` — without this, n8n ignores the OIDC
  env vars at boot and falls back to its DB-stored config.
- `N8N_SSO_OIDC_LOGIN_ENABLED=true`
- `N8N_SSO_OIDC_CLIENT_ID=n8n`
- `N8N_SSO_OIDC_CLIENT_SECRET=…`
- `N8N_SSO_OIDC_DISCOVERY_ENDPOINT=https://auth.maudet.cloud/.well-known/openid-configuration`
- `N8N_SSO_REDIRECT_LOGIN_TO_SSO=true` — the email/password form is
  skipped and visitors land directly on Authelia.
- `N8N_SSO_JUST_IN_TIME_PROVISIONING=true` — first-time OIDC sign-in
  creates the n8n user from the claims.

The Authelia client `n8n` on hermes has the redirect URI
`https://n8n.dev-twake.maudet.cloud/rest/sso/oidc/callback` and uses
`token_endpoint_auth_method: client_secret_post`.

## Files

- `Dockerfile` — builds `n8n-patched:latest` from `n8nio/n8n:latest` and
  runs `patch-license.js` (no `sh`, no `apk` on the base image; we use
  `node` instead).
- `patch-license.js` — Node script that patches both
  `@n8n/backend-common/dist/license-state.js` (module-registry gate)
  and `/usr/local/lib/node_modules/n8n/dist/license.js` (controller
  middleware gate) so that any check for `feat:oidc` returns `true`.

## How it runs

```sh
docker run -d --name n8n --restart unless-stopped \
  -p 6120:5678 \
  -e N8N_HOST=n8n.dev-twake.maudet.cloud \
  -e N8N_PROTOCOL=https \
  -e WEBHOOK_URL=https://n8n.dev-twake.maudet.cloud/ \
  -e N8N_EDITOR_BASE_URL=https://n8n.dev-twake.maudet.cloud \
  -e N8N_PROXY_HOPS=1 \
  -e N8N_USER_MANAGEMENT_AUTHENTICATION_METHOD=email \
  -e N8N_SSO_MANAGED_BY_ENV=true \
  -e N8N_SSO_OIDC_LOGIN_ENABLED=true \
  -e N8N_SSO_OIDC_CLIENT_ID=n8n \
  -e N8N_SSO_OIDC_CLIENT_SECRET=… \
  -e N8N_SSO_OIDC_DISCOVERY_ENDPOINT=https://auth.maudet.cloud/.well-known/openid-configuration \
  -e N8N_SSO_OIDC_PROMPT=select_account \
  -e N8N_SSO_REDIRECT_LOGIN_TO_SSO=true \
  -e N8N_SSO_JUST_IN_TIME_PROVISIONING=true \
  -e GENERIC_TIMEZONE=Europe/Paris \
  -v n8n_data:/home/node/.n8n \
  n8n-patched:latest
```

UFW: `sudo ufw allow in on tailscale0 to any port 6120`.

## nginx vhost (on hermes)

`/etc/nginx/sites-available/n8n` proxies
`https://n8n.dev-twake.maudet.cloud/` → `http://100.64.110.85:6120`
(athena via Tailscale), strips `X-Frame-Options` and rewrites CSP to
`frame-ancestors https://*.dev-twake.maudet.cloud` for iframe embedding
inside the Cozy `n8n` webapp. **No Authelia `forwardAuth` snippet** —
OIDC happens inside n8n itself.
