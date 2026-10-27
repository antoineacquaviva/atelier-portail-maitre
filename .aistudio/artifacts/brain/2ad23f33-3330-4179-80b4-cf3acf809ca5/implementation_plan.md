# Refonte & Simplification du Portail Orchestrateur (`atelierconceptionjeu.fr`)

Cette refonte épure l'interface de tous les assistants temporaires de migration initiale (nettoyage `Projet_Jeu`, inspecteur statique `lora-factory`, scripts PowerShell locaux sur PC) pour transformer le portail en un **hub quotidien ultra-simple, 100 % pilotable depuis le navigateur (que vous soyez sur Windows 11 ou sur Ubuntu, sans aucun dépôt Git local requis sur vos PC)**.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Voici les décisions clés validées ensemble pour cette nouvelle version épurée :

- **Décision confirmée 1 — Zéro dépôt requis sur vos PC (Upload `.zip` direct + Git Pull direct)** :
  - **Source 1 (Google AI Studio ➔ GitHub)** : Vous sauvegardez vers GitHub depuis AI Studio, puis vous cliquez sur **« Tirer depuis GitHub »** dans le portail. La VM fait `git pull`, compile si nécessaire et redémarre le service.
  - **Source 2 (Discussion Gemini ➔ Archive `.zip`)** : Vous glissez-déposez directement le fichier `.zip` téléchargé dans l'interface web du portail. La VM décompresse l'archive dans `/srv/jeu/<outil>` (en préservant `.git`, `venv`, `dataset`, `models`), redémarre le service `systemd`, **et exécute elle-même `git commit` + `git push origin main` vers GitHub**. Ainsi, GitHub reste toujours à jour et vous pouvez basculer un projet d'une source à l'autre à tout moment.
- **Décision confirmée 2 — Ajout automatisé d'un nouvel outil par la VM** : Le formulaire **« + Nouvel outil »** crée automatiquement le dossier `/srv/jeu/<id>`, clone le dépôt (ou extrait le premier `.zip`), génère et active l'unité `/etc/systemd/system/<id>.service`, met à jour `/etc/caddy/Caddyfile` avec le nouveau sous-chemin `/<id>` et recharge Caddy.
- **Décision confirmée 3 — Auto-mise à jour discrète du Portail dans l'en-tête** : Le portail est retiré de la grille des outils métier pour ne pas polluer l'écran d'accueil. Un bouton discret **« Mettre à jour le Portail »** dans la barre supérieure permet de le mettre à jour en un clic (`git pull` + `npm install --legacy-peer-deps && npm run build` + `systemctl restart atelier-portail.service`).

---

## 1. Overview & Core Concept

