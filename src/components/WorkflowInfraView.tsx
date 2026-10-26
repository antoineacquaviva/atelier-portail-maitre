import React, { useState } from 'react';
import { Copy, Check, Download, Terminal, Server, Laptop, GitBranch, Sparkles, Image as ImageIcon } from 'lucide-react';
import {
  CADDYFILE_CONFIG,
  SYSTEMD_UNITS,
  POWERSHELL_WORKFLOW_SCRIPT,
  VM_BOOTSTRAP_SCRIPT,
} from '../data/scriptsData';

export const WorkflowInfraView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'guide' | 'powershell' | 'caddy' | 'systemd' | 'vm-bootstrap' | 'captures'>('guide');
  const [selectedUnit, setSelectedUnit] = useState<string>('foret-lab.service');
  const [copied, setCopied] = useState(false);

  const getCurrentCode = () => {
    if (activeTab === 'powershell') return POWERSHELL_WORKFLOW_SCRIPT;
    if (activeTab === 'caddy') return CADDYFILE_CONFIG;
    if (activeTab === 'systemd') return SYSTEMD_UNITS[selectedUnit]?.content || '';
    if (activeTab === 'vm-bootstrap') return VM_BOOTSTRAP_SCRIPT;
    return '';
  };

  const getCurrentFilename = () => {
    if (activeTab === 'powershell') return 'Jeu-Workflow.ps1';
    if (activeTab === 'caddy') return 'Caddyfile';
    if (activeTab === 'systemd') return selectedUnit;
    if (activeTab === 'vm-bootstrap') return 'bootstrap_vm_architecture.sh';
    return 'config.txt';
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getCurrentCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const content = getCurrentCode();
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getCurrentFilename();
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-2">
        <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
          <span>Architecture cible standardisée</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono">C:\Dev\Jeu\</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono">github.com/antoineacquaviva/*</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono">/srv/jeu/*</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
          03. Workflow Unifié (Gemini ➔ Windows 11 / Ubuntu ➔ GitHub ➔ VM Oracle)
        </h1>
        <p className="text-sm text-slate-400 max-w-4xl leading-relaxed">
          Pour mettre fin aux dépôts dispersés sur votre PC et aux versions désynchronisées entre la VM et GitHub, chaque outil dispose désormais d’un emplacement miroir strict entre votre poste local et la VM Oracle.
        </p>
      </div>

      {/* 4-Step Pipeline Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-mono text-emerald-400 font-semibold">Étape A</span>
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-100">
              1. Fils de discussion Gemini
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Vous itérez avec Gemini sur un outil précis (<span className="font-mono text-slate-300">foret-automate-lab</span>,{' '}
              <span className="font-mono text-slate-300">lora-factory</span>,{' '}
              <span className="font-mono text-slate-300">bga-studio</span>). Vous téléchargez l’archive ZIP générée dans{' '}
              <span className="font-mono text-slate-200">C:\Dev\Jeu\gemini-inbox\</span>.
            </p>
          </div>
          <div className="pt-3 border-t border-slate-800/80 text-[11px] font-mono text-slate-400">
            Règle d’or : 1 fil Gemini = 1 outil ciblé
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-mono text-emerald-400 font-semibold">Étape B</span>
              <Laptop className="w-4 h-4 text-sky-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-100">
              2. PC Windows 11 (et Ubuntu)
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Tous les dépôts sont rangés sous <span className="font-mono text-slate-200">C:\Dev\Jeu\&lt;outil&gt;</span> (et{' '}
              <span className="font-mono text-slate-200">~/Dev/Jeu/&lt;outil&gt;</span> sur Ubuntu). Le script{' '}
              <span className="font-mono text-slate-300">Jeu-Workflow.ps1</span> décompresse l’archive Gemini sans écraser <span className="font-mono">.git</span> ni vos datasets.
            </p>
          </div>
          <div className="pt-3 border-t border-slate-800/80 text-[11px] font-mono text-slate-400">
            .\Jeu-Workflow.ps1 -Action ImportGeminiZip
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-mono text-emerald-400 font-semibold">Étape C</span>
              <GitBranch className="w-4 h-4 text-amber-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-100">
              3. GitHub (Source de vérité)
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Chaque outil possède son dépôt propre sous <span className="font-mono text-slate-200">github.com/antoineacquaviva/</span>. On pousse depuis Windows 11 vers <span className="font-mono">origin/main</span>. On ne modifie jamais le code directement sur la VM.
            </p>
          </div>
          <div className="pt-3 border-t border-slate-800/80 text-[11px] font-mono text-slate-400">
            4 dépôts actifs + Projet_Jeu en archive
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-mono text-emerald-400 font-semibold">Étape D</span>
              <Server className="w-4 h-4 text-emerald-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-100">
              4. VM Oracle (141.145.218.127)
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              La VM ne fait que <span className="font-mono text-slate-200">git pull --ff-only</span> +{' '}
              <span className="font-mono text-slate-200">systemctl restart</span> dans <span className="font-mono">/srv/jeu/&lt;outil&gt;</span>, déclenché en 1 clic depuis ce Portail Web ou via PowerShell SSH.
            </p>
          </div>
          <div className="pt-3 border-t border-slate-800/80 text-[11px] font-mono text-slate-400">
            Routage HTTPS Caddy : / · /lab · /lora · /bga
          </div>
        </div>
      </div>

      {/* Directory Alignment Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">
            Table d’alignement des chemins (Windows 11 · Ubuntu · GitHub · VM Oracle · Caddy)
          </h2>
          <span className="text-xs text-slate-400 font-mono">Utilisateur VM : opc</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/50">
                <th className="py-3 px-4 font-medium">Projet / Outil</th>
                <th className="py-3 px-4 font-medium">PC Windows 11</th>
                <th className="py-3 px-4 font-medium">Dépôt GitHub</th>
                <th className="py-3 px-4 font-medium">Chemin VM Oracle</th>
                <th className="py-3 px-4 font-medium">Unité systemd & Port</th>
                <th className="py-3 px-4 font-medium">URL Publique Caddy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-mono tabular-nums">
              <tr className="hover:bg-slate-800/40">
                <td className="py-3 px-4 font-sans font-semibold text-slate-100">Portail Maître (Ce projet)</td>
                <td className="py-3 px-4 text-slate-300">C:\Dev\Jeu\atelier-portail-maitre</td>
                <td className="py-3 px-4 text-slate-300">antoineacquaviva/atelier-portail-maitre</td>
                <td className="py-3 px-4 text-slate-300">/srv/jeu/atelier-portail-maitre</td>
                <td className="py-3 px-4 text-slate-300">atelier-portail.service · :3000</td>
                <td className="py-3 px-4 text-emerald-400">atelierconceptionjeu.fr/</td>
              </tr>
              <tr className="hover:bg-slate-800/40">
                <td className="py-3 px-4 font-sans font-semibold text-slate-100">Forêt Automate Lab</td>
                <td className="py-3 px-4 text-slate-300">C:\Dev\Jeu\foret-automate-lab</td>
                <td className="py-3 px-4 text-slate-300">antoineacquaviva/foret-automate-lab</td>
                <td className="py-3 px-4 text-slate-300">/srv/jeu/foret-automate-lab</td>
                <td className="py-3 px-4 text-slate-300">foret-lab.service · :8080</td>
                <td className="py-3 px-4 text-emerald-400">atelierconceptionjeu.fr/lab/</td>
              </tr>
              <tr className="hover:bg-slate-800/40">
                <td className="py-3 px-4 font-sans font-semibold text-slate-100">LoRA Factory v2</td>
                <td className="py-3 px-4 text-slate-300">C:\Dev\Jeu\lora-factory</td>
                <td className="py-3 px-4 text-slate-300">antoineacquaviva/lora-factory</td>
                <td className="py-3 px-4 text-slate-300">/srv/jeu/lora-factory (➔ ~/lora-factory)</td>
                <td className="py-3 px-4 text-slate-300">lora-studio.service · :5050</td>
                <td className="py-3 px-4 text-emerald-400">atelierconceptionjeu.fr/lora/</td>
              </tr>
              <tr className="hover:bg-slate-800/40">
                <td className="py-3 px-4 font-sans font-semibold text-slate-100">BGA Studio Sandbox</td>
                <td className="py-3 px-4 text-slate-300">C:\Dev\Jeu\bga-studio</td>
                <td className="py-3 px-4 text-slate-300">antoineacquaviva/bga-studio</td>
                <td className="py-3 px-4 text-slate-300">/srv/jeu/bga-studio</td>
                <td className="py-3 px-4 text-slate-300">bga-studio.service · :8082</td>
                <td className="py-3 px-4 text-emerald-400">atelierconceptionjeu.fr/bga/</td>
              </tr>
              <tr className="hover:bg-slate-800/40 bg-slate-950/30">
                <td className="py-3 px-4 font-sans font-medium text-slate-400">Ancien Atelier (Archivé)</td>
                <td className="py-3 px-4 text-slate-500">C:\Dev\Jeu\archives\Projet_Jeu</td>
                <td className="py-3 px-4 text-slate-500">antoineacquaviva/Projet_Jeu</td>
                <td className="py-3 px-4 text-amber-400/90">Supprimé de la VM (Étape 1)</td>
                <td className="py-3 px-4 text-slate-500">Désactivé</td>
                <td className="py-3 px-4 text-slate-500">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive Configuration & Script Explorer */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg">
            {[
              { id: 'guide', label: 'Guide Pas-à-Pas (PC ➔ Git ➔ VM)', icon: Sparkles },
              { id: 'powershell', label: 'PowerShell Windows 11 (Jeu-Workflow.ps1)', icon: Terminal },
              { id: 'caddy', label: 'Reverse-Proxy (/etc/caddy/Caddyfile)', icon: Server },
              { id: 'systemd', label: 'Unités systemd (.service)', icon: Server },
              { id: 'vm-bootstrap', label: 'Bootstrap VM (/srv/jeu)', icon: GitBranch },
              { id: 'captures', label: 'Vos captures de référence (4)', icon: ImageIcon },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as any)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    activeTab === t.id
                      ? 'bg-slate-800 text-slate-100 shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {activeTab !== 'captures' && activeTab !== 'guide' && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copié' : 'Copier'}
              </button>
              <button
                onClick={handleDownload}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Télécharger {getCurrentFilename()}
              </button>
            </div>
          )}
        </div>

        {activeTab === 'guide' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-5 space-y-3">
              <div className="text-xs font-mono text-emerald-400 font-semibold">
                Phase 1 · Réorganiser les dépôts sur le PC Windows 11
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Ouvrez PowerShell sur votre PC Windows 11 pour créer la structure propre <span className="font-mono">C:\Dev\Jeu\</span>, archiver vos anciens dossiers dispersés et cloner proprement vos dépôts depuis GitHub :
              </p>
              <pre className="bg-slate-900 border border-slate-800 rounded p-3 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">{`# 1. Créer la racine propre C:\\Dev\\Jeu
New-Item -ItemType Directory -Force -Path "C:\\Dev\\Jeu\\archives", "C:\\Dev\\Jeu\\gemini-inbox" | Out-Null
cd C:\\Dev\\Jeu

# 2. Cloner vos dépôts existants au bon endroit
git clone https://github.com/antoineacquaviva/foret-automate-lab.git
git clone https://github.com/antoineacquaviva/lora-factory.git
git clone https://github.com/antoineacquaviva/Projet_Jeu.git C:\\Dev\\Jeu\\archives\\Projet_Jeu`}</pre>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-5 space-y-3">
              <div className="text-xs font-mono text-emerald-400 font-semibold">
                Phase 2 · Pousser ce Portail Orchestrateur sur GitHub
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Dans Google AI Studio (en haut à droite), cliquez sur <strong>Download App (ZIP)</strong> ou sur l’icône GitHub, puis initialisez le dépôt maître <span className="font-mono">atelier-portail-maitre</span> :
              </p>
              <pre className="bg-slate-900 border border-slate-800 rounded p-3 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">{`# 1. Extraire le ZIP téléchargé d'AI Studio vers C:\\Dev\\Jeu\\atelier-portail-maitre
Expand-Archive "$HOME\\Downloads\\atelier-portail-maitre.zip" -DestinationPath "C:\\Dev\\Jeu\\atelier-portail-maitre" -Force
cd C:\\Dev\\Jeu\\atelier-portail-maitre

# 2. Initialiser Git et pousser vers GitHub (créez le repo vide sur github.com/new)
git init -b main
git add -A
git commit -m "feat: initialisation du Portail Maitre Orchestrateur"
git remote add origin https://github.com/antoineacquaviva/atelier-portail-maitre.git
git push -u origin main`}</pre>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-5 space-y-3 lg:col-span-2">
              <div className="text-xs font-mono text-emerald-400 font-semibold">
                Phase 3 · Déployer le Portail et le Reverse-Proxy Caddy sur la VM Oracle (141.145.218.127)
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Une fois l’Étape 1 (nettoyage de <span className="font-mono">Projet_Jeu</span>) exécutée, lancez ce bloc en SSH sur <span className="font-mono">opc@141.145.218.127</span> pour cloner le portail, activer son service <span className="font-mono">systemd</span> et brancher Caddy sur <span className="font-mono">https://atelierconceptionjeu.fr</span> :
              </p>
              <pre className="bg-slate-900 border border-slate-800 rounded p-3 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">{`ssh opc@141.145.218.127

# 1. Préparer /srv/jeu et cloner le portail maître
sudo mkdir -p /srv/jeu && sudo chown -R opc:opc /srv/jeu
ln -sfn /home/opc/lora-factory /srv/jeu/lora-factory
cd /srv/jeu
git clone https://github.com/antoineacquaviva/atelier-portail-maitre.git
cd /srv/jeu/atelier-portail-maitre
npm install && npm run build

# 2. Créer et démarrer le service systemd atelier-portail.service (Port 3000)
sudo tee /etc/systemd/system/atelier-portail.service > /dev/null << 'EOF'
[Unit]
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
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now atelier-portail.service

# 3. Autoriser opc à redémarrer les services depuis le portail web sans mot de passe bloquant
echo "opc ALL=(ALL) NOPASSWD: /usr/bin/systemctl start *, /usr/bin/systemctl stop *, /usr/bin/systemctl restart *, /usr/bin/systemctl status *" | sudo tee /etc/sudoers.d/atelier-portail
sudo chmod 440 /etc/sudoers.d/atelier-portail`}</pre>
            </div>
          </div>
        )}

        {activeTab === 'systemd' && (
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(SYSTEMD_UNITS).map(([unitName, info]) => (
              <button
                key={unitName}
                onClick={() => setSelectedUnit(unitName)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors border whitespace-nowrap shrink-0 ${
                  selectedUnit === unitName
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {unitName}
              </button>
            ))}
            <span className="text-xs text-slate-400 ml-2">
              {SYSTEMD_UNITS[selectedUnit]?.description}
            </span>
          </div>
        )}

        {activeTab === 'powershell' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-1">
              <div className="text-slate-300 font-medium">1. Ranger le PC Windows 11 :</div>
              <code className="text-emerald-400 block font-mono">.\Jeu-Workflow.ps1 -Action InitWorkspace</code>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-1">
              <div className="text-slate-300 font-medium">2. Importer un ZIP Gemini :</div>
              <code className="text-emerald-400 block font-mono">
                .\Jeu-Workflow.ps1 -Action ImportGeminiZip -Project foret-automate-lab -ZipPath .\inbox.zip
              </code>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-1">
              <div className="text-slate-300 font-medium">3. Push GitHub + Déployer VM :</div>
              <code className="text-emerald-400 block font-mono">
                .\Jeu-Workflow.ps1 -Action Deploy -Project foret-automate-lab
              </code>
            </div>
          </div>
        )}

        {activeTab === 'captures' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-2">
              <div className="text-xs font-medium text-slate-300">
                Instance Oracle Cloud : vm-campagne-tests (141.145.218.127 · 8 OCPU · 16 Go)
              </div>
              <img
                src="/assets/aistudio/image_4a09ae8b.png"
                alt="VM Oracle Cloud vm-campagne-tests"
                referrerPolicy="no-referrer"
                className="w-full rounded border border-slate-800 object-contain"
              />
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-2">
              <div className="text-xs font-medium text-slate-300">
                Dépôts GitHub actuels (Projet_Jeu, foret-automate-lab, lora-factory)
              </div>
              <img
                src="/assets/aistudio/image_0b0cdea2.png"
                alt="Dépôts GitHub antoineacquaviva"
                referrerPolicy="no-referrer"
                className="w-full rounded border border-slate-800 object-contain max-h-48"
              />
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-2">
              <div className="text-xs font-medium text-slate-300">
                Architecture technique prévue pour foret-automate-lab (14 workers en os.nice(15))
              </div>
              <img
                src="/assets/aistudio/image_78aae61d.png"
                alt="Architecture foret-automate-lab"
                referrerPolicy="no-referrer"
                className="w-full rounded border border-slate-800 object-contain"
              />
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-2">
              <div className="text-xs font-medium text-slate-300">
                Déploiement systemd et scripts sur 141.145.218.127
              </div>
              <img
                src="/assets/aistudio/image_2d4ed8f4.png"
                alt="Déploiement systemd VM Oracle"
                referrerPolicy="no-referrer"
                className="w-full rounded border border-slate-800 object-contain"
              />
            </div>
          </div>
        ) : activeTab !== 'guide' ? (
          <pre className="bg-slate-950 border border-slate-800/90 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-[500px] leading-relaxed">
            {getCurrentCode()}
          </pre>
        ) : null}
      </div>
    </div>
  );
};
