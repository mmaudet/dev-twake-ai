# BentoPDF — étude d'intégration en coquille Cozy

**Branche** : `feature/bentopdf`
**Statut** : étude pré-implémentation, à valider avant code.

## Contexte

Besoin : ajouter une app « PDF toolkit » à la stack `dev-twake.maudet.cloud`, avec friction minimale pour l'utilisateur. Idéalement réutiliser le file picker du Twake Drive forké pour permettre de prendre des PDF soit du Drive, soit du disque local.

## BentoPDF en bref

| | |
|--|--|
| Site / docs | https://bentopdf.com |
| Repo | https://github.com/winkun/bentoPDF |
| Licence | **AGPL-3.0** (+ licence commerciale 49 $ pour usage propriétaire) |
| Stack | TypeScript + Vite + Tailwind, SPA pure (Node.js v18+ pour build) |
| Modèle | **Tout client-side, 100 % browser, aucun upload serveur**. Site statique servi par n'importe quel proxy HTTP |
| Image Docker | `ghcr.io/alam00000/bentopdf-simple:latest` (~100 MB), expose port 8080 |
| API REST | **Aucune** — pas d'endpoint programmable |
| Auth | **Aucune** — appli anonyme, pas de compte utilisateur |
| Fonctions | ~50 outils : merge, split, compress, rotate, crop, watermark, sign, OCR, encrypt/decrypt, redact, edit metadata, fill forms, convert images/Office… |
| Contraintes hébergement | Doit servir les headers `Cross-Origin-Embedder-Policy: require-corp` et `Cross-Origin-Opener-Policy: same-origin` (nécessaires pour `SharedArrayBuffer` côté WASM) |
| File loading documenté | Drag-drop ou `<input type=file>` natif. **Aucun support documenté** pour `?file=<url>`, postMessage ou window.opener |

**Implication clé** : BentoPDF n'accepte pas qu'on lui dise « ouvre tel fichier ». L'utilisateur doit drop le PDF lui-même. Cela conditionne toute l'architecture d'intégration.

**Compatibilité AGPL-3.0** : compatible avec la stack actuelle (la plupart des autres composants sont sous licences permissives). Si on patche BentoPDF (cf phases 2/3 ci-dessous), nos patches devront être publiés sous AGPL (déjà le cas — repo public sur github.com/mmaudet/dev-twake-ai).

## Surface d'intégration côté Twake Drive

Le Drive forké (sur `feature/twake-drive-fork`) expose **3 points d'extension** déjà utilisés par Excalidraw / Grist :

### 1. `externalAppRedirect.js` — dispatch sur extension de fichier

Fichier : `twake-drive/src/modules/viewer/externalAppRedirect.js`. Table `HANDLERS` :

```js
const HANDLERS = [
  { matches: f => fileName(f).toLowerCase().endsWith('.excalidraw'),
    slug: 'excalidraw',
    hash: f => `/edit/${fileId(f)}` }
]
```

→ Ajouter 1 entrée pour `.pdf`, slug `bentopdf`, hash `/file/<fileId>`.
**Coût** : 1 commit, ~5 lignes. Effet : double-clic sur un PDF dans le Drive ouvre la coquille bentopdf avec le fileId en hash.

### 2. Menu « + Créer » — `AddMenuContent.jsx` + `CreateBentoPdfItem.jsx`

Copier le pattern des commits Excalidraw / Grist (`1bb426ca6`) : icône SVG + composant 59 lignes + i18n + wiring. **Coût** : ~80 lignes + 1 icône.
Utilité discutable : un « nouveau PDF vierge » n'a pas vraiment de sens (BentoPDF crée des PDF à partir d'autres formats). À skipper sauf besoin précis.

### 3. Menu contextuel droit-clic « Ouvrir avec »

`twake-drive/src/components/RightClick/RightClickFileMenu.jsx`. Possibilité de proposer « Ouvrir avec BentoPDF » pour les `.pdf`. **Coût** : exploration supplémentaire requise — non détaillée ici.

### File picker réutilisable

Drive expose un composant `FolderPicker.tsx` (`twake-drive/src/components/FolderPicker/`) mais **pas exporté** pour des apps tierces — il sert aux flows internes (déplacer, créer shortcut). **Verdict** : pas réutilisable depuis la coquille bentopdf sans patcher Drive.

### Permissions Cozy à déclarer dans le manifest bentopdf

