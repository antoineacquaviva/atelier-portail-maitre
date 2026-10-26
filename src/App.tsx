/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { RotateCw, CheckCircle2 } from 'lucide-react';
import type { OverviewResponse, ServiceItem, VmInfo } from './types';
import { CockpitView } from './components/CockpitView';
import { Step1CleanupView } from './components/Step1CleanupView';
import { LoraV2InspectorView } from './components/LoraV2InspectorView';
import { WorkflowInfraView } from './components/WorkflowInfraView';

type ActiveView = 'cockpit' | 'step1' | 'lora-v2' | 'workflow';

const FALLBACK_VM_INFO: VmInfo = {
  name: 'vm-campagne-tests',
  publicIp: '141.145.218.127',
  privateIp: '10.0.0.217',
  domain: 'https://atelierconceptionjeu.fr',
  shape: 'VM.Standard.E5.Flex',
  ocpuCount: 8,
  vcpuCount: 16,
  ramGb: 16,
  availabilityDomain: 'EU-PARIS-1-AD-1',
  osUser: 'opc',
  osDistro: 'Oracle Linux (DNF · systemd · Caddy 2)',
  executionMode: 'preview-sandbox',
  cpuLoadPercent: 14,
  reservedWebVcpu: 2,
  workerVcpuPool: 14,
  ramUsedGb: 1.54,
};

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('cockpit');
  const [vmInfo, setVmInfo] = useState<VmInfo>(FALLBACK_VM_INFO);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [step1Completed, setStep1Completed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyServiceId, setBusyServiceId] = useState<string | null>(null);
  const [deployingAll, setDeployingAll] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3200);
  };

  const fetchOverview = async () => {
    try {
      const res = await fetch('/api/overview');
      const data: OverviewResponse = await res.json();
      setVmInfo(data.vmInfo);
      setServices(data.services);
      setStep1Completed(data.step1Completed);
    } catch {
      // Keep current state on transient failure
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const handleServiceAction = async (
    serviceId: string,
    action: 'start' | 'stop' | 'restart' | 'git-pull' | 'clear-logs'
  ) => {
    setBusyServiceId(serviceId);
    try {
      const res = await fetch(`/api/service/${serviceId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.service) {
        setServices((prev) =>
          prev.map((s) => (s.id === serviceId ? data.service : s))
        );
        const labelMap: Record<string, string> = {
          start: 'Service démarré',
          stop: 'Service arrêté',
          restart: 'Service redémarré',
          'git-pull': 'Dépôt synchronisé (git pull)',
          'clear-logs': 'Console nettoyée',
        };
        showToast(`${data.service.name} : ${labelMap[action] || 'Action exécutée'}`);
      }
    } finally {
      setBusyServiceId(null);
    }
  };

  const handleDeployAll = async () => {
    setDeployingAll(true);
    try {
      const res = await fetch('/api/deploy-all', { method: 'POST' });
      const data = await res.json();
      if (data.services) {
        setServices(data.services);
        showToast(`Tous les services actifs ont été synchronisés (${data.timestamp})`);
      }
    } finally {
      setDeployingAll(false);
    }
  };

  const handleToggleStep1 = async (completed: boolean) => {
    setStep1Completed(completed);
    try {
      await fetch('/api/step1-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
      showToast(
        completed
          ? 'Étape 1 (Nettoyage Projet_Jeu) enregistrée comme terminée'
          : 'Étape 1 remise à l’état « À exécuter »'
      );
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0F17] text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-[#0B0F17]/95 backdrop-blur border-b border-slate-800 px-6 py-4 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#cockpit"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('cockpit');
          }}
          className="text-lg font-bold tracking-tight text-slate-100 font-display whitespace-nowrap shrink-0"
        >
          Atelier Conception Jeu
        </a>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-400 overflow-x-auto">
          <a
            href="#cockpit"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('cockpit');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeView === 'cockpit'
                ? 'text-slate-100 border-b-2 border-emerald-400'
                : 'hover:text-slate-200'
            }`}
          >
            Cockpit & Outils
          </a>
          <a
            href="#step1"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('step1');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeView === 'step1'
                ? 'text-slate-100 border-b-2 border-emerald-400'
                : 'hover:text-slate-200'
            }`}
          >
            Étape 1 : Nettoyage VM
          </a>
          <a
            href="#lora-v2"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('lora-v2');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeView === 'lora-v2'
                ? 'text-slate-100 border-b-2 border-emerald-400'
                : 'hover:text-slate-200'
            }`}
          >
            LoRA Factory v2
          </a>
          <a
            href="#workflow"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('workflow');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeView === 'workflow'
                ? 'text-slate-100 border-b-2 border-emerald-400'
                : 'hover:text-slate-200'
            }`}
          >
            Workflow & Infra
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            disabled={deployingAll}
            onClick={handleDeployAll}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-500 rounded-lg hover:bg-emerald-400 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 disabled:opacity-60"
          >
            <RotateCw className={`w-3.5 h-3.5 ${deployingAll ? 'animate-spin' : ''}`} />
            Synchroniser la VM
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

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {loading ? (
          <div className="space-y-6">
            <div className="h-44 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-64 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
              <div className="h-64 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
            </div>
          </div>
        ) : (
          <>
            {activeView === 'cockpit' && (
              <CockpitView
                vmInfo={vmInfo}
                services={services}
                step1Completed={step1Completed}
                busyServiceId={busyServiceId}
                onServiceAction={handleServiceAction}
                onNavigateView={setActiveView}
              />
            )}
            {activeView === 'step1' && (
              <Step1CleanupView
                step1Completed={step1Completed}
                onToggleStep1Completed={handleToggleStep1}
              />
            )}
            {activeView === 'lora-v2' && <LoraV2InspectorView />}
            {activeView === 'workflow' && <WorkflowInfraView />}
          </>
        )}
      </main>

      {/* Clean Footer */}
      <footer className="border-t border-slate-800/80 px-6 py-5 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            Atelier Conception Jeu · Portail Maître d’Orchestration (atelierconceptionjeu.fr · 141.145.218.127)
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveView('step1')}
              className="hover:text-slate-300 transition-colors"
            >
              Script Étape 1 (Projet_Jeu)
            </button>
            <span aria-hidden="true">·</span>
            <button
              onClick={() => setActiveView('lora-v2')}
              className="hover:text-slate-300 transition-colors"
            >
              Archive LoRA Factory v2
            </button>
            <span aria-hidden="true">·</span>
            <button
              onClick={() => setActiveView('workflow')}
              className="hover:text-slate-300 transition-colors"
            >
              PowerShell C:\Dev\Jeu\ & Caddyfile
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
