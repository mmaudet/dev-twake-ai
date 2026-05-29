# OpenProject backend

OpenProject Community Edition 13 running in Docker on `athena`, exposed
publicly through the `nginx` vhost on `hermes` at
`https://openproject.dev-twake.maudet.cloud/`.

## Files

- `Dockerfile` — builds `openproject-patched:13`, an
  `openproject/community:13` derivative where the `EnterpriseToken`
  gate around `OpenProject::Plugins::AuthPlugin.filtered_strategy?` is
  always-true. This is what lets us plug OIDC (an Enterprise-only feature
  in upstream Community) without buying a license.
- `run.sh` — recreates the `openproject` container from the patched
  image with the right env vars. Reads the OIDC client secret from
  `~/.openproject/op_oidc.env` (gitignored). Run `docker build -t
  openproject-patched:13 .` first.

## SSO via Authelia OIDC

The container points at Authelia (`https://auth.maudet.cloud`) as the
sole OIDC identity provider. Configuration lives in two places:

1. **OpenProject side** — env vars passed to the container (see
   `run.sh`):

   ```
   OPENPROJECT_OPENID__CONNECT_AUTHELIA_HOST=auth.maudet.cloud
   OPENPROJECT_OPENID__CONNECT_AUTHELIA_IDENTIFIER=openproject
   OPENPROJECT_OPENID__CONNECT_AUTHELIA_SECRET=<secret>
   OPENPROJECT_OPENID__CONNECT_AUTHELIA_AUTHORIZATION__ENDPOINT=/api/oidc/authorization
   OPENPROJECT_OPENID__CONNECT_AUTHELIA_TOKEN__ENDPOINT=/api/oidc/token
   OPENPROJECT_OPENID__CONNECT_AUTHELIA_USERINFO__ENDPOINT=/api/oidc/userinfo
   OPENPROJECT_OPENID__CONNECT_AUTHELIA_END__SESSION__ENDPOINT=/api/oidc/logout
   ```

   The provider key (here `AUTHELIA`) is the OmniAuth strategy name. The
   login button hits `POST /auth/authelia`, which redirects to Authelia.

   The endpoints are set explicitly because `USE__DISCOVERY=true` is
   silently ignored by the OmniAuth OpenIDConnect strategy in this
   integration: it falls back to the OAuth2 default `/authorize` and
   `/token` paths, which Authelia returns 404 for (Authelia exposes OIDC
   under `/api/oidc/*`).

2. **Authelia side** — `identity_providers.oidc.clients` entry on
   hermes (`/opt/authelia/config/configuration.yml`), with the same
   client id `openproject` and a hashed copy of the secret. Redirect
   URI: `https://openproject.dev-twake.maudet.cloud/auth/authelia/callback`.
   `token_endpoint_auth_method` must be `client_secret_basic` (OP sends
   the secret via HTTP Basic, not as a form field).

## nginx vhost (on hermes)

The vhost `/etc/nginx/sites-available/openproject` proxies
`https://openproject.dev-twake.maudet.cloud/` → `http://100.64.110.85:6080`
(athena via Tailscale). It strips `X-Frame-Options` and replaces
`Content-Security-Policy` with `frame-ancestors https://*.dev-twake.maudet.cloud`
so the app can be embedded inside the Cozy `openproject` webapp iframe.

## Two-factor authentication

OpenProject's default user-creation flow drops freshly-provisioned OIDC
users into the TOTP/WebAuthn setup screen, then bounces them back to
`/auth/authelia/callback` with the original (already-consumed) code —
which fails with 401. Disable TFA strategies entirely:

```sh
docker exec openproject bundle exec rails runner "
  Setting.plugin_openproject_two_factor_authentication = {
    'active_strategies' => [], 'enforced' => false,
    'allow_remember_for_days' => 0
  }
"
```

This is persistent in the OP database, so it survives container
recreates.

## Default credentials

First boot creates an `admin` user with password `admin`, which OP forces
you to change on first login. Otherwise users self-provision through
the Authelia OIDC flow.
