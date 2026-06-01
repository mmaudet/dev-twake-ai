# `feature/twake-space` — Wrapper Twake Space + scripts

## En une phrase

Coquille Cozy `twakespace` qui wrap la démo statique Twake Space (HTML/JS exporté du build officiel) dans une iframe, surmontée du cozy-bar moderne. Plus deux scripts shell sur athena pour provisionner des utilisateurs (Authelia + Cozy + email) et déployer une coquille sur toutes les instances.

## Structure

```
twake-space-app/         ← coquille Cozy (HTML statique + bar pré-build)
  index.html             ← embed cozy-bar + iframe vers demo.html
  demo.html              ← snapshot statique du Twake Space (build officiel)
  bar.css / bar.js       ← cozy-bar bundle (sortie de twake-space-app-build)
  icon.svg               ← icône officielle Twake Space
  manifest.webapp        ← slug = "twakespace"

twake-space-app-build/   ← projet esbuild qui produit bar.js + bar.css
  package.json
  src/                   ← React 18.3 + cozy-bar libs
  (gitignored : node_modules/, dist/)

scripts/
  deploy-app.sh          ← rsync coquille → ~/cozy-apps/<slug>/ + cozy-stack apps install/update
  provision-user.sh      ← ajoute un user dans Authelia + crée Cozy instance + envoie welcome mail
  hermes/
    patch-dev-twake-nginx.py  ← injecte un sub_filter CSS dans le vhost
                                hermes catch-all qui hide les apps
                                « dataproxy » et « store » du launcher
                                Cozy + de la home (purement cosmétique)
    README.md             ← procédure de déploiement du patch hermes

USERS.md                 ← registre des utilisateurs provisionnés (slug, name, email, date)
```

## L'app `twakespace`

Architecture : la démo Twake Space est un export statique HTML/JSX (avec `@babel/standalone` pour transpiler le JSX au runtime — d'où le besoin d'un CSP relax). Le wrapper :

- Charge la démo dans une iframe à `<slug>.dev-twake.maudet.cloud/twakespace/demo.html`.
- Au-dessus, mount le `bar.js` (cozy-bar moderne, build artifact de `twake-space-app-build/`).
- Le bar est buildé une fois dans `twake-space-app-build/` puis recopié dans `twake-space-app/` pour servir comme partie de l'app Cozy.

### Patch CSP requis (hors scope ce repo)

`demo.html` exécute du JSX transpilé par `@babel/standalone` → nécessite `script-src 'unsafe-inline' 'unsafe-eval'`. Le cozy-stack vanilla bloque ça. Solution locale : sur `cozy-stack/local/twake-space-csp-relax`, patch qui honore `disable_csp: true` dans le contexte instance. **Ce patch n'est pas upstream et n'est pas dans ce repo** (le clone cozy-stack est gitignored).

## `scripts/deploy-app.sh`

Sync une coquille du repo vers les instances Cozy. Usage : `./scripts/deploy-app.sh <slug> [--branch <branch>] [--build] [--dry-run]`.

Slugs câblés (case `$slug` du script) :

| Slug | Source dans le repo | Branche typique |
|------|---------------------|------------------|
| `twakespace` | `twake-space-app/` | `feature/twake-space` |
| `grist` | `grist-app/` | `feature/grist` |
| `excalidraw` | `excalidraw-app/` | `feature/excalidraw` |
| `kanbn` | `kanbn-app/` | `feature/kanbn` |
| `openproject` | `openproject-app/` | `feature/openproject` |
| `n8n` | `n8n-app/` | `feature/n8n` |
| `twake2fa` | `twake-2fa-app/` | `feature/twake-2fa-linagora` |
| `bentopdf` | `bentopdf-app/` | `feature/bentopdf` |
| `dashboard` | `dashboard-app/build` | `feature/dashboard` (avec `--build`) |
| `drive` | `twake-drive/build` | `feature/twake-drive-fork` (avec `--build`) |

Flow :
1. **Worktree-aware checkout** (`--branch`) : si la branche cible est déjà checkée dans un worktree linké (`git worktree add`), le script utilise ce path comme source au lieu de tenter un `git checkout` (qui échouerait). Sinon, switch + trap pour restaurer la branche initiale en sortie.
2. Si `--build` est passé, lance `yarn build` dans le dossier parent du `src_rel` (pour les coquilles qui ont une étape de build : `drive`, `dashboard`).
3. Rsync `<source>/` → `~/cozy-apps/<slug>/` (mode `--delete`, ou `--dry-run --itemize-changes` si `--dry-run`).
4. Cache-bust : MD5 des fichiers non-hashed (`bar.js`, `bar.css`, `editor.js`, `editor.css`) → ajout de `?v=<8-char-hash>` dans `index.html` pour forcer les browsers à refetch.
5. Pour chaque instance retournée par `cozy-stack instances ls` : `cozy-stack apps install` (si absent), `update` (si même source), `uninstall + install` (si source différente).
6. **Healthcheck par instance** : `cozy-stack apps show <slug> --domain <inst>` doit reporter `Source = <target_src>`. Sinon → `fail_count++`. Le script exit 1 si une instance a fail.

### Modes spéciaux

- `--dry-run` : rsync passe en `-an --itemize-changes`, les commandes `cozy-stack apps` sont juste affichées en `would: install/update/…` sans exécution.
- `--branch <name>` : utilise cette branche comme source. Worktree-aware.
- `--build` : exécute `yarn build` avant le rsync (pour les coquilles avec étape de build).

### Fixes audit appliqués (`feature/twake-space`)

