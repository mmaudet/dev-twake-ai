# Audit hostile — dev.twake.ai

Audit pré-handoff de l'ensemble des branches `feature/*`. Méthodologie : revue read-only des diffs, croisée avec un inventaire des points d'intégration (OIDC, JMAP, CalDAV, Authelia, Grist, Excalidraw, cozy-stack). Scope : sécurité (OWASP top-10 adapté), robustesse (erreurs, races), qualité / maintenabilité, conformité prod.

Trois statuts par finding :

- **Fixé dans ce handoff** — correction appliquée, commit référencé.
- **Faux positif** — finding initial revu et invalidé après lecture du code.
- **TODO équipe** — non corrigé ; à arbitrer / traiter avant prod.

---

## 1. Findings corrigés dans ce handoff

### 1.1. Critical / High

| Sévérité | Finding | Fichier | Commit |
|----------|---------|---------|--------|
| Critical | URL CouchDB hardcodée avec creds par défaut `admin:password` | `scripts/provision-user.sh:127` (avant fix) | `04332cf09` `[audit]` sur `feature/twake-space` |
| High | Password Authelia généré avec entropie faible (14 chars) | `scripts/provision-user.sh:66` (avant fix) | `04332cf09` |
| High | BCC opérateur (`michel.maudet@gmail.com`) hardcodé dans le script | `scripts/provision-user.sh:233` (avant fix) | `04332cf09` |
| High | Cascade-delete Grist sans retry sur échec API transitoire | `grist-app/services/cleanup-grist.js` | `523293153` `[audit]` sur `feature/grist` |
| High | Title sync Grist écrase les renames concurrents côté Drive | `grist-app/index.html:syncShortcutName` | `c3d1786e4` `[audit]` sur `feature/grist` |

### 1.2. Medium / Low (deuxième vague)

| Sévérité | Finding | Fichier | Commit |
|----------|---------|---------|--------|
| Medium | Slug `provision-user.sh` non validé + script non idempotent | `scripts/provision-user.sh` | `3ba399c99` `[audit]` sur `feature/twake-space` |
| Medium | `deploy-app.sh` : pas de dry-run + pas de healthcheck post-déploiement | `scripts/deploy-app.sh` | `3ba399c99` |
| Medium | PKCE state sans TTL en sessionStorage | `dashboard-app/src/utils/backend.js`, `dashboard-app/src/components/OidcCallback.jsx` | `317725c77` `[audit]` sur `feature/dashboard` |
| Medium | Sanitisation Excalidraw : pas de strip des control chars | `excalidraw-app-build/src/main.jsx:sanitizeName` | `818dd0826` `[audit]` sur `feature/excalidraw` |
| Medium | `console.log` / `console.warn` `[excalidraw]` visibles en prod | `excalidraw-app-build/src/main.jsx`, `excalidraw-app/index.html` | `818dd0826` |
| Medium | Grist : fallback silencieux sur `orgs[0]` (sandbox personnelle) | `grist-app/index.html` bridge create | `ae6bf772e` `[audit]` sur `feature/grist` |
| Medium | `console.log` / `console.warn` `[grist]` visibles en prod | `grist-app/index.html` | `ae6bf772e` |

### 1.3. Bug remonté en prod (troisième vague)

| Sévérité | Finding | Fichier | Commit |
|----------|---------|---------|--------|
| High | Dashboard widgets Mail/Calendar : refresh_token Linagora rejeté → backend renvoie 500 au lieu de NOT_CONNECTED | `dashboard-backend/tokens.js`, `dashboard-backend/server.js` | `643a5daae` `[audit]` sur `feature/dashboard` |
| Medium | Dashboard widget RecentFiles : clic sur shortcut Grist ouvrait `<slug>-grist.<domain>/o/<org>/<docId>` (hôte coquille + path Grist) → 404 « Élément non trouvé » | `dashboard-app/src/components/widgets/RecentFiles.jsx:buildGristUrl` | `28f0a5684` `[audit]` sur `feature/dashboard` |

