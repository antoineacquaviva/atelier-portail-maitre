import express from 'express';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import type {
  ToolItem,
  PortalSelfInfo,
  VmPrerequisites,
  DeployVersionRequest,
  CreateToolRequest,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isOracleVm = fs.existsSync('/home/opc') && fs.existsSync('/etc/systemd/system');
const REGISTRY_PATH = isOracleVm
  ? '/srv/jeu/tools-registry.json'
  : path.join(__dirname, 'tools-registry.local.json');

const nowTime = () => new Date().toTimeString().split(' ')[0];

const DEFAULT_TOOLS: ToolItem[] = [
  {
    id: 'lora-factory',
    name: 'LoRA Factory Studio',
    description:
      'Studio de filtres graphiques SDXL pour les illustrations du jeu (Table lumineuse CropperJS, Tag Builder FR->EN, Copilote Gemini Vision, GPU A10 OCI).',
    repo: 'antoineacquaviva/lora-factory',
    branch: 'main',
    commitHash: '5bb40d5',
    lastUpdated: 'Déployé (v2 active)',
    lastSource: 'zip',
    subpath: '/lora',
    port: 5050,
    systemdUnit: 'lora-studio.service',
    vmPath: '/home/opc/lora-factory',
    stackPreset: 'flask',
    execStart: '/usr/bin/python3 /home/opc/lora-factory/app.py',
    buildCmd: '',
    status: 'active',
    logs: [
      `[08:30:10] systemd[1]: Started lora-studio.service - LoRA Factory Studio v2.`,
      `[08:30:11] werkzeug: INFO: Running on http://127.0.0.1:5050`,
      `[08:31:00] lora.studio: INFO: Prêt sur https://atelierconceptionjeu.fr/lora/`,
    ],
  },
  {
    id: 'foret-automate-lab',
    name: 'Forêt Automate Lab',
    description:
      'Système de test de versions et équilibrage multiprocessus du jeu (14 workers en os.nice(15) + interface web légère).',
    repo: 'antoineacquaviva/foret-automate-lab',
    branch: 'main',
    commitHash: '1711fc7',
    lastUpdated: 'Prêt pour itération Web UI',
    lastSource: 'zip',
    subpath: '/lab',
    port: 8080,
    systemdUnit: 'foret-lab.service',
    vmPath: '/srv/jeu/foret-automate-lab',
    stackPreset: 'fastapi',
    execStart:
      '/home/opc/venv/bin/uvicorn app:app --host 127.0.0.1 --port 8080 --root-path /lab',
    buildCmd: '',
    status: 'standby',
    logs: [
      `[09:00:00] caddy.route: Route https://atelierconceptionjeu.fr/lab/ préconfigurée vers 127.0.0.1:8080.`,
      `[09:00:01] systemd: En attente du déploiement de la version avec interface Web.`,
    ],
  },
  {
    id: 'bga-studio',
    name: 'BGA Studio Sandbox',
    description:
      'Environnement de test et d’implémentation du jeu de société pour Board Game Arena.',
    repo: 'antoineacquaviva/bga-studio',
    branch: 'main',
    commitHash: 'initial',
    lastUpdated: 'Emplacement réservé',
    lastSource: 'git',
    subpath: '/bga',
    port: 8082,
    systemdUnit: 'bga-studio.service',
    vmPath: '/srv/jeu/bga-studio',
    stackPreset: 'static-python',
    execStart: '/usr/bin/python3 -m http.server 8082 --bind 127.0.0.1',
    buildCmd: '',
    status: 'standby',
    logs: [
      `[09:00:00] caddy.route: Route https://atelierconceptionjeu.fr/bga/ préconfigurée vers 127.0.0.1:8082.`,
    ],
  },
];

function loadToolsRegistry(): ToolItem[] {
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // fallback to default
  }
  saveToolsRegistry(DEFAULT_TOOLS);
  return DEFAULT_TOOLS;
}

function saveToolsRegistry(tools: ToolItem[]) {
  try {
    const dir = path.dirname(REGISTRY_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(tools, null, 2), 'utf-8');
  } catch {
    // ignore write error in read-only environments
  }
}

let toolsState: ToolItem[] = loadToolsRegistry();

