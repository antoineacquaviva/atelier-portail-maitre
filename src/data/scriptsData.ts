export interface CleanupOptions {
  createBackupTar: boolean;
  killNodeProcesses: boolean;
  resetCaddyRoot: boolean;
}

export function generateStep1CleanupScript(opts: CleanupOptions): string {
  return `#!/bin/bash
# ==============================================================================
# ÉTAPE 1 (INDÉPENDANTE) — NETTOYAGE DE "PROJET_JEU" (ATELIER DE CONCEPTION)
# Cible : VM Oracle Cloud (vm-campagne-tests / 141.145.218.127 — Utilisateur: opc)
# Objectif : Désinstaller proprement l'ancien site monolithique "Projet_Jeu"
#            sans toucher à lora-factory ni à foret-automate-lab.
# ==============================================================================
set -e

echo "=================================================================="
echo " [1/5] Diagnostic des emplacements et processus liés à Projet_Jeu "
echo "=================================================================="

CANDIDATE_DIRS=(
  "/home/opc/Projet_Jeu"
  "/home/opc/projet_jeu"
  "/home/opc/atelier-conception"
  "/var/www/Projet_Jeu"
  "/var/www/atelierconceptionjeu"
  "/srv/Projet_Jeu"
)

FOUND_DIRS=()
for d in "\${CANDIDATE_DIRS[@]}"; do
  if [ -d "\$d" ]; then
    echo " -> Dossier détecté : \$d"
    FOUND_DIRS+=("\$d")
  fi
done

if [ \${#FOUND_DIRS[@]} -eq 0 ]; then
  # Recherche élargie dans /home/opc d'un dépôt pointant vers antoineacquaviva/Projet_Jeu
  while IFS= read -r gitdir; do
    repo_root=\$(dirname "\$gitdir")
    if git -C "\$repo_root" remote -v 2>/dev/null | grep -qi "Projet_Jeu"; then
      echo " -> Dépôt Git Projet_Jeu détecté : \$repo_root"
      FOUND_DIRS+=("\$repo_root")
    fi
  done < <(find /home/opc -maxdepth 3 -name ".git" 2>/dev/null)
fi

echo ""
echo "=================================================================="
echo " [2/5] Arrêt et désactivation des services systemd de Projet_Jeu  "
echo "=================================================================="

CANDIDATE_SERVICES=(
  "projet-jeu.service"
  "projet_jeu.service"
  "atelier.service"
  "atelier-conception.service"
)

for svc in "\${CANDIDATE_SERVICES[@]}"; do
  if systemctl list-unit-files | grep -q "^\$svc"; then
    echo " -> Arrêt et suppression du service systemd : \$svc"
    sudo systemctl stop "\$svc" || true
    sudo systemctl disable "\$svc" || true
    sudo rm -f "/etc/systemd/system/\$svc"
  fi
done
sudo systemctl daemon-reload

${opts.killNodeProcesses ? `echo ""
echo "=================================================================="
echo " [3/5] Arrêt des processus Node / Vite / PM2 liés à Projet_Jeu    "
echo "=================================================================="
pkill -f "Projet_Jeu" || true
pkill -f "projet_jeu" || true
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete Projet_Jeu 2>/dev/null || true
  pm2 save --force 2>/dev/null || true
fi` : `echo "[3/5] Conservation des processus Node non-systemd (option désactivée)."`}

${opts.createBackupTar ? `echo ""
echo "=================================================================="
echo " [4/5] Sauvegarde d'archive froide avant suppression des dossiers "
echo "=================================================================="
BACKUP_DIR="/home/opc/archives_avant_refonte"
mkdir -p "\$BACKUP_DIR"
STAMP=\$(date +"%Y%m%d_%H%M%S")

for dir in "\${FOUND_DIRS[@]}"; do
  base_name=\$(basename "\$dir")
  tar_file="\$BACKUP_DIR/\${base_name}_\${STAMP}.tar.gz"
  echo " -> Création de l'archive de sécurité : \$tar_file"
  tar --exclude="node_modules" --exclude=".git" -czf "\$tar_file" "\$dir"
  echo " -> Suppression du dossier actif : \$dir"
  rm -rf "\$dir"
done` : `echo ""
echo "=================================================================="
echo " [4/5] Suppression directe des dossiers de Projet_Jeu             "
echo "=================================================================="
for dir in "\${FOUND_DIRS[@]}"; do
  echo " -> Suppression de : \$dir"
  rm -rf "\$dir"
done`}

${opts.resetCaddyRoot ? `echo ""
echo "=================================================================="
echo " [5/5] Libération de la racine dans Caddy (atelierconceptionjeu.fr)"
echo "=================================================================="
if [ -f /etc/caddy/Caddyfile ]; then
  sudo cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.\$(date +%Y%m%d_%H%M%S)"
  echo " -> Sauvegarde de /etc/caddy/Caddyfile effectuée."
fi
echo " -> Projet_Jeu est désormais totalement retiré de la VM."` : `echo "[5/5] Configuration Caddy laissée intacte pour l'étape suivante."`}

echo ""
echo "✅ NETTOYAGE ÉTAPE 1 TERMINÉ AVEC SUCCÈS SUR 141.145.218.127."
echo "   Services préservés : lora-studio.service (port 5050) & foret-automate-lab."
`;
}

