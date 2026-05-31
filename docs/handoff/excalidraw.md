# `feature/excalidraw` — Coquille Cozy + intégration Drive

## En une phrase

Coquille Cozy qui ouvre les fichiers `.excalidraw` du Drive dans Excalidraw embarqué (via une iframe vers une instance Excalidraw self-hosted, gated par Authelia). Le Drive forké dispatch automatiquement les fichiers `.excalidraw` vers cette coquille.

## Topologie

`feature/excalidraw` **branche depuis `feature/twake-drive-fork`** : la coquille Cozy et les patches Drive vivent sur la même branche pour que la review et le merge se fassent en un seul flux.

```
main
└── feature/twake-drive-fork    (5 commits — base Drive + dispatch)
    └── feature/excalidraw      (5 commits Excalidraw — shell + éditeur)
```

## Structure

```
excalidraw-app/        ← coquille Cozy (HTML statique + JS vanilla)
  index.html           ← dispatcher de routes côté client
  editor.js            ← bundled Excalidraw editor (2.7MB minified, build artifact)
  editor.css
  manifest.webapp      ← slug = "excalidraw"

excalidraw-app-build/  ← source de l'éditeur bundlé
  package.json
  src/main.jsx         ← entrée React qui mount Excalidraw + connecte au Drive

excalidraw-backend/    ← config nginx/auth Authelia pour l'instance Excalidraw
                         (déployée séparément sur athena)
twake-drive/           ← fork Drive (vendoré depuis linagora/twake-drive @ d2e6bbc)
                         + 4 patches voir twake-drive-fork.md
```

## Routes (front)

| Hash route | Comportement |
|------------|--------------|
| (vide) | Iframe directe vers `https://excalidraw.dev-twake.maudet.cloud/` (mode standalone Excalidraw) |
| `#/bridge/excalidraw/new/<folderId>` | Crée un fichier `Sans titre.excalidraw` (JSON vide) dans `<folderId>` du Drive, redirige sur `#/edit/<fileId>` |
| `#/edit/<fileId>` | Mount `editor.js` qui hydrate Excalidraw avec le contenu du fichier Drive |

## Flow create + edit

### Création depuis Drive
1. Utilisateur clique « + Créer → Excalidraw » dans le Drive forké (entrée ajoutée par le commit `1bb426ca6` sur `feature/twake-drive-fork`).
2. Drive redirige vers `https://<slug>.dev-twake.maudet.cloud/excalidraw/#/bridge/excalidraw/new/<folderId>`.
3. La coquille POST sur `/files` avec `Type=file`, `Name=Sans titre.excalidraw`, body = JSON Excalidraw vide.
4. Redirige sur `#/edit/<fileId>`.

### Édition
1. `editor.js` fetch `GET /files/download/<fileId>` (avec Bearer token cozy).
2. Parse le JSON, hydrate Excalidraw avec `initialData`.
3. Save loop : à chaque modif de scène, debounce 1s, puis `PUT /files/<fileId>?Type=file` avec le nouveau JSON.
4. Title sync : lorsque l'utilisateur édite le titre dans Excalidraw, mirror vers le nom de fichier Drive via `PATCH /files/<fileId>` (avec sanitisation : remove `/\`, cap 200 chars).

### Double-click depuis Drive
1. Le Drive forké détecte l'extension `.excalidraw` via `isExcalidraw()` (helper dans `twake-drive/src/modules/navigation/hooks/helpers.ts`).
2. Génère une URL `cozy://<slug>/excalidraw/#/edit/<fileId>` via `generateWebLink`.
3. Redirige (côté FilesViewer ou FileOpenerExternal) au lieu d'afficher le viewer générique « Document EXCALIDRAW / Télécharger ».

## Patches Drive associés (sur `feature/twake-drive-fork`)

| SHA | Rôle |
|-----|------|
| `8c3b177da` | Base : vendoring `linagora/twake-drive @ d2e6bbc` |
| `1bb426ca6` | Ajoute les 2 entrées de menu « + Créer → Excalidraw / Grist » (icônes + i18n + `AddMenuContent.jsx`) |
| `422e00ce3` | Helpers `isExcalidraw()`, `computeApp()`, `computePath()` dans `helpers.ts` ; redirection des `.excalidraw` vers la coquille |
| `707afb1f2` | Extrait `externalAppRedirect.js` avec une `HANDLERS` table ; le `FilesViewer` + `FileOpenerExternal` y délèguent (architecture extensible pour `.tldraw`, etc.) |
| `440c7ef84` | Hardening : matching du nom de fichier sur `attributes.name` **et** `name` (variations selon le consommateur cozy-client) |

Voir [twake-drive-fork.md](twake-drive-fork.md) pour le détail.

## Config / surface d'audit

| Élément | Fichier | Notes |
|---------|---------|-------|
| URL upstream Excalidraw | `excalidraw-app/index.html:~72` | Hardcodée `https://excalidraw.dev-twake.maudet.cloud`. **À externaliser**. |
| Token Cozy | Injecté via `data-cozy-token` sur le root element | Single session, pas de refresh logic — si la session expire pendant l'édition, save fail silencieux. |
| Save errors | `excalidraw-app-build/src/main.jsx:~95` | `console.warn` + silent UI. **À surfacer à l'utilisateur** (toast ou icône d'état). |
| Title sanitization | `excalidraw-app-build/src/main.jsx:~75` | Cap 200 chars, remove `/`, `\`. Pas de validation null-byte / control chars. |
| Rename failures | `excalidraw-app-build/src/main.jsx:~175` | `console.warn` + silent. Si le PATCH échoue pendant que l'utilisateur édite le titre, le titre Drive n'est pas mis à jour mais l'éditeur affiche le bon. |

## Déploiement

```
scripts/deploy-app.sh excalidraw
```
Voir [twake-space.md](twake-space.md) pour le script.

L'instance Excalidraw upstream doit être déployée séparément sur athena avec Authelia en façade (`excalidraw-backend/` contient les fichiers de config nginx + Authelia rules).

## Commits notables (`feature/twake-drive-fork..feature/excalidraw`)

5 commits, du plus ancien au plus récent :

1. `8233c0866` — Cozy shell + Authelia-gated Excalidraw backend
2. `12183e776` — Real `.excalidraw` files in the Drive (bundled editor)
3. `61878908b` — Mirror Excalidraw title to Drive file name
4. `623e6c756` — Editable title bar above the editor
5. `cd0e3b04e` — Collapsible Notes-style top bar with breadcrumb path

## Points à confirmer avec l'équipe

- Stratégie pour réduire la taille de `editor.js` (2.7MB minified) — code-split ou CDN ?
- Refresh token Cozy : faut-il un fallback explicite à l'expiration ?
- Décision sur le couplage `feature/excalidraw` ↔ `feature/twake-drive-fork` : faut-il les merger d'un bloc ou garder l'option de merger la coquille sans le fork ?