**Reproduction du #2** (constatée live le 2026-05-31 ~23:24 FR) : depuis le widget « Fichiers récents » du dashboard, clic sur le shortcut `Sans titre.url` → ouverture de `https://mmaudet-grist.dev-twake.maudet.cloud/o/twake-dev/<docId>` → page d'erreur Twake Workplace « Élément non trouvé ». Le widget remplaçait l'host du cozyUrl par `<slug>-grist.` mais conservait le path Grist canonique `/o/<org>/<docId>` — pas un format compris ni par cozy-stack (qui retourne 404), ni par le router de la coquille Grist (qui matche `#/doc/<docId>`). Fix : abandonner la reconstruction et utiliser `info.url` du shortcut (déjà bien formé depuis le commit `338ab936b` sur `feature/grist`).

**Reproduction du #1** (constatée live le 2026-05-31 ~22:24 FR) :
- `/api/status` rapportait `connected: true` pour mail/calendar avec `expires_at` dans le passé (mail expiré depuis 22h, calendar depuis 14h).
- `/api/mail/recent` et `/api/calendar/day` : `HTTP 500 {"error":"Refresh failed: 400 invalid_grant"}`.
- Le front affichait juste « Erreur : HTTP 500 », sans CTA pour reconnecter.

**Cause** : `refreshTokens()` throw `new Error('Refresh failed: ...')` (sans `code`). Les routes catch ne mappent que `e.code === 'NOT_CONNECTED'` → 401, le reste → 500.

**Fix `643a5daae`** :
- `tokens.js:refreshTokens` : un 4xx OIDC sur `/oauth2/token` (`invalid_grant`, `invalid_client`…) signifie que le refresh_token est mort. On `clearTokens(widget)` + throw `NOT_CONNECTED` propre. Les 5xx et erreurs réseau restent transients (bubble up en 500).
- `server.js:statusFor` : `connected = !isExpired(tokens) || !!tokens.refresh_token` au lieu de `!!tokens?.access_token`. Le front voit `connected: false` dès que les tokens ne sont plus exploitables, sans devoir roundtripper sur un endpoint qui crash.

**Déploiement requis** : `dashboard-backend/` tourne sur athena (systemd unit), pas sur cozy-stack. Pour appliquer le fix il faut pull la branche `feature/dashboard` et restart le service. Le redéploiement n'est pas automatisé par `scripts/deploy-app.sh` (qui ne gère que les coquilles Cozy).

### Détails des fixes

#### `04332cf09` — Provision : externalize secrets + password entropy

