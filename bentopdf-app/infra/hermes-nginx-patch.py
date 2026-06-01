#!/usr/bin/env python3
"""Patch nginx vhost for bentopdf to inject a light-theme CSS override.

The base palette swap on :root + --color-* variables is not enough because
parts of BentoPDF's bundle ship hex literals (#111827, #1e2939, #1f2937…)
inside the CSS or as Vue/JS inline styles. We layer hard `!important`
overrides on the Tailwind utility classes to win against them.
"""
import re

p = '/etc/nginx/sites-available/bentopdf'
s = open(p).read()

# ------------------------------------------------------------------
# Light theme palette (Tailwind-like, hex for portability against
# inline-style values; CSS vars stay swapped too for any class that
# resolves them).
# ------------------------------------------------------------------
LIGHT_BG = '#ffffff'      # gray-900 ↔ pure white surface
LIGHT_BG_2 = '#f8f9fa'    # body backdrop
LIGHT_CARD = '#ffffff'    # gray-800 surface
LIGHT_CARD_HOVER = '#f1f5f9'
LIGHT_BORDER = '#e5e7eb'  # gray-700 border
LIGHT_TEXT = '#1a1d29'    # dark navy (was text-white)
LIGHT_TEXT_SOFT = '#475569'  # was text-gray-400

light_css = (
    # 1. :root variable swap (handles every class that resolves --color-gray-*)
    ":root{"
    "--color-gray-50:oklch(21% .034 264.665);"
    "--color-gray-100:oklch(27.8% .033 256.848);"
    "--color-gray-200:oklch(37.3% .034 259.733);"
    "--color-gray-300:oklch(44.6% .03 256.802);"
    "--color-gray-400:oklch(55.1% .027 264.364);"
    "--color-gray-500:oklch(70.7% .022 261.325);"
    "--color-gray-600:oklch(87.2% .01 258.338);"
    "--color-gray-700:oklch(92.8% .006 264.531);"
    "--color-gray-800:oklch(96.7% .003 264.542);"
    "--color-gray-900:oklch(98.5% .002 247.839);"
    "--color-white:" + LIGHT_TEXT + ";"
    "--color-black:#ffffff;"
    "}"
    # 2. Body + html: defeat the hardcoded #111827 background-color.
    "html,body{background-color:" + LIGHT_BG_2 + " !important;color:" + LIGHT_TEXT + " !important;}"
    # 3. Hardened class overrides (win over hex literals baked elsewhere)
    ".bg-gray-700,.bg-gray-750,.bg-gray-800,.bg-gray-850,.bg-gray-900{"
    "background-color:" + LIGHT_CARD + " !important;"
    "}"
    ".bg-black{background-color:" + LIGHT_BG + " !important;}"
    ".bg-white{background-color:" + LIGHT_TEXT + " !important;}"
    # tool cards (JS-injected, often combine rounded-xl + border-gray-700)
    "[class*=rounded-xl][class*=border-gray-700]{"
    "background-color:" + LIGHT_CARD + " !important;"
    "border-color:" + LIGHT_BORDER + " !important;"
    "}"
    ".border-gray-600,.border-gray-700,.border-gray-800{border-color:" + LIGHT_BORDER + " !important;}"
    # 4. Text overrides
    ".text-white{color:" + LIGHT_TEXT + " !important;}"
    ".text-gray-100,.text-gray-200,.text-gray-300{color:" + LIGHT_TEXT + " !important;}"
    ".text-gray-400,.text-gray-500{color:" + LIGHT_TEXT_SOFT + " !important;}"
    # Section titles use text-indigo-200/300/400 which are too pale on light
    # background. Darken them to indigo-700 (BentoPDF's primary accent).
    ".text-indigo-200,.text-indigo-300,.text-indigo-400{color:#4338ca !important;}"
    # Tool category headers (Outils populaires, Éditer et annoter, …) are
    # styled by a non-Tailwind rule .category-header{color:#fff;…} so the
    # gray-* overrides above don't touch them; force the indigo-700 accent.
    ".category-header,.category-chevron{color:#4338ca !important;}"
    ".category-header:hover,.category-header:hover .category-chevron{color:#312e81 !important;}"
    # 5. Common BentoPDF hex literals that show up as inline styles or
    # tailwind arbitrary values like bg-[#111827].
    "[style*=\"#111827\"],[style*=\"#1e2939\"],[style*=\"#1f2937\"]{"
    "background-color:" + LIGHT_CARD + " !important;"
    "}"
)

# ------------------------------------------------------------------
# Hide BentoPDF chrome (demo cleanup, same as before)
# ------------------------------------------------------------------
hide_css = (
    "nav[data-simple-nav=\"true\"]{display:none !important}"
    "#tools-header{display:none !important}"
    "#simple-mode-lang-switcher{display:none !important}"
    "#app{padding-top:1.5rem !important}"
)

style_block = "<style>" + light_css + hide_css + "</style>"

banner = (
    "<div id=\"cozy-demo-banner\" "
    "style=\"position:relative;z-index:9999;background:#ED7B23;color:#fff;"
    "font-family:system-ui,sans-serif;font-size:.9em;padding:.6em 1em;"
    "text-align:center;border-bottom:1px solid #c25e0d;\">"
    "Démonstration — seulement 17 outils sur 117 sont affichés "
    "ici. Une sélection plus large peut être configurée dans le "
    "cadre du projet."
    "</div>"
)

replacement = '<body class="antialiased">' + style_block + banner
new_line = "        sub_filter '<body class=\"antialiased\">' '" + replacement + "';"

s, n = re.subn(
    r"^[ \t]*sub_filter '<body class=\"antialiased\">' '[^']*';",
    new_line,
    s,
    count=1,
    flags=re.MULTILINE,
)
if n == 0:
    raise SystemExit("ERROR: no sub_filter line matched")

open(p, 'w').write(s)
print(f"patched ({n} replacement)")