export const CADDYFILE_CONFIG = `# /etc/caddy/Caddyfile
# Configuration Reverse-Proxy unifiée pour la VM Oracle (141.145.218.127)
# Certificat HTTPS Let's Encrypt géré automatiquement par Caddy

atelierconceptionjeu.fr, www.atelierconceptionjeu.fr {
    encode zstd gzip

    # -------------------------------------------------------------------------
    # 1. FORÊT AUTOMATE LAB (/lab -> 127.0.0.1:8080)
    #    Backend FastAPI / Uvicorn + 14 workers en os.nice(15)
    # -------------------------------------------------------------------------
    redir /lab /lab/
    handle_path /lab/* {
        reverse_proxy 127.0.0.1:8080 {
            header_up X-Forwarded-Prefix /lab
            header_up Host {host}
            header_up X-Real-IP {remote_host}
        }
    }

    # -------------------------------------------------------------------------
    # 2. LORA FACTORY STUDIO v2 (/lora -> 127.0.0.1:5050)
    #    Flask Studio SDXL + Copilote Gemini + Orchestrateur OCI GPU A10
    # -------------------------------------------------------------------------
    redir /lora /lora/
    handle_path /lora/* {
        reverse_proxy 127.0.0.1:5050 {
            header_up X-Forwarded-Prefix /lora
            header_up Host {host}
            header_up X-Real-IP {remote_host}
        }
    }

    # -------------------------------------------------------------------------
    # 3. BGA STUDIO SANDBOX (/bga -> 127.0.0.1:8082)
    #    Environnement d'implémentation Board Game Arena
    # -------------------------------------------------------------------------
    redir /bga /bga/
    handle_path /bga/* {
        reverse_proxy 127.0.0.1:8082 {
            header_up X-Forwarded-Prefix /bga
            header_up Host {host}
            header_up X-Real-IP {remote_host}
        }
    }

    # -------------------------------------------------------------------------
    # 4. PORTAIL MAÎTRE ORCHESTRATEUR (Racine / -> 127.0.0.1:3000)
    #    Cockpit de pilotage systemd, Git pull et accès aux outils
    # -------------------------------------------------------------------------
    handle {
        reverse_proxy 127.0.0.1:3000 {
            header_up Host {host}
            header_up X-Real-IP {remote_host}
        }
    }
}
`;