function refreshLiveVmStates() {
  if (!isOracleVm) return;
  for (const tool of toolsState) {
    try {
      execSync(`systemctl is-active --quiet ${tool.systemdUnit}`);
      tool.status = 'active';
    } catch {
      tool.status = fs.existsSync(`/etc/systemd/system/${tool.systemdUnit}`)
        ? 'stopped'
        : 'standby';
    }

    if (fs.existsSync( path.join(tool.vmPath, '.git') )) {
      try {
        const rev = execSync(`git -C "${tool.vmPath}" rev-parse --short HEAD`, {
          encoding: 'utf-8',
        }).trim();
        if (rev) tool.commitHash = rev;
      } catch {
        // ignore
      }
    }
  }
}

function getVmPrerequisites(): VmPrerequisites {
  const sudoersCommand = `echo "opc ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/atelier-portail && sudo chmod 440 /etc/sudoers.d/atelier-portail`;
  if (!isOracleVm) {
    return {
      sshPublicKey:
        'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExempleClePubliqueVMOracleOpcAtelierJeu opc@vm-campagne-tests',
      sudoersConfigured: true,
      sudoersCommand,
    };
  }

  let sshPublicKey = '';
  const pubKeyPath = '/home/opc/.ssh/id_ed25519.pub';
  const rsaKeyPath = '/home/opc/.ssh/id_rsa.pub';
  try {
    if (fs.existsSync(pubKeyPath)) {
      sshPublicKey = fs.readFileSync(pubKeyPath, 'utf-8').trim();
    } else if (fs.existsSync(rsaKeyPath)) {
      sshPublicKey = fs.readFileSync(rsaKeyPath, 'utf-8').trim();
    } else {
      execSync(`ssh-keygen -t ed25519 -N "" -f /home/opc/.ssh/id_ed25519 -q`);
      sshPublicKey = fs.readFileSync(pubKeyPath, 'utf-8').trim();
    }
  } catch {
    sshPublicKey = 'Clé SSH non lisible (vérifiez /home/opc/.ssh/id_ed25519.pub)';
  }

  const sudoersConfigured = fs.existsSync('/etc/sudoers.d/atelier-portail');
  return {
    sshPublicKey,
    sudoersConfigured,
    sudoersCommand,
  };
}

function generateCaddyfile(tools: ToolItem[]): string {
  const blocks = tools
    .map((t) => {
      const cleanSub = t.subpath.startsWith('/') ? t.subpath : `/${t.subpath}`;
      return `    # Outil : ${t.name} (${cleanSub} -> 127.0.0.1:${t.port})
    redir ${cleanSub} ${cleanSub}/
    handle_path ${cleanSub}/* {
        reverse_proxy 127.0.0.1:${t.port} {
            header_up X-Forwarded-Prefix ${cleanSub}
            header_up Host {host}
            header_up X-Real-IP {remote_host}
        }
    }`;
    })
    .join('\n\n');

  return `atelierconceptionjeu.fr, www.atelierconceptionjeu.fr {
    encode zstd gzip

${blocks}

    # Portail Maître Orchestrateur (Racine / -> 127.0.0.1:3000)
    handle {
        reverse_proxy 127.0.0.1:3000 {
            header_up Host {host}
            header_up X-Real-IP {remote_host}
        }
    }
}
`;
}

function generateSystemdUnitFile(tool: ToolItem): string {
  return `[Unit]
Description=${tool.name} - Atelier Conception Jeu
After=network.target

[Service]
Type=simple
User=opc
WorkingDirectory=${tool.vmPath}
Environment=PYTHONUNBUFFERED=1
Environment=PORT=${tool.port}
ExecStart=${tool.execStart}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
`;
}

