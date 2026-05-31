# `feature/grist` — Coquille Cozy + intégration Drive

## En une phrase

Coquille Cozy qui crée et affiche des documents Grist (self-hosted, OIDC-wired) depuis le Drive via des shortcuts. Title sync deux sens (Grist ↔ shortcut Drive) et cascade-delete via un service Cozy déclenché par `@event io.cozy.files:DELETED`.

## Topologie

`feature/grist` **branche depuis `feature/twake-drive-fork`** : la coquille Cozy et les patches Drive vivent sur la même branche.

```
main
└── feature/twake-drive-fork    (5 commits — base Drive + dispatch)
    └── feature/grist           (7 commits Grist — shell + bridges + sync + cleanup)
```

## Structure

```
grist-app/                       ← coquille Cozy (HTML statique + JS vanilla)
  index.html                     ← dispatcher + bridges + title sync
  bar.css / bar.js / icon.png    ← cozy-bar bundled + favicon
  manifest.webapp                ← slug = "grist"
  services/
    cleanup-grist.js             ← service @event io.cozy.files:DELETED
                                   (cascade-delete du doc Grist)
  README.md

grist-backend/                   ← config OIDC + .env example pour Grist self-hosted
  .env.example
  run.sh
  README.md

twake-drive/                     ← fork Drive (voir twake-drive-fork.md)
```

## Routes (front)

| Hash route | Comportement |
|------------|--------------|
| (vide) | Iframe directe vers `https://grist.dev-twake.maudet.cloud/` |
| `#/bridge/grist/new/<folderId>` | Crée un doc Grist via l'API REST, matérialise un shortcut Drive avec `metadata.target`, redirige vers le doc Grist |

## Flow create + sync + delete

### Création depuis Drive
1. Utilisateur clique « + Créer → Grist » dans le Drive forké (entrée ajoutée par `1bb426ca6` sur `feature/twake-drive-fork`).
2. Drive redirige vers `https://<slug>.dev-twake.maudet.cloud/grist/#/bridge/grist/new/<folderId>`.
3. La coquille `index.html` :
   - `GET /api/orgs` sur Grist (cookies OIDC). Si 401/403 → prompt utilisateur pour ouvrir Grist dans un nouvel onglet et se login.
   - Sélectionne la première org « non-personnelle » (pas du pattern `docs-N`).
   - `GET /api/orgs/<orgId>/workspaces` → première workspace.
   - `POST /api/workspaces/<wsId>/docs` avec `{ name: 'Sans titre' }` → reçoit `docId`.
   - `POST /shortcuts` côté Cozy avec `metadata.target = { app: 'grist', docId, orgDomain }` → shortcut matérialisé dans `<folderId>` avec extension `.url`.
   - Redirige sur `https://grist.dev-twake.maudet.cloud/o/<orgDomain>/<docId>`.

### Title sync (Grist → Drive)
Implémenté dans `grist-app/index.html` → `syncShortcutName(docId)`.
1. Au mount + à chaque `visibilitychange` + `pagehide`, fetch en parallèle :
   - le nom du doc Grist (`GET /api/docs/<docId>`)
   - le shortcut Drive correspondant (recherche par `metadata.target.docId`)
2. Si nom Grist ≠ nom shortcut, **refetch le shortcut juste avant PATCH** pour détecter un rename concurrent côté Drive ; abort si conflit (fix audit).
3. Sinon `PATCH /files/<fileId>` avec `attributes.name = <gristName>.url`.

### Cascade-delete (Drive → Grist)
Implémenté dans `grist-app/services/cleanup-grist.js` :
1. Le service est déclaré dans `manifest.webapp` avec un trigger `@event io.cozy.files:DELETED`.
2. cozy-stack invoque le service avec `COZY_COUCH_DOC` en env (état du doc juste avant DELETE).
3. Le service parse, extrait `metadata.target.docId` si `target.app === 'grist'`.
4. `DELETE /api/docs/<docId>` sur Grist avec `Authorization: Bearer <GRIST_API_KEY>`.
5. **Retry avec backoff** (1s, 3s, 10s — fix audit) sur erreurs réseau / 408 / 429 / 5xx. 4xx « permanent » sortent immédiatement.

### Configuration de la clé Grist
La clé `GRIST_API_KEY` est lue depuis `~/.cozy/grist.env` (cozy-stack strippe l'env quand il fork le service, le fichier est re-lu manuellement). Si la clé est absente, le service log explicitement « would DELETE » et exit 0 — design intentionnel pour permettre de wire le trigger avant que le secret soit provisionné.

## Config / surface d'audit

| Élément | Fichier | Notes |
|---------|---------|-------|
| URL upstream Grist | `grist-app/index.html` | Hardcodée `https://grist.dev-twake.maudet.cloud`. **À externaliser**. |
| `GRIST_API_KEY` | `~/.cozy/grist.env` sur athena | Chargé via `loadApiKey()`. Pas dans le repo. |
| Session OIDC Grist | Cookies (`credentials: 'include'`) | Si l'utilisateur n'a pas de session Grist, prompt explicite. |
| Race title sync | `grist-app/index.html:syncShortcutName` | Corrigé : refetch + compare avant PATCH (commit `c3d1786e4`). |
| Retry cascade-delete | `grist-app/services/cleanup-grist.js:deleteGristDocWithRetry` | Corrigé : backoff exponentiel (commit `523293153`). |
| TLS validation | `grist-app/services/cleanup-grist.js:https.request` | Default Node `rejectUnauthorized: true` — validation active. |
| Doc name par défaut | `grist-app/index.html` création | Hardcodé `'Sans titre'`. Pas de validation d'unicité par l'utilisateur. |

## Déploiement

```
scripts/deploy-app.sh grist
```

L'instance Grist upstream est déployée séparément sur athena (config `grist-backend/`). Voir [twake-space.md](twake-space.md) pour le script de déploiement.

## Commits notables (`feature/twake-drive-fork..feature/grist`)

9 commits, du plus ancien au plus récent :

1. `da4fff23e` — Cozy shell + OIDC-wired grist backend on athena
2. `6c6762ab0` — Swap icon to petal logo
3. `951e71855` — Trim icon to petals only (transparent bg)
4. `ead7ed8b8` — Bridge `/bridge/grist/new/:folderId`
5. `2bdab11ce` — Cascade-delete Grist doc on shortcut purge
6. `338ab936b` — Keep cozy-bar around + preserve API session
7. `0cec24c13` — Two-way title sync + cascade-delete debug
8. `523293153` — `[audit]` Retry cascade-delete with backoff
9. `c3d1786e4` — `[audit]` Detect concurrent Drive rename before sync PATCH

**Note historique** : avant le nettoyage, `feature/grist` contenait aussi 8 commits dashboard cherry-pickés par erreur. Ces commits ont été retirés par rebase ; la version pré-rebase est préservée dans `backup/feature/grist-pre-rebase` sur origin.

## Points à confirmer avec l'équipe

- Sélection d'org : actuellement « première org non-personnelle ». Que faire si plusieurs orgs non-personnelles ?
- Lookup shortcut par `docId` : se fait via Mango `_find` avec index sur `metadata.target.docId`. Vérifier que l'index est créé au manifest install.
- Service cleanup : que devient un fail définitif après retries ? Actuellement exit 1 — le trigger refire ? Boucle infinie possible ?
- Conformité prod sur les console.log : `[grist] title sync: ...` est laissé en prod, à mettre derrière un flag debug.