```json
"files": {
  "type": "io.cozy.files",
  "verbs": ["GET", "POST", "PUT", "PATCH"]
}
```
Identique à Excalidraw (pas de DELETE — la coquille n'est pas chargée de supprimer des PDF).

## Architecture proposée (3 phases)

### Phase 1 — MVP iframe (1 jour de boulot)

**Objectif** : avoir BentoPDF accessible depuis Cozy en mode standalone, comme une app supplémentaire.

```
[Cozy launcher] → coquille bentopdf → iframe vers bentopdf.dev-twake.maudet.cloud/
                                                    ↑
                                          BentoPDF Docker
                                          (sub-domain dédié,
                                          headers COEP/COOP forcés
                                          par nginx via Hermes)
```

- Self-host BentoPDF (Docker) sur athena, exposé via Hermes à `bentopdf.dev-twake.maudet.cloud`, derrière Authelia comme Excalidraw.
- Coquille `bentopdf-app/` minimaliste : `index.html` qui mount juste une iframe pleine page vers `bentopdf.dev-twake.maudet.cloud`, plus le cozy-bar standard.
- Manifest : aucun permission `io.cozy.files` requise à cette phase (l'app n'accède pas au Drive — l'utilisateur drop son PDF directement dans BentoPDF).

**Friction utilisateur** :
- PDF local → ouvrir l'app → drag PDF (natif BentoPDF) : ✓ fluide.
- PDF du Drive → l'utilisateur doit ouvrir Drive, télécharger le PDF, l'ouvrir dans BentoPDF, traiter, re-uploader. **Pénible.**

C'est le strict minimum pour avoir BentoPDF en self-host avec SSO.

### Phase 2 — Drive → BentoPDF (« Ouvrir avec BentoPDF »)

**Objectif** : double-clic sur un PDF dans Drive → ouvre directement dans BentoPDF avec le fichier déjà chargé.

```
Drive (.pdf double-click)
   └→ externalAppRedirect.js → window.location = '<slug>-bentopdf.dev-twake.maudet.cloud/#/file/<fileId>'
       └→ coquille bentopdf récupère fileId du hash
           └→ GET /files/download/<fileId> sur cozy-stack → Blob PDF
               └→ injection dans l'iframe BentoPDF
```

**Le « injection » est le point critique**. 3 options techniques :

| Option | Description | Verdict |
|--------|-------------|---------|
| **A. postMessage** | La coquille envoie `{ type: 'load-pdf', blob }` à l'iframe BentoPDF. Nécessite un **patch upstream BentoPDF** qui écoute `window.addEventListener('message')` et appelle l'API interne de chargement. | Propre, mais nécessite fork BentoPDF et le maintenir |
| **B. Drop simulé** | La coquille crée un `DataTransfer` avec le `File` et dispatch un `drop` event sur le drop-zone de l'iframe. **Bloqué cross-origin** : impossible si BentoPDF est sur un autre domaine. | Inviable sauf si BentoPDF est servi sur même origin que la coquille |
| **C. Blob URL en query string** | La coquille passe `?file=<blob-url>` à l'iframe. **Nécessite patch upstream** pour lire ce paramètre et `fetch()` le blob URL. | Plus simple que A mais blob URL ne survit pas au cross-origin |
| **D. Servir BentoPDF depuis la coquille elle-même** | Au lieu d'un sub-domain dédié, on bundle BentoPDF dans la coquille Cozy (`bentopdf-app/bentopdf/`). La coquille charge BentoPDF dans un iframe **same-origin** et peut alors manipuler son DOM (drop simulé, injection direct, etc.). | Pas d'iframe cross-origin = solution la plus flexible mais bundle ~25 MB |

**Recommandation Phase 2** : commencer par **A (postMessage + patch upstream)**.

- Patch minimaliste à proposer upstream : `if (e.data?.type === 'load-pdf-blob') { loadPdfInternal(e.data.blob) }`. ~15 lignes.
- Si le patch n'est pas mergé, on maintient un fork léger (rebase régulier).
- Fallback gracieux : si l'iframe ne répond pas au postMessage en 2s, afficher un message « Drop manuellement votre PDF dans la fenêtre BentoPDF ».

### Phase 3 — BentoPDF → Drive (« Save back to Drive »)

**Objectif** : depuis BentoPDF, sauver le PDF édité directement dans le Drive (au même path, ou dans un dossier choisi).

Nécessite **forcément un patch upstream** : ajouter un bouton « Save to Drive » qui postMessage le Blob modifié à la coquille parent, qui fait `PUT /files/<fileId>` sur cozy-stack.

- Idéalement, le patch upstream propose un mécanisme générique de « custom save handlers » via postMessage (pas qu'un bouton « Drive »). Si proposé proprement, plus de chance d'être mergé.
- Sans Phase 3, l'utilisateur télécharge le PDF modifié et le re-upload manuellement dans Drive : friction non négligeable.

## Risques et points d'attention

- **Maintenance du fork BentoPDF** : si on patche pour Phase 2 + 3, on doit rebase régulièrement sur upstream. Coût récurrent (Excalidraw même problème déjà géré).
- **AGPL-3.0** : un patch sur BentoPDF doit être publié. Le repo `mmaudet/dev-twake-ai` est public depuis aujourd'hui — c'est conforme.
- **COEP/COOP** : ces headers cassent les iframes cross-origin (par design). Donc soit la coquille **n'iframe pas** BentoPDF (redirige directement), soit BentoPDF est servi avec `Cross-Origin-Resource-Policy: cross-origin` ET la coquille avec les bons COEP/COOP. À tester en Phase 1.
- **Taille bundle option D** : self-bundle ~25 MB par coquille. Pas critique mais à anticiper côté `deploy-app.sh` (le cache-buster ?v= sur les assets unhashed peut alourdir, à vérifier).
- **Pas de file picker Drive natif** : la demande initiale du user (« file picker Twake Drive ») n'est satisfaite **que** par la Phase 2 (= « ouvrir un PDF depuis Drive »). Un vrai picker modal qui s'ouvre _dans_ BentoPDF demanderait soit (i) un export du composant Drive `FolderPicker.tsx` (patch Drive non trivial), soit (ii) un picker custom dans la coquille bentopdf qui parle à cozy-client. Option (ii) plus pragmatique mais ~100 lignes en plus.

## Décisions à prendre avant de coder

1. **Self-host BentoPDF où ?** Sub-domain dédié (`bentopdf.dev-twake.maudet.cloud`, derrière Authelia comme Excalidraw) **ou** bundle dans la coquille (option D ci-dessus) ?
2. **Phase 2 d'emblée ou seulement Phase 1 ?** La Phase 1 seule n'apporte pas grand chose (BentoPDF aussi accessible via `bentopdf.dev-twake.maudet.cloud` direct, ce n'est qu'une icône dans le launcher). La valeur est dans la Phase 2.
3. **Acceptation du fork BentoPDF** : prêt à maintenir un fork patché (Phase 2 + 3) ou on reste en standalone (Phase 1) ?
4. **Licence commerciale** : 49 $ one-shot pour usage non-AGPL. Probablement non pertinent ici (notre repo est AGPL-compatible).
5. **« Créer un nouveau PDF » dans le menu « + Créer »** du Drive : utile ou non ? Probablement non (BentoPDF ne fait pas de doc neuf — il transforme des docs existants).

## Plan d'exécution suggéré (sous réserve de validation)

Si la décision est **Phase 1 + Phase 2 (postMessage)** :

1. Déploiement BentoPDF Docker sur athena + nginx Hermes + Authelia rule (équivalent setup Excalidraw).
2. Branche `feature/bentopdf` (cette branche) : créer `bentopdf-app/` (coquille Cozy minimale), iframe vers bentopdf.dev-twake.maudet.cloud, hash router `#/file/<fileId>` qui fetch le Drive.
3. Ajout slug `bentopdf` à `scripts/deploy-app.sh` (sur feature/twake-space).
4. Patch `twake-drive-fork` : ajouter une entrée HANDLERS pour `.pdf`.
5. Fork BentoPDF (`mmaudet/bentoPDF`) avec patch postMessage `load-pdf-blob`. Tag de version + Docker image custom.
6. Test : déposer un PDF dans Drive, double-click, vérifier qu'il s'ouvre dans BentoPDF chargé.
7. (Phase 3 plus tard) : patch upstream pour bouton « Save to Drive ».

## Annexes

- Rapport recherche externe BentoPDF : sources sourceforge.net, repocloud.io, bentopdf.com/docs, github.com/winkun/bentoPDF, synacktime.com, opentechhub.io, opensourcedaily.blog.
- Rapport cartographie Drive : voir les fichiers `twake-drive/src/modules/viewer/externalAppRedirect.js`, `twake-drive/src/components/FolderPicker/FolderPicker.tsx`, `twake-drive/manifest.webapp`, `twake-drive/src/modules/drive/AddMenu/AddMenuContent.jsx` sur la branche `feature/twake-drive-fork`.
- Coquilles de référence pour les patterns de download / upload Drive : `excalidraw-app-build/src/main.jsx` (PUT binaire) et `grist-app/index.html` (POST shortcut).
