# `feature/dashboard` — Dashboard custom Cozy avec widgets

## En une phrase

App Cozy qui remplace la page d'accueil par un dashboard drag-and-drop, avec des widgets pour Drive (Recent Files), Notes, kan.bn (Tasks), Mail Linagora (JMAP) et Calendar Linagora (CalDAV). Backend Node.js séparé pour porter le flow OIDC PKCE Linagora et conserver les tokens JMAP/CalDAV.

## Structure

```
dashboard-app/        ← app Cozy (React + cozy-scripts)
  src/
    components/
      OidcCallback.jsx        ← endpoint /#/oidc/callback (handle code + state)
      widgets/
        CalendarLinagora.jsx  ← widget Calendar (CalDAV via backend)
        MailLinagora.jsx      ← widget Mail (JMAP via backend)
        RecentFiles.jsx       ← widget Drive (cozy-client direct)
        RecentNotes.jsx       ← widget Notes (cozy-client direct)
        Tasks.jsx             ← widget kan.bn (cozy-client direct)
    utils/
      backend.js              ← BACKEND_BASE = https://dashboard-api.dev-twake.maudet.cloud
  manifest.webapp             ← slug = "dashboard"

dashboard-backend/    ← backend Node.js (Express)
  src/                ← endpoints OIDC + /api/status + bridges JMAP/CalDAV
  .env.example        ← OIDC client_id/secret, JMAP/CalDAV URLs
```

## Routes (front)

| Route | Rôle |
|-------|------|
| `/#/` | Dashboard principal — grille drag-and-drop, widgets actifs |
| `/#/widgets` | Page « Gérer les widgets » — catalogue + activation |
| `/#/oidc/callback` | Endpoint de retour OIDC Linagora (PKCE) |

## Flow OIDC Linagora (PKCE)

