import React, { useState } from 'react';
import {
  X,
  GitBranch,
  FileArchive,
  Upload,
  CheckCircle2,
  RotateCw,
  AlertCircle,
} from 'lucide-react';
import type { ToolItem, DeployVersionRequest } from '../types';

interface DeployVersionModalProps {
  tool: ToolItem;
  onClose: () => void;
  onSuccess: (updatedTool: ToolItem) => void;
}

export const DeployVersionModal: React.FC<DeployVersionModalProps> = ({
  tool,
  onClose,
  onSuccess,
}) => {
  const [source, setSource] = useState<'git' | 'zip'>(tool.lastSource || 'git');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [commitMessage, setCommitMessage] = useState<string>(
    `feat(${tool.id}): nouvelle version depuis discussion Gemini`
  );
  const [autoSubpathPatch, setAutoSubpathPatch] = useState<boolean>(true);
  const [deploying, setDeploying] = useState<boolean>(false);
  const [stepLogs, setStepLogs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState<boolean>(false);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleDeploy = async () => {
    setDeploying(true);
    setErrorMsg(null);
    setDone(false);
    setStepLogs([`Démarrage du déploiement pour ${tool.name}...`]);

    try {
      const payload: DeployVersionRequest = {
        source,
        autoSubpathPatch,
      };

      if (source === 'zip') {
        if (!zipFile) {
          setErrorMsg('Veuillez sélectionner une archive .zip téléchargée depuis Gemini.');
          setDeploying(false);
          return;
        }
        payload.zipBase64 = await fileToBase64(zipFile);
        payload.zipFileName = zipFile.name;
        payload.commitMessage = commitMessage;
      }

      const res = await fetch(`/api/tools/${tool.id}/deploy-version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.stepLogs) {
        setStepLogs(data.stepLogs);
      }
      if (!res.ok || data.error) {
        setErrorMsg(data.error || 'Une erreur est survenue pendant le déploiement.');
      } else {
        setDone(true);
        if (data.tool) {
          onSuccess(data.tool);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erreur réseau lors du déploiement.');
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="text-xs font-mono text-emerald-400">
              {tool.subpath} · {tool.repo}
            </div>
            <h2 className="text-lg font-bold text-slate-100 mt-0.5">
              Déployer une nouvelle version — {tool.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Source Selector */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-300">
            D’où provient cette nouvelle version ? (Vous pouvez alterner librement entre les deux sources)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setSource('git')}
              className={`p-4 rounded-xl border text-left transition-colors space-y-1.5 ${
                source === 'git'
                  ? 'bg-emerald-500/10 border-emerald-500/50 text-slate-100'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <GitBranch className="w-4 h-4" />
                <span>Source 1 : Google AI Studio (GitHub)</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Vous avez poussé vos modifications sur GitHub depuis AI Studio. La VM fait <span className="font-mono">git pull</span> et redémarre l’outil.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSource('zip')}
              className={`p-4 rounded-xl border text-left transition-colors space-y-1.5 ${
                source === 'zip'
                  ? 'bg-emerald-500/10 border-emerald-500/50 text-slate-100'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <FileArchive className="w-4 h-4" />
                <span>Source 2 : Discussion Gemini (.zip)</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Téléversez directement le <span className="font-mono">.zip</span> ici (0 dépôt requis sur PC). La VM déploie l’archive et pousse sur GitHub.
              </p>
            </button>
          </div>
        </div>

        {/* Source 1 Details */}
        {source === 'git' ? (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-300 font-mono">
              <span>Dépôt GitHub cible :</span>
              <span className="text-emerald-400">https://github.com/{tool.repo}</span>
            </div>
            <div className="flex items-center justify-between text-slate-300 font-mono">
              <span>Dossier sur la VM :</span>
              <span>{tool.vmPath} (branche {tool.branch})</span>
            </div>
            <p className="text-slate-400 pt-1">
              Assurez-vous d’avoir cliqué sur <strong>Save to GitHub</strong> dans Google AI Studio avant de lancer la mise à jour ci-dessous.
            </p>
          </div>
        ) : (
          /* Source 2: ZIP Upload */
          <div className="space-y-4">
            <label className="block border-2 border-dashed border-slate-700 hover:border-emerald-500/50 rounded-xl p-6 text-center cursor-pointer bg-slate-950/60 transition-colors">
              <input
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setZipFile(f);
                }}
              />
              <Upload className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
              {zipFile ? (
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-emerald-300 font-mono">
                    {zipFile.name}
                  </div>
                  <div className="text-xs text-slate-400 font-mono tabular-nums">
                    {(zipFile.size / 1024).toFixed(1)} Ko · Cliquez pour changer de fichier
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-200">
                    Cliquez pour sélectionner l’archive .zip téléchargée depuis Gemini
                  </div>
                  <div className="text-xs text-slate-400">
                    Vos dossiers de données sur la VM (<span className="font-mono">dataset/</span>, <span className="font-mono">models/</span>, <span className="font-mono">.gemini_key</span>) seront automatiquement préservés.
                  </div>
                </div>
              )}
            </label>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">
                Message de commit pour la synchronisation automatique vers GitHub
              </label>
              <input
                type="text"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        )}

        {/* Subpath adaptation checkbox */}
        <label className="flex items-start gap-3 p-3.5 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
          <input
            type="checkbox"
            checked={autoSubpathPatch}
            onChange={(e) => setAutoSubpathPatch(e.target.checked)}
            className="mt-0.5 rounded border-slate-700 bg-slate-900 text-emerald-500"
          />
          <div className="space-y-0.5 text-xs">
            <div className="font-medium text-slate-200">
              Adapter automatiquement les chemins HTML/JS pour le sous-chemin Caddy ({tool.subpath}/)
            </div>
            <div className="text-slate-400">
              Ajoute <span className="font-mono">&lt;base href="{tool.subpath}/"&gt;</span> et convertit les appels absolus <span className="font-mono">/api/...</span> et <span className="font-mono">/static/...</span> en chemins relatifs.
            </div>
          </div>
        </label>

        {/* Execution Logs */}
        {stepLogs.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-300">
              Journal de déploiement :
            </div>
            <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 text-xs font-mono text-slate-300 overflow-x-auto max-h-48 leading-relaxed">
              {stepLogs.join('\n')}
            </pre>
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 rounded-lg bg-red-950/50 border border-red-500/40 text-xs text-red-200 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {done && !errorMsg && (
          <div className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Nouvelle version déployée et active sur{' '}
                <strong className="font-mono">{tool.subpath}/</strong> !
              </span>
            </div>
            <a
              href={`${tool.subpath}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-emerald-300 hover:text-emerald-200"
            >
              Ouvrir l’outil ↗
            </a>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            Fermer
          </button>
          <button
            type="button"
            disabled={deploying}
            onClick={handleDeploy}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${deploying ? 'animate-spin' : ''}`} />
            {source === 'git'
              ? 'Tirer depuis GitHub & Redémarrer'
              : 'Déployer le ZIP & Pousser sur GitHub'}
          </button>
        </div>
      </div>
    </div>
  );
};