- Ajoute le sourcing de `~/.cozy/couchdb.env` (variable `COZY_COUCHDB_URL` obligatoire, fail-fast si absente).
- Augmente la longueur du password généré de 14 → 20 chars random (suffix `Xy!` conservé pour la contrainte symbol/case d'Authelia).
- `COZY_BCC_EMAIL` devient optionnel : si non-set, l'email part sans BCC (avant : BCC `michel.maudet@gmail.com` envoyé en silence à chaque provision).

#### `523293153` — Grist cascade-delete : retry avec backoff

- 4 tentatives max (1s, 3s, 10s entre).
- Retriable : network errors, 408, 429, 5xx. 4xx « permanent » exit immédiatement.
- Avant : exit 1 sur première erreur → trigger refire potentiellement en boucle.

#### `c3d1786e4` — Grist title sync : détection rename concurrent

- Refetch du shortcut juste avant PATCH.
- Compare le nom re-fetché avec celui initialement observé ; si différent → abort (l'utilisateur a renommé côté Drive entre temps).
- Window de race : 1 RTT (négligeable en pratique).

#### `3ba399c99` — Provision slug + Cozy idempotence + deploy dry-run + healthcheck

- `provision-user.sh` : regex `^[a-z][a-z0-9-]{1,30}$` sur le slug, refus up-front sinon. Si l'instance Cozy existe déjà → exit 0 avec message (avant : crash dans `instances add` après avoir créé l'Authelia user, état mi-provisionné).
- `deploy-app.sh` : flag `--dry-run` (rsync `--dry-run --itemize-changes`, cozy-stack calls juste affichés). Healthcheck par instance après install/update : `cozy-stack apps show` doit reporter `Source = <target>`, sinon `fail_count++`. Le script exit 1 si une seule instance a fail.

#### `317725c77` — Dashboard : PKCE state TTL

- Timestamp `created_at` ajouté au write dans `startLinagoraConnect`.
- À la lecture dans `OidcCallback`, rejet + cleanup si l'entrée est plus vieille que `PKCE_TTL_MS` (5 minutes).
- Message utilisateur explicite « Connexion expirée — relance depuis le widget ».

#### `818dd0826` — Excalidraw : sanitization + debug logs

- `sanitizeName()` : strip des `[\x00-\x1f\x7f]` en plus du cap 200 chars + remove `/\`. Défensif contre control chars / Unicode-confusable.
- Helpers `dbg`/`warn` lus depuis `window.__excalidrawEditor.debug`. `index.html` set le flag depuis `?debug=1`. Off par défaut.
- `console.error` (vrais bugs) reste unconditionnel.

#### `ae6bf772e` — Grist : org fallback + debug logs

- Si aucune org non-personnelle (= pas du pattern `docs-N`) → throw avec un message qui liste les sandboxes personnelles et invite à demander à l'admin. Avant : fallback silencieux sur `orgs[0]` qui mettait le shortcut dans une sandbox non-partageable.
- `dbg`/`dbgWarn` helpers gated par `?debug=1`. `console.error` reste unconditionnel.

---

## 2. Findings revus → faux positifs

| Finding initial | Réalité | Pourquoi |
|-----------------|---------|----------|
| « `GRIST_API_KEY` silently allows deletion without key » | Faux | `cleanup-grist.js:117` log explicite `« would DELETE »` puis exit 0 — design intentionnel pour wire le trigger avant que la clé soit provisionnée. |
| « Argon2 hash sans vérification » | Faux | `provision-user.sh` vérifie déjà via `grep -oE` qui filtre sur le pattern `$argon2id$...` ; exit 1 si vide. |
| « TLS validation possibly disabled » sur `cleanup-grist.js` | Faux | `https.request()` utilise les defaults Node (`rejectUnauthorized: true`). Aucun override dans le code. |

---

## 3. Findings TODO équipe

Les findings ci-dessous **n'ont pas été corrigés dans ce handoff** : ils nécessitent un choix design ou sortent du périmètre.

### Conformité prod

| Sévérité | Finding | Fichier | Reco | Pourquoi pas fixé ici |
|----------|---------|---------|------|----------------------|
| Medium | URLs externes hardcodées (Excalidraw, Grist, dashboard backend) | `excalidraw-app/index.html`, `grist-app/index.html`, `dashboard-app/src/utils/backend.js` | Externaliser via paramètre manifest.webapp ou env build-time. | Choix de pattern global à valider avec l'équipe (manifest params vs env injection vs constants par env). |
| Low | Manque de logging structuré côté backends | `dashboard-backend/`, `grist-backend/` | Migrer vers `pino` ou équivalent JSON. | Backends hors arbre dans ce repo. |

### Auth & secrets

| Sévérité | Finding | Fichier | Reco | Pourquoi pas fixé ici |
|----------|---------|---------|------|----------------------|
| Medium | Token Cozy injecté via `data-cozy-token`, pas de refresh | `excalidraw-app/index.html` | Implémenter refresh via cozy-client ou re-login fallback. | Décision design cozy-client globale (les coquilles vanilla n'utilisent pas cozy-client). |
| Medium | Patch CSP cozy-stack en local seul, non upstream | `cozy-stack/` (hors arbre) | CI check sur la freshness du patch + proposer un PR upstream. | Le clone cozy-stack est gitignored, géré indépendamment. |
| Low | Aucune rotation documentée pour `GRIST_API_KEY` | `~/.cozy/grist.env` | Documenter la procédure de rotation + impact downtime. | Procédure ops à valider avec l'équipe SRE. |

### Validation d'entrées

| Sévérité | Finding | Fichier | Reco | Pourquoi pas fixé ici |
|----------|---------|---------|------|----------------------|
| Medium | Doc name Grist par défaut hardcodé `'Sans titre'` | `grist-app/index.html` création | Prompt utilisateur avant POST, ou template configurable. | Sémantique intentionnelle (un user peut vouloir créer plusieurs docs « Sans titre » puis les renommer). |

### Robustesse

| Sévérité | Finding | Fichier | Reco | Pourquoi pas fixé ici |
|----------|---------|---------|------|----------------------|
| Medium | Excalidraw save errors silent (warn) | `excalidraw-app-build/src/main.jsx` | Toast utilisateur + état visible (icône bandeau « non sauvegardé »). | Nécessite une maquette UX validée (composant Toast à intégrer dans le shell Excalidraw qui est minimal). |
| Medium | Grist : pas de check doublon avant POST | `grist-app/index.html` création | Vérifier shortcut existant pour `<folderId>` avant create. | Sémantique intentionnelle (le user peut vouloir 2 docs avec le même nom). |

### Hors scope

| Élément | Raison |
|---------|--------|
| Patch `disable_csp: true` côté `cozy-stack` | Le clone cozy-stack est gitignored et géré indépendamment. Le patch vit sur la branche `local/twake-space-csp-relax`. À discuter pour upstream. |
| Sécurité interne de l'instance Grist self-hosted | Code Grist non audité dans ce handoff ; seul l'usage via API REST est dans le scope. |
| Sécurité interne de l'instance Excalidraw self-hosted | Idem. |
| `dashboard-backend/` code | Inspection visuelle limitée (le backend tourne séparément sur athena). Audit dédié recommandé. |

---

## 4. Smoke tests (faisabilité limitée locale)

La review fonctionnelle complète nécessite un déploiement sur `athena` + accès Authelia + browser. Les smoke tests réalisés localement avant handoff :

| Test | Méthode | Résultat |
|------|---------|---------|
| `provision-user.sh` syntaxe | `bash -n` | OK |
| `deploy-app.sh` syntaxe | `bash -n` | OK |
| `cleanup-grist.js` parse | `node --check` | OK |
| `grist-app/index.html` HTML + JS embedded | `python3 HTMLParser` + extract + `node --check` | OK |
| `excalidraw-app/index.html` HTML | `python3 HTMLParser` | OK |

Tests fonctionnels à exécuter par l'équipe sur un déploiement réel (non couverts par les smoke locaux) :

- Excalidraw : créer un fichier depuis le Drive forké, éditer, sauver, renommer le titre, double-cliquer depuis Drive.
- Grist : `+ Créer → Grist` depuis Drive forké, vérifier création doc + shortcut. Supprimer le shortcut → cascade-delete du doc Grist (avec et sans `GRIST_API_KEY` set). Renommer le doc dans Grist → vérifier sync du shortcut. Renommer le shortcut dans Drive pendant l'édition → vérifier qu'on n'écrase pas (fix `c3d1786e4`).
- Provision : `provision-user.sh test-user "Test User" test@example.com` → vérifier slug accepté, runs, BCC absent si `COZY_BCC_EMAIL` vide. Re-run sur le même slug → vérifier exit 0 et message « already exists ».
- Deploy : `deploy-app.sh grist --dry-run` → vérifier output « would: ... » sans side effect. `deploy-app.sh grist` → vérifier healthcheck per-instance + fail si une instance broken.

---

## 5. Méthodologie

- **Outillage** : revue manuelle des diffs (`git log -p main..feature/*`), lecture des fichiers clé identifiés par cartographie, syntax checks (bash, node, html).
- **Scope sécurité** : auth & secrets (OIDC, sessions, tokens, clés API), injection (XSS, command, path), validation d'entrées, CORS / CSP, TLS.
- **Scope robustesse** : gestion d'erreurs réseau, race conditions, idempotence des services, cascade behaviors.
- **Scope qualité** : code mort, duplications, naming, types, complexité, dette technique.
- **Scope prod** : logs, perf, healthchecks, déploiement, secrets externalisés, CI.

## 6. Recommandations transverses (TODO équipe)

1. **Migrer les URLs hardcodées vers de la config build-time** — règle uniforme via `manifest.webapp` parameters ou env injectée par cozy-stack (`process.env.GRIST_URL`). Le pattern devrait être unique sur toutes les coquilles (sinon dette technique).
2. **CI minimum** : lint + dry-run build de chaque coquille + check de freshness du patch cozy-stack (CSP relax).
3. **Documenter la rotation des secrets** : `GRIST_API_KEY`, OIDC client secret Linagora, admin passphrase Cozy, mot de passe SMTP Linagora.
4. **Inventaire des `trigger@event`** : vérifier qu'aucune coquille ne crée un trigger récursif (DELETE → service → cleanup → DELETE → ...).
5. **Composant Toast partagé** : besoin d'un pattern UX pour surfacer les erreurs réseau / save errors / sync errors à l'utilisateur. Actuellement chaque coquille fait son propre rendu (Alerter dans dashboard, rien dans Excalidraw, console.log dans Grist).
