# `feature/bentopdf` — Coquille « PDF Toolkit » + file picker Drive

## En une phrase

Coquille Cozy `bentopdf` qui frame BentoPDF (toolkit PDF 100 % browser-side, AGPL-3.0) self-hosté sur athena. La dropzone d'upload de BentoPDF est augmentée d'une seconde carte symétrique « Depuis votre Drive » qui ouvre un file explorer Drive (breadcrumb, navigation dossiers), récupère le PDF choisi et l'injecte dans BentoPDF comme s'il avait été drag-droppé.

## Topologie

Coquille **autonome** (pas branchée sur `feature/twake-drive-fork`) — BentoPDF est isolé sur son propre sous-domaine, l'intégration avec le Drive passe par l'API REST de cozy-stack et un bridge JavaScript injecté.

```
main
└── feature/bentopdf                  ← coquille + infra/

main (référence)
└── feature/twake-space               ← script deploy + entry provision
```

## Architecture globale

```
                    ┌─────────────────────────────────────────────┐
                    │  Coquille Cozy bentopdf-app                 │
                    │  <slug>-bentopdf.dev-twake.maudet.cloud     │
                    │  - cozy-bar                                 │
                    │  - <iframe src=…>                           │  ← drive picker modal (sur clic)
                    │      ┌───────────────────────────────────┐  │
                    │      │  BentoPDF (iframe)                │  │
                    │      │  bentopdf.dev-twake.maudet.cloud  │  │
                    │      │  + cozy-bridge.js (injecté nginx) │  │
                    │      │     ↳ bouton « Depuis votre Drive »│  │
                    │      └───────────────────────────────────┘  │
                    └─────────────────────────────────────────────┘
                                          │
                                          │  Authelia SSO (one_factor)
                                          ▼
                              ┌─────────────────────┐
                              │  Docker container   │
                              │  bentopdf:6130      │
                              │  athena             │
                              └─────────────────────┘
```

## Infra (athena + hermes)

| Composant | Détail |
|-----------|--------|
| Docker container `bentopdf` | Image `ghcr.io/alam00000/bentopdf-simple:latest`. Port 6130:8080. `restart=unless-stopped`. Monte `~/.bentopdf/config.json:/usr/share/nginx/html/config.json:ro` pour la liste `disabledTools` (17 outils gardés, 100 cachés). |
| nginx vhost `bentopdf.dev-twake.maudet.cloud` | `/etc/nginx/sites-available/bentopdf` sur hermes. proxy vers `100.64.110.85:6130`. Authelia gate one_factor. **Strip `Cross-Origin-Opener-Policy` + `Cross-Origin-Embedder-Policy`** (sinon les postMessage cross-origin parent→iframe sont dropped silencieusement). location dédiée pour `/cozy-bridge.js` (statique, no-auth, no-cache). |
| Cozy-bridge JS | `/etc/nginx/snippets/cozy-bridge.js` sur hermes. Injecté dans le HTML de **chaque** page BentoPDF via `sub_filter` (matche `<body class="antialiased">` ET `<body class="antialiased bg-gray-900">` — la 2e classe est sur les pages outils i18n type `/fr/crop-pdf`). |

Le script de patch nginx idempotent vit dans `bentopdf-app/infra/hermes-nginx-patch.py` et la source canonique du bridge dans `bentopdf-app/infra/cozy-bridge.js` (deux fichiers répliqués depuis hermes pour traçabilité repo).

## Structure de la coquille (`bentopdf-app/`)

```
bentopdf-app/
  manifest.webapp        slug "bentopdf", permissions io.cozy.files
                         GET/POST/PUT/PATCH, pas de DELETE
  index.html             coquille HTML : iframe vers bentopdf.dev-twake.
                         maudet.cloud + modal file picker côté coquille
  icon.png               favicon-no-bg.svg rendu en PNG 192×192 transparent
  bar.css / bar.js       cozy-bar bundle (copie depuis grist-app)
  infra/
    cozy-bridge.js       version vendored du bridge JS servi par nginx
    hermes-nginx-patch.py  script idempotent qui injecte/met à jour la
                         conf nginx vhost bentopdf sur hermes
    config.json          liste disabledTools BentoPDF (les 100 outils
                         retirés sur 117)
    README.md            instructions de déploiement
```

## Le bridge JS (`/cozy-bridge.js`)

Injecté dans chaque page BentoPDF, il fait 4 choses :

