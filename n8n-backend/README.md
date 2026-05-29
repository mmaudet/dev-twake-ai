# n8n backend

[n8n](https://n8n.io/) (workflow automation) running in Docker on
`athena`, gated by Authelia, exposed publicly through the nginx vhost
on `hermes` at `https://n8n.dev-twake.maudet.cloud/`.

## Authentication

n8n's native OIDC SSO is locked behind the Enterprise license
(`@BackendModule({ name: 'sso-oidc', licenseFlag: 'feat:oidc' })`).
Rather than patching the source like we did for OpenProject, we take
the same shortcut as Excalidraw:

- `N8N_USER_MANAGEMENT_DISABLED=true` — turns off n8n's built-in
  email/password auth, so anyone reaching the editor is the (single)
  owner.
- Authelia's `forwardAuth` middleware on the nginx vhost gates access:
  the visitor must hold an Authelia session before they can reach n8n.
- The `access_control.rules` list on hermes has a `one_factor` entry
  for `n8n.dev-twake.maudet.cloud`.

There is therefore no per-user account in n8n, only the shared owner
identity. Authentication identity lives in the Authelia session.

## How it runs

```sh
docker run -d --name n8n --restart unless-stopped \
  -p 6120:5678 \
  -e N8N_HOST=n8n.dev-twake.maudet.cloud \
  -e N8N_PROTOCOL=https \
  -e WEBHOOK_URL=https://n8n.dev-twake.maudet.cloud/ \
  -e N8N_EDITOR_BASE_URL=https://n8n.dev-twake.maudet.cloud \
  -e N8N_PROXY_HOPS=1 \
  -e N8N_USER_MANAGEMENT_DISABLED=true \
  -e N8N_USER_MANAGEMENT_AUTHENTICATION_METHOD=email \
  -e GENERIC_TIMEZONE=Europe/Paris \
  -v n8n_data:/home/node/.n8n \
  n8nio/n8n:latest
```

UFW: `sudo ufw allow in on tailscale0 to any port 6120`.

## nginx vhost (on hermes)

`/etc/nginx/sites-available/n8n` proxies
`https://n8n.dev-twake.maudet.cloud/` → `http://100.64.110.85:6120`
(athena via Tailscale), applies `authelia-location.conf` +
`authelia-authrequest.conf`, strips `X-Frame-Options` and rewrites CSP
to `frame-ancestors https://*.dev-twake.maudet.cloud` for iframe
embedding inside the Cozy `n8n` webapp.
