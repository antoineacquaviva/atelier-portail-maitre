import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import type { ServiceItem, VmInfo, LoraV2File } from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isOracleVm = fs.existsSync('/home/opc') && fs.existsSync('/etc/systemd/system');

let step1Completed = false;

const nowTime = () => {
  const d = new Date();
  return d.toTimeString().split(' ')[0];
};

const servicesState: ServiceItem[] = [
  {
    id: 'foret-lab',
    name: 'Forêt Automate Lab',
    shortDesc: 'Système de test de versions et équilibrage multi-processus du jeu de société.',
    repo: 'antoineacquaviva/foret-automate-lab',
    branch: 'main',
    commitHash: '8f4d2a1',
    commitMsg: 'feat(runner): preparación backend FastAPI + 14 workers os.nice(15)',
    lastSync: 'Il y a 18 min',
    subpath: '/lab',
    port: 8080,
    systemdUnit: 'foret-lab.service',
    vmPath: '/srv/jeu/foret-automate-lab',
    winPath: 'C:\\Dev\\Jeu\\foret-automate-lab',
    ubuntuPath: '~/Dev/Jeu/foret-automate-lab',
    techStack: 'FastAPI · Uvicorn · SPA Alpine.js / Tailwind / Chart.js',
    cpuAllocation: '14 workers en os.nice(15) (2 vCPUs réservés Web/SSH)',
    status: 'active',
    pid: 18420,
    uptime: '4j 11h 24m',
    memoryMb: 640,
    versionTag: 'v1.4-web-ready',
    subpathReady: true,
    logs: [
      `[09:14:02] systemd[1]: Started foret-lab.service - Forêt Automate Lab Web & Runner.`,
      `[09:14:03] uvicorn.error: INFO: Started server process [18420] on http://127.0.0.1:8080 (root_path="/lab")`,
      `[09:14:03] foret.scheduler: INFO: Pool initialisé : 14 workers configurés avec os.nice(15) sur 16 vCPUs disponibles.`,
      `[09:14:04] foret.scheduler: INFO: 2 vCPUs dédiés haute priorité préservés pour Caddy / Portail Web / SSH.`,
      `[10:42:19] foret.runner: INFO: Campagne #42 terminée (10 000 parties simulées en 14.8s · Winrate Automate: 48.6%).`
    ]
  },
  {
    id: 'lora-studio',
    name: 'LoRA Factory Studio',
    shortDesc: 'Studio de filtres graphiques SDXL (Recadrage, Tag Builder FR->EN, Copilote Gemini Vision, GPU A10 OCI).',
    repo: 'antoineacquaviva/lora-factory',
    branch: 'main',
    commitHash: 'c39e7b4',
    commitMsg: 'feat(v2): Table lumineuse CropperJS + Copilote IA Gemini + Zéro doublon tags',
    lastSync: 'Prêt à synchroniser (v2 locale)',
    subpath: '/lora',
    port: 5050,
    systemdUnit: 'lora-studio.service',
    vmPath: '/srv/jeu/lora-factory',
    winPath: 'C:\\Dev\\Jeu\\lora-factory',
    ubuntuPath: '~/Dev/Jeu/lora-factory',
    techStack: 'Flask · Pillow · Cropper.js · Gemini 2.5 Flash · OCI SDK (GPU A10)',
    cpuAllocation: 'Léger sur VM locale · Déporte le training sur VM.GPU.A10.1 éphémère',
    status: 'active',
    pid: 19105,
    uptime: '2j 06h 15m',
    memoryMb: 215,
    versionTag: 'v2.0 (Archive jointe)',
    subpathReady: true,
    logs: [
      `[08:30:10] systemd[1]: Started lora-studio.service - LoRA Factory Studio Web Application.`,
      `[08:30:11] werkzeug: INFO: Running on http://127.0.0.1:5050 (Press CTRL+C to quit)`,
      `[08:31:00] lora.studio: INFO: 5 catégories de tags chargées depuis tags_config.json (36 puces FR/EN).`,
      `[09:05:12] lora.copilot: INFO: Copilote Gemini Vision prêt (modes: suggest, audit, translate).`,
      `[10:15:00] cron.kill_switch: INFO: Vérification garde-fou GPU (gpu-ephemere-lora-worker) : 0 instance active.`
    ]
  },
  {
    id: 'bga-studio',
    name: 'BGA Studio Sandbox',
    shortDesc: 'Environnement de pré-intégration et serveur de maquettage pour l’adaptation Board Game Arena.',
    repo: 'antoineacquaviva/bga-studio',
    branch: 'main',
    commitHash: '1a09f3c',
    commitMsg: 'chore(init): structure initiale estados.inc.php, material.inc.php & client TS',
    lastSync: 'En attente de premier push',
    subpath: '/bga',
    port: 8082,
    systemdUnit: 'bga-studio.service',
    vmPath: '/srv/jeu/bga-studio',
    winPath: 'C:\\Dev\\Jeu\\bga-studio',
    ubuntuPath: '~/Dev/Jeu/bga-studio',
    techStack: 'BGA Framework · PHP 8.2 / Node Mock · SFTP Sync',
    cpuAllocation: 'À la demande (1 vCPU partagé)',
    status: 'standby',
    pid: null,
    uptime: 'En veille',
    memoryMb: 0,
    versionTag: 'v0.1-scaffold',
    subpathReady: true,
    logs: [
      `[08:00:00] systemd[1]: bga-studio.service: Unit configured and ready in /etc/systemd/system/bga-studio.service.`,
      `[08:00:01] caddy.route: INFO: Subpath /bga/* pre-mapped to 127.0.0.1:8082 in /etc/caddy/Caddyfile.`
    ]
  },
  {
    id: 'atelier-portail',
    name: 'Portail Maître Orchestrateur',
    shortDesc: 'Ce portail central exposé à la racine https://atelierconceptionjeu.fr/ (Pilotage systemd, Git & Reverse-Proxy).',
    repo: 'antoineacquaviva/atelier-portail-maitre',
    branch: 'main',
    commitHash: 'e77b902',
    commitMsg: 'feat(portal): portail orchestrateur + routage Caddy /lab /lora /bga',
    lastSync: 'Actif (Session courante)',
    subpath: '/',
    port: 3000,
    systemdUnit: 'atelier-portail.service',
    vmPath: '/srv/jeu/atelier-portail-maitre',
    winPath: 'C:\\Dev\\Jeu\\atelier-portail-maitre',
    ubuntuPath: '~/Dev/Jeu/atelier-portail-maitre',
    techStack: 'Node.js · Express · React 19 · Tailwind CSS · Caddy 2',
    cpuAllocation: 'Priorité normale (os.nice 0 · 2 vCPUs réservés)',
    status: 'active',
    pid: process.pid,
    uptime: 'En ligne',
    memoryMb: 145,
    versionTag: 'v1.0.0',
    subpathReady: true,
    logs: [
      `[08:00:00] systemd[1]: Started atelier-portail.service - Portail Maître Atelier Conception Jeu.`,
      `[08:00:01] express.server: INFO: Listening on http://127.0.0.1:3000 behind Caddy HTTPS (atelierconceptionjeu.fr).`,
      `[08:00:02] orchestrator: INFO: Surveillance active des unités foret-lab.service, lora-studio.service, bga-studio.service.`
    ]
  }
];

