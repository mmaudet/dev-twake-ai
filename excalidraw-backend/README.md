# Excalidraw backend

[Excalidraw](https://excalidraw.com/) (open-source whiteboard) running
in Docker on `athena`, gated by Authelia, exposed publicly through the
nginx vhost on `hermes` at `https://excalidraw.dev-twake.maudet.cloud/`.

Excalidraw's open-source build is fully client-side: it ships only the
React editor, with no backend, no per-user storage and no auth layer.
Drawings live in the browser's `localStorage`. There is therefore
nothing to expose to a database or to wire to OIDC at the application
level.

## How it runs

- `excalidraw` container (`excalidraw/excalidraw:latest`) bound to
  athena `0.0.0.0:6100` → container nginx on `:80`. Single command,
  no volume, no env vars:

  ```sh
  docker run -d --name excalidraw --restart unless-stopped \
      -p 6100:80 excalidraw/excalidraw:latest
  ```

- UFW: `sudo ufw allow in on tailscale0 to any port 6100`.

## SSO via Authelia

Authelia gates access at the reverse-proxy level using the same
`forwardAuth` snippets as paperless / immich / bichon:
`/etc/nginx/snippets/authelia-location.conf` and
`/etc/nginx/snippets/authelia-authrequest.conf` on hermes. The
`access_control.rules` list on hermes has a one_factor entry for
`excalidraw.dev-twake.maudet.cloud`. No app-level OIDC client needed.

A user who already has an Authelia session (e.g. came from
OpenProject or kan.bn) gets straight to Excalidraw without any login
prompt. A user with no session is bounced to `auth.maudet.cloud` and
back. Headers on `auth.maudet.cloud` have already been relaxed to let
this happen inside the Cozy iframe.

## nginx vhost (on hermes)

`/etc/nginx/sites-available/excalidraw` proxies
`https://excalidraw.dev-twake.maudet.cloud/` → `http://100.64.110.85:6100`
(athena via Tailscale), applies `authelia-location.conf` +
`authelia-authrequest.conf`, strips `X-Frame-Options` and rewrites CSP
to `frame-ancestors https://*.dev-twake.maudet.cloud` so the Cozy
`excalidraw` webapp can host it in an iframe.

## Persistence caveat

Each browser keeps its own drawings. There is no per-user cloud
storage and no cross-device sync; close the tab without an explicit
export and the drawing is gone with the localStorage that holds it.
For real collaboration / persistence one would have to plug a custom
backend or move to Excalidraw+. We accept the trade-off here.
