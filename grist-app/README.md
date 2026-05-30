# grist coquille

Cozy shell webapp wrapping [Grist](https://www.getgrist.com/) self-hosted on
athena. Exposed at `https://<user>-grist.dev-twake.maudet.cloud/` (one
instance per user via Cozy `flat` subdomains).

## Two routes

- **Default `/`** — renders an iframe pointing at
  `https://grist.dev-twake.maudet.cloud/`. The user sees Grist embedded
  with the Cozy bar on top.
- **`#/bridge/grist/new/<folderId>`** — Drive's "+ Créer → Grist" entry
  navigates here (see the `twake-drive` fork). The bridge:
  1. Discovers the user's Grist org + first workspace via the Grist
     REST API (browser-side, with the user's Grist session cookie).
  2. Creates a new doc.
  3. Materializes an `io.cozy.files.shortcuts` in `<folderId>` pointing
     to the new Grist doc. Metadata: `{target: {app: 'grist', docId,
     orgDomain}}` — the docId is what `cleanup-grist.js` needs at
     purge time.
  4. Redirects to the Grist doc.

  If the user has no Grist session yet, the bridge opens Grist in a new
  tab so OIDC takes over, then prompts a reload.

## Cascade delete (Drive trash → Grist trash)

`services/cleanup-grist.js` is wired to `@event io.cozy.files:DELETED`
in `manifest.webapp`. When a file is purged from the Drive trash:

- It checks `metadata.target.app === 'grist'`. If not, it returns.
- It reads `metadata.target.docId` and sends
  `DELETE https://grist.dev-twake.maudet.cloud/api/docs/<docId>` with
  a Grist API key.

**Cozy `@event …:DELETED` only fires on permanent purge** (moving to
trash is an UPDATE), so users can still recover a shortcut from the
Drive trash without losing the Grist doc.

### Provisioning the Grist API key

The service reads `GRIST_API_KEY` from its env. On athena the
cozy-stack systemd unit picks it up via `EnvironmentFile`:

```sh
# 1. Log into Grist as the user, open profile → API tokens → create one
# 2. Save it locally
mkdir -p ~/.cozy && touch ~/.cozy/grist.env && chmod 600 ~/.cozy/grist.env
printf 'GRIST_API_KEY=%s\n' '<paste-here>' > ~/.cozy/grist.env

# 3. Wire it into the cozy-stack systemd unit
systemctl --user edit cozy-stack
# Add under [Service]:
#   EnvironmentFile=%h/.cozy/grist.env

systemctl --user daemon-reload
systemctl --user restart cozy-stack
```

Without the key the service logs `would DELETE Grist doc <docId>
(skipping)` — the trigger fires, the file is gone from the Drive, but
the Grist side stays.