- **Medium** — `--dry-run` ajouté + healthcheck par instance + parsing JSON (au lieu de regex texte) pour `cozy-stack apps show` (commits `3ba399c99`, `c6a0cb972`).
- Nouveau slug `dashboard` + détection worktree-aware (`947eec000`).
- Nouveau slug `twake2fa` (`b4e0774bb`).
- Nouveau slug `bentopdf` (`bc652c25a`).

## `scripts/provision-user.sh`

Provisionne un user sur athena : Authelia + Cozy instance + welcome email. Usage : `./scripts/provision-user.sh <slug> <public_name> <email>`.

Flow :
1. **Validation slug** : regex `^[a-z][a-z0-9-]{1,30}$` (DNS-safe). Refuse up-front sinon.
2. **Authelia** : ssh hermes, append le user à `/opt/authelia/config/users_database.yml`. Mot de passe généré (20 chars random + `Xy!` suffix), hashé via `authelia crypto hash generate argon2` dans le container. Restart Authelia.
3. **Cozy idempotence** : si `cozy-stack instances show <slug>.dev-twake.maudet.cloud` succeed → l'instance existe déjà, exit 0 avec message. Sinon `cozy-stack instances add` avec les apps standard.
4. **Install apps custom** : étape `cozy-stack apps install twakespace ...` puis `cozy-stack apps install bentopdf ...` (depuis `~/cozy-apps/bentopdf-app/` peuplé par `deploy-app.sh`). Les autres coquilles (dashboard, grist, excalidraw, kanbn, n8n, openproject, twake2fa, drive) sont déployées séparément via `deploy-app.sh` qui itère sur toutes les instances.
5. Trigger `/auth/passphrase_reset` (CSRF dance), lit le `passphrase_reset_token` directement dans CouchDB → produit un lien `/auth/passphrase_renew` à usage unique.
6. **Email** : envoie un welcome mail (Linagora SMTP) avec les 2 jeux de credentials. BCC opérateur optionnel via `COZY_BCC_EMAIL`.

### Prérequis sur athena

```
~/.cozy/admin-passphrase.txt    cozy-stack admin passphrase (chmod 600)
~/.cozy/smtp.env                COZY_MAIL_USERNAME, COZY_MAIL_PASSWORD,
                                optional COZY_BCC_EMAIL
~/.cozy/couchdb.env             COZY_COUCHDB_URL=http://<user>:<pw>@<host>:5984
ssh hermes                      passwordless sudo pour Authelia
```

### Fixes audit appliqués sur `provision-user.sh`

- **Critical** — URL CouchDB extraite en `COZY_COUCHDB_URL` (commit `04332cf09`, avant : `http://admin:password@127.0.0.1:5984` en dur).
- **High** — Password entropy passée de 14 à 20 chars random (suffix `Xy!` conservé pour la contrainte de complexité Authelia).
- **High** — BCC opérateur extrait en `COZY_BCC_EMAIL` (avant : `michel.maudet@gmail.com` en dur, leaked à chaque provision).
- **Medium** — Validation slug regex + check d'idempotence (`cozy-stack instances show` avant `add`) — commit `3ba399c99`.
- **Feature** — Auto-install `bentopdf` pour les nouveaux users (commit `ca6efef81`).

## `scripts/hermes/patch-dev-twake-nginx.py`

Le launcher Cozy (cozy-bar) et la home triant les apps par `slug` (alphabétique, immuable), il n'y a pas de levier natif pour masquer ou réordonner certaines apps comme `dataproxy` ou `store`. Le script injecte un `<style>` via nginx `sub_filter` sur le vhost catch-all `dev-twake` (qui sert TOUTES les coquilles + la home Cozy) qui cache les tiles des 2 apps via plusieurs sélecteurs CSS (par `href`, `data-slug`, `aria-label`).

Idempotent — re-run remplace le block existant en place via marqueurs `# >>> cozy-launcher-hide >>> … # <<< cozy-launcher-hide <<<`.

Effet : **les apps `dataproxy` et `store` disparaissent visuellement du launcher et de la home** sur toutes les instances. Elles restent installées et reachable par leur URL directe (`<slug>-store.…`, `<slug>-dataproxy.…`).

Voir `scripts/hermes/README.md` pour la procédure de déploiement et de revert.

## Commits notables (`main..feature/twake-space`)

23 commits :

- 8 sur le wrapper `twakespace` (init, refresh demo.html successifs, fix icon viewBox, revert).
- 4 sur le provisioning initial (`provision-user.sh` + flows passphrase, BCC).
- 3 sur les scripts (`deploy-app.sh` + cache-bust).
- 1 fix audit Critical/High (`04332cf09`) — extraction secrets + entropy.
- 1 fix audit Medium (`3ba399c99`) — slug regex + idempotence + dry-run + healthcheck.
- 1 fix audit Medium (`c6a0cb972`) — healthcheck parse JSON.
- 4 ajouts de slugs à `deploy-app.sh` : dashboard, twake2fa, bentopdf + worktree-aware checkout.
- 1 chore (`7e862f8e6`) — registre `USERS.md` augmenté de Paul Tranvan + Patrick Pereira.
- 1 feature (`ca6efef81`) — install automatique `bentopdf` au provision.
- 1 feature (`55fc1645d`) — patch nginx hermes pour hide dataproxy + store du launcher.

## Points à confirmer avec l'équipe

- `demo.html` est un snapshot statique : process officiel pour la rafraîchir ? Pipeline CI ?
- Le patch CSP côté cozy-stack n'est pas portable : faut-il proposer un upstream PR ou faire vivre le patch hors arbre ?
- `provision-user.sh` est interactif/SSH-bound : envisager une API HTTP ou Ansible playbook ?
- `USERS.md` est un registre manuel : envisager un export depuis Authelia / cozy-stack ?
