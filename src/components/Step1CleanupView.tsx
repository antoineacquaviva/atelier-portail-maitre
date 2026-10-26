import React, { useState } from 'react';
import { Copy, Check, Download, Terminal, Trash2, Archive, ShieldCheck } from 'lucide-react';
import { generateStep1CleanupScript, type CleanupOptions } from '../data/scriptsData';

interface Step1CleanupViewProps {
  step1Completed: boolean;
  onToggleStep1Completed: (completed: boolean) => void;
}

export const Step1CleanupView: React.FC<Step1CleanupViewProps> = ({
  step1Completed,
  onToggleStep1Completed,
}) => {
  const [options, setOptions] = useState<CleanupOptions>({
    createBackupTar: true,
    killNodeProcesses: true,
    resetCaddyRoot: true,
  });
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const scriptContent = generateStep1CleanupScript(options);
  const oneLinerCmd = `ssh opc@141.145.218.127 "bash -s" < .\\step1_cleanup_projet_jeu.sh`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(scriptContent);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const handleCopyOneLiner = () => {
    navigator.clipboard.writeText(oneLinerCmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const handleDownloadScript = () => {
    const blob = new Blob([scriptContent], { type: 'text/x-shellscript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'step1_cleanup_projet_jeu.sh';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="space-y-2 max-w-3xl">
          <div className="flex items-center gap-2 text-xs text-amber-400 font-medium">
            <span>Étape préalable autonome</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">VM 141.145.218.127</span>
            <span aria-hidden="true">·</span>
            <span>Cible : antoineacquaviva/Projet_Jeu</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            01. Désinstallation de « l’Atelier de Conception » (Projet_Jeu) sur la VM
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Ce script indépendant nettoie proprement l’ancien site monolithique actuellement exposé à la racine de{' '}
            <span className="font-mono text-slate-200">https://atelierconceptionjeu.fr/</span>. Il laisse intacts votre dépôt GitHub{' '}
            <span className="font-mono text-slate-300">antoineacquaviva/Projet_Jeu</span> (pour conserver vos idées et votre historique) ainsi que{' '}
            <span className="font-mono text-slate-300">lora-factory</span> et{' '}
            <span className="font-mono text-slate-300">foret-automate-lab</span> sur la VM.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
          <button
            onClick={() => onToggleStep1Completed(!step1Completed)}
            className={`px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center justify-center gap-2 border ${
              step1Completed
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            {step1Completed ? 'Étape 1 marquée comme terminée' : 'Marquer l’Étape 1 comme exécutée'}
          </button>
        </div>
      </div>

      {/* Options & SSH One-Liner Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Configuration of Cleanup Script */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-100">
              Options de sécurité du script de nettoyage
            </h2>
            <p className="text-xs text-slate-400">
              Ajustez le comportement du script avant de le télécharger ou de l’exécuter en SSH depuis votre PC Windows 11.
            </p>

            <div className="space-y-3 pt-2">
              <label className="flex items-start gap-3 p-3.5 rounded-lg bg-slate-950/70 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={options.createBackupTar}
                  onChange={(e) => setOptions({ ...options, createBackupTar: e.target.checked })}
                  className="mt-0.5 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                />
                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-200 flex items-center gap-2">
                    <Archive className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Créer une archive .tar.gz de sécurité avant suppression</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Sauvegarde le dossier (hors <span className="font-mono">node_modules</span>) dans{' '}
                    <span className="font-mono text-slate-300">/home/opc/archives_avant_refonte/</span> au cas où une configuration locale non poussée sur Git s’y trouverait.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-lg bg-slate-950/70 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={options.killNodeProcesses}
                  onChange={(e) => setOptions({ ...options, killNodeProcesses: e.target.checked })}
                  className="mt-0.5 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                />
                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-200 flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Tuer les processus Node / PM2 liés à Projet_Jeu</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Libère immédiatement le port occupé par l’ancien atelier (sans impacter Python/Flask sur le port 5050).
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-lg bg-slate-950/70 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={options.resetCaddyRoot}
                  onChange={(e) => setOptions({ ...options, resetCaddyRoot: e.target.checked })}
                  className="mt-0.5 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                />
                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-200 flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>Sauvegarder /etc/caddy/Caddyfile avant bascule</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Crée une copie horodatée <span className="font-mono text-slate-300">Caddyfile.bak.*</span> avant l’installation du nouveau routage multi-outils.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Direct SSH execution box */}
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">
                Exécution directe depuis PowerShell (Windows 11)
              </span>
              <button
                onClick={handleCopyOneLiner}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                {copiedCmd ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedCmd ? 'Commande copiée' : 'Copier la commande SSH'}
              </button>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-emerald-300 overflow-x-auto">
              {oneLinerCmd}
            </div>
            <p className="text-xs text-slate-400">
              1. Téléchargez <span className="font-mono text-slate-300">step1_cleanup_projet_jeu.sh</span> ci-contre.{' '}
              2. Lancez cette commande dans PowerShell depuis le dossier de téléchargement.
            </p>
          </div>
        </div>

        {/* Right: Generated Bash Script */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-100 font-mono">
                step1_cleanup_projet_jeu.sh
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Script Bash autonome · Cible : <span className="font-mono text-slate-300">opc@141.145.218.127</span>
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={handleCopyScript}
                className="px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedScript ? 'Script copié' : 'Copier le script'}
              </button>
              <button
                onClick={handleDownloadScript}
                className="px-3.5 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Télécharger .sh
              </button>
            </div>
          </div>

          <pre className="bg-slate-950 border border-slate-800/90 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-[460px] leading-relaxed">
            {scriptContent}
          </pre>
        </div>
      </div>
    </div>
  );
};
