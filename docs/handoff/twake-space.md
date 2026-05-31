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

Sync une coquille du repo vers les instances Cozy. Usage : `./scripts/deploy-app.sh <slug>` (twakespace, dashboard, grist, excalidraw, etc.).

Flow :
1. Optionnellement `git checkout` la branche source de la coquille (trap pour restaurer la branche initiale en sortie).
2. Si la coquille a un build (`yarn build`), le lance.
3. Rsync `<repo>/<slug>-app/` → `~/.cozy-apps/<slug>/`.
4. Cache-bust : MD5 des fichiers non-hashed → ajout de `?v=<hash>` dans `index.html` pour forcer les browsers à refetch.
5. Pour chaque instance dans `~/.cozy-apps/instances.txt` : `cozy-stack apps install` ou `update` selon état.

### Points d'attention

- `--delete` sur rsync : destructif si la source est mauvaise. Pas de dry-run.
- Pas de healthcheck post-déploiement.
- `COZY_ADMIN_PASSPHRASE` lue de `~/.cozy/admin-passphrase.txt` (fichier en clair, doit être 600).

## `scripts/provision-user.sh`

Provisionne un user sur athena : Authelia + Cozy instance + welcome email. Usage : `./scripts/provision-user.sh <slug> <public_name> <email>`.

Flow :
1. **Authelia** : ssh hermes, append le user à `/opt/authelia/config/users_database.yml`. Mot de passe généré (20 chars random + `Xy!` suffix), hashé via `authelia crypto hash generate argon2` dans le container. Restart Authelia.
2. **Cozy** : `cozy-stack instances add <slug>.dev-twake.maudet.cloud` avec les apps standard + `twakespace`. Trigger `/auth/passphrase_reset` (CSRF dance), lit le `passphrase_reset_token` directement dans CouchDB → produit un lien `/auth/passphrase_renew` à usage unique.
3. **Email** : envoie un welcome mail (Linagora SMTP) avec les 2 jeux de credentials. BCC opérateur optionnel via `COZY_BCC_EMAIL`.

### Prérequis sur athena

```
~/.cozy/admin-passphrase.txt    cozy-stack admin passphrase (chmod 600)
~/.cozy/smtp.env                COZY_MAIL_USERNAME, COZY_MAIL_PASSWORD,
                                optional COZY_BCC_EMAIL
~/.cozy/couchdb.env             COZY_COUCHDB_URL=http://<user>:<pw>@<host>:5984
ssh hermes                      passwordless sudo pour Authelia
```

### Fixes audit appliqués (commit `04332cf09`)

- **Critical** — URL CouchDB extraite en `COZY_COUCHDB_URL` (avant : `http://admin:password@127.0.0.1:5984` en dur).
- **High** — Password entropy passée de 14 à 20 chars random (suffix `Xy!` conservé pour la contrainte de complexité Authelia).
- **High** — BCC opérateur extrait en `COZY_BCC_EMAIL` (avant : `michel.maudet@gmail.com` en dur, leaked à chaque provision).

## Commits notables (`main..feature/twake-space`)

16 commits :

- 8 sur le wrapper `twakespace` (init, refresh demo.html successifs, fix icon viewBox, revert).
- 4 sur le provisioning (`provision-user.sh` + flows passphrase, BCC).
- 3 sur les scripts (`deploy-app.sh` + cache-bust).
- 1 fix audit (`04332cf09`) — extraction secrets + entropy.

## Points à confirmer avec l'équipe

- `demo.html` est un snapshot statique : process officiel pour la rafraîchir ? Pipeline CI ?
- Le patch CSP côté cozy-stack n'est pas portable : faut-il proposer un upstream PR ou faire vivre le patch hors arbre ?
- `provision-user.sh` est interactif/SSH-bound : envisager une API HTTP ou Ansible playbook ?
- `USERS.md` est un registre manuel : envisager un export depuis Authelia / cozy-stack ?
