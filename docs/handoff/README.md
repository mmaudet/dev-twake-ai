# Handoff — dev.twake.ai

Ce dossier décrit la démo livrée par Michel Maudet à l'équipe de dev Linagora pour review. Il documente, branche par branche, ce que chaque morceau fait, comment il s'intègre à la stack Cozy / Twake, et ce qu'il reste à durcir avant un passage en prod.

Aucune branche n'est mergée — c'est intentionnel. Chaque feature vit sur sa propre branche `feature/*` pour permettre une review indépendante.

## Carte des branches

| Branche | Contenu | Doc |
|---------|---------|-----|
| `main` | Bootstrap (`README.md`, `.gitignore`, `USERS.md`) + ce dossier `docs/handoff/`. | — |
| `feature/dashboard` | App Cozy custom : dashboard drag-and-drop avec widgets (Drive, Notes, kan.bn, Mail Linagora, Calendar Linagora). Backend Node.js pour OIDC / JMAP / CalDAV. | [dashboard.md](dashboard.md) |
| `feature/excalidraw` | Coquille Cozy `excalidraw` (éditeur sur fichiers `.excalidraw` du Drive) + base Drive forkée. **Branche depuis `feature/twake-drive-fork`**. | [excalidraw.md](excalidraw.md) |
| `feature/grist` | Coquille Cozy `grist` + backend de cascade-delete + base Drive forkée. **Branche depuis `feature/twake-drive-fork`**. | [grist.md](grist.md) |
| `feature/twake-drive-fork` | Fork de `linagora/twake-drive @ d2e6bbc` avec 4 patches : entrée menu « + Créer → Excalidraw/Grist », dispatch `.excalidraw`, redirect external coquilles, hardening matching name. | [twake-drive-fork.md](twake-drive-fork.md) |
| `feature/twake-space` | Wrapper Cozy `twakespace` (esbuild + cozy-bar autour de la démo Twake Space) + scripts de déploiement et de provisioning. | [twake-space.md](twake-space.md) |
| `feature/kanbn` | Coquille Cozy `kanbn` (en surface seulement, hors scope handoff complet). | — |
| `feature/n8n` | Coquille Cozy `n8n` (idem). | — |
| `feature/openproject` | Coquille Cozy `openproject` (idem). | — |
| `backup/feature/grist-pre-rebase` | Snapshot de `feature/grist` avant son nettoyage (8 commits dashboard avaient leaké). À conserver le temps de la review. | — |
| `backup/feature/excalidraw-pre-cherry` | Snapshot de `feature/excalidraw` avant son rebase sur `feature/twake-drive-fork`. À conserver le temps de la review. | — |

## Topologie

```
main (bootstrap + docs handoff)
├── feature/dashboard
├── feature/twake-space
├── feature/twake-drive-fork           ← base Drive forkée (5 commits)
│   ├── feature/excalidraw             ← branche depuis twake-drive-fork
│   └── feature/grist                  ← branche depuis twake-drive-fork
├── feature/kanbn
├── feature/n8n
└── feature/openproject
```

`feature/excalidraw` et `feature/grist` héritent du Drive forké : pour les exécuter, il faut build le Drive depuis ces branches (les coquilles Cozy sont autonomes mais l'intégration « + Créer dans Drive » et le dispatch `.excalidraw` viennent du fork).

## Ordre de merge suggéré (si l'équipe décide d'intégrer)

1. `feature/twake-space` (provisioning + scripts) — pré-requis pour déployer toute coquille.
2. `feature/twake-drive-fork` (base Drive avec menu + dispatch) — pré-requis pour Excalidraw + Grist.
3. `feature/dashboard` — indépendant.
4. `feature/excalidraw` et `feature/grist` — peuvent merger en parallèle dès que (2) est en place.
5. `feature/kanbn`, `feature/n8n`, `feature/openproject` — indépendants (hors scope handoff).

## Services externes utilisés

| Service | Rôle | URL |
|---------|------|-----|
| `athena` (VPS) | Hôte de la stack Cozy + des backends Node des coquilles + Grist self-hosted. | (réseau privé) |
| `hermes` (VPS Hetzner) | Reverse proxy nginx + Authelia, hub `*.maudet.cloud`. | https://auth.maudet.cloud |
| Authelia | SSO en façade des coquilles tierces (Excalidraw, Grist, n8n, OpenProject, kan.bn). | https://auth.maudet.cloud |
| Cozy stack | Déployée sur athena, exposée via Hermes. | https://`<slug>`.dev-twake.maudet.cloud |
| Linagora OIDC | SSO Linagora (PKCE), utilisé par le dashboard. | https://sso.linagora.com |
| Linagora JMAP | API mail, utilisée par le widget Mail du dashboard. | https://jmap.linagora.com |
| Linagora CalDAV | API calendrier, utilisée par le widget Calendar du dashboard. | https://tcalendar.linagora.com |
| Grist self-hosted | Backend Grist sur athena (OIDC-wired). | https://grist.dev-twake.maudet.cloud |
| Excalidraw self-hosted | Backend Excalidraw sur athena (Authelia-gated). | https://excalidraw.dev-twake.maudet.cloud |

## Démarrage local

Aucune procédure clé-en-main : la démo est wired pour le couple `athena` + `hermes` + `maudet.cloud`. Pour reproduire localement :

1. Cloner le repo, clone séparé pour `cozy-stack/` (gitignored, son propre repo).
2. Build le cozy-stack avec le patch CSP local (branche `local/twake-space-csp-relax` sur le clone cozy-stack). Détails dans [twake-space.md](twake-space.md).
3. Build chaque coquille comme une app Cozy classique (`cozy-stack apps install <slug> file://<path>`).
4. Pour le fork Drive : `cd twake-drive && yarn install && yarn build`.

Voir [audit.md](audit.md) pour la checklist pré-prod (URLs hardcodées, secrets, etc. à externaliser).

## Pour l'équipe de review

- **Fichiers à lire en premier** : [audit.md](audit.md) (les findings sont déjà classés par sévérité, certains sont corrigés, d'autres restent en TODO équipe).
- **Format des commits** : Conventional Commits (`feat(grist):`, `fix(provision): ... [audit]`, etc.). Les commits `[audit]` correspondent à des corrections appliquées suite à l'audit hostile.
- **Réécriture d'historique** : `feature/grist` et `feature/excalidraw` ont été force-pushed pour atteindre cet état propre. Les versions antérieures sont conservées dans `backup/feature/*` sur origin.
