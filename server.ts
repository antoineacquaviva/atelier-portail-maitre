import {prepareToolDirectory} from "./src/server/toolDirectory";
import {checkGitTarget} from "./src/server/gitTarget";
import {amazoniaRuntime, amazoniaUnit} from "./src/server/amazoniaDeployment";
import {internalGuard, proxyHeaders} from "./src/server/security";
import {generateCaddyfile} from "./src/server/caddyConfig";
import {actions, validateTool, isAmazonia} from "./src/server/validation";
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
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
      throw new Error("Parent du registre à préparer manuellement");
    }
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(tools, null, 2), 'utf-8');
  } catch {
    // ignore write error in read-only environments
  }
}

let toolsState: ToolItem[] = structuredClone(DEFAULT_TOOLS);

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

/**
 * Clones or updates a GitHub repository into vmPath, handling both HTTPS (public)
 * and SSH (private or authenticated) URLs. Shared parents are operator-provisioned.
 */
function cloneOrUpdateGitRepo(
  repo: string,
  branch: string,
  vmPath: string,
  log: (msg: string) => void
): string {
  checkGitTarget(vmPath);
  if (repo.toLowerCase()==='antoineacquaviva/amazonia') amazoniaRuntime();
  prepareToolDirectory(vmPath);

  const hasGit = fs.existsSync(path.join(vmPath, '.git'));
  if (!hasGit) {
    // Git can clone into an existing empty directory; do not replace its owner/mode.
    log(`Clonage du dépôt GitHub ${repo} dans ${vmPath}...`);
    try {
      runCmdWithDetails(`git clone https://github.com/${repo}.git "${vmPath}"`);
    } catch {
      log(`Tentative de clonage via SSH (git@github.com:${repo}.git)...`);
      runCmdWithDetails(
        `GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new" git clone git@github.com:${repo}.git "${vmPath}"`,
        log
      );
    }
    log(`Dépôt ${repo} cloné avec succès dans ${vmPath}.`);
  } else {
    log(`Mise à jour du dépôt existant dans ${vmPath}...`);
    try {
      runCmdWithDetails(
        `git -C "${vmPath}" fetch origin ${branch} && git -C "${vmPath}" reset --hard origin/${branch}`,
        log
      );
    } catch {
      // Fallback if default branch is master or main
      runCmdWithDetails(
        `git -C "${vmPath}" fetch origin && git -C "${vmPath}" reset --hard FETCH_HEAD`,
        log
      );
    }
    log(`Code aligné sur la dernière version GitHub.`);
  }

  try {
    return execSync(`git -C "${vmPath}" rev-parse --short HEAD`, {
      encoding: 'utf-8',
    }).trim();
  } catch {
    return 'main';
  }
}

