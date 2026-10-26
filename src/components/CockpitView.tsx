import React, { useState } from 'react';
import {
  Play,
  Square,
  RotateCw,
  GitPullRequest,
  ExternalLink,
  Terminal,
  Copy,
  Check,
  Trash2,
  ArrowRight,
  Cpu,
  HardDrive,
} from 'lucide-react';
import type { ServiceItem, VmInfo } from '../types';

interface CockpitViewProps {
  vmInfo: VmInfo;
  services: ServiceItem[];
  step1Completed: boolean;
  busyServiceId: string | null;
  onServiceAction: (serviceId: string, action: 'start' | 'stop' | 'restart' | 'git-pull' | 'clear-logs') => void;
  onNavigateView: (view: 'cockpit' | 'step1' | 'lora-v2' | 'workflow') => void;
}

export const CockpitView: React.FC<CockpitViewProps> = ({
  vmInfo,
  services,
  step1Completed,
  busyServiceId,
  onServiceAction,
  onNavigateView,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'standby'>('all');
  const [selectedLogServiceId, setSelectedLogServiceId] = useState<string>('foret-lab');
  const [copiedSsh, setCopiedSsh] = useState(false);
  const [previewUrlNotice, setPreviewUrlNotice] = useState<ServiceItem | null>(null);

  const filteredServices = services.filter((svc) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') return svc.status === 'active';
    return svc.status !== 'active';
  });

  const activeLogService =
    services.find((s) => s.id === selectedLogServiceId) || services[0];

  const handleCopySshStatus = (svc: ServiceItem) => {
    const cmd = `ssh opc@${vmInfo.publicIp} "sudo systemctl status ${svc.systemdUnit} --no-pager && git -C ${svc.vmPath} log -1 --oneline"`;
    navigator.clipboard.writeText(cmd);
    setCopiedSsh(true);
    setTimeout(() => setCopiedSsh(false), 2000);
  };

  const handleOpenTool = (svc: ServiceItem) => {
    if (vmInfo.executionMode === 'production-vm') {
      window.location.href = svc.subpath;
    } else {
      setPreviewUrlNotice(svc);
    }
  };

  return (
    <div className="space-y-8">
      {/* Step 1 Callout Banner if not marked completed yet */}
      {!step1Completed && (
        <div className="bg-slate-900 border border-amber-500/40 rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-amber-400 font-semibold">
              <span>Première étape recommandée avant bascule Caddy</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">141.145.218.127</span>
            </div>
            <p className="text-sm text-slate-200">
              L’ancien site monolithique <span className="font-mono text-amber-300">Projet_Jeu</span> (« Atelier de conception ») doit d’abord être retiré de la VM via le script indépendant de l’Étape 1.
            </p>
          </div>
          <button
            onClick={() => onNavigateView('step1')}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            Ouvrir le script Étape 1 (Projet_Jeu)
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Hero & VM Resource Strip */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
              <span className="text-emerald-400 font-semibold">{vmInfo.name}</span>
              <span aria-hidden="true">·</span>
              <span>IP Publique {vmInfo.publicIp}</span>
              <span aria-hidden="true">·</span>
              <span>IP Privée {vmInfo.privateIp}</span>
              <span aria-hidden="true">·</span>
              <span>{vmInfo.shape}</span>
              <span aria-hidden="true">·</span>
              <span>{vmInfo.availabilityDomain}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
              Portail Maître & Orchestrateur des Outils de Conception
            </h1>
            <p className="text-sm text-slate-400">
              Point d’entrée central de <span className="font-mono text-slate-200">{vmInfo.domain}</span>. Pilotez vos services <span className="font-mono">systemd</span>, tirez les dernières versions depuis GitHub et accédez à chaque outil sur son sous-chemin dédié.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onNavigateView('lora-v2')}
              className="px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              Inspecter LoRA Factory v2 (10 fichiers)
            </button>
            <button
              onClick={() => onNavigateView('workflow')}
              className="px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              Scripts C:\Dev\Jeu\ & Caddyfile
            </button>
          </div>
        </div>

        {/* 4-Column Hardware & Routing Telemetry Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Processeur Oracle Flex</span>
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-lg font-bold text-slate-100 font-mono tabular-nums">
              {vmInfo.ocpuCount} OCPU / {vmInfo.vcpuCount} vCPU
            </div>
            <div className="text-xs text-slate-400 font-mono tabular-nums">
              2 vCPU Web/SSH (nice 0) · 14 vCPU Lab (nice 15)
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Mémoire Vive (RAM)</span>
              <HardDrive className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="text-lg font-bold text-slate-100 font-mono tabular-nums">
              {vmInfo.ramUsedGb} Go / {vmInfo.ramGb} Go
            </div>
            <div className="text-xs text-slate-400 font-mono tabular-nums">
              {(vmInfo.ramGb - vmInfo.ramUsedGb).toFixed(2)} Go libres pour les campagnes de test
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Reverse-Proxy HTTPS</span>
              <span className="font-mono text-emerald-400 text-[11px]">Caddy 2 Actif</span>
            </div>
            <div className="text-lg font-bold text-slate-100 font-mono tabular-nums">
              / · /lab · /lora · /bga
            </div>
            <div className="text-xs text-slate-400">
              TLS Let’s Encrypt sur atelierconceptionjeu.fr
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Ancien site Projet_Jeu</span>
              <span className={`font-mono text-[11px] ${step1Completed ? 'text-emerald-400' : 'text-amber-400'}`}>
                {step1Completed ? 'Retiré (Étape 1 OK)' : 'En attente Étape 1'}
              </span>
            </div>
            <div className="text-lg font-bold text-slate-100">
              {step1Completed ? 'Racine / Libérée' : 'À nettoyer (Étape 1)'}
            </div>
            <div className="text-xs text-slate-400">
              Dépôt GitHub conservé en archive froide
            </div>
          </div>
        </div>
      </div>

      {/* Preview Notice Modal / Banner when clicking "Ouvrir /lab" inside AI Studio preview */}
      {previewUrlNotice && (
        <div className="bg-slate-900 border border-emerald-500/40 rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-mono text-emerald-400">
              Routage Caddy : {vmInfo.domain}{previewUrlNotice.subpath} ➔ 127.0.0.1:{previewUrlNotice.port} ({previewUrlNotice.systemdUnit})
            </div>
            <p className="text-sm text-slate-200">
              Une fois ce portail déployé sur <span className="font-mono">{vmInfo.publicIp}</span> avec le <span className="font-mono">Caddyfile</span> fourni, ce bouton ouvre directement{' '}
              <span className="font-mono text-emerald-300">{vmInfo.domain}{previewUrlNotice.subpath}</span>.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={`${vmInfo.domain}${previewUrlNotice.subpath}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              Ouvrir {vmInfo.domain}{previewUrlNotice.subpath}
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={() => setPreviewUrlNotice(null)}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors whitespace-nowrap shrink-0"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Filter Bar & Section Title */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            Services & Outils de l’Atelier ({filteredServices.length})
          </h2>
          <p className="text-xs text-slate-400">
            Contrôle direct des unités <span className="font-mono">systemd</span> et synchronisation Git par dépôt indépendant
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
          {[
            { id: 'all', label: `Tous (${services.length})` },
            { id: 'active', label: `Actifs (${services.filter((s) => s.status === 'active').length})` },
            { id: 'standby', label: `Veille / Arrêtés (${services.filter((s) => s.status !== 'active').length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === tab.id
                  ? 'bg-slate-800 text-slate-100 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {filteredServices.map((svc) => {
          const isBusy = busyServiceId === svc.id;
          const isActive = svc.status === 'active';

          return (
            <div
              key={svc.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-5"
            >
              <div className="space-y-3">
                {/* Top Metadata Line (Zero-Pill Unboxed Text) */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className={isActive ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                      {isActive ? 'ACTIF' : svc.status === 'standby' ? 'PRÉCONFIGURÉ (VEILLE)' : 'ARRÊTÉ'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-200 font-semibold">Route {svc.subpath}</span>
                    <span aria-hidden="true">·</span>
                    <span>Port :{svc.port}</span>
                    <span aria-hidden="true">·</span>
                    <span>{svc.versionTag}</span>
                  </div>

                  <span className="text-slate-400">
                    {svc.pid ? `PID ${svc.pid} · ${svc.memoryMb} Mo` : 'Aucun processus actif'}
                  </span>
                </div>

                {/* Title & Description */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-100">
                      {svc.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {svc.shortDesc}
                    </p>
                  </div>

                  <button
                    onClick={() => handleOpenTool(svc)}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <span>Ouvrir {svc.subpath}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Technical Metadata Rows */}
                <div className="pt-2 space-y-1.5 text-xs border-t border-slate-800/80 font-mono tabular-nums">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-500 font-sans">Dépôt GitHub :</span>
                    <span>{svc.repo} ({svc.branch} @ {svc.commitHash})</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-500 font-sans">Dossier Windows 11 :</span>
                    <span>{svc.winPath}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-500 font-sans">Dossier VM & Service :</span>
                    <span>{svc.vmPath} · {svc.systemdUnit}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-500 font-sans">Allocation CPU :</span>
                    <span className="font-sans text-slate-300">{svc.cpuAllocation}</span>
                  </div>
                </div>
              </div>

              {/* Action Controls Bar */}
              <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    disabled={isBusy}
                    onClick={() => {
                      setSelectedLogServiceId(svc.id);
                      onServiceAction(svc.id, 'git-pull');
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    <GitPullRequest className="w-3.5 h-3.5 text-emerald-400" />
                    Git Pull
                  </button>

                  <button
                    disabled={isBusy}
                    onClick={() => {
                      setSelectedLogServiceId(svc.id);
                      onServiceAction(svc.id, 'restart');
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    <RotateCw className={`w-3.5 h-3.5 text-sky-400 ${isBusy ? 'animate-spin' : ''}`} />
                    Redémarrer
                  </button>

                  {isActive ? (
                    <button
                      disabled={isBusy}
                      onClick={() => {
                        setSelectedLogServiceId(svc.id);
                        onServiceAction(svc.id, 'stop');
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-red-950/60 text-slate-300 hover:text-red-300 border border-slate-700 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                    >
                      <Square className="w-3.5 h-3.5 text-red-400" />
                      Arrêter
                    </button>
                  ) : (
                    <button
                      disabled={isBusy}
                      onClick={() => {
                        setSelectedLogServiceId(svc.id);
                        onServiceAction(svc.id, 'start');
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5 text-emerald-400" />
                      Démarrer
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setSelectedLogServiceId(svc.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    selectedLogServiceId === svc.id
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  Logs ({svc.logs.length})
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Journalctl & SSH Inspector Console */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-100">
                Console Journalctl & Trace d’Exécution en Direct
              </h2>
            </div>
            <p className="text-xs text-slate-400 font-mono tabular-nums">
              Unité sélectionnée : {activeLogService.systemdUnit} · Dossier : {activeLogService.vmPath} · Dernière synchro : {activeLogService.lastSync}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
              {services.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedLogServiceId(s.id)}
                  className={`px-2.5 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
                    selectedLogServiceId === s.id
                      ? 'bg-slate-800 text-emerald-300 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {s.subpath === '/' ? '/ (portail)' : s.subpath}
                </button>
              ))}
            </div>

            <button
              onClick={() => handleCopySshStatus(activeLogService)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              {copiedSsh ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedSsh ? 'Commande SSH copiée' : 'Copier diagnostic SSH'}
            </button>

            <button
              onClick={() => onServiceAction(activeLogService.id, 'clear-logs')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Vider
            </button>
          </div>
        </div>

        <pre className="bg-slate-950 border border-slate-800/90 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-64 leading-relaxed tabular-nums">
          {activeLogService.logs.join('\n')}
        </pre>
      </div>
    </div>
  );
};