function applySubpathPatchInDirectory(targetDir: string, subpath: string) {
  const cleanSub = subpath.replace(/\/+$/, '');
  const baseTag = `<base href="${cleanSub}/">`;

  // Patch HTML files in root or templates/
  const candidateHtmls = [
    path.join(targetDir, 'index.html'),
    path.join(targetDir, 'templates', 'index.html'),
  ];
  for (const htmlFile of candidateHtmls) {
    if (fs.existsSync(htmlFile)) {
      let html = fs.readFileSync(htmlFile, 'utf-8');
      if (!html.includes('<base href=')) {
        html = html.replace('<head>', `<head>\n    ${baseTag}`);
      }
      html = html
        .replace(/href="\/static\//g, 'href="static/')
        .replace(/src="\/static\//g, 'src="static/');
      fs.writeFileSync(htmlFile, html, 'utf-8');
    }
  }

  // Patch JS files in static/js/
  const jsDir = path.join(targetDir, 'static', 'js');
  if (fs.existsSync(jsDir)) {
    for (const f of fs.readdirSync(jsDir)) {
      if (f.endsWith('.js')) {
        const full = path.join(jsDir, f);
        let js = fs.readFileSync(full, 'utf-8');
        js = js
          .replace(/fetch\('\/api\//g, "fetch('api/")
          .replace(/fetch\("\/api\//g, 'fetch("api/')
          .replace(/src="\/img\//g, 'src="img/')
          .replace(/`\/img\//g, '`img/')
          .replace(/href="\/models\//g, 'href="models/');
        fs.writeFileSync(full, js, 'utf-8');
      }
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Allow up to 100MB payload for direct Gemini .zip uploads
  app.use(express.json({ limit: '100mb' }));

  // 1. GET /api/overview
  app.get('/api/overview', (_req, res) => {
    refreshLiveVmStates();
    let portalCommit = 'a663b89';
    if (isOracleVm && fs.existsSync('/srv/jeu/atelier-portail-maitre/.git')) {
      try {
        portalCommit = execSync(
          'git -C /srv/jeu/atelier-portail-maitre rev-parse --short HEAD',
          { encoding: 'utf-8' }
        ).trim();
      } catch {
        // ignore
      }
    }

    const portal: PortalSelfInfo = {
      repo: 'antoineacquaviva/atelier-portail-maitre',
      vmPath: '/srv/jeu/atelier-portail-maitre',
      systemdUnit: 'atelier-portail.service',
      commitHash: portalCommit,
      lastUpdated: 'En ligne',
      domain: 'https://atelierconceptionjeu.fr',
      publicIp: '141.145.218.127',
      executionMode: isOracleVm ? 'production-vm' : 'preview-sandbox',
    };

    res.json({
      portal,
      tools: toolsState,
      prereqs: getVmPrerequisites(),
    });
  });

  // 2. POST /api/tools/:id/action (start, stop, restart, clear-logs, delete)
  app.post('/api/tools/:id/action', (req, res) => {
    const { id } = req.params;
    const { action } = req.body || {};
    const toolIdx = toolsState.findIndex((t) => t.id === id);
    if (toolIdx === -1) {
      res.status(404).json({ error: 'Outil introuvable' });
      return;
    }

    const tool = toolsState[toolIdx];
    const ts = nowTime();

    if (action === 'delete') {
      if (isOracleVm) {
        try {
          execSync(`sudo systemctl stop ${tool.systemdUnit} || true`);
          execSync(`sudo systemctl disable ${tool.systemdUnit} || true`);
        } catch {
          // ignore
        }
      }
      toolsState.splice(toolIdx, 1);
      saveToolsRegistry(toolsState);
      res.json({ deleted: true, tools: toolsState });
      return;
    }

    if (action === 'clear-logs') {
      tool.logs = [`[${ts}] Console nettoyée.`];
      saveToolsRegistry(toolsState);
      res.json({ tool });
      return;
    }

    if (isOracleVm) {
      try {
        execSync(`sudo systemctl ${action} ${tool.systemdUnit}`);
        tool.status = action === 'stop' ? 'stopped' : 'active';
        tool.logs.push(
          `[${ts}] systemd: systemctl ${action} ${tool.systemdUnit} exécuté avec succès.`
        );
        // Fetch last 12 lines of journalctl
        try {
          const jLogs = execSync(
            `sudo journalctl -u ${tool.systemdUnit} -n 8 --no-pager -o short-iso`,
            { encoding: 'utf-8' }
          )
            .trim()
            .split('\n')
            .filter(Boolean);
          tool.logs.push(...jLogs);
        } catch {
          // ignore
        }
      } catch (err: any) {
        tool.logs.push(`[${ts}] ERREUR systemd: ${err.message}`);
      }
    } else {
      tool.status = action === 'stop' ? 'stopped' : 'active';
      tool.logs.push(
        `[${ts}] [Simulation VM] sudo systemctl ${action} ${tool.systemdUnit} -> ${tool.status.toUpperCase()}`
      );
    }

    saveToolsRegistry(toolsState);
    res.json({ tool });
  });

  // 3. POST /api/tools/:id/deploy-version (Bi-source: 'git' or 'zip')
  app.post('/api/tools/:id/deploy-version', (req, res) => {
    const { id } = req.params;
    const body = (req.body || {}) as DeployVersionRequest;
    const tool = toolsState.find((t) => t.id === id);
    if (!tool) {
      res.status(404).json({ error: 'Outil introuvable' });
      return;
    }

    const ts = nowTime();
    const stepLogs: string[] = [];
    const log = (msg: string) => {
      const entry = `[${nowTime()}] ${msg}`;
      stepLogs.push(entry);
      tool.logs.push(entry);
    };

    try {
      if (body.source === 'git') {
        log(`Démarrage du déploiement depuis GitHub (${tool.repo})...`);
        if (isOracleVm) {
          if (!fs.existsSync(path.join(tool.vmPath, '.git'))) {
            fs.mkdirSync(path.dirname(tool.vmPath), { recursive: true });
            execSync(
              `git clone https://github.com/${tool.repo}.git "${tool.vmPath}"`
            );
            log(`Dépôt cloné dans ${tool.vmPath}.`);
          } else {
            execSync(
              `git -C "${tool.vmPath}" fetch origin ${tool.branch} && git -C "${tool.vmPath}" reset --hard origin/${tool.branch}`
            );
            log(`Code aligné sur origin/${tool.branch}.`);
          }

          if (body.autoSubpathPatch) {
            applySubpathPatchInDirectory(tool.vmPath, tool.subpath);
            log(`Adaptation des chemins relatifs appliquée pour ${tool.subpath}/.`);
          }

          if (tool.buildCmd && tool.buildCmd.trim()) {
            log(`Exécution de la commande de build : ${tool.buildCmd}`);
            execSync(`cd "${tool.vmPath}" && ${tool.buildCmd}`);
          }

          // Ensure systemd unit exists
          if (!fs.existsSync(`/etc/systemd/system/${tool.systemdUnit}`)) {
            const unitContent = generateSystemdUnitFile(tool);
            fs.writeFileSync(`/tmp/${tool.systemdUnit}`, unitContent, 'utf-8');
            execSync(
              `sudo mv /tmp/${tool.systemdUnit} /etc/systemd/system/${tool.systemdUnit} && sudo systemctl daemon-reload && sudo systemctl enable ${tool.systemdUnit}`
            );
            log(`Unité systemd ${tool.systemdUnit} créée et activée.`);
          }

          execSync(`sudo systemctl restart ${tool.systemdUnit}`);
          const rev = execSync(`git -C "${tool.vmPath}" rev-parse --short HEAD`, {
            encoding: 'utf-8',
          }).trim();
          tool.commitHash = rev || tool.commitHash;
          tool.status = 'active';
          log(
            `Service ${tool.systemdUnit} redémarré (commit ${tool.commitHash}).`
          );
        } else {
          log(`[Aperçu] git -C ${tool.vmPath} fetch origin ${tool.branch} && reset --hard`);
          if (tool.buildCmd) log(`[Aperçu] Build: ${tool.buildCmd}`);
          log(`[Aperçu] sudo systemctl restart ${tool.systemdUnit}`);
          tool.status = 'active';
        }
        tool.lastSource = 'git';
        tool.lastUpdated = `Mis à jour depuis Git (${ts})`;
      } else if (body.source === 'zip') {
        if (!body.zipBase64) {
          res.status(400).json({ error: 'Aucune archive ZIP fournie.' });
          return;
        }
        const commitMsg =
          (body.commitMessage || '').trim() ||
          `feat: déploiement archive Gemini (${body.zipFileName || 'update.zip'})`;

        log(
          `Réception de l'archive Gemini : ${body.zipFileName || 'archive.zip'}...`
        );

        if (isOracleVm) {
          const tmpZip = `/tmp/gemini_${tool.id}_${Date.now()}.zip`;
          const tmpExtract = `/tmp/gemini_extract_${tool.id}_${Date.now()}`;
          fs.writeFileSync(tmpZip, Buffer.from(body.zipBase64, 'base64'));
          fs.mkdirSync(tmpExtract, { recursive: true });

          execSync(`unzip -q -o "${tmpZip}" -d "${tmpExtract}"`);
          log(`Archive décompressée dans ${tmpExtract}.`);

          // Detect single root folder inside ZIP (e.g., lora-factory-main/)
          const entries = fs.readdirSync(tmpExtract);
          let sourceRoot = tmpExtract;
          if (
            entries.length === 1 &&
            fs.statSync(path.join(tmpExtract, entries[0])).isDirectory()
          ) {
            sourceRoot = path.join(tmpExtract, entries[0]);
          }

          fs.mkdirSync(tool.vmPath, { recursive: true });
          execSync(
            `rsync -a --exclude='.git' --exclude='venv' --exclude='node_modules' --exclude='dataset' --exclude='originals' --exclude='models' --exclude='.gemini_key' "${sourceRoot}/" "${tool.vmPath}/"`
          );
          log(
            `Fichiers copiés dans ${tool.vmPath} (données et .git préservés).`
          );

          if (body.autoSubpathPatch) {
            applySubpathPatchInDirectory(tool.vmPath, tool.subpath);
            log(
              `Adaptation automatique des chemins relatifs pour ${tool.subpath}/ effectuée.`
            );
          }

          if (tool.buildCmd && tool.buildCmd.trim()) {
            log(`Exécution du build : ${tool.buildCmd}`);
            execSync(`cd "${tool.vmPath}" && ${tool.buildCmd}`);
          }

          // Ensure systemd unit exists & restart
          if (!fs.existsSync(`/etc/systemd/system/${tool.systemdUnit}`)) {
            const unitContent = generateSystemdUnitFile(tool);
            fs.writeFileSync(`/tmp/${tool.systemdUnit}`, unitContent, 'utf-8');
            execSync(
              `sudo mv /tmp/${tool.systemdUnit} /etc/systemd/system/${tool.systemdUnit} && sudo systemctl daemon-reload && sudo systemctl enable ${tool.systemdUnit}`
            );
          }
          execSync(`sudo systemctl restart ${tool.systemdUnit}`);
          tool.status = 'active';
          log(`Service ${tool.systemdUnit} redémarré avec succès.`);

          // Commit & Push back to GitHub so GitHub stays in sync!
          try {
            if (!fs.existsSync(path.join(tool.vmPath, '.git'))) {
              execSync(
                `cd "${tool.vmPath}" && git init -b ${tool.branch} && git remote add origin git@github.com:${tool.repo}.git`
              );
            }
            execSync(
              `cd "${tool.vmPath}" && git config user.name "Atelier Portail VM" && git config user.email "opc@atelierconceptionjeu.fr"`
            );
            execSync(`cd "${tool.vmPath}" && git add -A`);
            const statusOut = execSync(
              `cd "${tool.vmPath}" && git status --porcelain`,
              { encoding: 'utf-8' }
            ).trim();
            if (statusOut) {
              execSync(
                `cd "${tool.vmPath}" && git commit -m ${JSON.stringify(commitMsg)}`
              );
              const rev = execSync(
                `cd "${tool.vmPath}" && git rev-parse --short HEAD`,
                { encoding: 'utf-8' }
              ).trim();
              tool.commitHash = rev || tool.commitHash;
              log(`Commit Git créé sur la VM (${tool.commitHash}). Envoi vers GitHub...`);
              execSync(`cd "${tool.vmPath}" && git push -u origin ${tool.branch}`);
              log(`Synchronisation GitHub (${tool.repo}) réussie !`);
            } else {
              log(`Aucun changement de code à commiter vers GitHub.`);
            }
          } catch (gitErr: any) {
            log(
              `Note Git Push : L'outil est bien déployé et actif sur la VM, mais le push vers GitHub nécessite d'autoriser la clé SSH de la VM (voir onglet Guide & Prérequis). Détail : ${gitErr.message}`
            );
          }

          fs.rmSync(tmpZip, { force: true });
          fs.rmSync(tmpExtract, { recursive: true, force: true });
        } else {
          log(`[Aperçu] Extraction de ${body.zipFileName} vers ${tool.vmPath}`);
          if (body.autoSubpathPatch) {
            log(`[Aperçu] Patch sous-chemin Caddy ${tool.subpath}/ appliqué.`);
          }
          log(`[Aperçu] sudo systemctl restart ${tool.systemdUnit}`);
          log(`[Aperçu] git commit -m "${commitMsg}" && git push origin ${tool.branch}`);
          tool.status = 'active';
        }
        tool.lastSource = 'zip';
        tool.lastUpdated = `Déployé par ZIP (${ts})`;
      }

      saveToolsRegistry(toolsState);
      res.json({ tool, stepLogs });
    } catch (err: any) {
      log(`ERREUR : ${err.message}`);
      saveToolsRegistry(toolsState);
      res.status(500).json({ error: err.message, tool, stepLogs });
    }
  });

  // 4. POST /api/tools/create (Deploy a brand new tool: directory + systemd + Caddy)
  app.post('/api/tools/create', (req, res) => {
    const body = (req.body || {}) as CreateToolRequest;
    const cleanId = (body.id || '')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!cleanId || !body.name || !body.repo || !body.port) {
      res
        .status(400)
        .json({ error: 'Veuillez renseigner tous les champs obligatoires.' });
      return;
    }

    if (toolsState.some((t) => t.id === cleanId)) {
      res.status(400).json({ error: `Un outil avec l'identifiant ${cleanId} existe déjà.` });
      return;
    }

    const cleanSubpath = body.subpath.startsWith('/')
      ? body.subpath.replace(/\/+$/, '')
      : `/${body.subpath.replace(/\/+$/, '')}`;

    const vmPath = `/srv/jeu/${cleanId}`;
    const systemdUnit = `${cleanId}.service`;

    const newTool: ToolItem = {
      id: cleanId,
      name: body.name.trim(),
      description: body.description?.trim() || `Outil déployé sur ${cleanSubpath}`,
      repo: body.repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, ''),
      branch: 'main',
      commitHash: 'initial',
      lastUpdated: `Créé à ${nowTime()}`,
      lastSource: body.initialSource,
      subpath: cleanSubpath,
      port: Number(body.port),
      systemdUnit,
      vmPath,
      stackPreset: body.stackPreset,
      execStart: body.execStart.trim(),
      buildCmd: (body.buildCmd || '').trim(),
      status: 'active',
      logs: [`[${nowTime()}] Création de l'outil ${body.name} sur ${cleanSubpath} (port ${body.port}).`],
    };

    const stepLogs: string[] = [];
    const log = (msg: string) => {
      const entry = `[${nowTime()}] ${msg}`;
      stepLogs.push(entry);
      newTool.logs.push(entry);
    };

    try {
      if (isOracleVm) {
        fs.mkdirSync('/srv/jeu', { recursive: true });
        if (body.initialSource === 'git') {
          log(`Clonage de https://github.com/${newTool.repo}.git dans ${vmPath}...`);
          execSync(`git clone https://github.com/${newTool.repo}.git "${vmPath}"`);
        } else if (body.initialSource === 'zip' && body.zipBase64) {
          log(`Extraction de l'archive initiale ${body.zipFileName || 'archive.zip'}...`);
          const tmpZip = `/tmp/new_${cleanId}_${Date.now()}.zip`;
          const tmpExtract = `/tmp/new_extract_${cleanId}_${Date.now()}`;
          fs.writeFileSync(tmpZip, Buffer.from(body.zipBase64, 'base64'));
          fs.mkdirSync(tmpExtract, { recursive: true });
          execSync(`unzip -q -o "${tmpZip}" -d "${tmpExtract}"`);

          const entries = fs.readdirSync(tmpExtract);
          let sourceRoot = tmpExtract;
          if (
            entries.length === 1 &&
            fs.statSync(path.join(tmpExtract, entries[0])).isDirectory()
          ) {
            sourceRoot = path.join(tmpExtract, entries[0]);
          }
          fs.mkdirSync(vmPath, { recursive: true });
          execSync(`cp -r "${sourceRoot}/." "${vmPath}/"`);
          fs.rmSync(tmpZip, { force: true });
          fs.rmSync(tmpExtract, { recursive: true, force: true });

          try {
            execSync(
              `cd "${vmPath}" && git init -b main && git config user.name "Atelier Portail VM" && git config user.email "opc@atelierconceptionjeu.fr" && git add -A && git commit -m "feat: version initiale depuis archive Gemini"`
            );
            execSync(
              `cd "${vmPath}" && git remote add origin git@github.com:${newTool.repo}.git && git push -u origin main`
            );
            log(`Dépôt Git initialisé et poussé vers github.com/${newTool.repo}.`);
          } catch {
            log(`Dépôt Git local initialisé dans ${vmPath}.`);
          }
        } else {
          fs.mkdirSync(vmPath, { recursive: true });
        }

        if (body.autoSubpathPatch) {
          applySubpathPatchInDirectory(vmPath, cleanSubpath);
          log(`Adaptation sous-chemin Caddy (${cleanSubpath}/) appliquée.`);
        }

        if (newTool.buildCmd) {
          log(`Exécution de la commande d'installation : ${newTool.buildCmd}`);
          execSync(`cd "${vmPath}" && ${newTool.buildCmd}`);
        }

        // Write systemd service
        const unitContent = generateSystemdUnitFile(newTool);
        fs.writeFileSync(`/tmp/${systemdUnit}`, unitContent, 'utf-8');
        execSync(
          `sudo mv /tmp/${systemdUnit} /etc/systemd/system/${systemdUnit} && sudo systemctl daemon-reload && sudo systemctl enable --now ${systemdUnit}`
        );
        log(`Service systemd ${systemdUnit} créé et démarré.`);

        // Update Caddyfile with all tools including the new one
        toolsState.push(newTool);
        saveToolsRegistry(toolsState);

        const caddyContent = generateCaddyfile(toolsState);
        fs.writeFileSync('/tmp/Caddyfile.new', caddyContent, 'utf-8');
        execSync(
          `sudo mv /tmp/Caddyfile.new /etc/caddy/Caddyfile && sudo systemctl reload caddy`
        );
        log(`Caddyfile mis à jour et rechargé : route ${cleanSubpath}/ active !`);
      } else {
        log(`[Aperçu] Dossier ${vmPath} préparé.`);
        log(`[Aperçu] Service /etc/systemd/system/${systemdUnit} activé sur le port ${newTool.port}.`);
        log(`[Aperçu] Route Caddy ${cleanSubpath}/* ajoutée et Caddy rechargé.`);
        toolsState.push(newTool);
        saveToolsRegistry(toolsState);
      }

      res.json({ tool: newTool, tools: toolsState, stepLogs });
    } catch (err: any) {
      log(`Attention : ${err.message}`);
      if (!toolsState.some((t) => t.id === newTool.id)) {
        toolsState.push(newTool);
        saveToolsRegistry(toolsState);
      }
      res.status(500).json({ error: err.message, tool: newTool, tools: toolsState, stepLogs });
    }
  });

  // 5. POST /api/portal/self-update (Pulls & rebuilds the portal itself from GitHub)
  app.post('/api/portal/self-update', (_req, res) => {
    const portalDir = '/srv/jeu/atelier-portail-maitre';
    if (!isOracleVm || !fs.existsSync(portalDir)) {
      res.json({
        status: 'simulated',
        message:
          'Mode aperçu : sur la VM, cette action exécute git pull + npm run build + systemctl restart atelier-portail.service.',
      });
      return;
    }

    try {
      execSync(
        `cd "${portalDir}" && git fetch origin main && git reset --hard origin/main && npm install --legacy-peer-deps && npm run build`
      );
      const newCommit = execSync(`git -C "${portalDir}" rev-parse --short HEAD`, {
        encoding: 'utf-8',
      }).trim();

      res.json({
        status: 'ok',
        commitHash: newCommit,
        message: `Portail mis à jour (commit ${newCommit}). Redémarrage du service en cours...`,
      });

      setTimeout(() => {
        try {
          execSync('sudo systemctl restart atelier-portail.service');
        } catch {
          // ignore
        }
      }, 800);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for dev / static files for production
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
    console.log(
      `Atelier Conception Jeu — Portail Orchestrateur actif sur http://0.0.0.0:${PORT}`
    );
  });
}

startServer();
