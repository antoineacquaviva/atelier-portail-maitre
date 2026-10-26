# Portail Orchestrateur & Refonte d'Infrastructure — Atelier Conception Jeu (`atelierconceptionjeu.fr`)

Cette application constitue le **projet maître (`atelier-portail-maitre`)** destiné à remplacer l'ancien site monolithique sur `https://atelierconceptionjeu.fr/` (`141.145.218.127`). Elle fournit à la fois le **portail web actif d'orchestration** (contrôle `systemd`, synchronisation `git pull`, logs en direct et accès aux sous-chemins `/lab`, `/lora`, `/bga`), l'**explorateur et préparateur de `lora-factory` v2** (à partir de l'archive jointe), les **fichiers d'infrastructure VM (Caddy + systemd)**, le **workflow PowerShell Windows 11**, ainsi qu'un **module séparé de Première Étape dédié au script indépendant de nettoyage de `Projet_Jeu`**.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Voici la synthèse des décisions architecturales validées ensemble avant la génération du code de l'application et des scripts d'automatisation :

- **Décision confirmée 1 — Routage par sous-chemins via Caddy** : Le domaine `https://atelierconceptionjeu.fr/` sert le Portail Orchestrateur à la racine (`/`) et route chaque outil vers son port local dédié via `handle_path` dans Caddy :
  - `/lab` ➔ `foret-automate-lab` (`127.0.0.1:8080`, FastAPI/Uvicorn, 14 workers en `os.nice(15)`)
  - `/lora` ➔ `lora-factory` v2 (`127.0.0.1:8081`, Flask/Python + scripts d'orchestration GPU/filtres)
  - `/bga` ➔ `bga-studio` (`127.0.0.1:8082`, emplacement préconfiguré pour les outils BGA Studio à venir)
- **Décision confirmée 2 — Portail Orchestrateur actif** : L'interface web intègre un backend Node/Express capable d'interagir avec les services `systemd` (`start`, `stop`, `restart`, `status`), d'exécuter `git pull` sur chaque dépôt de la VM et de lire les journaux `journalctl` en temps réel (avec simulation réaliste transparente lorsque le portail est consulté hors de la VM Oracle, par exemple dans AI Studio ou en local sur Windows 11).
- **Décision confirmée 3 — Architecture multi-dépôts sous `C:\Dev\Jeu\`** : Chaque outil conserve son propre dépôt GitHub indépendant (`antoineacquaviva/foret-automate-lab`, `antoineacquaviva/lora-factory`, `antoineacquaviva/atelier-portail-maitre`), aligné sur une structure locale unique `C:\Dev\Jeu\<nom-du-depot>` sur Windows 11 et `/srv/jeu/<nom-du-depot>` sur la VM Oracle.
- **Décision confirmée 4 — Nettoyage de `Projet_Jeu` isolé en Étape 1** : Le nettoyage de l'ancien "atelier de conception" (`Projet_Jeu`) sur la VM fait l'objet d'un script Bash indépendant, autonome et sécurisé, à exécuter en toute première étape avant le déploiement de la nouvelle architecture.

---

## 1. Overview & Core Concept

- **Ce que fait l'application** :
  1. **Étape 1 (Script Indépendant de Nettoyage VM)** : Génère et documente un script shell autonome (`cleanup_projet_jeu.sh`) exécutable en une ligne SSH depuis Windows 11 pour arrêter proprement l'ancien service `Projet_Jeu`, sauvegarder optionnellement ses données, supprimer son dossier de déploiement sur la VM et libérer le reverse-proxy Caddy sans impacter les autres projets.
  2. **Cockpit d'Orchestration Live (`atelierconceptionjeu.fr/`)** : Affiche l'état des outils du laboratoire de création du jeu de société (`foret-automate-lab`, `lora-factory` v2, `bga-studio`), la répartition des ressources de la VM (`vm-campagne-tests` : 8 OCPU / 16 vCPU AMD E5.Flex, 16 Go RAM), les boutons d'ouverture rapide (`/lab`, `/lora`, `/bga`), les commandes directes `git pull` + `systemctl restart` et la console de logs en direct.
  3. **Centre de Synchronisation `lora-factory` v2** : Intègre directement l'intégralité des fichiers de l'archive jointe `lora-factory-v2_6d507730.zip` (`app.py`, `install.sh`, `tags_config.json`, `scripts/orchestrate.py`, `scripts/gpu_worker_run.sh`, `scripts/kill_switch.py`, `templates/index.html`, `static/js/studio.js`, `static/css/style.css`) pour vous permettre d'inspecter les nouveautés de la v2 et de lancer le script de mise à jour de la v1 vers la v2 (PC Windows 11 ➔ GitHub ➔ VM).
  4. **Workflow Gemini / Windows 11 / GitHub / VM & Kit d'Infrastructure** : Fournit le script PowerShell unifié (`Jeu-Workflow.ps1`) pour organiser `C:\Dev\Jeu\`, intégrer une archive issue d'un fil Gemini, pousser sur GitHub et déclencher la mise à jour sur la VM, ainsi que le `Caddyfile` et les services `systemd` complets.
- **Public cible & Usage** : Conçu sur-mesure pour votre usage d'auteur/développeur de jeu de société travaillant entre Gemini, votre PC Windows 11 (et ponctuellement Ubuntu), GitHub et votre VM Oracle Cloud (`141.145.218.127`).

---

## 2. User Experience & Visual Design

- **Parcours utilisateur principal** :
  1. **Vue « Cockpit & Outils » (Accueil du Portail)** : Accès immédiat aux cartes des outils actifs (`/lab` — *Forêt Automate Lab*, `/lora` — *LoRA Factory v2*, `/bga` — *BGA Studio Sandbox*). Chaque carte permet d'ouvrir l'outil, de vérifier la branche/commit Git, de tirer la dernière version (`git pull`), de redémarrer le démon `systemd` et d'inspecter les logs. Un panneau latéral affiche la télémétrie CPU/RAM de `vm-campagne-tests` (notamment la réserve de 2 vCPUs libres face aux 14 workers `os.nice(15)` de `foret-automate-lab`).
  2. **Vue « Étape 1 : Nettoyage `Projet_Jeu` »** : Présente le script Bash autonome de désinstallation de l'ancien site `Projet_Jeu` sur la VM, avec options interactives (archivage préalable `.tar.gz` ou suppression directe, nettoyage des unités `systemd` et remise à zéro du routage racine Caddy) et commande SSH prête à copier dans PowerShell.
  3. **Vue « Migration `lora-factory` v2 »** : Permet de parcourir tous les fichiers extraits de votre archive `lora-factory-v2_6d507730.zip`, de comparer l'architecture v2 (`app.py`, `orchestrate.py`, `gpu_worker_run.sh`, `kill_switch.py`, `studio.js`) et de copier ou télécharger le script PowerShell/Bash qui remplace proprement la v1 par la v2 dans `C:\Dev\Jeu\lora-factory`, pousse sur `antoineacquaviva/lora-factory` et met à jour la VM.
  4. **Vue « Workflow & Infrastructure (Windows 11 / Git / VM) »** : Schéma interactif du cycle de vie d'une itération Gemini, script PowerShell de réorganisation de `C:\Dev\Jeu\`, configuration `Caddyfile` multi-projets et fichiers `.service` `systemd` téléchargeables ou déployables en un clic.
- **Identité Visuelle & Thème (SaaS & Developer Console)** :
  - *Direction esthétique* : Console d'ingénierie sobre, haute densité, lisible et structurée (inspirée des interfaces d'orchestration modernes type Vercel / Railway / Linear, sans fioritures artificielles).
  - *Palette de couleurs (60-30-10)* :
    - **60% Canvas Neutre** : Ardoise profonde (`#0B0F17` / `bg-slate-950`) pour un confort visuel optimal lors des sessions de test et de lecture de logs.
    - **30% Surfaces Structurelles** : Panneaux en ardoise sobre (`#111827` / `bg-slate-900`) délimités par de fines bordures de 1px (`border-slate-800`).
    - **10% Budget d'Accent** : Émeraude forestier (`#10B981`, clin d'œil à *Forêt Automate Lab* et aux états actifs), Ambre (`#F59E0B`) pour les synchronisations/avertissements, et Cramoisi (`#EF4444`) pour les arrêts d'urgence / nettoyage.
  - *Typographie & Hiérarchie (Règle 2+1)* :
    - **Titres & Navigation (`Display`)** : `Plus Jakarta Sans` (SemiBold/Bold, structure nette).
    - **Corps de texte (`Body`)** : `DM Sans` (lecture fluide des guides de workflow).
    - **Données, Ports, Commandes SSH & Métriques (`Monospace`)** : `JetBrains Mono` avec `tabular-nums` obligatoire sur tous les numéros de ports, PID, compteurs CPU/RAM et horodatages.
  - *Discipline d'interface* : Barre supérieure stricte en 3 zones (Marque à gauche, 4 liens de navigation au centre, 1 action primaire à droite), métadonnées textuelles épurées avec séparateurs typographiques (`·` et `/`), un seul niveau d'élévation de carte.

