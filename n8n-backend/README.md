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

## Skipping first-boot gates

n8n shows two screens on a fresh `n8n_data` volume that we want gone so
that users SSO straight into the editor:

1. **"Set up owner account" form.** Even with the SSO redirect on,
   n8n refuses to boot the editor until an owner exists. n8n
   supports seeding the owner from env vars
   (`OwnerInstanceSettingsLoader` in
   `dist/instance-settings-loader/loaders/owner.instance-settings-loader.js`)
   — we use that:

   - `N8N_INSTANCE_OWNER_MANAGED_BY_ENV=true`
   - `N8N_INSTANCE_OWNER_EMAIL=mmaudet@linagora.com`
   - `N8N_INSTANCE_OWNER_FIRST_NAME=Michel`
   - `N8N_INSTANCE_OWNER_LAST_NAME=Maudet`
   - `N8N_INSTANCE_OWNER_PASSWORD_HASH=$2a$10$…` — a **bcrypt** hash
     (regex `^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$`), not the raw
     password. Generate it from inside the running container:

     ```sh
     docker exec n8n node -e \
       "const b=require('/usr/local/lib/node_modules/n8n/node_modules/.pnpm/bcryptjs@2.4.3/node_modules/bcryptjs');
        b.hash(process.argv[1],10).then(h=>process.stdout.write(h));" \
       'YOUR_PASSWORD'
     ```

   With these set, n8n logs `Owner was set up successfully` on every
   cold boot and the local email/password login still works as a
   break-glass fallback if Authelia is down.

2. **"Customize n8n to you" personalization survey.** Shown to every
   first-time user (including JIT-provisioned OIDC users). Disabled
   globally with `N8N_PERSONALIZATION_ENABLED=false` — the frontend
   computes `personalizationSurveyEnabled =
   personalization.enabled && diagnostics.enabled` (see
   `dist/services/frontend.service.js`), so flipping this single var
   hides the modal for everyone.

## Files

- `Dockerfile` — builds `n8n-patched:latest` from `n8nio/n8n:latest` and
  runs `patch-license.js` (no `sh`, no `apk` on the base image; we use
  `node` instead).
- `patch-license.js` — Node script that patches both
  `@n8n/backend-common/dist/license-state.js` (module-registry gate)
  and `/usr/local/lib/node_modules/n8n/dist/license.js` (controller
  middleware gate) so that any check for `feat:oidc` returns `true`.

## How it runs

The full env (OIDC + owner seed + survey gate + base config) lives in
`~/.n8n-secrets/n8n.env` on athena (mode `600`, not in the repo
because of the bcrypt hash and the Authelia client secret). Bringing
the container up or restarting it is then:

```sh
docker run -d --name n8n --restart unless-stopped \
  -p 6120:5678 \
  --env-file /home/mmaudet/.n8n-secrets/n8n.env \
  -v n8n_data:/home/node/.n8n \
  n8n-patched:latest
```

The env file currently holds:

```
N8N_HOST=n8n.dev-twake.maudet.cloud
N8N_PROTOCOL=https
WEBHOOK_URL=https://n8n.dev-twake.maudet.cloud/
N8N_EDITOR_BASE_URL=https://n8n.dev-twake.maudet.cloud
N8N_PROXY_HOPS=1
N8N_USER_MANAGEMENT_AUTHENTICATION_METHOD=email
N8N_PERSONALIZATION_ENABLED=false
GENERIC_TIMEZONE=Europe/Paris

# OIDC SSO via Authelia
N8N_SSO_MANAGED_BY_ENV=true
N8N_SSO_OIDC_LOGIN_ENABLED=true
N8N_SSO_OIDC_CLIENT_ID=n8n
N8N_SSO_OIDC_CLIENT_SECRET=…
N8N_SSO_OIDC_DISCOVERY_ENDPOINT=https://auth.maudet.cloud/.well-known/openid-configuration
N8N_SSO_OIDC_PROMPT=select_account
N8N_SSO_REDIRECT_LOGIN_TO_SSO=true
N8N_SSO_JUST_IN_TIME_PROVISIONING=true

# Seeded instance owner (skips the "Set up owner account" form)
N8N_INSTANCE_OWNER_MANAGED_BY_ENV=true
N8N_INSTANCE_OWNER_EMAIL=mmaudet@linagora.com
N8N_INSTANCE_OWNER_FIRST_NAME=Michel
N8N_INSTANCE_OWNER_LAST_NAME=Maudet
N8N_INSTANCE_OWNER_PASSWORD_HASH=$2a$10$…
```

UFW: `sudo ufw allow in on tailscale0 to any port 6120`.

## nginx vhost (on hermes)

`/etc/nginx/sites-available/n8n` proxies
`https://n8n.dev-twake.maudet.cloud/` → `http://100.64.110.85:6120`
(athena via Tailscale), strips `X-Frame-Options` and rewrites CSP to
`frame-ancestors https://*.dev-twake.maudet.cloud` for iframe embedding
inside the Cozy `n8n` webapp. **No Authelia `forwardAuth` snippet** —
OIDC happens inside n8n itself.
