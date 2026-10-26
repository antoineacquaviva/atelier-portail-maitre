import React, { useState, useEffect } from 'react';
import { Copy, Check, Download, FileCode, Terminal, FolderGit2 } from 'lucide-react';
import type { LoraV2File } from '../types';
import { LORA_V2_MIGRATION_SCRIPT } from '../data/scriptsData';

export const LoraV2InspectorView: React.FC = () => {
  const [files, setFiles] = useState<LoraV2File[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<'all' | LoraV2File['category']>('all');
  const [selectedFilePath, setSelectedFilePath] = useState<string>('app.py');
  const [viewMode, setViewMode] = useState<'original' | 'patched' | 'migration-script'>('original');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/lora-v2/files')
      .then((res) => res.json())
      .then((data) => {
        if (data.files) {
          setFiles(data.files);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filteredFiles = files.filter(
    (f) => selectedCategory === 'all' || f.category === selectedCategory
  );

  const activeFile = files.find((f) => f.relativePath === selectedFilePath) || files[0];

  const displayedContent =
    viewMode === 'migration-script'
      ? LORA_V2_MIGRATION_SCRIPT
      : viewMode === 'patched' && activeFile?.subpathPatchedContent
      ? activeFile.subpathPatchedContent
      : activeFile?.content || '';

  const handleCopy = () => {
    navigator.clipboard.writeText(displayedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadFile = () => {
    const filename =
      viewMode === 'migration-script'
        ? 'Sync-LoraFactoryV2.ps1'
        : activeFile?.fileName || 'lora-file.txt';
    const blob = new Blob([displayedContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Header Explanation */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="space-y-2 max-w-3xl">
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
            <span>Archive jointe analysée</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">lora-factory-v2_6d507730.zip</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">10 fichiers extraits</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            02. Synchronisation & Inspecteur de « LoRA Factory v2 »
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Votre dépôt GitHub <span className="font-mono text-slate-300">antoineacquaviva/lora-factory</span> et la VM disposent actuellement de la v1, tandis que la v2 issue de votre fil Gemini ajoute la{' '}
            <strong className="text-slate-200 font-medium">Table Lumineuse Cropper.js</strong>, le{' '}
            <strong className="text-slate-200 font-medium">Constructeur de tags FR/EN sans doublon</strong> et le{' '}
            <strong className="text-slate-200 font-medium">Copilote IA Gemini Vision</strong>. Nous avons également préparé l’adaptation automatique des chemins relatifs pour que la v2 fonctionne sous{' '}
            <span className="font-mono text-emerald-300">https://atelierconceptionjeu.fr/lora/</span>.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setViewMode(viewMode === 'migration-script' ? 'original' : 'migration-script')}
            className={`px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 ${
              viewMode === 'migration-script'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
            }`}
          >
            <FolderGit2 className="w-4 h-4" />
            {viewMode === 'migration-script'
              ? 'Retour à l’explorateur de fichiers v2'
              : 'Voir le script Sync-LoraFactoryV2.ps1'}
          </button>
        </div>
      </div>

      {/* Category Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
          {[
            { id: 'all', label: `Tous (${files.length})` },
            { id: 'backend', label: 'Backend Flask' },
            { id: 'frontend', label: 'Studio Frontend' },
            { id: 'orchestration-oci', label: 'GPU A10 OCI' },
            { id: 'config', label: 'Config & Systemd' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setSelectedCategory(tab.id as any);
                setViewMode('original');
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                selectedCategory === tab.id
                  ? 'bg-slate-800 text-slate-100 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-400 font-mono tabular-nums">
          Destination Windows 11 : C:\Dev\Jeu\lora-factory · Destination VM : /home/opc/lora-factory (lié à /srv/jeu/lora-factory)
        </div>
      </div>

      {loading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-sm text-slate-400">
          Chargement des fichiers de l’archive lora-factory-v2...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Column: File Table */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col justify-between">
            <div className="divide-y divide-slate-800/80">
              {filteredFiles.map((file) => {
                const isSelected = viewMode !== 'migration-script' && activeFile?.relativePath === file.relativePath;
                return (
                  <button
                    key={file.relativePath}
                    onClick={() => {
                      setSelectedFilePath(file.relativePath);
                      if (viewMode === 'migration-script') setViewMode('original');
                    }}
                    className={`w-full text-left p-4 transition-colors flex flex-col gap-1.5 ${
                      isSelected ? 'bg-slate-800/90' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-100 flex items-center gap-2">
                        <FileCode className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        {file.relativePath}
                      </span>
                      <span className="text-xs text-slate-400 font-mono tabular-nums whitespace-nowrap shrink-0">
                        {file.lineCount} lignes · {(file.sizeBytes / 1024).toFixed(1)} Ko
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{file.summary}</p>
                    <div className="text-[11px] text-slate-400 pt-0.5">
                      <span className="text-emerald-400 font-medium">Nouveauté v2 :</span> {file.v2Changes}
                    </div>
                    {file.subpathPatchedContent && (
                      <div className="text-[11px] text-amber-300 font-mono pt-0.5">
                        ✓ Patch sous-chemin Caddy /lora/ disponible pour ce fichier
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="p-4 bg-slate-950/60 border-t border-slate-800 text-xs text-slate-400 space-y-1">
              <div className="font-medium text-slate-300">Pourquoi conserver le lien /home/opc/lora-factory ?</div>
              <p>
                Dans <span className="font-mono text-slate-300">scripts/orchestrate.py</span> (ligne 15), la v2 utilise{' '}
                <span className="font-mono text-slate-300">Path.home() / "lora-factory"</span>. Le script de migration crée donc un lien symbolique{' '}
                <span className="font-mono text-slate-300">/srv/jeu/lora-factory ➔ /home/opc/lora-factory</span> pour que l’orchestrateur GPU A10 fonctionne sans aucune modification.
              </p>
            </div>
          </div>

          {/* Right Column: File Viewer / Subpath Patch / Migration Script */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-100 font-mono">
                  {viewMode === 'migration-script'
                    ? 'Sync-LoraFactoryV2.ps1 (Migration v1 -> v2 : Windows 11 + GitHub + VM)'
                    : activeFile?.relativePath}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {viewMode === 'migration-script'
                    ? 'Exécutez ce script dans PowerShell sur Windows 11 pour synchroniser la v2 partout.'
                    : activeFile?.v2Changes}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {activeFile?.subpathPatchedContent && viewMode !== 'migration-script' && (
                  <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                    <button
                      onClick={() => setViewMode('original')}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                        viewMode === 'original' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Archive brute
                    </button>
                    <button
                      onClick={() => setViewMode('patched')}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                        viewMode === 'patched' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Compatible Caddy /lora/
                    </button>
                  </div>
                )}

                <button
                  onClick={handleCopy}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copié' : 'Copier'}
                </button>
                <button
                  onClick={handleDownloadFile}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Télécharger
                </button>
              </div>
            </div>

            <pre className="bg-slate-950 border border-slate-800/90 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-[540px] leading-relaxed">
              {displayedContent}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
