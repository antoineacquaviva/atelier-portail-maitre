import React, { useState } from 'react';
import {
  ExternalLink,
  UploadCloud,
  RotateCw,
  Play,
  Square,
  Terminal,
  Plus,
  Trash2,
  BookOpen,
} from 'lucide-react';
import type { ToolItem, PortalSelfInfo } from '../types';

interface ToolsDashboardViewProps {
  portal: PortalSelfInfo;
  tools: ToolItem[];
  busyToolId: string | null;
  onOpenDeployModal: (tool: ToolItem) => void;
  onOpenNewToolModal: () => void;
  onToolAction: (
    toolId: string,
    action: 'start' | 'stop' | 'restart' | 'clear-logs' | 'delete'
  ) => void;
  onNavigateGuide: () => void;
}

export const ToolsDashboardView: React.FC<ToolsDashboardViewProps> = ({
  portal,
  tools,
  busyToolId,
  onOpenDeployModal,
  onOpenNewToolModal,
  onToolAction,
  onNavigateGuide,
}) => {
  const [selectedLogToolId, setSelectedLogToolId] = useState<string | null>(null);

  const activeLogTool = tools.find((t) => t.id === selectedLogToolId) || null;

  const getToolHref = (tool: ToolItem) => {
    const cleanSub = tool.subpath.endsWith('/') ? tool.subpath : `${tool.subpath}/`;
    if (portal.executionMode === 'production-vm') {
      return cleanSub;
    }
    return `${portal.domain}${cleanSub}`;
  };

  return (
    <div className="space-y-8">
      {/* Clean Header Summary */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
            <span className="text-emerald-400 font-semibold">{portal.domain}</span>
            <span aria-hidden="true">·</span>
            <span>VM {portal.publicIp}</span>
            <span aria-hidden="true">·</span>
            <span>{tools.length} outils configurés</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            Outils de Conception & Test du Jeu
          </h1>
          <p className="text-sm text-slate-400">
            Accédez en un clic à chaque outil ou déployez une nouvelle version (depuis GitHub / AI Studio ou depuis une archive <span className="font-mono text-slate-300">.zip</span> Gemini, sans aucun dépôt requis sur votre PC).
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onNavigateGuide}
            className="px-3.5 py-2.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
            Guide de déploiement
          </button>
          <button
            onClick={onOpenNewToolModal}
            className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Déployer un nouvel outil
          </button>
        </div>
      </div>

      {/* Tools Grid (Only actual game tools, excluding the portal itself) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {tools.map((tool) => {
          const isBusy = busyToolId === tool.id;
          const isActive = tool.status === 'active';
          const href = getToolHref(tool);

          return (
            <div
              key={tool.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-6"
            >
              <div className="space-y-4">
                {/* Unboxed Metadata Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
                  <div className="flex items-center gap-2 text-slate-400">
                    <span
                      className={
                        isActive
                          ? 'text-emerald-400 font-semibold'
                          : 'text-amber-400 font-semibold'
                      }
                    >
                      {isActive
                        ? 'EN LIGNE'
                        : tool.status === 'standby'
                        ? 'PRÉCONFIGURÉ'
                        : 'ARRÊTÉ'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-200 font-semibold">
                      {tool.subpath}/
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Port :{tool.port}</span>
                    <span aria-hidden="true">·</span>
                    <span>Commit {tool.commitHash}</span>
                  </div>

                  <span className="text-slate-500">
                    {tool.lastSource === 'zip' ? 'Source : ZIP Gemini' : 'Source : GitHub'}
                  </span>
                </div>

                {/* Tool Title & Description */}
                <div>
                  <h2 className="text-xl font-bold text-slate-100">
                    {tool.name}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    {tool.description}
                  </p>
                </div>

                {/* Primary 1-Click Actions: Open Tool + Deploy New Version */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-3 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                  >
                    <span>Ouvrir {tool.subpath}/</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <button
                    type="button"
                    onClick={() => onOpenDeployModal(tool)}
                    className="px-4 py-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                  >
                    <UploadCloud className="w-4 h-4 text-emerald-400" />
                    <span>Déployer une nouvelle version</span>
                  </button>
                </div>
              </div>

              {/* Quiet Secondary Bar: Repo Info + Service Controls */}
              <div className="pt-4 border-t border-slate-800/90 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="font-mono text-slate-400 truncate max-w-[260px]" title={tool.repo}>
                  {tool.repo} · {tool.lastUpdated}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onToolAction(tool.id, 'restart')}
                    title="Redémarrer le service systemd"
                    className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    <RotateCw className={`w-3.5 h-3.5 text-sky-400 ${isBusy ? 'animate-spin' : ''}`} />
                    <span>Redémarrer</span>
                  </button>

                  {isActive ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onToolAction(tool.id, 'stop')}
                      title="Arrêter le service"
                      className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-red-950/50 text-slate-400 hover:text-red-300 border border-slate-800 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                    >
                      <Square className="w-3.5 h-3.5 text-red-400" />
                      <span>Arrêter</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onToolAction(tool.id, 'start')}
                      title="Démarrer le service"
                      className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-emerald-950/50 text-emerald-300 border border-slate-800 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Démarrer</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setSelectedLogToolId(
                        selectedLogToolId === tool.id ? null : tool.id
                      )
                    }
                    className={`px-2.5 py-1.5 rounded-lg font-mono border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      selectedLogToolId === tool.id
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Logs</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Card to Add a New Tool */}
        <button
          type="button"
          onClick={onOpenNewToolModal}
          className="bg-slate-900/40 hover:bg-slate-900 border-2 border-dashed border-slate-800 hover:border-emerald-500/40 rounded-xl p-6 flex flex-col items-center justify-center text-center gap-3 transition-colors min-h-[240px] group"
        >
          <div className="w-11 h-11 rounded-full bg-slate-900 border border-slate-800 group-hover:border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <Plus className="w-5 h-5" />
          </div>
          <div className="space-y-1 max-w-sm">
            <div className="text-sm font-semibold text-slate-200">
              Déployer un nouvel outil (1 outil = 1 projet Git)
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Crée automatiquement le dossier dans <span className="font-mono">/srv/jeu/</span>, configure le démon <span className="font-mono">systemd</span> et ajoute le sous-chemin dans Caddy.
            </p>
          </div>
        </button>
      </div>

      {/* Collapsible Live Logs Drawer */}
      {activeLogTool && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span>Journaux d’exécution — {activeLogTool.name}</span>
              </div>
              <div className="text-xs font-mono text-slate-400">
                Unité : {activeLogTool.systemdUnit} · Dossier VM : {activeLogTool.vmPath}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onToolAction(activeLogTool.id, 'clear-logs')}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Vider
              </button>
              <button
                type="button"
                onClick={() => setSelectedLogToolId(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Fermer
              </button>
            </div>
          </div>

          <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-64 leading-relaxed tabular-nums">
            {activeLogTool.logs.join('\n')}
          </pre>
        </div>
      )}
    </div>
  );
};
