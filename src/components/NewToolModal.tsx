import React, { useState } from 'react';
import {
  X,
  Plus,
  GitBranch,
  FileArchive,
  Upload,
  RotateCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import type { ToolItem, StackPreset, CreateToolRequest } from '../types';

interface NewToolModalProps {
  existingTools: ToolItem[];
  onClose: () => void;
  onCreated: (tools: ToolItem[]) => void;
}

export const NewToolModal: React.FC<NewToolModalProps> = ({
  existingTools,
  onClose,
  onCreated,
}) => {
  const usedPorts = new Set(existingTools.map((t) => t.port));
  let suggestedPort = 8083;
  while (usedPorts.has(suggestedPort)) suggestedPort++;

  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [subpath, setSubpath] = useState('/');
  const [port, setPort] = useState<number>(suggestedPort);
  const [repo, setRepo] = useState('antoineacquaviva/');
  const [description, setDescription] = useState('');
  const [stackPreset, setStackPreset] = useState<StackPreset>('fastapi');
  const [execStart, setExecStart] = useState(
    `/home/opc/venv/bin/uvicorn app:app --host 127.0.0.1 --port ${suggestedPort} --root-path /outil`
  );
  const [buildCmd, setBuildCmd] = useState('');
  const [initialSource, setInitialSource] = useState<'git' | 'zip'>('git');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [autoSubpathPatch, setAutoSubpathPatch] = useState<boolean>(true);
  const [creating, setCreating] = useState<boolean>(false);
  const [stepLogs, setStepLogs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState<boolean>(false);

  const updateDefaultsFromSlug = (slug: string, preset: StackPreset, p: number) => {
    const cleanSub = `/${slug || 'outil'}`;
    if (preset === 'fastapi') {
      setExecStart(
        `/home/opc/venv/bin/uvicorn app:app --host 127.0.0.1 --port ${p} --root-path ${cleanSub}`
      );
      setBuildCmd('');
    } else if (preset === 'flask') {
      setExecStart(`/usr/bin/python3 /srv/jeu/${slug || 'outil'}/app.py`);
      setBuildCmd('');
    } else if (preset === 'node') {
      setExecStart(`/usr/bin/npx tsx server.ts`);
      setBuildCmd('npm install --legacy-peer-deps && npm run build');
    } else if (preset === 'static-python') {
      setExecStart(`/usr/bin/python3 -m http.server ${p} --bind 127.0.0.1`);
      setBuildCmd('');
    }
  };

  const handleNameChange = (val: string) => {
    setName(val);
    const slug = val
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    setId(slug);
    setSubpath(`/${slug}`);
    setRepo(`antoineacquaviva/${slug}`);
    updateDefaultsFromSlug(slug, stackPreset, port);
  };

  const handlePresetChange = (preset: StackPreset) => {
    setStackPreset(preset);
    updateDefaultsFromSlug(id, preset, port);
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.includes(',') ? result.split(',')[1] : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleCreate = async () => {
    setCreating(true);
    setErrorMsg(null);
    setStepLogs([`Provisionnement du nouvel outil ${name} sur la VM...`]);

    try {
      const payload: CreateToolRequest = {
        name,
        id,
        description,
        subpath,
        port,
        repo,
        stackPreset,
        execStart,
        buildCmd,
        initialSource,
        autoSubpathPatch,
      };

      if (initialSource === 'zip') {
        if (!zipFile) {
          setErrorMsg('Veuillez sélectionner une archive .zip initiale.');
          setCreating(false);
          return;
        }
        payload.zipBase64 = await fileToBase64(zipFile);
        payload.zipFileName = zipFile.name;
      }

      const res = await fetch('/api/tools/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.stepLogs) setStepLogs(data.stepLogs);
      if (!res.ok || data.error) {
        setErrorMsg(data.error || 'Erreur lors de la création de l’outil.');
        if (data.tools) onCreated(data.tools);
      } else {
        setDone(true);
        if (data.tools) onCreated(data.tools);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erreur réseau.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="text-xs font-mono text-emerald-400">
              Automatisation VM : /srv/jeu + systemd + Caddyfile
            </div>
            <h2 className="text-lg font-bold text-slate-100 mt-0.5">
              Déployer un nouvel outil sur atelierconceptionjeu.fr
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            <label className="font-medium text-slate-300">Nom de l’outil *</label>
            <input
              type="text"
              placeholder="ex: Générateur de Cartes"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-medium text-slate-300">
              Identifiant dossier (/srv/jeu/...) *
            </label>
            <input
              type="text"
              placeholder="ex: generateur-cartes"
              value={id}
              onChange={(e) => setId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-medium text-slate-300">
              Sous-chemin public Caddy *
            </label>
            <input
              type="text"
              placeholder="ex: /cartes"
              value={subpath}
              onChange={(e) => setSubpath(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-emerald-300 font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-medium text-slate-300">
              Port local sur la VM (127.0.0.1) *
            </label>
            <input
              type="number"
              value={port}
              onChange={(e) => {
                const p = Number(e.target.value);
                setPort(p);
                updateDefaultsFromSlug(id, stackPreset, p);
              }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono tabular-nums focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <label className="font-medium text-slate-300">
              Dépôt GitHub associé (1 outil = 1 projet Git) *
            </label>
            <input
              type="text"
              placeholder="antoineacquaviva/nom-du-depot"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <label className="font-medium text-slate-300">
              Courte description de l’outil
            </label>
            <input
              type="text"
              placeholder="À quoi sert cet outil dans la mise au point du jeu ?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Stack Preset & Commands */}
        <div className="space-y-3 text-xs border-t border-slate-800 pt-4">
          <label className="font-medium text-slate-300 block">
            Type de technologie (pré-remplit la commande systemd) :
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'fastapi', label: 'Python FastAPI / Uvicorn' },
              { id: 'flask', label: 'Python Flask (app.py)' },
              { id: 'node', label: 'Node.js / Express (AI Studio)' },
              { id: 'static-python', label: 'HTML/JS Statique' },
              { id: 'custom', label: 'Personnalisé' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePresetChange(p.id as StackPreset)}
                className={`px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                  stackPreset === p.id
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <label className="text-slate-400">Commande de démarrage (ExecStart) :</label>
              <input
                type="text"
                value={execStart}
                onChange={(e) => setExecStart(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400">
                Commande de build après mise à jour (optionnel) :
              </label>
              <input
                type="text"
                placeholder="ex: npm install --legacy-peer-deps && npm run build"
                value={buildCmd}
                onChange={(e) => setBuildCmd(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Initial Code Source */}
        <div className="space-y-3 text-xs border-t border-slate-800 pt-4">
          <label className="font-medium text-slate-300 block">
            Source initiale du code :
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setInitialSource('git')}
              className={`p-3.5 rounded-xl border text-left transition-colors ${
                initialSource === 'git'
                  ? 'bg-emerald-500/10 border-emerald-500/50 text-slate-100'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold text-emerald-400">
                <GitBranch className="w-4 h-4" />
                <span>Cloner depuis GitHub (Source 1)</span>
              </div>
              <p className="text-slate-400 mt-1">
                Le code est déjà sur GitHub (ex: poussé depuis Google AI Studio).
              </p>
            </button>

            <button
              type="button"
              onClick={() => setInitialSource('zip')}
              className={`p-3.5 rounded-xl border text-left transition-colors ${
                initialSource === 'zip'
                  ? 'bg-emerald-500/10 border-emerald-500/50 text-slate-100'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold text-emerald-400">
                <FileArchive className="w-4 h-4" />
                <span>Téléverser un .zip Gemini (Source 2)</span>
              </div>
              <p className="text-slate-400 mt-1">
                La VM extrait le .zip et pousse la version initiale sur votre dépôt GitHub.
              </p>
            </button>
          </div>

          {initialSource === 'zip' && (
            <label className="block border-2 border-dashed border-slate-700 hover:border-emerald-500/50 rounded-xl p-4 text-center cursor-pointer bg-slate-950/60 transition-colors">
              <input
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={(e) => setZipFile(e.target.files?.[0] || null)}
              />
              <Upload className="w-5 h-5 text-emerald-400 mx-auto mb-1.5" />
              <span className="text-slate-200 font-medium">
                {zipFile
                  ? `${zipFile.name} (${(zipFile.size / 1024).toFixed(1)} Ko)`
                  : 'Sélectionner l’archive .zip initiale'}
              </span>
            </label>
          )}
        </div>

        {/* Logs & Status */}
        {stepLogs.length > 0 && (
          <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 overflow-x-auto max-h-40">
            {stepLogs.join('\n')}
          </pre>
        )}

        {errorMsg && (
          <div className="p-3 rounded-lg bg-red-950/50 border border-red-500/40 text-xs text-red-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {done && !errorMsg && (
          <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Outil créé, service systemd actif et route Caddy{' '}
              <strong className="font-mono">{subpath}/</strong> opérationnelle !
            </span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            Fermer
          </button>
          <button
            type="button"
            disabled={creating}
            onClick={handleCreate}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-2 disabled:opacity-50"
          >
            {creating ? (
              <RotateCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Créer & Déployer sur la VM
          </button>
        </div>
      </div>
    </div>
  );
};