export const SYSTEMD_UNITS: Record<string, { title: string; path: string; description: string; content: string }> = {
  'atelier-portail.service': {
    title: 'atelier-portail.service (Portail Maître — Port 3000)',
    path: '/etc/systemd/system/atelier-portail.service',
    description: 'Service maître servant ce Portail Orchestrateur à la racine de atelierconceptionjeu.fr.',
    content: `[Unit]
Description=Portail Maitre Orchestrateur - Atelier Conception Jeu
After=network.target

[Service]
Type=simple
User=opc
WorkingDirectory=/srv/jeu/atelier-portail-maitre
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npx tsx server.ts
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target`
  },
  'foret-lab.service': {
    title: 'foret-lab.service (Forêt Automate Lab — Port 8080)',
    path: '/etc/systemd/system/foret-lab.service',
    description: 'Serveur Web FastAPI/Uvicorn pilotant le runner multiprocessus (14 workers en os.nice(15) sur 16 vCPUs).',
    content: `[Unit]
Description=Foret Automate Lab - Web UI & Runner Multiprocessus
After=network.target

[Service]
Type=simple
User=opc
WorkingDirectory=/srv/jeu/foret-automate-lab
Environment=PYTHONUNBUFFERED=1
Environment=FORET_WORKERS=14
Environment=FORET_WORKER_NICE=15
# Le serveur FastAPI tourne à priorité normale (Nice=0) pour garder l'UI ultra-réactive,
# tandis que les 14 workers de simulation appliquent os.nice(15) dans le code Python.
ExecStart=/srv/jeu/foret-automate-lab/venv/bin/uvicorn app:app --host 127.0.0.1 --port 8080 --root-path /lab
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target`
  },
  'lora-studio.service': {
    title: 'lora-studio.service (LoRA Factory v2 — Port 5050)',
    path: '/etc/systemd/system/lora-studio.service',
    description: 'Studio de filtres graphiques SDXL v2. Conserve le lien symbolique /home/opc/lora-factory pour orchestrate.py.',
    content: `[Unit]
Description=LoRA Factory Studio v2 Web Application (SDXL & OCI GPU)
After=network.target

[Service]
Type=simple
User=opc
WorkingDirectory=/home/opc/lora-factory
Environment=PYTHONUNBUFFERED=1
Environment=GEMINI_MODEL=gemini-2.5-flash
ExecStart=/usr/bin/python3 /home/opc/lora-factory/app.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target`
  },
  'bga-studio.service': {
    title: 'bga-studio.service (BGA Studio Sandbox — Port 8082)',
    path: '/etc/systemd/system/bga-studio.service',
    description: 'Unité préconfigurée pour le futur environnement de test Board Game Arena sous /bga.',
    content: `[Unit]
Description=BGA Studio Sandbox - Maquettage Board Game Arena
After=network.target

[Service]
Type=simple
User=opc
WorkingDirectory=/srv/jeu/bga-studio
ExecStart=/usr/bin/python3 -m http.server 8082 --bind 127.0.0.1
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target`
  }
};

