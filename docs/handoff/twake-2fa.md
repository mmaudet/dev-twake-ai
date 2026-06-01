# `feature/twake-2fa-linagora` — Coquille « My 2FA Setup »

## En une phrase

Coquille Cozy ultra-minimale (`twake2fa`) qui présente une page d'accueil avec un CTA ouvrant `https://sso.linagora.com/2fregisters/totp` dans un nouvel onglet. Sert de point d'entrée discoverable depuis le launcher Cozy pour que l'utilisateur active le second facteur (TOTP) sur son compte SSO LINAGORA.

## Topologie

Coquille **autonome** — pas de backend, pas d'iframe, pas de dépendance au Drive forké. Branche depuis `main`.

## Structure

```
twake-2fa-app/
  manifest.webapp          slug "twake2fa", category "security",
                           permissions minimales (apps/settings/sharings/
                           contacts pour le cozy-bar)
  index.html               page « card » centrée avec icône + titre +
                           bouton CTA <a target="_blank" rel="noopener noreferrer">
  icon.png                 bouclier bleu + cadenas + « 2FA » (transparent)
  bar.css / bar.js         cozy-bar bundle (copié depuis grist-app)
```

## Comportement

Au chargement, l'app affiche une carte centrée :

- Icône large (le bouclier 2FA en transparent)
- Titre : « Configurer la double authentification LINAGORA »
- Texte : « Active le second facteur (TOTP) sur ton compte SSO LINAGORA pour sécuriser ton accès. La page d'enrôlement s'ouvre dans un nouvel onglet. »
- Bouton CTA bleu : « Configurer le 2FA » avec `<a href="https://sso.linagora.com/2fregisters/totp" target="_blank" rel="noopener noreferrer">`
- Sous le bouton : le lien direct en `<code>` pour copier/coller

Le cozy-bar standard s'affiche en haut (apps menu, user menu).

## Nom affiché

Évolution dans le temps :
1. Initial : « Twake 2FA LINAGORA » (commit `816a30960`)
2. Renommé : « 2FA LINAGORA » (commit `11aae21fe`, drop du préfixe `Twake`)
3. Renommé encore : **« My 2FA Setup »** (commit `55091c323`, finale)

Le slug interne reste `twake2fa` (DNS-safe, immutable).

## Icône

Bouclier bleu dégradé + cadenas blanc + texte « 2FA » blanc, fond **transparent** (commit `42617782e`). Obtenue par flood-fill ImageMagick depuis les 4 coins du PNG d'origine avec fuzz 8% — seuls les pixels blancs reliés aux coins sont remplacés par alpha 0 ; les traits blancs intérieurs du bouclier et le texte « 2FA » restent intacts car protégés par le bord bleu.

```sh
convert icon-original.png -alpha set -channel RGBA \
  -fuzz 8% -fill none -floodfill +0+0 white \
  -fuzz 8% -fill none -floodfill +473+0 white \
  -fuzz 8% -fill none -floodfill +0+473 white \
  -fuzz 8% -fill none -floodfill +473+473 white \
  icon.png
```

## Permissions manifest

```json
{
  "apps":     { "type": "io.cozy.apps",     "verbs": ["GET"] },
  "settings": { "type": "io.cozy.settings", "verbs": ["GET"] },
  "sharings": { "type": "io.cozy.sharings", "verbs": ["GET"] },
  "contacts": { "type": "io.cozy.contacts", "verbs": ["GET"] }
}
```

Strictement le minimum requis pour faire fonctionner le cozy-bar. Pas de `io.cozy.files`, pas d'intent, pas de service.

## Déploiement

```
scripts/deploy-app.sh twake2fa --branch feature/twake-2fa-linagora
```

Slug pré-câblé dans `deploy-app.sh` (commit `b4e0774bb` sur `feature/twake-space`). L'app est installée sur les 8 instances de la stack.

## Commits notables

| SHA | Sujet |
|-----|-------|
| `816a30960` | feat(twake-2fa): Cozy coquille opening the LINAGORA TOTP enrolment page |
| `11aae21fe` | chore: drop the 'Twake' prefix from the display name |
| `55091c323` | chore: rename display name to 'My 2FA Setup' |
| `42617782e` | chore: icon transparent background |

## Points à confirmer avec l'équipe

- L'URL `https://sso.linagora.com/2fregisters/totp` est-elle stable côté Linagora ? (URL d'enrôlement TOTP du SSO LemonLDAP). À sortir en config si elle bouge.
- Faut-il un retour dans la coquille après enrôlement (postMessage côté Linagora) ou la fenêtre standalone suffit ?
- Le bouton CTA est en `target="_blank"` ; on accepte que les bloqueurs de popup puissent gêner sur certains setups.
