# Grist backend

[Grist](https://github.com/gristlabs/grist-core) running in Docker on
`athena`, exposed publicly through the nginx vhost on `hermes` at
`https://grist.dev-twake.maudet.cloud/`.

## Files

- `run.sh` — recreates the `grist` container with the env vars the
  install needs to actually serve OIDC traffic. Reads the OIDC client
  secret and session secret from `~/.grist/grist.env` (gitignored).
- `.env.example` — schema for `~/.grist/grist.env`.

## SSO via Authelia OIDC

Grist exposes its login flow through the OIDC provider declared in env
vars; the wrapper hits `POST /signin` (or `GET /`) and Grist 302s to
the Authelia authorization endpoint. The Authelia client `grist` on
hermes has the redirect URI
`https://grist.dev-twake.maudet.cloud/oauth2/callback` and uses
`token_endpoint_auth_method: client_secret_basic` (Grist's
openid-client posts the secret in the Authorization header).

### Required env

What gets the SSO actually working end-to-end (the lessons learned
during the first deploy):

- `GRIST_LOGIN_SYSTEM_TYPE=oidc` — Grist defaults to the boot-key
  fallback unless the active provider is explicitly selected.
- `GRIST_IN_SERVICE=true` — Without this, `FlexServer.addSetupGate`
  whitelists only `/admin`, `/boot`, `/status`, `/api/log` and
  `/api/session` and redirects every other path to `/boot`, regardless
  of OIDC config.
- `GRIST_SANDBOX_FLAVOR=gvisor` — Otherwise the `sandboxing` install
  probe is in "fault" and the admin panel keeps yelling at you. gvisor
  is what ships in the upstream image so it's the right value.
- `GRIST_OIDC_IDP_END_SESSION_ENDPOINT=https://auth.maudet.cloud/logout`
  — Authelia's `.well-known/openid-configuration` doesn't advertise an
  `end_session_endpoint`, and `openid-client` errors out at startup
  unless you either point at one explicitly or set
  `GRIST_OIDC_IDP_SKIP_END_SESSION_ENDPOINT=true`.
- `GRIST_FORCE_LOGIN=true` plus `GRIST_SINGLE_ORG=twake-dev` to skip
  the public landing page and force every visitor through the OIDC
  flow into a single workspace.

## nginx vhost (on hermes)

`/etc/nginx/sites-available/grist` proxies
`https://grist.dev-twake.maudet.cloud/` → `http://100.64.110.85:6110`
(athena via Tailscale). Same iframe header trick as OpenProject /
kanbn: strip `X-Frame-Options`, rewrite CSP to
`frame-ancestors https://*.dev-twake.maudet.cloud`.

## First admin

The first user to sign in via OIDC whose email matches
`GRIST_DEFAULT_EMAIL` becomes the workspace owner; everyone else is
provisioned as a regular member.
