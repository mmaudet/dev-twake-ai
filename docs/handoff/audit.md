# Audit hostile — dev.twake.ai

Audit pré-handoff de l'ensemble des branches `feature/*`. Méthodologie : revue read-only des diffs, croisée avec un inventaire des points d'intégration (OIDC, JMAP, CalDAV, Authelia, Grist, Excalidraw, cozy-stack). Scope : sécurité (OWASP top-10 adapté), robustesse (erreurs, races), qualité / maintenabilité, conformité prod.

Trois statuts par finding :

- **Fixé dans ce handoff** — correction appliquée, commit référencé.
- **Faux positif** — finding initial revu et invalidé après lecture du code.
- **TODO équipe** — non corrigé ; à arbitrer / traiter avant prod.

---

## 1. Findings corrigés dans ce handoff

| Sévérité | Finding | Fichier | Commit |
|----------|---------|---------|--------|
| Critical | URL CouchDB hardcodée avec creds par défaut `admin:password` | `scripts/provision-user.sh:127` (avant fix) | `04332cf09` `[audit]` sur `feature/twake-space` |
| High | Password Authelia généré avec entropie faible (14 chars) | `scripts/provision-user.sh:66` (avant fix) | `04332cf09` |
| High | BCC opérateur (`michel.maudet@gmail.com`) hardcodé dans le script | `scripts/provision-user.sh:233` (avant fix) | `04332cf09` |
| High | Cascade-delete Grist sans retry sur échec API transitoire | `grist-app/services/cleanup-grist.js` | `523293153` `[audit]` sur `feature/grist` |
| High | Title sync Grist écrase les renames concurrents côté Drive | `grist-app/index.html:syncShortcutName` | `c3d1786e4` `[audit]` sur `feature/grist` |

### Détails

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

---

## 2. Findings revus → faux positifs

| Finding initial | Réalité | Pourquoi |
|-----------------|---------|----------|
| « `GRIST_API_KEY` silently allows deletion without key » | Faux | `cleanup-grist.js:117` log explicite `« would DELETE »` puis exit 0 — design intentionnel pour wire le trigger avant que la clé soit provisionnée. |
| « Argon2 hash sans vérification » | Faux | `provision-user.sh:71-74` vérifie déjà via `grep -oE` qui filtre sur le pattern `$argon2id$...` ; exit 1 si vide. |
| « TLS validation possibly disabled » sur `cleanup-grist.js` | Faux | `https.request()` utilise les defaults Node (`rejectUnauthorized: true`). Aucun override dans le code. |

---

## 3. Findings TODO équipe

### Conformité prod

| Sévérité | Finding | Fichier | Reco |
|----------|---------|---------|------|
| Medium | URLs externes hardcodées (Excalidraw, Grist, dashboard backend) | `excalidraw-app/index.html`, `grist-app/index.html`, `dashboard-app/src/utils/backend.js` | Externaliser via env build-time ou paramètre manifest. |
| Medium | `console.log` / `console.warn` laissés en prod | `grist-app/index.html`, `excalidraw-app-build/src/main.jsx` | Wrapper derrière un flag debug (lu depuis manifest ou env). |
| Medium | Pas de healthcheck post-déploiement | `scripts/deploy-app.sh` | Ajouter `curl <slug>/_status` après update et fail si non-200. |
| Medium | Pas de dry-run sur `deploy-app.sh` | `scripts/deploy-app.sh` | Flag `--dry-run` qui montre le diff rsync sans toucher aux instances. |
| Low | Manque de logging structuré côté backends | `dashboard-backend/`, `grist-backend/` (à confirmer) | Migrer vers `pino` ou équivalent JSON. |

### Auth & secrets

