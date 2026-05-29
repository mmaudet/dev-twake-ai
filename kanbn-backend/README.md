# kan.bn backend

[kan.bn](https://kan.bn/) (open-source Trello alternative) running in
Docker Compose on `athena`, exposed publicly through the `nginx` vhost on
`hermes` at `https://kanbn.dev-twake.maudet.cloud/`.

## Files

- `docker-compose.yml` — three services: `postgres` (DB), `migrate`
  (one-shot DB migrations), and `web` (Next.js, exposed on
  `0.0.0.0:6090` → container port 3000).
- `run.sh` — wrapper that calls `docker compose up -d` reading env from
  `~/.kanbn/kanbn.env` (gitignored) or `./.env`. See `.env.example`.

## SSO via Authelia OIDC

Plain OIDC, no patching needed — kan uses `better-auth`'s `genericOAuth`
plugin which is enabled as soon as `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`
and `OIDC_DISCOVERY_URL` are all set. The login page exposes the OIDC
button once `/api/auth/social-providers` returns `"oidc"`.

- **kan side** (env vars): the three `OIDC_*` plus
  `NEXT_PUBLIC_ALLOW_CREDENTIALS=false` (turn off the email/password
  form). Discovery URL: `https://auth.maudet.cloud/.well-known/openid-configuration`.
- **Authelia side** (`/opt/authelia/config/configuration.yml` on hermes):
  client `kanbn`, redirect URI
  `https://kanbn.dev-twake.maudet.cloud/api/auth/oauth2/callback/oidc`,
  `token_endpoint_auth_method: client_secret_post`. Unlike OpenProject
  (which posts via HTTP Basic), better-auth sends the client secret as
  a form field; if Authelia is set to `client_secret_basic` for this
  client the token exchange fails with
  `invalid_client / token_endpoint_auth_method 'client_secret_post' however the OAuth 2.0 client registration does not allow this method`.

`BETTER_AUTH_TRUSTED_ORIGINS` lists every Cozy app subdomain that will
embed kan in an iframe (one per user). Without this, better-auth rejects
the OIDC callback for cross-origin requests.

## nginx vhost (on hermes)

The vhost `/etc/nginx/sites-available/kanbn` proxies
`https://kanbn.dev-twake.maudet.cloud/` → `http://100.64.110.85:6090`
(athena via Tailscale). Same iframe header trick as OpenProject: strip
`X-Frame-Options`, rewrite CSP to `frame-ancestors https://*.dev-twake.maudet.cloud`.

## First user

kan auto-provisions users on first OIDC login from the email claim.
The first user to sign in becomes the workspace owner.
