# `feature/twake-drive-fork` — Fork Twake Drive avec dispatch externe

## En une phrase

Vendoring de `linagora/twake-drive @ d2e6bbc` + 4 patches : entrée menu « + Créer → Excalidraw / Grist », dispatcher pour ouvrir les fichiers `.excalidraw` dans la coquille Excalidraw, table extensible pour d'autres coquilles tierces, et un hardening de matching de nom de fichier.

## Topologie

Cette branche est la base sur laquelle `feature/excalidraw` et `feature/grist` se branchent. Elle ne contient que les modifs Drive (pas les coquilles).

```
main
└── feature/twake-drive-fork
    ├── feature/excalidraw   (hérite des patches Drive ci-dessous)
    └── feature/grist        (idem)
```

## Structure

```
twake-drive/              ← vendor de linagora/twake-drive @ d2e6bbc (745 fichiers)
  src/
    modules/
      navigation/hooks/helpers.ts     ← isExcalidraw(), computeApp(), computePath()
      viewer/
        externalAppRedirect.js        ← HANDLERS table + redirectToExternalAppIfNeeded()
        FilesViewer.jsx               ← appelle redirectToExternalAppIfNeeded
        FileOpenerExternal.jsx        ← idem
    (autres modules : inchangés)
  package.json
  yarn.lock
  (gitignored : node_modules/, build/, dist/, .cache/)
```

Les fichiers `AddMenuContent.jsx`, `CreateExcalidrawItem.jsx`, `CreateGristItem.jsx` et les fichiers i18n (`fr.json`, `en.json`) sont également modifiés par le patch `1bb426ca6` — chemins exacts dans le code source Twake Drive.

## Détail des 5 commits

### 1. `8c3b177da` — chore(twake-drive): vendor `linagora/twake-drive @ d2e6bbc`

Base du fork : 745 fichiers, 82 260 lignes. Vendoring direct (pas de sous-module) pour pouvoir patcher sans dépendre du repo upstream.

**Question équipe** : envisager un sous-module Git si le fork est destiné à diverger longtemps, ou rebase régulier sur upstream si l'objectif est de remonter les patches.

### 2. `1bb426ca6` — feat: add Grist and Excalidraw entries to « + Créer » menu

Modifie le menu « + Créer » du Drive pour ajouter 2 raccourcis :

- `CreateExcalidrawItem.jsx` (59 lignes) : navigate vers `/bridge/excalidraw/new/<folderId>` sur la coquille.
- `CreateGristItem.jsx` (59 lignes) : idem pour `/bridge/grist/new/<folderId>`.
- Icônes SVG ajoutées (excalidraw, grist).
- Entrées i18n fr/en (`nouvelle_excalidraw`, `nouveau_grist`).
- Wiring dans `AddMenuContent.jsx`.

**Note de design** : ces 2 entrées sont liées dans le même commit pour cohérence visuelle. Si l'équipe veut merger Excalidraw seul (sans Grist) ou inverse, ce commit sera à splitter — voir [README.md](README.md) section « Ordre de merge ».

### 3. `422e00ce3` — feat: dispatch `.excalidraw` files to the excalidraw coquille

Helpers dans `src/modules/navigation/hooks/helpers.ts` :
- `isExcalidraw(file)` — détecte l'extension (lowercase, sur `file.name` ou `file.attributes.name`).
- `computeFileType(file)`, `computeApp(file)`, `computePath(file)` — choisissent le slug Cozy et le hash route.

Wiré dans `FilesViewer` : double-click sur un `.excalidraw` → `generateWebLink({ slug: 'excalidraw', hash: '/edit/<id>' })` au lieu d'afficher le viewer générique.

**Extensibilité** : pour ajouter `.tldraw`, `.quill`, etc., on ajoute un cas dans `computeApp` + une entrée dans le HANDLERS du commit suivant.

### 4. `707afb1f2` — feat: redirect external-coquille files from the preview route

Extrait `externalAppRedirect.js` avec une table `HANDLERS` qui mappe extensions → coquille. `FilesViewer` et `FileOpenerExternal` appellent `redirectToExternalAppIfNeeded(file)` en début de mount → court-circuit du viewer générique.

Couvre les cas :
- Clic depuis un widget Dashboard
- Clic depuis un lien partagé
- Deep URL `/files/<id>`

**Sans ce patch** : le Drive affiche « Document EXCALIDRAW / Télécharger » au lieu d'ouvrir l'éditeur.

### 5. `440c7ef84` — fix: match files exposing name on attributes too

Hardening : selon le consommateur cozy-client (composant React vs hook vs raw API), un fichier expose son nom sur `file.name` ou `file.attributes.name`. Le code initial ne regardait que `file.name`, ratait certains événements.

Ajoute des helpers `fileName(file)` et `fileId(file)` qui lookent aux deux endroits. Change aussi `location.href = ...` en `location.replace(...)` pour éviter de polluer l'historique du navigateur. Ajoute un `console.info` de trace pour debug.

## Build

```
cd twake-drive
yarn install
yarn build
```

L'output va dans `twake-drive/build/` (gitignored). Pour déployer comme app Cozy via `scripts/deploy-app.sh`, le script gère le `yarn build` automatiquement pour le slug `drive`.

## Stratégie de maintenance

Actuellement le fork vit indépendamment. Les options pour la suite :

1. **Upstream les 4 patches** vers `linagora/twake-drive` — souhaitable, mais nécessite l'accord de l'équipe Drive sur l'architecture `HANDLERS` table.
2. **Maintenir le fork** avec rebase régulier sur upstream — coût récurrent.
3. **Remplacer le fork par des hooks externes** — si Twake Drive ajoute un système de plugins / extensions, on pourrait dégradé les patches en simple config.

## Points à confirmer avec l'équipe

- Stratégie de maintenance long terme (cf ci-dessus).
- Vendoring brut vs sous-module : décision avant que le delta vs upstream grossisse.
- Le commit `1bb426ca6` (menu) : faut-il le splitter pour permettre des merges indépendants Excalidraw / Grist ?
- Pour étendre à `.tldraw`, `.quill`, etc., un mainteneur peut-il ajouter une entrée dans `HANDLERS` sans toucher au reste du Drive ?
