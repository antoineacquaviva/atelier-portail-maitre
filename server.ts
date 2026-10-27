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
      'Système de test de versions, recherche MAP-Elites et équilibrage multiprocessus du jeu.',
    repo: 'antoineacquaviva/foret-automate-lab',
    branch: 'main',
    commitHash: 'd1c6267',
    lastUpdated: 'Synchronisé avec GitHub',
    lastSource: 'git',
    subpath: '/lab',
    port: 8080,
    systemdUnit: 'foret-lab.service',
    vmPath: '/srv/jeu/foret-automate-lab',
    stackPreset: 'node',
    execStart:
      '/usr/bin/python3 -m http.server 8080 --bind 127.0.0.1 --directory /srv/jeu/foret-automate-lab/dist',
    buildCmd: 'npm install --legacy-peer-deps && npx vite build --base=/lab/',
    status: 'active',
    logs: [
      `[09:00:00] caddy.route: Route https://atelierconceptionjeu.fr/lab/ configurée vers 127.0.0.1:8080.`,
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

/**
 * Helper to execute a command on the VM and format detailed stderr/stdout if it fails.
 */
function runCmdWithDetails(cmd: string, log?: (msg: string) => void): string {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (err: any) {
    const stdout = err.stdout ? String(err.stdout).trim() : '';
    const stderr = err.stderr ? String(err.stderr).trim() : '';
    const combined = [stdout, stderr].filter(Boolean).join('\n');
    const tail = combined
      .split('\n')
      .slice(-20)
      .join('\n');
    if (log && tail) {
      log(`Détail sortie commande :\n${tail}`);
    }
    throw new Error(tail || err.message || `Échec de la commande: ${cmd}`);
  }
}

function isPortListening(port: number): boolean {
  if (!isOracleVm) return true;
  try {
    const out = execSync(`ss -tln | grep -E ":${port}\\b" || true`, {
      encoding: 'utf-8',
    }).trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

function refreshLiveVmStates() {
  if (!isOracleVm) return;
  for (const tool of toolsState) {
    try {
      execSync(`systemctl is-active --quiet ${tool.systemdUnit}`);
      // Also check that the port is genuinely listening so we don't report 'active' when it's 502
      tool.status = isPortListening(tool.port) ? 'active' : 'stopped';
    } catch {
      tool.status = fs.existsSync(`/etc/systemd/system/${tool.systemdUnit}`)
        ? 'stopped'
        : 'standby';
    }

    if (fs.existsSync(path.join(tool.vmPath, '.git'))) {
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
Environment=NODE_ENV=production
Environment=PYTHONUNBUFFERED=1
Environment=PORT=${tool.port}
Environment= PATH=/home/opc/venv/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=${tool.execStart}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
`;
}

function applySubpathPatchInDirectory(targetDir: string, subpath: string) {
  if (fs.existsSync(path.join(targetDir, 'package.json'))) {
    return;
  }

  const cleanSub = subpath.replace(/\/+$/, '');
  const baseTag = `<base href="${cleanSub}/">`;

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

/**
 * Patches server.ts so it does not hardcode PORT = 3000 (which collides with the Portal on port 3000!)
 * and ensures relative API fetches in src/ work behind Caddy handle_path.
 */
function patchNodeServerAndClientForSubpath(
  vmPath: string,
  port: number,
  log: (msg: string) => void
) {
  const serverTsPath = path.join(vmPath, 'server.ts');
  if (fs.existsSync(serverTsPath)) {
    let code = fs.readFileSync(serverTsPath, 'utf-8');
    const updated = code
      .replace(
        /const\s+PORT\s*=\s*3000\s*;/g,
        `const PORT = Number(process.env.PORT) || ${port};`
      )
      .replace(
        /const\s+port\s*=\s*3000\s*;/g,
        `const port = Number(process.env.PORT) || ${port};`
      )
      .replace(/\.listen\(\s*3000\b/g, `.listen(Number(process.env.PORT) || ${port}`);
    if (updated !== code) {
      fs.writeFileSync(serverTsPath, updated, 'utf-8');
      log(`Port 3000 dans server.ts automatiquement adapté vers le port ${port}.`);
    }
  }

  // Also convert absolute fetch('/api/...') to relative fetch('api/...') in src/ so calls go through /lab/api/...
  const srcDir = path.join(vmPath, 'src');
  if (fs.existsSync(srcDir)) {
    const patchRecursive = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          patchRecursive(fullPath);
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          const orig = fs.readFileSync(fullPath, 'utf-8');
          const next = orig
            .replace(/fetch\(\s*['"]\/api\//g, (m) => m.replace('/api/', 'api/'))
            .replace(/fetch\(\s*`\/api\//g, 'fetch(`api/');
          if (next !== orig) {
            fs.writeFileSync(fullPath, next, 'utf-8');
          }
        }
      }
    };
    try {
      patchRecursive(srcDir);
    } catch {
      // ignore
    }
  }
}

/**
 * Inspects the files inside tool.vmPath, builds the project, configures systemd,
 * starts the service, and verifies that the target port is actively listening.
 */
function autoDetectBuildAndStartService(
  tool: ToolItem,
  autoSubpathPatch: boolean,
  log: (msg: string) => void
) {
  const cleanSub = tool.subpath.replace(/\/+$/, '');
  const pkgJsonPath = path.join(tool.vmPath, 'package.json');
  const appPyPath = path.join(tool.vmPath, 'app.py');
  const mainPyPath = path.join(tool.vmPath, 'main.py');
  const pythonBin = fs.existsSync('/home/opc/venv/bin/python3')
    ? '/home/opc/venv/bin/python3'
    : '/usr/bin/python3';

  if (fs.existsSync(pkgJsonPath)) {
    log(`Projet Node.js / Vite détecté dans ${tool.vmPath}.`);
    tool.stackPreset = 'node';

    // 1. Clean any injected <base href> in source index.html so Vite doesn't choke
    const srcIndexHtml = path.join(tool.vmPath, 'index.html');
    if (fs.existsSync(srcIndexHtml)) {
      const content = fs.readFileSync(srcIndexHtml, 'utf-8');
      if (content.includes('<base href=')) {
        fs.writeFileSync(
          srcIndexHtml,
          content.replace(/<base href="[^"]*">\s*/g, ''),
          'utf-8'
        );
      }
    }

    // 2. Patch server.ts (if present) so it doesn't collide with port 3000, and patch fetch('/api/...')
    patchNodeServerAndClientForSubpath(tool.vmPath, tool.port, log);

    // 3. Backup existing dist/ in case the new build has a syntax error
    const distDir = path.join(tool.vmPath, 'dist');
    const backupDist = `/tmp/dist_backup_${tool.id}`;
    if (fs.existsSync(distDir)) {
      try {
        execSync(`rm -rf "${backupDist}" && cp -r "${distDir}" "${backupDist}"`);
      } catch {
        // ignore
      }
    }

    const buildCmd = `npm install --legacy-peer-deps && ./node_modules/.bin/vite build --base=${cleanSub}/`;
    tool.buildCmd = buildCmd;
    log(`Installation npm et compilation Vite (--base=${cleanSub}/) en cours...`);
    try {
      runCmdWithDetails(`cd "${tool.vmPath}" && ${buildCmd}`, log);
      log(`Compilation Vite réussie (dossier dist/ prêt).`);
    } catch (buildErr: any) {
      log(`Alerte Build Vite : ${buildErr.message}`);
      if (fs.existsSync(backupDist) && !fs.existsSync(path.join(distDir, 'index.html'))) {
        execSync(`rm -rf "${distDir}" && cp -r "${backupDist}" "${distDir}"`);
        log(`Ancien dossier dist/ restauré pour éviter une coupure de service.`);
      } else {
        throw buildErr;
      }
    }

    // 4. Determine ExecStart
    const hasServerTs = fs.existsSync(path.join(tool.vmPath, 'server.ts'));
    if (hasServerTs) {
      const tsxBin = fs.existsSync(path.join(tool.vmPath, 'node_modules/.bin/tsx'))
        ? path.join(tool.vmPath, 'node_modules/.bin/tsx')
        : '/usr/bin/npx tsx';
      tool.execStart = `${tsxBin} ${tool.vmPath}/server.ts`;
      log(`Backend server.ts détecté -> démarrage sur le port ${tool.port}.`);
    } else {
      tool.execStart = `/usr/bin/python3 -m http.server ${tool.port} --bind 127.0.0.1 --directory ${tool.vmPath}/dist`;
      log(`SPA statique Vite -> servie sur 127.0.0.1:${tool.port} depuis ${tool.vmPath}/dist.`);
    }
  } else if (fs.existsSync(appPyPath) || fs.existsSync(mainPyPath)) {
    const pyEntry = fs.existsSync(appPyPath) ? 'app.py' : 'main.py';
    const pyFull = path.join(tool.vmPath, pyEntry);
    log(`Projet Python (${pyEntry}) détecté dans ${tool.vmPath}.`);

    if (autoSubpathPatch) {
      applySubpathPatchInDirectory(tool.vmPath, cleanSub);
      log(`Adaptation des chemins relatifs appliquée pour ${cleanSub}/.`);
    }

    const reqTxt = path.join(tool.vmPath, 'requirements.txt');
    if (fs.existsSync(reqTxt)) {
      log(`Installation des dépendances Python (requirements.txt)...`);
      runCmdWithDetails(`${pythonBin} -m pip install -r "${reqTxt}"`, log);
    }

    const pyContent = fs.readFileSync(pyFull, 'utf-8');
    if (pyContent.includes('FastAPI')) {
      tool.stackPreset = 'fastapi';
      const moduleName = pyEntry.replace(/\.py$/, '');
      tool.execStart = `${pythonBin} -m uvicorn ${moduleName}:app --host 127.0.0.1 --port ${tool.port} --root-path ${cleanSub}`;
    } else {
      tool.stackPreset = 'flask';
      tool.execStart = `${pythonBin} ${pyFull}`;
    }
  } else if (fs.existsSync(path.join(tool.vmPath, 'index.html'))) {
    log(`Site statique HTML détecté dans ${tool.vmPath}.`);
    if (autoSubpathPatch) {
      applySubpathPatchInDirectory(tool.vmPath, cleanSub);
    }
    tool.stackPreset = 'static-python';
    tool.execStart = `/usr/bin/python3 -m http.server ${tool.port} --bind 127.0.0.1 --directory ${tool.vmPath}`;
  } else if (tool.buildCmd && tool.buildCmd.trim()) {
    log(`Exécution de la commande de build : ${tool.buildCmd}`);
    runCmdWithDetails(`cd "${tool.vmPath}" && ${tool.buildCmd}`, log);
  }

  // 5. Write systemd unit, reload daemon, and restart service
  const unitContent = generateSystemdUnitFile(tool);
  fs.writeFileSync(`/tmp/${tool.systemdUnit}`, unitContent, 'utf-8');
  runCmdWithDetails(
    `sudo mv /tmp/${tool.systemdUnit} /etc/systemd/system/${tool.systemdUnit} && sudo systemctl daemon-reload && sudo systemctl enable ${tool.systemdUnit}`,
    log
  );

  // Free the port if an orphan process (outside this systemd unit) is holding it
  try {
    execSync(`sudo systemctl stop ${tool.systemdUnit} || true`);
  } catch {
    // ignore
  }

  runCmdWithDetails(`sudo systemctl restart ${tool.systemdUnit}`, log);

  // Wait briefly and verify that the service is actually listening on tool.port
  execSync('sleep 2');
  const listening = isPortListening(tool.port);

  if (!listening) {
    // Capture journalctl logs to explain why it didn't bind
    try {
      const crashLogs = execSync(
        `sudo journalctl -u ${tool.systemdUnit} -n 15 --no-pager -o cat`,
        { encoding: 'utf-8' }
      ).trim();
      if (crashLogs) {
        log(`Journal systemd (${tool.systemdUnit}) :\n${crashLogs}`);
      }
    } catch {
      // ignore
    }

    // Automatic self-healing fallback if dist/index.html exists
    const distIndex = path.join(tool.vmPath, 'dist', 'index.html');
    if (fs.existsSync(distIndex)) {
      log(
        `Auto-réparation : bascule automatique sur le serveur statique dist/ (port ${tool.port}) pour éviter l'erreur 502.`
      );
      tool.execStart = `/usr/bin/python3 -m http.server ${tool.port} --bind 127.0.0.1 --directory ${tool.vmPath}/dist`;
      const fallbackUnit = generateSystemdUnitFile(tool);
      fs.writeFileSync(`/tmp/${tool.systemdUnit}`, fallbackUnit, 'utf-8');
      runCmdWithDetails(
        `sudo mv /tmp/${tool.systemdUnit} /etc/systemd/system/${tool.systemdUnit} && sudo systemctl daemon-reload && sudo systemctl restart ${tool.systemdUnit}`,
        log
      );
      execSync('sleep 1');
    }
  }

  // Ensure Caddyfile is synchronized and reloaded
  try {
    const caddyContent = generateCaddyfile(toolsState);
    fs.writeFileSync('/tmp/Caddyfile.sync', caddyContent, 'utf-8');
    execSync(
      `sudo mv /tmp/Caddyfile.sync /etc/caddy/Caddyfile && sudo systemctl reload caddy`
    );
  } catch {
    // ignore
  }

  if (isPortListening(tool.port)) {
    tool.status = 'active';
    log(`Vérification OK : le port ${tool.port} répond bien à Caddy (${cleanSub}/ opérationnel).`);
  } else {
    tool.status = 'stopped';
    log(`Attention : aucun processus n'écoute encore sur le port ${tool.port}.`);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

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

  // 2. POST /api/tools/:id/action (start, stop, restart, clear-logs, delete, diagnose)
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

    if (action === 'diagnose') {
      const log = (msg: string) => {
        tool.logs.push(`[${nowTime()}] ${msg}`);
      };
      log(`=== Diagnostic & Réparation 502 lancé pour ${tool.name} (Port ${tool.port}) ===`);

      if (isOracleVm) {
        try {
          if (!fs.existsSync(tool.vmPath)) {
            log(`Dossier ${tool.vmPath} absent -> clonage depuis GitHub (${tool.repo})...`);
            fs.mkdirSync(path.dirname(tool.vmPath), { recursive: true });
            runCmdWithDetails(
              `git clone https://github.com/${tool.repo}.git "${tool.vmPath}"`,
              log
            );
          } else {
            const files = fs.readdirSync(tool.vmPath).join(', ');
            log(`Fichiers présents dans ${tool.vmPath} : ${files}`);
          }

          try {
            const jOut = execSync(
              `sudo journalctl -u ${tool.systemdUnit} -n 20 --no-pager -o cat`,
              { encoding: 'utf-8' }
            ).trim();
            if (jOut) {
              log(`Derniers logs systemd (${tool.systemdUnit}) :\n${jOut}`);
            }
          } catch {
            // ignore
          }

          autoDetectBuildAndStartService(tool, true, log);
        } catch (err: any) {
          log(`ERREUR Diagnostic/Réparation : ${err.message}`);
        }
      } else {
        log(`[Simulation] Inspection de ${tool.vmPath}, vérification du port ${tool.port}, compilation Vite (--base=${tool.subpath}/) et redémarrage de ${tool.systemdUnit}.`);
        tool.status = 'active';
      }

      saveToolsRegistry(toolsState);
      res.json({ tool });
      return;
    }

    if (isOracleVm) {
      try {
        execSync(`sudo systemctl ${action} ${tool.systemdUnit}`);
        execSync('sleep 1');
        tool.status =
          action === 'stop'
            ? 'stopped'
            : isPortListening(tool.port)
            ? 'active'
            : 'stopped';
        tool.logs.push(
          `[${ts}] systemd: systemctl ${action} ${tool.systemdUnit} exécuté (Port ${tool.port}: ${
            tool.status === 'active' ? 'ÉCOUTE OK' : 'NON ACTIF'
          }).`
        );
        try {
          const jLogs = execSync(
            `sudo journalctl -u ${tool.systemdUnit} -n 12 --no-pager -o short-iso`,
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
            runCmdWithDetails(
              `git clone https://github.com/${tool.repo}.git "${tool.vmPath}"`,
              log
            );
            log(`Dépôt cloné dans ${tool.vmPath}.`);
          } else {
            runCmdWithDetails(
              `git -C "${tool.vmPath}" fetch origin ${tool.branch} && git -C "${tool.vmPath}" reset --hard origin/${tool.branch}`,
              log
            );
            log(`Code aligné sur origin/${tool.branch}.`);
          }

          autoDetectBuildAndStartService(tool, Boolean(body.autoSubpathPatch), log);

          const rev = execSync(`git -C "${tool.vmPath}" rev-parse --short HEAD`, {
            encoding: 'utf-8',
          }).trim();
          tool.commitHash = rev || tool.commitHash;
          log(
            `Déploiement terminé (commit ${tool.commitHash}, statut : ${tool.status.toUpperCase()}).`
          );
        } else {
          log(`[Aperçu] git -C ${tool.vmPath} fetch origin ${tool.branch} && reset --hard`);
          log(`[Aperçu] Auto-détection stack, adaptation port ${tool.port} & compilation Vite/Python`);
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

          runCmdWithDetails(`unzip -q -o "${tmpZip}" -d "${tmpExtract}"`, log);
          log(`Archive décompressée dans ${tmpExtract}.`);

          const entries = fs.readdirSync(tmpExtract);
          let sourceRoot = tmpExtract;
          if (
            entries.length === 1 &&
            fs.statSync(path.join(tmpExtract, entries[0])).isDirectory()
          ) {
            sourceRoot = path.join(tmpExtract, entries[0]);
          }

          fs.mkdirSync(tool.vmPath, { recursive: true });
          runCmdWithDetails(
            `rsync -a --delete --exclude='.git' --exclude='venv' --exclude='node_modules' --exclude='dist' --exclude='dataset' --exclude='originals' --exclude='models' --exclude='.gemini_key' "${sourceRoot}/" "${tool.vmPath}/"`,
            log
          );
          log(
            `Fichiers synchronisés dans ${tool.vmPath} (données et .git préservés).`
          );

          autoDetectBuildAndStartService(tool, Boolean(body.autoSubpathPatch), log);

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
          } catch {
            log(
              `Note Git Push : L'outil est bien déployé et actif sur la VM, mais le push vers GitHub nécessite d'autoriser la clé SSH de la VM (voir onglet Guide & Prérequis).`
            );
          }

          fs.rmSync(tmpZip, { force: true });
          fs.rmSync(tmpExtract, { recursive: true, force: true });
        } else {
          log(`[Aperçu] Extraction de ${body.zipFileName} vers ${tool.vmPath}`);
          log(`[Aperçu] Auto-détection stack & redémarrage ${tool.systemdUnit}`);
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

  // 4. POST /api/tools/create
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
          runCmdWithDetails(
            `git clone https://github.com/${newTool.repo}.git "${vmPath}"`,
            log
          );
        } else if (body.initialSource === 'zip' && body.zipBase64) {
          log(`Extraction de l'archive initiale ${body.zipFileName || 'archive.zip'}...`);
          const tmpZip = `/tmp/new_${cleanId}_${Date.now()}.zip`;
          const tmpExtract = `/tmp/new_extract_${cleanId}_${Date.now()}`;
          fs.writeFileSync(tmpZip, Buffer.from(body.zipBase64, 'base64'));
          fs.mkdirSync(tmpExtract, { recursive: true });
          runCmdWithDetails(`unzip -q -o "${tmpZip}" -d "${tmpExtract}"`, log);

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

        toolsState.push(newTool);
        autoDetectBuildAndStartService(newTool, Boolean(body.autoSubpathPatch), log);
        saveToolsRegistry(toolsState);
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

  // 5. POST /api/portal/self-update
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