export const POWERSHELL_WORKFLOW_SCRIPT = `# ==============================================================================
# C:\\Dev\\Jeu\\Jeu-Workflow.ps1
# Script PowerShell unifié pour Windows 11 :
#   1. Réorganise proprement vos dépôts locaux sous C:\\Dev\\Jeu\\
#   2. Intègre une archive ZIP issue d'une itération Gemini dans le bon dépôt
#   3. Synchronise avec GitHub (antoineacquaviva/*)
#   4. Déploie en SSH sur la VM Oracle (141.145.218.127) et redémarre systemd
# ==============================================================================
param (
    [Parameter(Mandatory=$false)]
    [ValidateSet("InitWorkspace", "ImportGeminiZip", "Deploy", "Status")]
    [string]$Action = "Status",

    [Parameter(Mandatory=$false)]
    [ValidateSet("atelier-portail-maitre", "foret-automate-lab", "lora-factory", "bga-studio")]
    [string]$Project = "lora-factory",

    [Parameter(Mandatory=$false)]
    [string]$ZipPath = "",

    [Parameter(Mandatory=$false)]
    [string]$CommitMessage = "feat: iteration Gemini synchronisee depuis Windows 11"
)

$ErrorActionPreference = "Stop"
$BaseDir = "C:\\Dev\\Jeu"
$VmHost = "opc@141.145.218.127"
$GithubUser = "antoineacquaviva"

$ProjectsMap = @{
    "atelier-portail-maitre" = @{
        Repo = "https://github.com/$GithubUser/atelier-portail-maitre.git"
        VmDir = "/srv/jeu/atelier-portail-maitre"
        Service = "atelier-portail.service"
        Subpath = "/"
    }
    "foret-automate-lab" = @{
        Repo = "https://github.com/$GithubUser/foret-automate-lab.git"
        VmDir = "/srv/jeu/foret-automate-lab"
        Service = "foret-lab.service"
        Subpath = "/lab"
    }
    "lora-factory" = @{
        Repo = "https://github.com/$GithubUser/lora-factory.git"
        VmDir = "/srv/jeu/lora-factory"
        Service = "lora-studio.service"
        Subpath = "/lora"
    }
    "bga-studio" = @{
        Repo = "https://github.com/$GithubUser/bga-studio.git"
        VmDir = "/srv/jeu/bga-studio"
        Service = "bga-studio.service"
        Subpath = "/bga"
    }
}

function Invoke-InitWorkspace {
    Write-Host "=== [1/3] Création de l'arborescence standardisée C:\\Dev\\Jeu\\ ===" -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path "$BaseDir" | Out-Null
    New-Item -ItemType Directory -Force -Path "$BaseDir\\archives\\Projet_Jeu" | Out-Null
    New-Item -ItemType Directory -Force -Path "$BaseDir\\gemini-inbox" | Out-Null

    Write-Host "=== [2/3] Clonage / Vérification des dépôts GitHub actifs ===" -ForegroundColor Cyan
    foreach ($key in $ProjectsMap.Keys) {
        $targetDir = Join-Path $BaseDir $key
        $repoUrl = $ProjectsMap[$key].Repo
        if (-not (Test-Path "$targetDir\\.git")) {
            Write-Host " -> Clonage de $repoUrl dans $targetDir..." -ForegroundColor Yellow
            git clone $repoUrl $targetDir 2>$null
            if ($LASTEXITCODE -ne 0) {
                Write-Host "    (Dépôt distant non initialisé ou privé, création locale prête pour git init)" -ForegroundColor DarkGray
                New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
            }
        } else {
            Write-Host " -> [OK] $targetDir déjà présent." -ForegroundColor Green
        }
    }

    Write-Host "=== [3/3] Arborescence C:\\Dev\\Jeu\\ prête ! ===" -ForegroundColor Green
    Write-Host "Déposez vos prochains fichiers ZIP issus de Gemini dans : C:\\Dev\\Jeu\\gemini-inbox\\"
}

function Invoke-ImportGeminiZip {
    if (-not $ZipPath -or -not (Test-Path $ZipPath)) {
        throw "Spécifiez un chemin d'archive valide avec -ZipPath (ex: C:\\Dev\\Jeu\\gemini-inbox\\lora-factory-v2.zip)"
    }
    $targetDir = Join-Path $BaseDir $Project
    $tempExtract = Join-Path $env:TEMP "gemini_extract_$(Get-Random)"
    New-Item -ItemType Directory -Force -Path $tempExtract | Out-Null

    Write-Host "=== [1/2] Extraction de l'archive Gemini : $ZipPath ===" -ForegroundColor Cyan
    Expand-Archive -Path $ZipPath -DestinationPath $tempExtract -Force

    # Détecte si le ZIP contient un dossier racine unique (ex: lora-factory-main/)
    $subItems = Get-ChildItem -Path $tempExtract -Force
    $sourceRoot = $tempExtract
    if ($subItems.Count -eq 1 -and $subItems[0].PSIsContainer) {
        $sourceRoot = $subItems[0].FullName
    }

    Write-Host "=== [2/2] Copie propre vers $targetDir (préservation de .git, dataset, models) ===" -ForegroundColor Cyan
    robocopy $sourceRoot $targetDir /E /XD ".git" "node_modules" "venv" "dataset" "originals" "models" /XF ".gemini_key" | Out-Null

    Remove-Item -Recurse -Force $tempExtract
    Write-Host "✅ Code Gemini importé dans $targetDir !" -ForegroundColor Green
    git -C $targetDir status -s
}

function Invoke-Deploy {
    $cfg = $ProjectsMap[$Project]
    $targetDir = Join-Path $BaseDir $Project

    Write-Host "=== [1/3] Commit & Push depuis Windows 11 ($targetDir) vers GitHub ===" -ForegroundColor Cyan
    git -C $targetDir add -A
    $hasChanges = git -C $targetDir status --porcelain
    if ($hasChanges) {
        git -C $targetDir commit -m "$CommitMessage"
    }
    git -C $targetDir push origin main

    Write-Host "=== [2/3] Synchronisation Git Pull + Restart systemd sur la VM ($VmHost) ===" -ForegroundColor Cyan
    $remoteCmd = "cd $($cfg.VmDir) && git pull --ff-only origin main && sudo systemctl restart $($cfg.Service) && sudo systemctl is-active $($cfg.Service)"
    ssh $VmHost $remoteCmd

    Write-Host "=== [3/3] Déploiement terminé ! Accessible sur https://atelierconceptionjeu.fr$($cfg.Subpath) ===" -ForegroundColor Green
}

function Invoke-Status {
    Write-Host "=== ÉTAT LOCAL (PC WINDOWS 11 : $BaseDir) ===" -ForegroundColor Cyan
    foreach ($key in $ProjectsMap.Keys) {
        $dir = Join-Path $BaseDir $key
        if (Test-Path "$dir\\.git") {
            $branch = git -C $dir rev-parse --abbrev-ref HEAD 2>$null
            $shortRev = git -C $dir rev-parse --short HEAD 2>$null
            $dirty = (git -C $dir status --porcelain | Measure-Object).Count
            Write-Host (" - {0,-24} : Branche {1} @ {2} ({3} fichier(s) modifiés)" -f $key, $branch, $shortRev, $dirty)
        } else {
            Write-Host (" - {0,-24} : Non cloné dans $dir" -f $key) -ForegroundColor Yellow
        }
    }
}

switch ($Action) {
    "InitWorkspace"   { Invoke-InitWorkspace }
    "ImportGeminiZip" { Invoke-ImportGeminiZip }
    "Deploy"          { Invoke-Deploy }
    "Status"          { Invoke-Status }
}
`;