| Sévérité | Finding | Fichier | Reco |
|----------|---------|---------|------|
| Medium | Token Cozy injecté via `data-cozy-token` attribute, pas de refresh | `excalidraw-app/index.html` | Implémenter refresh via cozy-client ou re-login fallback. |
| Medium | Patch CSP cozy-stack en local seul, non upstream | `cozy-stack/` (hors arbre) | CI check sur la freshness du patch + proposer un PR upstream. |
| Low | PKCE state en sessionStorage sans expiry explicite | `dashboard-app/src/components/OidcCallback.jsx` | Ajouter TTL + cleanup à l'init. |
| Low | Aucune rotation documentée pour `GRIST_API_KEY` | `~/.cozy/grist.env` | Documenter la procédure de rotation + impact downtime. |

### Validation d'entrées

| Sévérité | Finding | Fichier | Reco |
|----------|---------|---------|------|
| Medium | Sanitisation noms Excalidraw : cap 200 chars + remove `/\`, mais pas de null-byte / control chars | `excalidraw-app-build/src/main.jsx:~75` | Whitelist explicite ou strip via regex `[\x00-\x1f]`. |
| Medium | Doc name Grist par défaut hardcodé `'Sans titre'` | `grist-app/index.html` création | Prompt utilisateur avant POST, ou template configurable. |
| Low | Slug utilisateur dans `provision-user.sh` non validé | `scripts/provision-user.sh` argument 1 | Regex `^[a-z][a-z0-9-]{2,30}$` + reject sinon. |

### Robustesse

| Sévérité | Finding | Fichier | Reco |
|----------|---------|---------|------|
| Medium | Excalidraw save errors silent (console.warn) | `excalidraw-app-build/src/main.jsx:~95` | Toast utilisateur + état visible (icône bandeau « non sauvegardé »). |
| Medium | Grist : pas de check doublon avant POST | `grist-app/index.html` création | Vérifier shortcut existant pour `<folderId>` avant create (ou laisser passer si la sémantique est OK). |
| Medium | Grist : `orgs[0]` fallback si aucune org non-personnelle | `grist-app/index.html` | Surfacer erreur explicite à l'utilisateur. |
| Low | `provision-user.sh` non idempotent (re-run = échec Authelia déjà-présent + Cozy add fail) | `scripts/provision-user.sh` | Détection up-front : si user Authelia + Cozy domain existent → skip avec exit 0. |

### Hors scope

| Élément | Raison |
|---------|--------|
| Patch `disable_csp: true` côté `cozy-stack` | Le clone cozy-stack est gitignored et géré indépendamment. Le patch vit sur la branche `local/twake-space-csp-relax`. À discuter pour upstream. |
| Sécurité interne de l'instance Grist self-hosted | Code Grist non audité dans ce handoff ; seul l'usage via API REST est dans le scope. |
| Sécurité interne de l'instance Excalidraw self-hosted | Idem. |
| `dashboard-backend/` code | Inspection visuelle limitée (le backend tourne séparément sur athena). Audit dédié recommandé. |

---

## 4. Méthodologie

- **Outillage** : revue manuelle des diffs (`git log -p main..feature/*`), lecture des fichiers clé identifiés par cartographie.
- **Scope sécurité** : auth & secrets (OIDC, sessions, tokens, clés API), injection (XSS, command, path), validation d'entrées, CORS / CSP, TLS.
- **Scope robustesse** : gestion d'erreurs réseau, race conditions, idempotence des services, cascade behaviors.
- **Scope qualité** : code mort, duplications, naming, types, complexité, dette technique.
- **Scope prod** : logs, perf, healthchecks, déploiement, secrets externalisés, CI.

## 5. Recommandations transverses

1. **Migrer les URLs hardcodées vers de la config build-time** — règle uniforme via `manifest.webapp` parameters ou env injectée par cozy-stack (`process.env.GRIST_URL`).
2. **Wrapper les `console.log` derrière un flag debug** — un seul module `log.js` par coquille qui no-op en prod.
3. **CI minimum** : lint + dry-run build + check de freshness du patch cozy-stack.
4. **Documenter la rotation des secrets** : `GRIST_API_KEY`, OIDC client secret Linagora, admin passphrase Cozy.
5. **Inventaire des trigger@event** : vérifier qu'aucune coquille ne crée un trigger récursif (DELETE → service → cleanup → DELETE → ...).