function refreshLiveVmStates() {
  if (!isOracleVm) return;
  for (const tool of toolsState) {
    try {
      execSync(`systemctl is-active --quiet ${tool.systemdUnit}`);
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
  const sudoersCommand = `Privilèges limités à définir et valider manuellement ; aucun sudo général recommandé.`;
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
      sshPublicKey = 'Clé à préparer manuellement par le propriétaire';
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

function syncCaddyConfig(log?: (msg: string) => void) {
  if (!isOracleVm) return;
  const directory=fs.mkdtempSync('/tmp/atelier-caddy-review-');
  const target=path.join(directory,'Caddyfile');
  fs.writeFileSync(target,generateCaddyfile(toolsState),{mode:0o600});
  log?.(`Caddyfile protégé préparé dans ${target} ; validation et activation manuelles requises. Configuration active inchangée.`);
}

function generateSystemdUnitFile(tool: ToolItem): string {
  if(isAmazonia(tool)) return amazoniaUnit(tool,amazoniaRuntime().node);
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
Environment=PATH=/home/opc/venv/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=${tool.execStart}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
`;
}

function applySubpathPatchInDirectory(targetDir: string, subpath: string) {
  const hasViteConfig =
    fs.existsSync(path.join(targetDir, 'vite.config.ts')) ||
    fs.existsSync(path.join(targetDir, 'vite.config.js'));
  if (fs.existsSync(path.join(targetDir, 'package.json')) && hasViteConfig && !fs.existsSync(path.join(targetDir, 'templates', 'index.html'))) {
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
  subpath: string,
  log: (msg: string) => void
) {
  const cleanSub = subpath.startsWith('/')
    ? subpath.replace(/\/+$/, '')
    : `/${subpath.replace(/\/+$/, '')}`;
  const serverTsPath = path.join(vmPath, 'server.ts');
  if (fs.existsSync(serverTsPath)) {
    let code = fs.readFileSync(serverTsPath, 'utf-8');
    let updated = code
      .replace(
        /(const|let|var)\s+(PORT|port)(\s*:\s*number)?\s*=\s*3000\b/g,
        `$1 $2$3 = Number(process.env.PORT) || ${port}`
      )
      .replace(/\.listen\(\s*3000\b/g, `.listen(Number(process.env.PORT) || ${port}`);

    // Prevent ESM ReferenceError: __dirname is not defined when NODE_ENV=production
    if (
      updated.includes('__dirname') &&
      !updated.includes('fileURLToPath') &&
      !/\b(const|let|var)\s+__dirname\b/.test(updated)
    ) {
      updated = updated
        .replace(/path\.join\(\s*__dirname\b/g, 'path.join(process.cwd()')
        .replace(/path\.resolve\(\s*__dirname\b/g, 'path.resolve(process.cwd()');
      log(`Correction ESM automatique : __dirname remplacé par process.cwd() dans server.ts.`);
    }

    // Prevent Express 5 path-to-regexp crash on app.get('*', ...) in production mode
    if (/app\.get\(\s*['"]\/?\*['"]\s*,/.test(updated)) {
      updated = updated.replace(/app\.get\(\s*['"]\/?\*['"]\s*,/g, 'app.use(');
      log(`Compatibilité Express 5 appliquée : app.get('*') converti en app.use() dans server.ts.`);
    }

    // Ensure Express accepts both /api/* and /<subpath>/api/* requests seamlessly
    if (cleanSub && !updated.includes('__als_subpath_strip')) {
      updated = updated.replace(
        /(const\s+app\s*=\s*express\(\s*\)\s*;?)/,
        `$1\n  // __als_subpath_strip\n  app.use((req, _res, next) => { if (req.url.startsWith('${cleanSub}/')) { req.url = req.url.slice(${cleanSub.length}) || '/'; } next(); });`
      );
    }

    if (updated !== code) {
      fs.writeFileSync(serverTsPath, updated, 'utf-8');
      log(`Adaptation automatique de server.ts appliquée (Port ${port} & sous-chemin ${cleanSub}).`);
    }
  }

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
            .replace(/fetch\(\s*`\/api\//g, 'fetch(`api/')
            // Increase aggressive AbortSignal / AbortController timeouts (1s-3s -> 15s) so heavy VM CPU load never triggers NetworkError
            .replace(/AbortSignal\.timeout\(\s*(1\d{3}|2\d{3}|3000)\s*\)/g, 'AbortSignal.timeout(15000)')
            .replace(/\.abort\(\s*\)\s*,\s*(1\d{3}|2\d{3}|3000)\s*\)/g, '.abort(), 15000)');
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
 * Finds any TypeScript worker_threads files (e.g. src/server/simWorker.ts) and bundles them
 * into native Node ESM (.mjs) with esbuild, updating references in src/ and server.ts so
 * Node.js Worker threads never fail with ERR_UNKNOWN_FILE_EXTENSION (.ts).
 */
function compileTypeScriptWorkers(vmPath: string, log: (msg: string) => void) {
  const esbuildBin = path.join(vmPath, 'node_modules', '.bin', 'esbuild');
  if (!fs.existsSync(esbuildBin)) return;

  const workerTsFiles: string[] = [];
  const scanDir = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(full);
      } else if (/worker\.ts$/i.test(entry.name)) {
        workerTsFiles.push(full);
      }
    }
  };
  scanDir(vmPath);

  if (workerTsFiles.length === 0) return;

  const compiledBasenames: Array<{ tsName: string; mjsName: string }> = [];
  for (const wFile of workerTsFiles) {
    const mjsFile = wFile.replace(/\.ts$/, '.mjs');
    try {
      runCmdWithDetails(
        `"${esbuildBin}" "${wFile}" --bundle --platform=node --format=esm --outfile="${mjsFile}"`,
        log
      );
      const tsBase = path.basename(wFile);
      const mjsBase = path.basename(mjsFile);
      compiledBasenames.push({ tsName: tsBase, mjsName: mjsBase });
      log(`Worker multi-cœurs pré-compilé en JS natif : ${tsBase} -> ${mjsBase}`);
    } catch (e: any) {
      log(`Note compilation worker ${path.basename(wFile)} : ${e.message}`);
    }
  }

  if (compiledBasenames.length === 0) return;

  const rewriteWorkerRefs = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        rewriteWorkerRefs(full);
      } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
        let content = fs.readFileSync(full, 'utf-8');
        let changed = false;
        for (const { tsName, mjsName } of compiledBasenames) {
          if (content.includes(tsName)) {
            content = content.split(tsName).join(mjsName);
            changed = true;
          }
        }
        if (changed) {
          fs.writeFileSync(full, content, 'utf-8');
        }
      }
    }
  };
  rewriteWorkerRefs(vmPath);
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
  validateTool(tool);
  if (isAmazonia(tool)) {
    const {node} = amazoniaRuntime();
    if(!fs.existsSync(path.join(tool.vmPath,'server.ts')) || !fs.existsSync(path.join(tool.vmPath,'package.json'))) throw new Error('Backend Amazonia requis');
    const nodeDir=path.dirname(node);
    runCmdWithDetails(`cd "${tool.vmPath}" && PATH="${nodeDir}:$PATH" npm install --include=dev --legacy-peer-deps && PATH="${nodeDir}:$PATH" npm run build`, log);
    tool.stackPreset='node';
    tool.execStart=`${node} --import tsx server.ts`;
    const unit=generateSystemdUnitFile(tool);
    const temporary=fs.mkdtempSync('/tmp/amazonia-unit-');
    try {
      fs.writeFileSync(path.join(temporary,'unit'),unit,{mode:0o600});
      runCmdWithDetails(`sudo install -m 644 "${temporary}/unit" /etc/systemd/system/${tool.systemdUnit} && sudo systemctl daemon-reload && sudo systemctl enable ${tool.systemdUnit} && sudo systemctl restart ${tool.systemdUnit}`,log);
    } finally {fs.rmSync(temporary,{recursive:true,force:true});}
    // Do not patch sources, compile workers heuristically, kill a port or downgrade to static.
    tool.status=isPortListening(tool.port)?'active':'stopped';
    if(tool.status!=='active') throw new Error('Backend Amazonia non démarré');
    syncCaddyConfig(log); saveToolsRegistry(toolsState); return;
  }

  const cleanSub = tool.subpath.replace(/\/+$/, '');
  const pkgJsonPath = path.join(tool.vmPath, 'package.json');
  const appPyPath = path.join(tool.vmPath, 'app.py');
  const mainPyPath = path.join(tool.vmPath, 'main.py');
  const pythonBin = fs.existsSync('/home/opc/venv/bin/python3')
    ? '/home/opc/venv/bin/python3'
    : '/usr/bin/python3';

  let useNodeBackend = false;

  if (fs.existsSync(pkgJsonPath)) {
    log(`Projet Node.js détecté dans ${tool.vmPath}.`);
    tool.stackPreset = 'node';

    const hasViteConfig =
      fs.existsSync(path.join(tool.vmPath, 'vite.config.ts')) ||
      fs.existsSync(path.join(tool.vmPath, 'vite.config.js')) ||
      fs.existsSync(path.join(tool.vmPath, 'src'));

    const srcIndexHtml = path.join(tool.vmPath, 'index.html');
    if (fs.existsSync(srcIndexHtml) && hasViteConfig) {
      const content = fs.readFileSync(srcIndexHtml, 'utf-8');
      if (content.includes('<base href=')) {
        fs.writeFileSync(
          srcIndexHtml,
          content.replace(/<base href="[^"]*">\s*/g, ''),
          'utf-8'
        );
      }
    }

    patchNodeServerAndClientForSubpath(tool.vmPath, tool.port, cleanSub, log);
    if (autoSubpathPatch && fs.existsSync(path.join(tool.vmPath, 'templates', 'index.html'))) {
      applySubpathPatchInDirectory(tool.vmPath, cleanSub);
    }

    if (hasViteConfig) {
      const distDir = path.join(tool.vmPath, 'dist');
      const backupDist = `/tmp/dist_backup_${tool.id}`;
      if (fs.existsSync(distDir)) {
        try {
          execSync(`rm -rf "${backupDist}" && cp -r "${distDir}" "${backupDist}"`);
        } catch {
          // ignore
        }
      }

      const buildCmd = `NODE_ENV=development npm install --include=dev --legacy-peer-deps && ./node_modules/.bin/vite build --base=${cleanSub}/`;
      tool.buildCmd = buildCmd;
      log(`Installation npm (avec devDependencies) et compilation Vite (--base=${cleanSub}/) en cours...`);
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
    } else {
      const installCmd = `NODE_ENV=development npm install --include=dev --legacy-peer-deps`;
      tool.buildCmd = installCmd;
      log(`Installation des dépendances Node.js (Express/Sharp sans Vite) en cours...`);
      runCmdWithDetails(`cd "${tool.vmPath}" && ${installCmd}`, log);
    }

    // Pre-compile any TypeScript worker_threads (e.g., simWorker.ts -> simWorker.mjs)
    compileTypeScriptWorkers(tool.vmPath, log);

    const serverTsFile = path.join(tool.vmPath, 'server.ts');
    const hasServerTs = fs.existsSync(serverTsFile);
    if (hasServerTs) {
      const sContent = fs.readFileSync(serverTsFile, 'utf-8');
      useNodeBackend = /['"`]\/?api\b|apiRouter|express\s*\(/.test(sContent);
    }

    if (useNodeBackend) {
      // Important: On Oracle Linux (SELinux Enforcing), systemd ExecStart must invoke /bin/bash (bin_t),
      // register tsx for any dynamic worker imports, and allocate 8GB heap for 16-vCPU campaigns.
      tool.execStart = `/bin/bash -lc "NODE_OPTIONS='--import tsx --max-old-space-size=8192' exec ./node_modules/.bin/tsx server.ts"`;
      log(`Backend Node.js / Express (server.ts) détecté -> démarrage sur le port ${tool.port}.`);
    } else {
      tool.execStart = `/usr/bin/python3 -m http.server ${tool.port} --bind 127.0.0.1 --directory ${tool.vmPath}/dist`;
      log(`Application Vite SPA pure -> servie sur 127.0.0.1:${tool.port} depuis ${tool.vmPath}/dist.`);
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

  const unitContent = generateSystemdUnitFile(tool);
  fs.writeFileSync(`/tmp/${tool.systemdUnit}`, unitContent, 'utf-8');
  runCmdWithDetails(
    `sudo tee /etc/systemd/system/${tool.systemdUnit} < /tmp/${tool.systemdUnit} > /dev/null && sudo chown root:root /etc/systemd/system/${tool.systemdUnit} && sudo chmod 644 /etc/systemd/system/${tool.systemdUnit} && (sudo restorecon -F /etc/systemd/system/${tool.systemdUnit} || true) && sudo systemctl daemon-reload && sudo systemctl enable ${tool.systemdUnit}`,
    log
  );

  // Stop existing service and free the TCP port in case an old python3 http.server is still holding it
  try {
    execSync(`sudo systemctl stop ${tool.systemdUnit} || true`);
    execSync(`sudo fuser -k ${tool.port}/tcp || true`);
  } catch {
    // ignore
  }

  runCmdWithDetails(`sudo systemctl restart ${tool.systemdUnit}`, log);

  let listening = false;
  for (let attempt = 1; attempt <= 12; attempt++) {
    execSync('sleep 1');
    if (isPortListening(tool.port)) {
      listening = true;
      break;
    }
  }

  if (!listening) {
    try {
      const crashLogs = execSync(
        `sudo journalctl -u ${tool.systemdUnit} -n 25 --no-pager -o cat`,
        { encoding: 'utf-8' }
      ).trim();
      if (crashLogs) {
        log(`Journal systemd (${tool.systemdUnit}) :\n${crashLogs}`);
      }
    } catch {
      // ignore
    }

    // NEVER fallback to python3 http.server if the project has a Node.js backend (server.ts),
    // because SimpleHTTP Python returns 404 on /api/* and forces local browser fallback!
    const distIndex = path.join(tool.vmPath, 'dist', 'index.html');
    if (!useNodeBackend && fs.existsSync(distIndex)) {
      log(
        `Auto-réparation SPA sans backend : bascule sur le serveur statique dist/ (port ${tool.port}).`
      );
      tool.execStart = `/usr/bin/python3 -m http.server ${tool.port} --bind 127.0.0.1 --directory ${tool.vmPath}/dist`;
      const fallbackUnit = generateSystemdUnitFile(tool);
      fs.writeFileSync(`/tmp/${tool.systemdUnit}`, fallbackUnit, 'utf-8');
      runCmdWithDetails(
        `sudo tee /etc/systemd/system/${tool.systemdUnit} < /tmp/${tool.systemdUnit} > /dev/null && sudo chown root:root /etc/systemd/system/${tool.systemdUnit} && sudo chmod 644 /etc/systemd/system/${tool.systemdUnit} && (sudo restorecon -F /etc/systemd/system/${tool.systemdUnit} || true) && sudo systemctl daemon-reload && sudo systemctl restart ${tool.systemdUnit}`,
        log
      );
      execSync('sleep 1');
    }
  } else if (useNodeBackend) {
    // Verify that Express (not SimpleHTTP Python) is answering on the port and log its JSON health payload
    try {
      const healthBody = execSync(
        `curl -s -m 4 http://127.0.0.1:${tool.port}/api/health || true`,
        { encoding: 'utf-8' }
      ).trim();
      if (healthBody) {
        log(`Réponse JSON GET http://127.0.0.1:${tool.port}/api/health : ${healthBody.slice(0, 260)}`);
      }
    } catch {
      // ignore
    }
  }

  syncCaddyConfig(log);

  if (isPortListening(tool.port)) {
    tool.status = 'active';
    log(`Vérification OK : le port ${tool.port} répond bien (${cleanSub}/ opérationnel).`);
  } else {
    tool.status = 'stopped';
    log(`Attention : aucun processus n'écoute encore sur le port ${tool.port}.`);
  }
}

export async function createPortalApp(tools?: ToolItem[], web=true) {
  if (tools) toolsState = structuredClone(tools);
  for (const tool of toolsState) validateTool(tool);
  const app = express();
  app.disable("x-powered-by");
  // Only unrelated tool flows may use forms/binary bodies and their own cache policy.
  app.use(internalGuard((requestPath) => !toolsState.some(t =>
    !isAmazonia(t) && (requestPath === t.subpath || requestPath.startsWith(t.subpath + "/"))
  )));

  app.use(express.json({ limit: '256kb' }));

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
    if (!actions.has(action)) {res.status(400).json({error:'Action non autorisée'});return;}
    const toolIdx = toolsState.findIndex((t) => t.id === id);
    if (toolIdx === -1) {
      res.status(404).json({ error: 'Outil introuvable' });
      return;
    }

    const tool = toolsState[toolIdx];
    try { validateTool(tool); } catch {res.status(400).json({error:'Outil invalide'});return;}
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
      syncCaddyConfig();
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
      log(`=== Diagnostic & Réparation lancé pour ${tool.name} (${tool.subpath}/ -> Port ${tool.port}) ===`);

      if (isOracleVm) {
        try {
          const hasFiles =
            fs.existsSync(tool.vmPath) &&
            fs.readdirSync(tool.vmPath).filter((f) => f !== '.git').length > 0;

          if (!hasFiles) {
            log(`Dossier ${tool.vmPath} vide ou absent -> clonage depuis GitHub (${tool.repo})...`);
            const rev = cloneOrUpdateGitRepo(tool.repo, tool.branch, tool.vmPath, log);
            tool.commitHash = rev;
          } else {
            const files = fs.readdirSync(tool.vmPath).join(', ');
            log(`Fichiers présents dans ${tool.vmPath} : ${files}`);
            if (fs.existsSync(path.join(tool.vmPath, '.git'))) {
              try {
                tool.commitHash = execSync(
                  `git -C "${tool.vmPath}" rev-parse --short HEAD`,
                  { encoding: 'utf-8' }
                ).trim();
              } catch {
                // ignore
              }
            }
          }

          try {
            const preHealth = execSync(
              `curl -i -s -m 4 http://127.0.0.1:${tool.port}/api/health || echo "TIMEOUT_OR_REFUSED"`,
              { encoding: 'utf-8' }
            ).trim();
            log(`État direct 127.0.0.1:${tool.port}/api/health avant réparation :\n${preHealth.slice(0, 350)}`);
          } catch {
            // ignore
          }

          try {
            const caddyHealth = execSync(
              `curl -i -s -k -m 4 https://127.0.0.1${tool.subpath}/api/health -H "Host: atelierconceptionjeu.fr" || echo "CADDY_TIMEOUT_OR_REFUSED"`,
              { encoding: 'utf-8' }
            ).trim();
            log(`État via Caddy https://atelierconceptionjeu.fr${tool.subpath}/api/health avant réparation :\n${caddyHealth.slice(0, 350)}`);
          } catch {
            // ignore
          }

          try {
            const jOut = execSync(
              `sudo journalctl -u ${tool.systemdUnit} -n 30 --no-pager -o cat`,
              { encoding: 'utf-8' }
            ).trim();
            if (jOut) {
              log(`Derniers logs systemd (${tool.systemdUnit}) avant redémarrage :\n${jOut}`);
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
    if(body.source!=='git') {res.status(409).json({error:'ZIP désactivé : préparation manuelle en staging requise'});return;}
    const tool = toolsState.find((t) => t.id === id);
    if (!tool) {
      res.status(404).json({ error: 'Outil introuvable' });
      return;
    }

    try {validateTool(tool);} catch {res.status(400).json({error:'Outil invalide'});return;}
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
          const rev = cloneOrUpdateGitRepo(tool.repo, tool.branch, tool.vmPath, log);
          tool.commitHash = rev || tool.commitHash;

          autoDetectBuildAndStartService(tool, Boolean(body.autoSubpathPatch), log);

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
    if(body.initialSource!=='git' || body.stackPreset==='custom') {res.status(409).json({error:'Création Git avec recette détectée uniquement'});return;}
    if(typeof body.id!=='string'||! /^[a-z0-9][a-z0-9-]{0,63}$/.test(body.id)||typeof body.name!=='string'||typeof body.repo!=='string'||typeof body.subpath!=='string') {res.status(400).json({error:'Champs invalides'});return;}
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
      execStart: '', // HTTP cannot select a shell command. Stack detection owns this recipe.
      buildCmd: '',
      status: 'active',
      logs: [`[${nowTime()}] Création de l'outil ${body.name} sur ${cleanSubpath} (port ${body.port}).`],
    };

    const stepLogs: string[] = [];
    const log = (msg: string) => {
      const entry = `[${nowTime()}] ${msg}`;
      stepLogs.push(entry);
      newTool.logs.push(entry);
    };

    try { validateTool(newTool); } catch {res.status(400).json({error:'Configuration invalide'});return;}
    if(toolsState.some(t=>t.port===newTool.port||t.subpath===newTool.subpath||t.vmPath===newTool.vmPath)) {res.status(400).json({error:'Collision outil'});return;}
    toolsState.push(newTool);
    saveToolsRegistry(toolsState);

    try {
      if (isOracleVm) {
        if (body.initialSource === 'git') {
          const rev = cloneOrUpdateGitRepo(newTool.repo, newTool.branch, vmPath, log);
          newTool.commitHash = rev;
        }

        autoDetectBuildAndStartService(newTool, Boolean(body.autoSubpathPatch), log);
        saveToolsRegistry(toolsState);
      } else {
        log(`[Aperçu] Dossier ${vmPath} préparé.`);
        log(`[Aperçu] Service /etc/systemd/system/${systemdUnit} activé sur le port ${newTool.port}.`);
        log(`[Aperçu] Route Caddy ${cleanSubpath}/* à préparer et activer manuellement.`);
        saveToolsRegistry(toolsState);
      }

      res.json({ tool: newTool, tools: toolsState, stepLogs });
    } catch (err: any) {
      log(`Attention : ${err.message}`);
      syncCaddyConfig(log);
      saveToolsRegistry(toolsState);
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
        `cd "${portalDir}" && git fetch origin main && git reset --hard origin/main && NODE_ENV=development npm install --include=dev --legacy-peer-deps && npm run build`
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

  // 6. Explicit subpath proxy only. The authenticated entry is mandatory; no Referer fallback.
  app.use((req, res, next) => {
    let matchedTool = toolsState.find((t) => {
      const cleanSub = t.subpath.replace(/\/+$/, '');
      if (!cleanSub) return false;
      return req.path === cleanSub || req.path.startsWith(`${cleanSub}/`);
    });

    let targetPath = req.originalUrl;

    if (matchedTool) {
      const cleanSub = matchedTool.subpath.replace(/\/+$/, '');
      if (req.path === cleanSub && !req.originalUrl.startsWith(`${cleanSub}/`)) {
        res.redirect(302, `${cleanSub}/`);
        return;
      }
      targetPath = req.originalUrl.slice(cleanSub.length) || '/';
    }

    if (!matchedTool) {
      next();
      return;
    }

    const cleanSub = matchedTool.subpath.replace(/\/+$/, '');
    const strippedUrl = targetPath;

    const proxyReq = http.request(
      {
        hostname: '127.0.0.1',
        port: matchedTool.port,
        path: strippedUrl,
        method: req.method,
        headers: {
          ...proxyHeaders(req.headers, isAmazonia(matchedTool)),
          host: `127.0.0.1:${matchedTool.port}`,
          'x-forwarded-prefix': cleanSub,
        },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      }
    );

    proxyReq.on('error', () => {
      res.status(502).send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>${matchedTool.name} — Déploiement / Réparation en cours</title>
  <style>
    body { background: #0B0F17; color: #F1F5F9; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
    .card { max-width: 560px; width: 100%; background: #0F172A; border: 1px solid #1E293B; border-radius: 14px; padding: 28px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
    .badge { color: #F59E0B; font-family: monospace; font-size: 12px; font-weight: 600; margin-bottom: 8px; }
    h1 { font-size: 20px; margin: 0 0 10px 0; }
    p { font-size: 13px; color: #94A3B8; line-height: 1.6; margin: 0 0 20px 0; }
    .btn { background: #10B981; color: #020617; border: none; padding: 11px 18px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; }
    .btn:disabled { opacity: 0.6; cursor: wait; }
    .btn-sec { background: #1E293B; color: #E2E8F0; margin-left: 10px; }
    pre { background: #020617; border: 1px solid #1E293B; padding: 12px; border-radius: 8px; font-size: 11px; color: #CBD5E1; overflow-x: auto; max-height: 220px; margin-top: 16px; display: none; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${matchedTool.subpath}/ · Port ${matchedTool.port} non démarré</div>
    <h1>Initialisation de « ${matchedTool.name} » requise</h1>
    <p>Le service <code>${matchedTool.systemdUnit}</code> (port <code>${matchedTool.port}</code>) n'écoute pas encore sur la VM (le clonage initial dans <code>${matchedTool.vmPath}</code> ou le build Vite doit être finalisé).</p>
    <div>
      <button id="repairBtn" class="btn" onclick="runRepair()">⚡ Cloner, Compiler & Démarrer ${matchedTool.name}</button>
      <a href="/" class="btn btn-sec">← Retour au Portail</a>
    </div>
    <pre id="logBox"></pre>
  </div>
  <script>
    async function runRepair() {
      const btn = document.getElementById('repairBtn');
      const box = document.getElementById('logBox');
      btn.disabled = true;
      btn.textContent = 'Installation & Compilation Vite en cours (patientez ~20s)...';
      box.style.display = 'block';
      box.textContent = 'Préparation ciblée du répertoire de l’outil, clonage GitHub (' + ${JSON.stringify(matchedTool.repo)} + ') et compilation Vite...';
      try {
        const res = await fetch('/api/tools/${matchedTool.id}/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'diagnose' })
        });
        const data = await res.json();
        if (data.tool && data.tool.logs) {
          box.textContent = data.tool.logs.slice(-18).join('\\n');
        }
        setTimeout(() => window.location.reload(), 1500);
      } catch (e) {
        box.textContent = 'Erreur : ' + e.message;
        btn.disabled = false;
      }
    }
  </script>
</body>
</html>`);
    });

    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
      const bodyStr = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyStr));
      proxyReq.write(bodyStr);
      proxyReq.end();
    } else {
      req.pipe(proxyReq, { end: true });
    }
  });

  app.use((err: any, _req: any, res: any, _next: any) => res.status(err.type==='entity.too.large'?413:400).json({error:'Requête invalide'}));
  if (!web) return app;
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

  app.use((err: any, _req: any, res: any, _next: any) => res.status(err.type==='entity.too.large'?413:400).json({error:'Requête invalide'}));
  return app;
}
async function startServer() {
  toolsState = loadToolsRegistry();
  const app = await createPortalApp();
  app.listen(3000, '127.0.0.1', () => console.log('Portail actif sur loopback:3000'));
  // No automatic deployments or Caddy rewrites on startup.
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) void startServer();