export const LORA_V2_MIGRATION_SCRIPT = `# ==============================================================================
# SCRIPT DE SYNCHRONISATION LORA-FACTORY V2 (Windows 11 -> GitHub -> VM Oracle)
# Met à jour votre dépôt v1 avec l'archive v2 jointe, applique le patch Caddy /lora/
# et déploie le service lora-studio.service sur 141.145.218.127.
# ==============================================================================

$ErrorActionPreference = "Stop"
$RepoDir = "C:\\Dev\\Jeu\\lora-factory"
$ZipV2 = "$HOME\\Downloads\\lora-factory-v2.zip" # Ou chemin de votre archive v2
$VmHost = "opc@141.145.218.127"

# 1. Préparation de C:\\Dev\\Jeu\\lora-factory
New-Item -ItemType Directory -Force -Path "C:\\Dev\\Jeu" | Out-Null
if (-not (Test-Path "$RepoDir\\.git")) {
    Write-Host "[1/5] Clonage de antoineacquaviva/lora-factory (v1) dans $RepoDir..." -ForegroundColor Cyan
    git clone https://github.com/antoineacquaviva/lora-factory.git $RepoDir
} else {
    Write-Host "[1/5] Mise à jour préalable du dépôt local $RepoDir..." -ForegroundColor Cyan
    git -C $RepoDir pull --ff-only origin main
}

# 2. Extraction de l'archive v2 par-dessus la v1
$TmpDir = Join-Path $env:TEMP "lora_v2_stage"
if (Test-Path $TmpDir) { Remove-Item -Recurse -Force $TmpDir }
Expand-Archive -Path $ZipV2 -DestinationPath $TmpDir -Force
$ExtractedRoot = Join-Path $TmpDir "lora-factory-main"

Write-Host "[2/5] Application des fichiers de la v2 dans $RepoDir..." -ForegroundColor Cyan
Copy-Item -Path "$ExtractedRoot\\*" -Destination $RepoDir -Recurse -Force

# 3. Patch automatique de compatibilité sous-chemin Caddy (/lora/)
Write-Host "[3/5] Adaptation des chemins relatifs pour fonctionner sous https://atelierconceptionjeu.fr/lora/..." -ForegroundColor Cyan
$IndexHtml = Join-Path $RepoDir "templates\\index.html"
$HtmlContent = Get-Content $IndexHtml -Raw
$HtmlContent = $HtmlContent.Replace('<head>', '<head><base href="/lora/">')
$HtmlContent = $HtmlContent.Replace('href="/static/css/style.css"', 'href="static/css/style.css"')
$HtmlContent = $HtmlContent.Replace('src="/static/js/studio.js"', 'src="static/js/studio.js"')
Set-Content -Path $IndexHtml -Value $HtmlContent -Encoding UTF8

$StudioJs = Join-Path $RepoDir "static\\js\\studio.js"
$JsContent = Get-Content $StudioJs -Raw
$JsContent = $JsContent.Replace("fetch('/api/", "fetch('api/")
$JsContent = $JsContent.Replace('src="/img/', 'src="img/')
$JsContent = $JsContent.Replace('href="/models/', 'href="models/')
Set-Content -Path $StudioJs -Value $JsContent -Encoding UTF8

# 4. Commit et Push de la v2 sur GitHub
Write-Host "[4/5] Commit et Push de la v2 vers github.com/antoineacquaviva/lora-factory..." -ForegroundColor Cyan
git -C $RepoDir add -A
git -C $RepoDir commit -m "feat(v2): Table lumineuse CropperJS, Tag Builder sans doublon, Copilote Gemini Vision & compatibilite /lora/"
git -C $RepoDir push origin main

# 5. Synchronisation sur la VM Oracle (141.145.218.127)
Write-Host "[5/5] Déploiement SSH sur la VM Oracle et redémarrage de lora-studio.service..." -ForegroundColor Cyan
$RemoteScript = @"
set -e
sudo mkdir -p /srv/jeu
if [ -d /home/opc/lora-factory ] && [ ! -L /srv/jeu/lora-factory ]; then
    sudo ln -sfn /home/opc/lora-factory /srv/jeu/lora-factory
fi
cd /home/opc/lora-factory
git fetch origin main
git reset --hard origin/main
bash install.sh
"@
ssh $VmHost $RemoteScript

Write-Host "✅ LoRA Factory v2 est synchronisé sur PC, GitHub et actif sur https://atelierconceptionjeu.fr/lora/ !" -ForegroundColor Green
`;