1. L'utilisateur active un widget Mail ou Calendar.
2. Le front appelle `GET /api/status` sur le backend → reçoit un `auth_url_template` (issuer, client_id, redirect_uri, scope).
3. Front génère `code_verifier` + `code_challenge`, stocke en `sessionStorage` (`linagora_pkce`), redirige vers `sso.linagora.com`.
4. Au retour, `OidcCallback.jsx` extrait `code` + `state`, POST `https://dashboard-api.dev-twake.maudet.cloud/oidc/callback` avec `code_verifier`.
5. Backend échange contre access/refresh tokens auprès de Linagora, les persiste côté backend (lié au cozyId de l'utilisateur).
6. Widgets Mail / Calendar appellent ensuite `GET /api/jmap/inboxes` et `GET /api/caldav/events` — le backend tape JMAP / CalDAV avec les tokens.

## Config / surface d'audit

| Élément | Fichier | Notes |
|---------|---------|-------|
| URL du backend dashboard | `dashboard-app/src/utils/backend.js:2` | Hardcodée `https://dashboard-api.dev-twake.maudet.cloud`. **À externaliser** (env build-time ou paramètre manifest). |
| Tokens en sessionStorage avec TTL | `dashboard-app/src/components/OidcCallback.jsx` | `linagora_pkce` (state + verifier + `created_at`) — TTL 5 min appliqué au callback, ancien state cleared automatiquement. Commit `317725c77` `[audit]`. |
| Credentials CORS | `dashboard-app/src/utils/backend.js` | `credentials: 'include'` sur tous les fetchs. Suppose CORS configuré côté backend pour `*.dev-twake.maudet.cloud`. |
| Refresh-token rejet | `dashboard-backend/tokens.js:refreshTokens` | Un 4xx OIDC (invalid_grant, …) → `clearTokens(widget)` + throw `NOT_CONNECTED` → 401 propre côté API. Avant : `Error` générique → 500 opaque. Commit `643a5daae` `[audit]`. |
| Statut widgets `/api/status` | `dashboard-backend/server.js:statusFor` | `connected: false` si `isExpired(tokens)` ET pas de refresh_token utilisable. Avant : `true` dès qu'un access_token existe (même expiré). Commit `643a5daae`. |
| Widget RecentFiles : URL des shortcuts Grist | `dashboard-app/src/components/widgets/RecentFiles.jsx` | Utilise `info.url` directement (déjà bien formé par la coquille grist depuis `338ab936b`). Commit `28f0a5684` `[audit]` — avant : reconstruction buggy `<slug>-grist.<domain>/o/<org>/<docId>` → 404. |
| Widget RecentFiles : icônes file-type | `dashboard-app/src/components/widgets/RecentFiles.jsx:FileTypeIcon` | `.excalidraw` → icône Excalidraw, shortcut Grist → pétale Grist. Icônes vendored dans `dashboard-app/src/assets/`. Commit `369ac4531`. |
| Widget RecentFiles : dispatch `.excalidraw` vers coquille | `dashboard-app/src/components/widgets/RecentFiles.jsx:openFile + EXTERNAL_APP_HANDLERS` | Avant `7dc797724` : un clic sur un `.excalidraw` ouvrait le file viewer Drive (stub « Document EXCALIDRAW / Télécharger ») au lieu de la coquille. Le widget construisait `<slug>-drive.<domain>/#/folder/<dir>/file/<id>` qui n'évalue pas le HANDLER du Drive forké. Fix : table `EXTERNAL_APP_HANDLERS` qui matche l'extension et route directement vers `<slug>-excalidraw.<domain>/#/edit/<id>`. Mirror du dispatch Drive côté widget. |
| Widget RecentFiles : dispatch `.pdf` vers coquille | `dashboard-app/src/components/widgets/RecentFiles.jsx:EXTERNAL_APP_HANDLERS` | Avant `45600417a` : un clic sur un `.pdf` ouvrait le stub Drive viewer. Fix : deuxième entrée dans `EXTERNAL_APP_HANDLERS` (`mime === 'application/pdf'` ou `.pdf` extension) → `<slug>-bentopdf.<domain>/#/edit/<id>`. Le hash router de la coquille bentopdf (commit `becd94061`) ouvre `/fr/edit-pdf` et auto-charge le PDF via le bridge. Ajout d'un badge `PDF` rouge dans `FileTypeIcon` pour cohérence visuelle avec Excalidraw / Grist. |

## Déploiement

Désormais wired dans `scripts/deploy-app.sh` (slug `dashboard`, source `dashboard-app/build`, nécessite `--build` pour `yarn build`) :

```
scripts/deploy-app.sh dashboard --branch feature/dashboard --build
```

Le `dashboard-backend/` tourne indépendamment sur athena (systemd user unit `dashboard-backend.service`, port 8090) et est exposé via Hermes à `https://dashboard-api.dev-twake.maudet.cloud`. **Pas géré par `deploy-app.sh`** (qui ne gère que les coquilles Cozy) — un changement de code backend nécessite un `systemctl --user restart dashboard-backend.service` après `git pull` du worktree.

## Commits notables (`main..feature/dashboard`)

19 commits :

- 15 sur le dashboard initial : drag-and-drop, widgets Mail/Calendar via backend, widget catalogue, fixes cozy-bar coexistence React, fixes OIDC callback path.
- 4 fixes audit `[audit]` :
  - `317725c77` — PKCE state TTL (5 min)
  - `643a5daae` — refresh_token Linagora rejeté = NOT_CONNECTED au lieu de 500 (côté `dashboard-backend/`)
  - `28f0a5684` — RecentFiles trust `info.url` au lieu de reconstruire (fix 404 sur shortcuts Grist)
  - `369ac4531` — icônes file-type Excalidraw/Grist dans RecentFiles
  - `7dc797724` — dispatch `.excalidraw` directement vers la coquille (avant : stub Drive viewer)
  - `45600417a` — dispatch `.pdf` vers la coquille bentopdf + badge PDF rouge dans `FileTypeIcon`

## Points à confirmer avec l'équipe

- Position du `dashboard-backend/` dans l'arbo : reste hébergé séparément ou intégré au monorepo ?
- Conformité CSP : le widget Mail/Calendar nécessite-t-il un relax CSP côté Cozy ?
- Stratégie token : refresh côté backend (transparent au front) ou refresh forcé via re-prompt ?
