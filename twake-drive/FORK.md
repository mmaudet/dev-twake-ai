# Twake Drive — local fork

This directory is a vendored copy of
[`linagora/twake-drive`](https://github.com/linagora/twake-drive),
patched to expose `Grist` and `Excalidraw` as native entries in the
Drive's "+ Créer" menu (next to `Dossier`, `Note`, `Raccourci`).

## Upstream pin

- Repo: `git@github.com:linagora/twake-drive`
- Commit: `d2e6bbca4b895b64a711d9adc988e0b2fa235dab`
- Version (per `package.json`): `1.100.0`

## Patches applied here

All changes live under `src/`. To see them, diff against upstream at
the pinned commit:

```sh
git -C /tmp/twake-drive-src reset --hard d2e6bbc
diff -ruN /tmp/twake-drive-src/src ./src
```

The patches add:

- `src/modules/drive/Toolbar/components/CreateGristItem.jsx`
- `src/modules/drive/Toolbar/components/CreateExcalidrawItem.jsx`
- `src/assets/icons/icon-grist.svg`
- `src/assets/icons/icon-excalidraw.svg`
- 2 i18n keys in `src/locales/{fr,en}.json`
- 2 `<CreateGristItem/>` + `<CreateExcalidrawItem/>` lines in
  `src/modules/drive/AddMenu/AddMenuContent.jsx`

Each menu entry simply navigates to
`https://<user>-<slug>.dev-twake.maudet.cloud/#/bridge/<slug>/new/<folderId>`
on the matching Cozy shell app (`grist`, `excalidraw`). The shell
app handles document creation and the Drive entry materialization
(shortcut for Grist, real file for Excalidraw).

## Build & install (on athena)

```sh
cd twake-drive
pnpm install
pnpm build
# dist/ now contains the bundled webapp
cozy-stack apps install drive "file://$(pwd)/dist" --domain mmaudet.dev-twake.maudet.cloud
```

If `drive` is already installed from the registry, use `update` with
a local source first time, then subsequent rebuilds need only
`cozy-stack apps update drive --domain ...`.