export const VM_BOOTSTRAP_SCRIPT = `#!/bin/bash
# ==============================================================================
# INITIALISATION DE L'ARCHITECTURE MAÎTRE SUR LA VM ORACLE (141.145.218.127)
# À exécuter APRÈS le script indépendant de nettoyage de Projet_Jeu (Étape 1).
# Configure /srv/jeu/, les liens symboliques, les services systemd et Caddy.
# ==============================================================================
set -e

echo "=== [1/4] Création de l'arborescence unifiée /srv/jeu ==="
sudo mkdir -p /srv/jeu
sudo chown -R opc:opc /srv/jeu

# Lien symbolique pour conserver /home/opc/lora-factory attendu par scripts/orchestrate.py
if [ -d "/home/opc/lora-factory" ]; then
    ln -sfn /home/opc/lora-factory /srv/jeu/lora-factory
    echo " -> Lien symbolique /srv/jeu/lora-factory -> /home/opc/lora-factory créé."
fi

if [ -d "/home/opc/foret-automate-lab" ] && [ ! -d "/srv/jeu/foret-automate-lab" ]; then
    mv /home/opc/foret-automate-lab /srv/jeu/foret-automate-lab
    ln -sfn /srv/jeu/foret-automate-lab /home/opc/foret-automate-lab
    echo " -> foret-automate-lab déplacé dans /srv/jeu/foret-automate-lab (avec lien de compatibilité)."
fi

mkdir -p /srv/jeu/bga-studio
mkdir -p /srv/jeu/atelier-portail-maitre

echo "=== [2/4] Vérification des dépendances Python (FastAPI / Uvicorn / Pillow) ==="
sudo dnf install -y python3-pip python3-pillow caddy git || true

echo "=== [3/4] Rechargement des unités systemd ==="
sudo systemctl daemon-reload
sudo systemctl enable lora-studio.service || true

echo "=== [4/4] Validation et rechargement de Caddy (atelierconceptionjeu.fr) ==="
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy

echo "✅ Architecture /srv/jeu et Reverse-Proxy Caddy opérationnels sur https://atelierconceptionjeu.fr !"
`;