- **Ce que fait l'application** :
  1. **Grille d'Accès Immédiat en 1 Clic (« Mes Outils »)** : Présente uniquement vos outils métier (`Forêt Automate Lab` sur `/lab`, `LoRA Factory Studio` sur `/lora`, `BGA Studio` sur `/bga`, et tout futur outil). Chaque carte met en avant un bouton principal **« Ouvrir l'outil »** ainsi qu'un bouton **« Déployer une nouvelle version »** et les contrôles rapides (`Redémarrer`, `Arrêter/Démarrer`, `Logs`).
  2. **Modale Unifiée « Déployer une nouvelle version » (Bi-Source)** : Permet de mettre à jour n'importe quel outil soit en 1 clic depuis **GitHub** (Source 1 : AI Studio), soit en téléversant une **archive `.zip`** issue d'un fil Gemini (Source 2 : Extraction sur la VM + Redémarrage + Push GitHub automatique).
  3. **Assistant « + Déployer un nouvel outil »** : Automatise de bout en bout l'intégration d'un nouveau projet sur la VM (clonage Git ou import `.zip` initial, attribution automatique d'un port libre, création du service `systemd` et ajout du sous-chemin dans Caddy).
  4. **Documentation Opérationnelle & Prérequis Résiduels (« Guide de Déploiement »)** : Documente pas-à-pas les 3 flux de travail (AI Studio, ZIP Gemini, bascule entre les deux) ainsi que la **liste exacte des étapes manuelles résiduelles** (création du dépôt vide sur GitHub, clé SSH de la VM autorisée sur GitHub pour le `git push` automatique des `.zip`, et consigne de prompt Gemini pour la compatibilité sous-chemin Caddy).

---

## 2. User Experience & Visual Design

- **Navigation Simplifiée (Barre supérieure en 3 zones)** :
  - **Zone 1 (Gauche)** : Titre `Atelier Conception Jeu` + indicateur discret d'état de la VM (`8 OCPU · 16 Go`).
  - **Zone 2 (Centre — 2 onglets uniquement)** :
    1. `Mes Outils` (Accès 1-clic, déploiement de nouvelles versions, ajout d'un outil et console de logs repliable).
    2. `Guide & Prérequis` (Documentation opérationnelle de bout en bout + vérification des droits SSH/sudo de la VM).
  - **Zone 3 (Droite)** : Bouton discret `Mettre à jour le Portail` (pour mettre à jour le portail lui-même depuis GitHub) + Bouton primaire `+ Nouvel outil`.
- **Parcours Utilisateur** :
  - **Lancer un outil** : Dès l'arrivée sur `https://atelierconceptionjeu.fr/`, un clic sur **« Ouvrir /lora »** ou **« Ouvrir /lab »** ouvre l'outil correspondant.
  - **Déployer une nouvelle version** : Clic sur **« Nouvelle version »** sur la carte de l'outil ➔ Choix entre **« Depuis GitHub (AI Studio) »** (1 clic) ou **« Depuis un fichier .zip (Discussion Gemini) »** (Sélection du fichier `.zip` + clic sur *Déployer & Synchroniser GitHub*). Un journal d'exécution affiche chaque étape en direct.
  - **Ajouter un nouvel outil** : Clic sur **« + Nouvel outil »** ➔ Saisie du nom (ex: *Simulateur de Cartes*), du sous-chemin (`/cartes`), de l'URL GitHub et du type d'application (Python FastAPI, Python Flask, Node.js) ➔ La VM configure tout et rend l'outil immédiatement accessible sur `https://atelierconceptionjeu.fr/cartes/`.

---

## 3. Key Product Decisions & Trade-Offs

- **Décision 1 : La VM devient l'unique passerelle Git (même pour les fichiers `.zip` Gemini)**
  - *Approche choisie* : Lorsqu'un fichier `.zip` est téléversé dans le portail web, le serveur Express de la VM l'extrait dans `/srv/jeu/<outil>` en excluant les dossiers de données (`.git`, `venv`, `node_modules`, `dataset`, `originals`, `models`, `.gemini_key`), puis exécute `git add -A && git commit -m "..." && git push origin main` directement depuis la VM.
  - *Pourquoi* : Vous n'avez plus jamais besoin de cloner ou d'entretenir des dépôts Git sur votre PC Windows 11 ni sur votre PC Ubuntu. Que vous téléchargiez un `.zip` depuis Gemini sur Ubuntu ou sur Windows, vous le glissez dans le portail web et GitHub est automatiquement mis à jour par la VM.
- **Décision 2 : Persistance de la liste des outils dans `/srv/jeu/tools-registry.json`**
  - *Approche choisie* : La liste des outils et leurs paramètres (port, sous-chemin, dépôt Git, commande de démarrage, commande de build) sont stockés dans `/srv/jeu/tools-registry.json` (en dehors du dossier du portail) afin qu'une mise à jour du portail lui-même conserve toujours tous les outils que vous avez ajoutés.

---

## 4. Technical Architecture & Data Strategy

### Flux de Déploiement Bi-Source (Zéro Dépôt sur PC)

```
┌──────────────────────────────────┐       ┌──────────────────────────────────┐
│ SOURCE 1 : Google AI Studio      │       │ SOURCE 2 : Fil de discussion     │
│ (Synchronisé avec GitHub)        │       │ Gemini (Archive .zip téléchargée)│
└────────────────┬─────────────────┘       └────────────────┬─────────────────┘
                 │                                          │
      1. Save to GitHub                          1. Upload direct du .zip
                 │                                  dans le Portail Web
                 ▼                                          │
┌──────────────────────────────────┐                        │
│ Dépôt GitHub                     │◄───────────────────────┤
│ github.com/antoineacquaviva/<id> │   3. git commit & push │
└────────────────┬─────────────────┘      automatique       │
                 │                        depuis la VM      │
      2. Clic "Tirer depuis GitHub"                         │
         dans le Portail Web                                │
                 │                                          │
                 ▼                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ VM ORACLE (141.145.218.127 — Portail Orchestrateur /srv/jeu/...)            │
│                                                                             │
│  • Extraction propre / Git Pull dans /srv/jeu/<id>                          │
│  • Patch optionnel sous-chemin Caddy (<base href="/<subpath>/">)            │
│  • Exécution du build éventuel (pip / npm --legacy-peer-deps)               │
│  • Redémarrage systemd (sudo systemctl restart <id>.service)                │
│  • Mise à jour automatique de /etc/caddy/Caddyfile & reload Caddy           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Architecture des Composants et Routes Backend (`server.ts`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ En-tête :Atelier Conception Jeu │ Mes Outils · Guide │ [MAJ Portail] [+Outil]│
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Grille "Mes Outils" (Uniquement les outils métier : /lab, /lora, ...) │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ Carte Outil :                                                   │  │  │
│  │  │  • Bouton primaire : [Ouvrir /lora ↗]                           │  │  │
│  │  │  • Bouton déploiement : [Déployer une nouvelle version]         │  │  │
│  │  │  • Contrôles rapides : [Redémarrer] [Arrêter] [Logs]            │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────┐ ┌─────────────────────────────────┐  │
│  │ Modale : Nouvelle Version         │ │ Modale : + Nouvel Outil         │  │
│  │  • Onglet 1 : Depuis GitHub       │ │  • Nom, Sous-chemin (/xxx),     │  │
│  │  • Onglet 2 : Upload Archive .zip │ │    Repo GitHub, Stack & Port    │  │
│  │  • Journal de déploiement en live │ │  • Création auto systemd+Caddy  │  │
│  └───────────────────────────────────┘ └─────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Vue "Guide & Prérequis" (Documentation de bout en bout + Clé SSH VM)  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Endpoints Backend (`server.ts`)

- `GET /api/tools` : Charge le registre des outils depuis `/srv/jeu/tools-registry.json` (pré-initialisé avec `foret-automate-lab`, `lora-factory` et `bga-studio`), vérifie l'état réel `systemctl is-active` et le dernier commit Git de chaque outil.
- `POST /api/tools/:id/deploy-git` : Exécute `git fetch origin main && git reset --hard origin/main`, lance le script d'installation/build de l'outil et redémarre son service `systemd`.
- `POST /api/tools/:id/deploy-zip` : Reçoit l'archive `.zip` (en base64/flux JSON sans dépendance externe fragile), l'extrait dans un dossier temporaire, copie les fichiers vers `/srv/jeu/:id` (en préservant `.git`, `dataset/`, `originals/`, `models/`, `venv/`, `node_modules/`, `.gemini_key`), applique si coché l'adaptation sous-chemin Caddy, redémarre le service `systemd`, et exécute `git add -A && git commit && git push origin main`.
- `POST /api/tools/create` : Crée un nouvel outil dans `/srv/jeu/:id` (par `git clone` ou extraction d'un `.zip` initial), génère `/etc/systemd/system/:unit`, régénère `/etc/caddy/Caddyfile` avec toutes les routes actives et recharge Caddy.
- `POST /api/portal/self-update` : Met à jour le portail lui-même depuis `github.com/antoineacquaviva/atelier-portail-maitre` (`git pull`, `npm install --legacy-peer-deps`, `npm run build`, puis redémarrage différé d'`atelier-portail.service`).
- `GET /api/vm-ssh-key` : Lit (ou génère via `ssh-keygen`) la clé publique SSH de la VM (`/home/opc/.ssh/id_ed25519.pub`) pour que vous puissiez l'ajouter une seule fois dans GitHub (*Settings ➔ SSH Keys*) afin d'autoriser la VM à faire `git push` lors des déploiements par `.zip`.