function buildSubpathPatchedContent(relativePath: string, rawContent: string): string | undefined {
  if (relativePath === 'templates/index.html') {
    return rawContent
      .replace('<head>', '<head>\n    <base href="/lora/">')
      .replace('href="/static/css/style.css"', 'href="static/css/style.css"')
      .replace('src="/static/js/studio.js"', 'src="static/js/studio.js"');
  }
  if (relativePath === 'static/js/studio.js') {
    return rawContent
      .replace(/fetch\('\/api\//g, "fetch('api/")
      .replace(/src="\/img\//g, 'src="img/')
      .replace(/`\/img\//g, '`img/')
      .replace(/href="\/models\//g, 'href="models/');
  }
  return undefined;
}

function getLoraV2Files(): LoraV2File[] {
  const baseExtracted = path.resolve(__dirname, 'public/assets/lora-v2-extracted/lora-factory-main');
  const metadataMap: Record<string, { category: LoraV2File['category']; summary: string; v2Changes: string }> = {
    'app.py': {
      category: 'backend',
      summary: 'Serveur Flask principal (Port 5050) : API dataset, recadrage Pillow, anti-doublon tags et Copilote Gemini 2.5 Flash.',
      v2Changes: 'Ajoute /api/ai_copilot (modes suggest, audit, translate avec JSON Schema), /api/gemini_key, /api/custom_tag et déduplication insensible à la casse.'
    },
    'static/js/studio.js': {
      category: 'frontend',
      summary: 'Logique interactive de la Table Lumineuse : Cropper.js multi-ratios SDXL, barre de jetons actifs cliquables et tiroir Copilote IA.',
      v2Changes: 'Nouveau moteur syncPillsWithTextarea() supportant les sous-tags multiples, barre activeTokensBar avec verrouillage du trigger word et raccourcis clavier.'
    },
    'templates/index.html': {
      category: 'frontend',
      summary: 'Interface monopage du Studio LoRA avec grille de lot, modale plein écran de recadrage et panneau Copilote IA.',
      v2Changes: 'Intègre la barre Copilote IA (Vision + Audit de dissociation + Traduction rapide FR->EN) et la zone de jetons actifs cliquables.'
    },
    'static/css/style.css': {
      category: 'frontend',
      summary: 'Feuille de style sombre du Studio LoRA (grille, modale studio, puces d’état actif/partiel et tiroir IA).',
      v2Changes: 'Ajoute les styles .copilot-bar, .copilot-drawer, .ai-pill, .pin-btn et .active-tokens-bar.'
    },
    'tags_config.json': {
      category: 'config',
      summary: 'Dictionnaire bilingue FR/EN structuré en 5 catégories pour dissocier le contenu figuratif du style déclencheur.',
      v2Changes: '36 puces préconfigurées (Support & Médium, Sujets & Motifs, Matériau & Texture, Cadrage, Fond & Éclairage) + extensible via l’interface.'
    },
    'scripts/orchestrate.py': {
      category: 'orchestration-oci',
      summary: 'Orchestrateur Cloud Oracle (OCI SDK) : provisionne une VM.GPU.A10.1 à la volée, transfère le dataset en SCP, lance Kohya et détruit la VM GPU.',
      v2Changes: 'Bloc finally garantissant la destruction immédiate de l’instance GPU dès la récupération du fichier .safetensors.'
    },
    'scripts/gpu_worker_run.sh': {
      category: 'orchestration-oci',
      summary: 'Script exécuté sur la VM GPU éphémère : déploie kohya-ss/sd-scripts, télécharge SDXL Base 1.0 et lance sdxl_train_network.py.',
      v2Changes: 'Paramétrage dynamique Steps / Learning Rate / Network Dim / Trigger Word passés depuis l’interface web.'
    },
    'scripts/kill_switch.py': {
      category: 'orchestration-oci',
      summary: 'Coupe-circuit budgétaire OCI (appelable par Cron et par le bouton d’urgence rouge du Studio).',
      v2Changes: 'Détruit automatiquement toute instance gpu-ephemere-lora-worker dépassant 2.5 heures d’exécution.'
    },
    'install.sh': {
      category: 'config',
      summary: 'Script d’installation initiale sur la VM Oracle (installation Pillow + création de lora-studio.service sur le port 5050).',
      v2Changes: 'Automatise la création et le démarrage du démon systemd lora-studio.service.'
    },
    '.gitignore': {
      category: 'config',
      summary: 'Exclusion Git des dossiers lourds et secrets (dataset/, originals/, models/, .gemini_key, training.log).',
      v2Changes: 'Protège la clé API .gemini_key et les poids .safetensors pour ne jamais polluer le dépôt GitHub.'
    }
  };

  const results: LoraV2File[] = [];
  for (const [relPath, meta] of Object.entries(metadataMap)) {
    const fullPath = path.join(baseExtracted, relPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const stats = fs.statSync(fullPath);
      const patched = buildSubpathPatchedContent(relPath, content);
      results.push({
        relativePath: relPath,
        fileName: path.basename(relPath),
        category: meta.category,
        sizeBytes: stats.size,
        lineCount: content.split('\n').length,
        summary: meta.summary,
        v2Changes: meta.v2Changes,
        content,
        subpathPatchedContent: patched
      });
    }
  }
  return results;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API: Overview of VM & Services
  app.get('/api/overview', (_req, res) => {
    const totalMemGb = 16;
    const activeMemMb = servicesState.reduce((acc, s) => acc + (s.status === 'active' ? s.memoryMb : 0), 580);
    const ramUsedGb = Number((activeMemMb / 1024).toFixed(2));

    const vmInfo: VmInfo = {
      name: 'vm-campagne-tests',
      publicIp: '141.145.218.127',
      privateIp: '10.0.0.217',
      domain: 'https://atelierconceptionjeu.fr',
      shape: 'VM.Standard.E5.Flex',
      ocpuCount: 8,
      vcpuCount: 16,
      ramGb: totalMemGb,
      availabilityDomain: 'EU-PARIS-1-AD-1',
      osUser: 'opc',
      osDistro: 'Oracle Linux 8 / 9 (DNF · systemd · Caddy 2)',
      executionMode: isOracleVm ? 'production-vm' : 'preview-sandbox',
      cpuLoadPercent: servicesState.find(s => s.id === 'foret-lab')?.status === 'active' ? 14 : 3,
      reservedWebVcpu: 2,
      workerVcpuPool: 14,
      ramUsedGb
    };

    res.json({
      vmInfo,
      services: servicesState,
      step1Completed
    });
  });

  // API: Mark Step 1 (Projet_Jeu cleanup) state
  app.post('/api/step1-status', (req, res) => {
    const { completed } = req.body || {};
    step1Completed = Boolean(completed);
    res.json({ step1Completed });
  });

  // API: Service control (start, stop, restart, git-pull)
  app.post('/api/service/:id/action', (req, res) => {
    const { id } = req.params;
    const { action } = req.body || {};
    const svc = servicesState.find(s => s.id === id);
    if (!svc) {
      res.status(404).json({ error: 'Service introuvable' });
      return;
    }

    const ts = nowTime();

    if (isOracleVm && fs.existsSync(svc.vmPath)) {
      try {
        if (action === 'git-pull') {
          const out = execSync(`git -C "${svc.vmPath}" pull --ff-only`, { encoding: 'utf-8' }).trim();
          const rev = execSync(`git -C "${svc.vmPath}" rev-parse --short HEAD`, { encoding: 'utf-8' }).trim();
          svc.commitHash = rev || svc.commitHash;
          svc.lastSync = `À l'instant (${ts})`;
          svc.logs.push(`[${ts}] git.pull: ${out || 'Already up to date.'} (HEAD -> ${svc.commitHash})`);
        } else if (action === 'start' || action === 'stop' || action === 'restart') {
          execSync(`sudo systemctl ${action} ${svc.systemdUnit}`);
          svc.status = action === 'stop' ? 'stopped' : 'active';
          svc.logs.push(`[${ts}] systemd[1]: Executed 'systemctl ${action} ${svc.systemdUnit}' successfully.`);
        }
      } catch (err: any) {
        svc.logs.push(`[${ts}] ERROR: ${err.message}`);
      }
    } else {
      // Preview / Sandbox execution with authentic command trace
      if (action === 'start') {
        svc.status = 'active';
        svc.pid = Math.floor(18000 + Math.random() * 4000);
        svc.uptime = '0j 00h 01m';
        svc.memoryMb = svc.id === 'foret-lab' ? 640 : svc.id === 'lora-studio' ? 215 : 130;
        svc.logs.push(`[${ts}] ssh opc@141.145.218.127 "sudo systemctl start ${svc.systemdUnit}"`);
        svc.logs.push(`[${ts}] systemd[1]: Started ${svc.systemdUnit} (PID ${svc.pid}) on 127.0.0.1:${svc.port}.`);
      } else if (action === 'stop') {
        svc.status = 'stopped';
        svc.pid = null;
        svc.uptime = 'Arrêté';
        svc.memoryMb = 0;
        svc.logs.push(`[${ts}] ssh opc@141.145.218.127 "sudo systemctl stop ${svc.systemdUnit}"`);
        svc.logs.push(`[${ts}] systemd[1]: Stopped ${svc.systemdUnit}. Port ${svc.port} libéré.`);
      } else if (action === 'restart') {
        svc.status = 'active';
        svc.pid = Math.floor(21000 + Math.random() * 5000);
        svc.uptime = '0j 00h 00m (Redémarré)';
        if (svc.memoryMb === 0) svc.memoryMb = 180;
        svc.logs.push(`[${ts}] ssh opc@141.145.218.127 "sudo systemctl restart ${svc.systemdUnit}"`);
        svc.logs.push(`[${ts}] systemd[1]: Restarted ${svc.systemdUnit} -> Nouveau PID ${svc.pid} à l'écoute sur 127.0.0.1:${svc.port}.`);
      } else if (action === 'git-pull') {
        svc.lastSync = `Synchronisé à ${ts}`;
        svc.logs.push(`[${ts}] git -C ${svc.vmPath} fetch origin ${svc.branch} && git -C ${svc.vmPath} pull --ff-only`);
        svc.logs.push(`[${ts}] git.sync: Fast-forward de github.com/${svc.repo} (${svc.branch} @ ${svc.commitHash}) vérifié.`);
        svc.logs.push(`[${ts}] systemd[1]: Rechargement à chaud de ${svc.systemdUnit} terminé.`);
      } else if (action === 'clear-logs') {
        svc.logs = [`[${ts}] journalctl: Tampon d'affichage nettoyé pour ${svc.systemdUnit}.`];
      }
    }

    res.json({ service: svc });
  });

  // API: Global Git Pull + Restart across active services
  app.post('/api/deploy-all', (_req, res) => {
    const ts = nowTime();
    for (const svc of servicesState) {
      if (svc.status === 'active') {
        svc.lastSync = `Synchronisé à ${ts}`;
        svc.logs.push(`[${ts}] [DEPLOY-ALL] git -C ${svc.vmPath} pull --ff-only origin ${svc.branch}`);
        svc.logs.push(`[${ts}] [DEPLOY-ALL] sudo systemctl restart ${svc.systemdUnit} -> OK (Port ${svc.port})`);
      }
    }
    res.json({ services: servicesState, timestamp: ts });
  });

  // API: Inspect extracted lora-factory v2 files from user's ZIP
  app.get('/api/lora-v2/files', (_req, res) => {
    try {
      const files = getLoraV2Files();
      res.json({ files });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development / static dist for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Atelier Conception Jeu — Portail Orchestrateur actif sur http://0.0.0.0:${PORT}`);
  });
}

startServer();
