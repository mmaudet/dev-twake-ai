# Hermes nginx patches

Scripts to apply on `hermes` (the reverse-proxy VPS) for behaviours that
can't live in the Cozy stack itself.

## `patch-dev-twake-nginx.py`

Idempotent. Injects a `<style id="cozy-launcher-hide">` block via nginx
`sub_filter` into every Cozy HTML response served by the catch-all
vhost `dev-twake` (i.e. every coquille + the cozy-home grid). The style
hides the launcher tiles for the `dataproxy` and `store` apps using
several selectors (href, data-slug, aria-label) — Cozy provides no
runtime knob to reorder/hide apps in the launcher (the list is
alphabetical by `slug`, immutable).

Markers `# >>> cozy-launcher-hide >>>` … `# <<< cozy-launcher-hide <<<`
are used to remove any previous version of the block before
re-inserting it, so repeated runs are safe.

### Deploy

```sh
scp scripts/hermes/patch-dev-twake-nginx.py hermes:/tmp/
ssh hermes 'sudo python3 /tmp/patch-dev-twake-nginx.py \
  && sudo nginx -t \
  && sudo systemctl reload nginx'
```

### Reverting

Edit `/etc/nginx/sites-available/dev-twake` and remove the block
between the markers, then reload nginx.

### Caveats

- `proxy_set_header Accept-Encoding ""` is added so cozy-stack returns
  uncompressed HTML for `sub_filter` to operate on. Minor bandwidth
  cost on HTML responses, negligible compared to the JS/CSS bundles
  that are cached.
- The CSS is purely cosmetic. The apps are still installed and reachable
  by typing the URL directly (`<slug>-dataproxy.…`, `<slug>-store.…`).