1. **Block du service worker BentoPDF**. Le SW recharge l'iframe à son activation, ce qui faisait silencieusement échouer le pipeline `postMessage` parent→iframe (bug observé en sessions multiples avant identification de la cause).
2. **Inject la carte « Depuis votre Drive »** à droite de la dropzone BentoPDF native (qui devient la carte gauche). Les 2 cartes sont visuellement symétriques (dashed border, padding, hover identique).
3. **Reçoit `postMessage({type:'cozy-load-pdf', name, arrayBuffer})`** de la coquille parent, recrée un `File`, et le pousse dans `#file-input` via `DataTransfer + change event` → BentoPDF traite le PDF comme un drag-drop natif.
4. **Émet `postMessage({type:'cozy-open-picker'})` vers le parent** quand l'utilisateur clique sur la carte Drive — la coquille parent ouvre alors le modal du file picker.

Verbose logs derrière `?debug=1` sur l'URL de l'iframe.

## Le file picker côté coquille

Le modal du picker (dans `bentopdf-app/index.html`) calque l'UX du Drive Twake :

- **Titre** : « Choisir un PDF depuis le Drive »
- **Breadcrumb** : `Drive › Dossier › Sous-dossier`, chaque crumb cliquable
- **Liste** : dossiers en premier (alpha-sort), puis PDFs (alpha-sort)
- **Filtres** : seuls les `directory` et les `file` avec `mime === 'application/pdf'` sont affichés
- **Icônes** : SVG inline (folder + chevron pour les dossiers, badge `PDF` rouge pour les fichiers)
- **Hover** : light gray background
- **Click sur dossier** → descend dedans, update breadcrumb
- **Click sur PDF** → fetch `/files/download/<id>`, convertit en `ArrayBuffer`, `postMessage` à l'iframe

API utilisée côté cozy-stack :

- `GET /files/<dirId>?include=contents` → retourne le dossier + un `included` avec chaque enfant détaillé
- `GET /files/download/<fileId>` → binaire du PDF

## Le sub_filter nginx (modifications côté hermes)

Sur le vhost `bentopdf.dev-twake.maudet.cloud` :

```nginx
sub_filter_once on;
sub_filter '<body class="antialiased">'              '<body class="antialiased">{INJECTIONS}';
sub_filter '<body class="antialiased bg-gray-900">'  '<body class="antialiased bg-gray-900">{INJECTIONS}';
proxy_set_header Accept-Encoding "";    # nginx sub_filter ne touche que les responses uncompressed
proxy_hide_header Cross-Origin-Opener-Policy;
proxy_hide_header Cross-Origin-Embedder-Policy;
```

`{INJECTIONS}` contient (généré par le script `hermes-nginx-patch.py`) :
- `<style>` light-theme : swap des CSS variables `--color-gray-*` (palette inversée) + overrides agressifs pour les classes Tailwind qui ne passent pas par les variables, + force le `body { background; color }` qui est hardcodé en `#111827`
- `<style>` hide chrome : retire `nav[data-simple-nav]`, `#tools-header`, `#simple-mode-lang-switcher`, override `.category-header` pour qu'elle soit lisible
- `<script src="/cozy-bridge.js">` (statique)
- `<div id="cozy-demo-banner">` orange : « Démonstration — seulement 17 outils sur 117 sont affichés ici. Une sélection plus large peut être configurée dans le cadre du projet. »

Idempotent : le script remplace en place sa propre block via marqueurs.

## Sélection des 17 outils (sur 117 dispo)

Liste dans `bentopdf-app/infra/config.json`, montée dans le container :

- **Manipulation pages** : merge-pdf, split-pdf, rotate-pdf, delete-pages, extract-pages
- **Optimisation** : compress-pdf, crop-pdf, add-watermark, header-footer
- **Édition** : edit-pdf, ocr-pdf, form-filler
- **Conversions** : jpg-to-pdf, image-to-pdf, word-to-pdf, excel-to-pdf, powerpoint-to-pdf

Les outils sécurité (sign-pdf, encrypt-pdf, decrypt-pdf) ont été explicitement retirés à la demande (commit du config.json sur `feature/bentopdf`).

Pour ajuster : éditer `~/.bentopdf/config.json` (ou son équivalent dans `bentopdf-app/infra/`), `docker restart bentopdf`, et mettre à jour le bandeau (« 17 outils » → nouveau compte) via `scripts/hermes/patch-dev-twake-nginx.py`. *Le compte est aussi inscrit dans le sub_filter banner — pas oublier de l'aligner.*

## Bugs notables résolus

Pendant l'intégration (toutes traces dans la branche `feature/bentopdf`) :

