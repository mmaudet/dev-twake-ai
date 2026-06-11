# Twake Space — Maquette de démonstration
### Note explicative & guide de lecture

---

## 1. En bref

Cette maquette est une **démonstration interactive haute-fidélité** d'un **espace
collaboratif souverain « Twake Space »** (ECS). Elle sert de support de présentation
fonctionnelle : elle **donne à voir** toutes les fonctionnalités cibles, de façon
cliquable, **sans aucun backend ni connexion réseau**.

> ⚠️ **C'est une simulation.** Aucune donnée n'est réelle, rien n'est envoyé sur
> Internet, rien n'est enregistré. L'« IA » et le « temps réel » sont simulés
> (textes pré-écrits + minuteries). Recharger la page remet tout à l'état initial.

### Comment l'ouvrir
- **Double-cliquez sur `twake-space.html`** (Chrome, Edge, Firefox ou Safari).
- Aucune installation, aucun serveur : ça fonctionne **hors-ligne**, en local.
- Gardez les fichiers ensemble (le `.html`, `styles.css`, `app.js` et le dossier
  `assets/` doivent rester dans le même dossier).

---

## 2. Ce que la maquette démontre

Le cœur du concept : **un espace unique qui agrège tous les modules** (fil, chat,
fichiers, tâches, agenda, mail) sous une barre d'onglets, avec **interopérabilité
visuelle** — un même objet (événement, document, tâche) se rend comme une « carte »
dans plusieurs modules.

Sont matérialisés : création d'espace, personnalisation (couleur/logo/widgets),
gestion des membres et des droits, partage de documents (versions + diffusion),
tâches avec avancement, agenda (visio & salles), fil d'actualité, messagerie,
notifications intelligentes, archivage, stockage partagé, **IA intégrée**, et un
**assistant IA souverain** par espace.

---

## 3. Les zones de l'écran

```
┌──────┬────────────┬────────────────────────────────┬─────────────┐
│ Rail │  Sidebar   │        Zone centrale           │  Volet IA   │
│ apps │ « Project »│  en-tête + onglets + contenu   │ (à la       │
│      │  (espaces) │                                │  demande)   │
└──────┴────────────┴────────────────────────────────┴─────────────┘
```

1. **Rail d'apps** (bande gauche) : logo Twake en haut, icônes des applications,
   votre **avatar** tout en bas.
2. **Sidebar « Project »** : la liste de vos **espaces** (épinglés + récents).
3. **Zone centrale** : l'**en-tête** de l'espace (nom, recherche, actions), la
   **barre d'onglets**, puis le **contenu** de l'onglet sélectionné.
4. **Volet Assistant IA** : panneau de droite qui s'ouvre à la demande.

---

## 4. Visite guidée — où cliquer, quoi faire

### 🗂️ Changer d'espace
**Cliquez un espace** dans la sidebar : *B2B Admin Panel*, *Modernisation du SI*,
*Équipements utilisateurs*, *Cybersécurité*, *Plateforme collaborative*.
→ Le contenu, les membres **et la couleur d'accent** changent pour chaque espace.
*(B2B Admin Panel est l'espace le plus détaillé.)*

### 📑 Naviguer dans les onglets
Cliquez les onglets sous l'en-tête. Pour chacun :

| Onglet | Ce qu'on voit | Ce qu'on peut faire |
|---|---|---|
| **Fil** | L'activité agrégée (docs, tâches, événements, messages, arrivées) | Cliquer le lien `#général` pour aller au chat |
| **Discussions** | Canaux + messages avec avatars, rôles, mentions, cartes liées | **Changer de canal** (clic), **écrire un message** (zone de saisie → Entrée), **réagir** (clic sur 👍/🚀) |
| **Fichiers** | Liste de documents avec badges (version, diffusion, IA) | **« Détails IA »** (ouvre auteur/entités/thématique), **badge « v3 »** (historique des versions), **recherche plein texte**, encart IA **« Regrouper / Ignorer »** |
| **Tâches** | Tableau À faire / En cours / Terminé + barre d'avancement | **Cliquer le statut** d'une carte → il avance (À faire → En cours → Terminé) et **l'avancement se recalcule** |
| **Agenda** | Réunions & échéances (visio « Twake Visio Meeting », salles) | Cliquer « Rejoindre » sur une réunion |
| **Mail** | Boîte allégée de l'espace | — |

### 🔎 Rechercher
Tapez dans **« Rechercher dans l'espace… »** (en-tête) → le contenu de l'onglet
courant **se filtre en direct**.

### ✨ Assistant IA (volet à droite)
- **Bouton flottant en bas à droite « Assistant IA »** → ouvre le volet.
  Sur grand écran, le volet **redimensionne la zone centrale** (vue scindée).
- **Cliquez une suggestion** (« Résumer l'activité récente », « Quelles tâches sont
  à risque ? »…) ou **tapez une question** → réponse **contextuelle à l'espace**,
  avec un temps de « réflexion » simulé.
- Fermez via le **×** du volet (ou la touche Échap).

### 🔔 Notifications
**Cloche** dans l'en-tête → panneau. **Survolez ou cliquez** une notification pour
la marquer lue ; **« Tout marquer lu »** vide le compteur. Une **nouvelle
notification arrive automatiquement** après quelques secondes (simulation temps réel).

### 👥 Membres & droits
Icône **« ajout de membre »** (en-tête) → panneau Membres :
- **Inviter** par e-mail — interne **ou externe** (badge « Externe » automatique).
- **Changer les rôles** (Administrateur / Contributeur / Lecteur).
- **Ajuster les droits par ressource** (lecture / écriture / partage).

### 🎨 Personnaliser l'espace
Menu **« … »** (en-tête) → **« Personnaliser l'espace »** :
- **Couleur d'accent** → l'interface **se re-teinte en direct**.
- **Logo** de l'espace, et **widgets** (les cases cochées affichent/masquent les onglets).

### ➕ Créer un espace
Bouton **« + »** dans la sidebar (ou **« Nouvel espace »** en bas) → formulaire
(nom, type, description). *(La création « dépend des droits ».)*

### 🗄️ Archiver / réactiver
Menu **« … »** → **« Archiver l'espace »** → bandeau d'information + passage en
**lecture seule** → bouton **« Réactiver »**.

### 👤 Préférences utilisateur
**Cliquez votre avatar** (bas du rail) → statut de présence, notifications,
paramètres du compte, déconnexion.

---

## 5. Bon à savoir

- **100 % simulé, hors-ligne.** Pas de serveur, pas d'appel réseau, pas de compte.
- **Pas de persistance** : vos clics (messages envoyés, statuts changés, invitations…)
  vivent en mémoire ; **recharger** la page repart de l'état initial.
- **Souveraineté** : l'assistant IA affiche « traitement souverain — vos données
  restent dans l'ECS » : c'est le message de positionnement, aucun traitement réel.

---

## 6. Contenu du dossier (aspect technique)

| Fichier | Rôle |
|---|---|
| `twake-space.html` | La page (structure) — **c'est le fichier à ouvrir** |
| `styles.css` | La mise en forme (design system « Cozy UI ») |
| `app.js` | Les comportements interactifs (tout en local) |
| `assets/` | Les logos SVG (Twake, cube d'espace) |
| `GUIDE.md` | Cette note |

Construit en **fichiers statiques**, **sans framework ni dépendance**, et conçu pour
passer une **politique de sécurité stricte (CSP)** : aucun script ni style « inline »,
aucun chargement externe. Cible d'affichage : écran **≥ 1024 px** de large.

---

*Maquette de démonstration — non contractuelle.*