---

## 3. Key Product Decisions & Trade-Offs

- **Décision 1 : Routage par sous-chemins Caddy (`handle_path`) plutôt que ports multiples exposés**
  - *Approche choisie* : Seuls les ports `80` et `443` restent exposés publiquement sur le pare-feu Oracle Cloud (Security List VCN + `ufw`/`iptables`). Caddy gère le certificat TLS automatique pour `atelierconceptionjeu.fr` et redirige `/lab`, `/lora` et `/bga` vers `127.0.0.1:8080`, `127.0.0.1:8081` et `127.0.0.1:8082`.
  - *Pourquoi* : Évite d'avoir à ouvrir de nouveaux ports dans la console Oracle Cloud à chaque nouvel outil, sécurise les serveurs Python (Uvicorn/Flask n'écoutent que sur `127.0.0.1`), et unifie tout sous un seul certificat HTTPS.
  - *Adaptation technique incluse* : Configuration d'un `root_path="/lab"` (pour FastAPI) ou d'un préfixe d'URL propre afin que les assets statiques (`static/js/studio.js`, `static/css/style.css`) de chaque outil se chargent sans erreur sous `/lab` et `/lora`.
- **Décision 2 : Workflow standardisé en 4 maillons (Gemini ➔ `C:\Dev\Jeu\` ➔ GitHub ➔ VM)**
  - *Approche choisie* : Le PC Windows 11 (`C:\Dev\Jeu\`) est la **seule station d'intégration** où sont déposées les archives/fichiers générés par Gemini. GitHub est la **source de vérité unique**. La VM Oracle ne modifie jamais le code : elle fait uniquement `git pull --ff-only` (déclenché depuis le Portail Orchestrateur ou en SSH depuis Windows 11).
  - *Pourquoi* : Élimine définitivement les désynchronisations entre la VM, GitHub et le PC (comme le cas actuel de `lora-factory` où la v1 est sur la VM/Git et la v2 en ZIP local) et permet de passer de Windows 11 à votre PC Ubuntu d'un simple `git clone / git pull`.

---

## 4. Technical Architecture & Data Strategy

### Architecture Globale & Flux de Travail (Windows 11 / GitHub / VM Oracle)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ 1. CRÉATION & ITÉRATION (Fils de discussion Gemini / Google AI Studio)               │
│    Génération d'archives ZIP (ex: lora-factory-v2.zip) ou de fichiers sources        │
└──────────────────────────────────────────┬───────────────────────────────────────────┘
                                           │ Téléchargement & Extraction assistée
                                           ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ 2. POSTE DE TRAVAIL LOCAL (PC Windows 11 — C:\Dev\Jeu\ & Ubuntu ~/Dev/Jeu/)          │
│                                                                                      │
│  C:\Dev\Jeu\                                                                         │
│  ├── atelier-portail-maitre\   (Ce portail orchestrateur + scripts VM/Caddy)         │
│  ├── foret-automate-lab\       (Moteur de simulation & Web UI FastAPI)               │
│  ├── lora-factory\             (Studio de filtres graphiques v2)                     │
│  ├── bga-studio\               (Implémentation Board Game Arena)                     │
│  ├── archives\Projet_Jeu\      (Archive locale froide de l'ancien atelier)           │
│  └── Jeu-Workflow.ps1          (Script PowerShell : Import ZIP -> Git Push -> SSH)   │
└──────────────────────────────────────────┬───────────────────────────────────────────┘
                                           │ git push origin main
                                           ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ 3. SOURCE DE VÉRITÉ (GitHub — github.com/antoineacquaviva/*)                         │
│    [atelier-portail-maitre]   [foret-automate-lab]   [lora-factory]   [bga-studio]   │
└──────────────────────────────────────────┬───────────────────────────────────────────┘
                                           │ git pull (via Portail Web ou SSH)
                                           ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ 4. VM ORACLE CLOUD (vm-campagne-tests — 141.145.218.127 — 8 OCPU / 16 Go RAM)        │
│    Domaine HTTPS : https://atelierconceptionjeu.fr (Reverse-Proxy Caddy :443)        │
│                                                                                      │
│    ┌────────────────────────────────────────────────────────────────────────────┐    │
│    │ CADDY SERVER (Ports 80 / 443 — TLS Automatique)                            │    │
│    └───┬──────────────────────┬─────────────────────────┬───────────────────┬───┘    │
│        │ / (Racine)           │ /lab/*                  │ /lora/*           │ /bga/* │
│        ▼                      ▼                         ▼                   ▼        │
│  ┌───────────────┐    ┌───────────────────┐     ┌────────────────┐   ┌─────────────┐ │
│  │ Portail Maître│    │ foret-automate-lab│     │ lora-factory v2│   │ bga-studio  │ │
│  │ :3000 (Node)  │    │ :8080 (FastAPI)   │     │ :8081 (Flask)  │   │ :8082       │ │
│  │ systemd       │    │ 14 workers nice15 │     │ systemd        │   │ systemd     │ │
│  └───────────────┘    └───────────────────┘     └────────────────┘   └─────────────┘ │
│    /srv/jeu/portail     /srv/jeu/foret-lab        /srv/jeu/lora        /srv/jeu/bga  │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Architecture Applicative du Portail Orchestrateur (`atelier-portail-maitre`)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ Top Navigation Bar (3 Zones: Marque · 4 Vues Principales · Action Déploiement)│
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────────────┐  ┌────────────────────────────────────────────┐  │
│  │ Vue 1: Cockpit & Outils │  │ Vue 2: Étape 1 — Script Indépendant        │  │
│  │ - Cartes /lab /lora /bga│  │        Nettoyage VM (Projet_Jeu)           │  │
│  │ - Contrôles systemd     │  │ - Diagnostic pré-nettoyage                 │  │
│  │ - Bouton Git Pull       │  │ - Options (Backup .tar.gz, Purge systemd)  │  │
│  │ - Visionneuse Logs Live │  │ - Script Bash autonome & One-liner SSH     │  │
│  │ - Jauge 8 OCPU / 16 Go  │  └────────────────────────────────────────────┘  │
│  └────────────┬────────────┘                                                  │
│               │               ┌────────────────────────────────────────────┐  │
│               │               │ Vue 3: Inspecteur & Packager               │  │
│               │               │        lora-factory v2 (Archive intégrée)  │  │
│               │               │ - Explorateur des 10 fichiers de la v2     │  │
│               │               │ - Lecteur de code (app.py, orchestrate.py) │  │
│               │               │ - Script de migration v1 -> v2 (Win11+Git) │  │
│               │               └────────────────────────────────────────────┘  │
│               │                                                               │
│               │               ┌────────────────────────────────────────────┐  │
│               ▼               │ Vue 4: Workflow Windows 11 & Infra VM      │  │
│  ┌─────────────────────────┐  │ - Script PowerShell C:\Dev\Jeu\ unifié     │  │
│  │ Backend Express API     │  │ - Générateur Caddyfile (/lab, /lora, /bga) │  │
│  │ - GET  /api/tools/status│  │ - Générateur des unités systemd (.service) │  │
│  │ - POST /api/tools/action│  │ - Guide pas-à-pas Windows 11 <-> Ubuntu    │  │
│  │ - GET  /api/lora-v2/*   │  └────────────────────────────────────────────┘  │
│  └─────────────────────────┘                                                  │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Modèle de Données & Correspondance des Interactions

- **Registre des Outils (`ToolService`)** :
  - Chaque outil (`foret-automate-lab`, `lora-factory`, `bga-studio`, ainsi que le portail maître lui-même) possède : identifiant, nom, dépôt GitHub (`antoineacquaviva/...`), chemin Windows (`C:\Dev\Jeu\...`), chemin VM (`/srv/jeu/...`), sous-chemin Caddy (`/lab`, `/lora`, `/bga`), port local (`8080`, `8081`, `8082`), nom d'unité `systemd`, état temps réel (`active`, `stopped`, `deploying`), hash de commit et tampon de logs.
- **API Serveur (`server.ts`) & Mode Hybride Réel / Simulation** :
  - `GET /api/overview` : Retourne l'état des services, l'utilisation CPU/RAM de la VM (via `os.cpus()` / `os.freemem()` sur la VM) et le mode d'exécution (`production-vm` sur Linux `/srv/jeu` ou `preview-sandbox`).
  - `POST /api/service/:id/action` : Exécute `git pull`, `sudo systemctl restart <service>`, `start`, ou `stop`, et renvoie la sortie console horodatée avec mise à jour immédiate de l'interface.
  - `GET /api/lora-v2/files` : Lit directement les fichiers extraits de votre archive `lora-factory-v2_6d507730.zip` côté serveur afin que vous puissiez consulter et récupérer chaque fichier de la v2 ou télécharger le script d'installation complet depuis l'interface.
