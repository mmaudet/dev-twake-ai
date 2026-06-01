# BentoPDF infra artefacts

Out-of-repo files needed to reproduce the current deployment. Versioned
here so that a fresh hermes / athena can be set up by copying these two
files to the right paths and running the standard deploy.

## `config.json`

Runtime config consumed by the BentoPDF Docker container. Lists the
~100 tools to hide so only the 17 "core" tools appear in the
SIMPLE_MODE home grid.

**Deploy location** (athena):
```
~/.bentopdf/config.json   (chmod 644)
```

**Wired into the container** via the existing `docker run` command:
```sh
docker rm -f bentopdf
docker run -d --name bentopdf --restart=unless-stopped \
  -p 6130:8080 \
  -v ~/.bentopdf/config.json:/usr/share/nginx/html/config.json:ro \
  ghcr.io/alam00000/bentopdf-simple:latest
```

To change the tool selection, edit `disabledTools` (add or remove
tool IDs from the list) and either `docker restart bentopdf` (re-reads
on next request) or recreate the container. The full list of 117
tool IDs is obtained via:
```sh
docker exec bentopdf sh -c 'ls /usr/share/nginx/html/*.html' \
  | xargs -n1 basename | sed s/\\.html// | sort
```

If the count changes, also update the banner text in
`hermes-nginx-patch.py` (line saying `seulement 17 outils sur 117…`).

## `hermes-nginx-patch.py`

Idempotent Python script that injects two things into the
hermes vhost `/etc/nginx/sites-available/bentopdf`, inside its
`sub_filter` for `<body class="antialiased">`:

1. **Light-theme CSS override** — swaps Tailwind `--color-gray-*`
   variables on `:root`, defeats the hardcoded `#111827` body
   background, hardens the visible classes (`bg-gray-800`, `text-white`,
   `text-indigo-400`, `.category-header`, …) so BentoPDF's dark UI
   renders in a light scheme. See the comment at the top of the script
   for the full reasoning — there's no out-of-the-box light mode in
   BentoPDF; this is a CSS workaround.
2. **Demo chrome hide** — `nav[data-simple-nav]`, `#tools-header`,
   `#simple-mode-lang-switcher` set to `display: none !important`.
3. **Orange demo banner** — fixed text « Démonstration — seulement
   17 outils sur 117 sont affichés ici. Une sélection plus large peut
   être configurée dans le cadre du projet. »

**Deploy:**
```sh
scp bentopdf-app/infra/hermes-nginx-patch.py hermes:/tmp/
ssh hermes 'sudo python3 /tmp/hermes-nginx-patch.py \
  && sudo nginx -t \
  && sudo systemctl reload nginx'
```

The script regex-replaces the existing `sub_filter '<body …>' '…';`
line in place; re-running it picks the latest CSS / banner content
without duplicating anything.

## Drive double-click dispatch (Phase 2)

Intentionally reverted in commit `b81979301` on
`feature/twake-drive-fork` — double-clicking a `.pdf` in the Drive
falls back to the native viewer instead of opening BentoPDF (the user
asked to drop that path).

See `docs/design/bentopdf-integration.md` on `main` for the full
phase-by-phase reasoning.
