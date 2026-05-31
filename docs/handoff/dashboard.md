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
| Tokens en sessionStorage | `dashboard-app/src/components/OidcCallback.jsx` | `linagora_pkce` (state + verifier). Cleanup au callback. Pas d'expiry explicite — vieux tokens si plusieurs essais. |
| Credentials CORS | `dashboard-app/src/utils/backend.js` | `credentials: 'include'` sur tous les fetchs. Suppose CORS configuré côté backend pour `*.dev-twake.maudet.cloud`. |
| Persistance des tokens | Backend Node, non auditée dans ce handoff (côté `dashboard-backend/`) | Vérifier : storage chiffré, rotation refresh tokens, scoping par cozyId. |

## Déploiement

L'app n'est pas (encore) wired dans `scripts/deploy-app.sh`. Pour la déployer manuellement :

```
cd dashboard-app && yarn build
cozy-stack apps install dashboard file://$(pwd)/build --domain <slug>.dev-twake.maudet.cloud
```

Le backend doit tourner indépendamment sur `dashboard-api.dev-twake.maudet.cloud` (déployé manuellement sur athena, derrière Hermes).

## Commits notables (`main..feature/dashboard`)

15 commits, tous propres et focalisés sur le dashboard. Du plus ancien au plus récent : initialisation drag-and-drop, ajout des widgets Mail/Calendar via backend, widget catalogue, fixes cozy-bar coexistence avec React, fixes OIDC callback path. Aucune contamination cross-feature.

## Points à confirmer avec l'équipe

- Position du `dashboard-backend/` dans l'arbo : reste hébergé séparément ou intégré au monorepo ?
- Conformité CSP : le widget Mail/Calendar nécessite-t-il un relax CSP côté Cozy ?
- Stratégie token : refresh côté backend (transparent au front) ou refresh forcé via re-prompt ?
