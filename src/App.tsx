/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { RotateCw, CheckCircle2 } from 'lucide-react';
import type {
  OverviewData,
  ToolItem,
  PortalSelfInfo,
  VmPrerequisites,
} from './types';
import { ToolsDashboardView } from './components/ToolsDashboardView';
import { DocumentationView } from './components/DocumentationView';
import { DeployVersionModal } from './components/DeployVersionModal';
import { NewToolModal } from './components/NewToolModal';

type ActiveTab = 'tools' | 'guide';

const DEFAULT_PORTAL_INFO: PortalSelfInfo = {
  repo: 'antoineacquaviva/atelier-portail-maitre',
  vmPath: '/srv/jeu/atelier-portail-maitre',
  systemdUnit: 'atelier-portail.service',
  commitHash: 'a663b89',
  lastUpdated: 'En ligne',
  domain: 'https://atelierconceptionjeu.fr',
  publicIp: '141.145.218.127',
  executionMode: 'preview-sandbox',
};

const DEFAULT_PREREQS: VmPrerequisites = {
  sshPublicKey: '',
  sudoersConfigured: true,
  sudoersCommand:
    'echo "opc ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/atelier-portail && sudo chmod 440 /etc/sudoers.d/atelier-portail',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('tools');
  const [portal, setPortal] = useState<PortalSelfInfo>(DEFAULT_PORTAL_INFO);
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [prereqs, setPrereqs] = useState<VmPrerequisites>(DEFAULT_PREREQS);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyToolId, setBusyToolId] = useState<string | null>(null);
  const [updatingPortal, setUpdatingPortal] = useState<boolean>(false);
  const [deployModalTool, setDeployModalTool] = useState<ToolItem | null>(null);
  const [showNewToolModal, setShowNewToolModal] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const fetchOverview = async () => {
    try {
      const res = await fetch('/api/overview');
      const data: OverviewData = await res.json();
      if (data.portal) setPortal(data.portal);
      if (data.tools) setTools(data.tools);
      if (data.prereqs) setPrereqs(data.prereqs);
    } catch {
      // Keep current state on transient error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const handleToolAction = async (
    toolId: string,
    action: 'start' | 'stop' | 'restart' | 'clear-logs' | 'delete' | 'diagnose'
  ) => {
    setBusyToolId(toolId);
    try {
      const res = await fetch(`/api/tools/${toolId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.deleted && data.tools) {
        setTools(data.tools);
        showToast('Outil retiré du portail');
      } else if (data.tool) {
        setTools((prev) =>
          prev.map((t) => (t.id === toolId ? data.tool : t))
        );
        const labels: Record<string, string> = {
          start: 'Service démarré',
          stop: 'Service arrêté',
          restart: 'Service redémarré',
          'clear-logs': 'Logs nettoyés',
          diagnose: 'Diagnostic & Réparation 502 terminés',
        };
        showToast(`${data.tool.name} : ${labels[action] || 'Action effectuée'}`);
      }
    } finally {
      setBusyToolId(null);
    }
  };

  const handlePortalSelfUpdate = async () => {
    setUpdatingPortal(true);
    try {
      const res = await fetch('/api/portal/self-update', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        showToast(`Erreur MAJ Portail : ${data.error}`);
      } else {
        showToast(
          data.message || 'Portail mis à jour depuis GitHub ! Rechargement...'
        );
        if (data.commitHash) {
          setPortal((p) => ({ ...p, commitHash: data.commitHash }));
        }
        if (portal.executionMode === 'production-vm') {
          setTimeout(() => window.location.reload(), 2500);
        }
      }
    } catch {
      showToast('Redémarrage du portail en cours...');
      setTimeout(() => window.location.reload(), 2500);
    } finally {
      setUpdatingPortal(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0F17] text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-[#0B0F17]/95 backdrop-blur border-b border-slate-800 px-6 py-4 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#tools"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('tools');
          }}
          className="text-lg font-bold tracking-tight text-slate-100 font-display whitespace-nowrap shrink-0"
        >
          Atelier Conception Jeu
        </a>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-400">
          <a
            href="#tools"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('tools');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeTab === 'tools'
                ? 'text-slate-100 border-b-2 border-emerald-400'
                : 'hover:text-slate-200'
            }`}
          >
            Mes Outils ({tools.length})
          </a>
          <a
            href="#guide"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('guide');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeTab === 'guide'
                ? 'text-slate-100 border-b-2 border-emerald-400'
                : 'hover:text-slate-200'
            }`}
          >
            Guide & Prérequis
          </a>
        </nav>

        {/* Zone 3: Discreet Self-Update Action for the Portal itself */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            disabled={updatingPortal}
            onClick={handlePortalSelfUpdate}
            title={`Tirer la dernière version de ${portal.repo} depuis GitHub, recompiler et redémarrer le portail`}
            className="px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 disabled:opacity-50"
          >
            <RotateCw
              className={`w-3.5 h-3.5 text-emerald-400 ${
                updatingPortal ? 'animate-spin' : ''
              }`}
            />
            <span>Mettre à jour le Portail</span>
          </button>
        </div>
      </header>

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 border border-emerald-500/40 text-slate-100 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2.5 text-xs font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-56 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
            <div className="h-56 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
          </div>
        ) : activeTab === 'tools' ? (
          <ToolsDashboardView
            portal={portal}
            tools={tools}
            busyToolId={busyToolId}
            onOpenDeployModal={(tool) => setDeployModalTool(tool)}
            onOpenNewToolModal={() => setShowNewToolModal(true)}
            onToolAction={handleToolAction}
            onNavigateGuide={() => setActiveTab('guide')}
          />
        ) : (
          <DocumentationView prereqs={prereqs} />
        )}
      </main>

      {/* Modals */}
      {deployModalTool && (
        <DeployVersionModal
          tool={deployModalTool}
          onClose={() => setDeployModalTool(null)}
          onSuccess={(updatedTool) => {
            setTools((prev) =>
              prev.map((t) => (t.id === updatedTool.id ? updatedTool : t))
            );
            setDeployModalTool(updatedTool);
            showToast(`${updatedTool.name} mis à jour avec succès !`);
          }}
        />
      )}

      {showNewToolModal && (
        <NewToolModal
          existingTools={tools}
          onClose={() => setShowNewToolModal(false)}
          onCreated={(updatedTools) => {
            setTools(updatedTools);
            showToast('Nouvel outil déployé et ajouté au portail !');
          }}
        />
      )}

      {/* Quiet Footer */}
      <footer className="border-t border-slate-800/80 px-6 py-4 text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 font-mono tabular-nums">
          <div>
            Portail Maître ({portal.repo} @ {portal.commitHash}) · {portal.domain}
          </div>
          <div className="flex items-center gap-4 font-sans">
            <button
              onClick={() => setActiveTab('tools')}
              className="hover:text-slate-300 transition-colors"
            >
              Mes Outils
            </button>
            <span aria-hidden="true">·</span>
            <button
              onClick={() => setActiveTab('guide')}
              className="hover:text-slate-300 transition-colors"
            >
              Guide de déploiement & Prérequis
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
