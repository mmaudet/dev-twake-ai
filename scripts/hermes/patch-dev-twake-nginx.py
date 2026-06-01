#!/usr/bin/env python3
"""Patch dev-twake nginx vhost to inject a CSS that hides the `dataproxy`
and `store` apps from cozy-bar (the launcher) and the cozy-home grid.

Cozy doesn't expose a runtime knob to reorder/hide apps in the launcher;
the order is alphabetical on `slug` and that slug is immutable. We
inject a style sheet via nginx sub_filter on the catch-all vhost so
that *every* Cozy webapp (each coquille + the home itself) loads it.

Idempotent: drops any previous block matching our marker before
re-inserting the current version.
"""
import re

p = '/etc/nginx/sites-available/dev-twake'
s = open(p).read()

MARKER_START = "# >>> cozy-launcher-hide >>>"
MARKER_END = "# <<< cozy-launcher-hide <<<"

# CSS hides the launcher tiles + home cards whose link points at a
# `<slug>-dataproxy.…` / `<slug>-store.…` subdomain, and any element
# that carries the slug as a data-* attribute or aria-label.
css = (
    "<style id=\"cozy-launcher-hide\">"
    "a[href*=\"-dataproxy.\"],"
    "a[href*=\"-store.\"],"
    "[data-app-slug=\"dataproxy\"],"
    "[data-app-slug=\"store\"],"
    "[data-slug=\"dataproxy\"],"
    "[data-slug=\"store\"],"
    "[aria-label=\"Twake Store\" i],"
    "[aria-label=\"Cozy Store\" i],"
    "[aria-label=\"Store\" i],"
    "[aria-label=\"cozy-data-proxy\" i],"
    "[aria-label=\"Cozy Data Proxy\" i],"
    "[aria-label=\"dataproxy\" i]"
    "{display:none !important;}"
    "</style>"
)

new_block = (
    f"        {MARKER_START}\n"
    "        sub_filter_once on;\n"
    f"        sub_filter '</head>' '{css}</head>';\n"
    "        proxy_set_header Accept-Encoding \"\";\n"
    f"        {MARKER_END}\n"
)

# --- Step 1: scrub any previous block we may have inserted -----------
# Remove our marker-delimited block (idempotent re-runs).
s = re.sub(
    rf"^[ \t]*{re.escape(MARKER_START)}.*?{re.escape(MARKER_END)}\n",
    "",
    s,
    flags=re.MULTILINE | re.DOTALL,
)
# Also collapse any duplicate "    }" left by a botched previous run
# (two consecutive lines that contain only "    }").
s = re.sub(r"(\n    \})(\n    \})+", r"\1", s)

# --- Step 2: insert the new block right before the closing `    }`
# of the first `location / { … }` block.
sentinel = "proxy_set_header X-Forwarded-Host  $host;\n"
needle = sentinel + "    }"  # the last header line right before the close
if needle not in s:
    raise SystemExit(
        "ERROR: could not locate the 'X-Forwarded-Host' sentinel; the file "
        "structure must have changed. Aborting to avoid corrupting it."
    )

replacement = sentinel + new_block + "    }"
s = s.replace(needle, replacement, 1)

open(p, 'w').write(s)
print("patched")