| Bug | Cause | Fix |
|-----|-------|-----|
| Zone blanche entre cozy-bar et l'iframe | iframe injectée par JS → div parent vide pendant le premier paint | iframe en HTML statique + `body { display: flex }` inconditionnel |
| Couleurs des cards restent sombres après swap de variables CSS | BentoPDF utilise aussi des hex literals en dur (`#111827`, `#1e2939`, `#1f2937`) | Override `!important` ciblé via classes + sélecteur d'attribut `[style*="#111827"]` |
| Titres de sections « Outils populaires » invisibles | Classe `.category-header` a `color: #fff` hardcodé en dehors des variables | Override CSS `.category-header { color: #4338ca !important }` |
| Toggle thème clair → cards toujours sombres | `bg-gray-850` (custom BentoPDF) pas dans la palette des variables | Override de `bg-gray-700/750/800/850/900` toutes en blanc `!important` |
| Drive → BentoPDF : `postMessage` silently dropped | `COOP: same-origin` + `COEP: credentialless` isolent BentoPDF dans son propre browsing-context-group | `proxy_hide_header` côté nginx pour strip les 2 headers |
| Bridge n'est pas injecté sur `/fr/crop-pdf` | Le `<body>` de la home (`class="antialiased"`) diffère de celui des pages outils (`class="antialiased bg-gray-900"`) | 2 sub_filter au lieu d'un, un par variant de body |
| Service Worker BentoPDF reload l'iframe et casse postMessage | Le SW déclenche `window.location.reload()` à son activation | Block du SW en monkey-patchant `navigator.serviceWorker.register` au boot du bridge |
| Blob via postMessage cross-origin parfois dropped | Compatibilité Chrome + Firefox sur structured-clone Blob cross-origin avec COEP/COOP | Conversion vers `ArrayBuffer` côté coquille avant l'envoi, sans la liste transferable (plain structured-clone) |

## Permissions manifest

```json
"files": {
  "type": "io.cozy.files",
  "verbs": ["GET", "POST", "PUT", "PATCH"]
}
```

Identique à Excalidraw (le PDF est un binaire dans le Drive, pas un shortcut). Pas de `DELETE` — la coquille ne supprime jamais de fichier.

## Déploiement

```sh
scripts/deploy-app.sh bentopdf --branch feature/bentopdf
```

Slug pré-câblé dans `deploy-app.sh` (commit `bc652c25a` sur `feature/twake-space`). L'app est installée sur les 8 instances. Pour les futurs users, l'install se fait automatiquement via `scripts/provision-user.sh` (commit `ca6efef81`).

Pour les modifications du bridge / banner / sélection d'outils, redéployer aussi côté hermes :

```sh
scp bentopdf-app/infra/{cozy-bridge.js,hermes-nginx-patch.py} hermes:/tmp/
ssh hermes 'sudo cp /tmp/cozy-bridge.js /etc/nginx/snippets/cozy-bridge.js \
  && sudo python3 /tmp/hermes-nginx-patch.py \
  && sudo nginx -t && sudo systemctl reload nginx'
```

## Points à confirmer avec l'équipe

- **Fork BentoPDF vs upstream** : on consomme l'image `ghcr.io/alam00000/bentopdf-simple:latest` sans fork. Le bridge JS est injecté côté nginx, pas dans l'image. Acceptable mais fragile si BentoPDF refactor son markup (le bridge cherche `#file-input` et `<body class="antialiased">`).
- **AGPL-3.0** : BentoPDF est sous AGPL. Notre repo `mmaudet/dev-twake-ai` est public depuis le 2026-05-31 — conforme.
- **Strip COEP/COOP** : tradeoff coûteux côté sécurité (perd la cross-origin isolation utilisée par BentoPDF pour `SharedArrayBuffer` dans les conversions Office). Pas critique sur notre sélection actuelle de 17 outils (aucun n'utilise les conversions Office), mais à reconsidérer si la liste s'étend.
- **`Cmd+Shift+R` requis** après chaque déploiement nginx — les caches navigateur (HTML + cozy-stack hash) sont tenaces. Pas de mécanisme cache-bust pour le bridge (il a `Cache-Control: no-store` côté nginx, mais le `<script src="/cozy-bridge.js">` lui-même est dans le HTML injecté par sub_filter).
- **Service Worker block** est invasif. Si BentoPDF mise à jour ajoute des features dépendant du SW (offline mode, push notif), elles seront cassées.
- **Liste des 17 outils** : à ajuster avec l'équipe selon les use cases prioritaires.
