import React, { useState } from 'react';
import {
  Copy,
  Check,
  GitBranch,
  FileArchive,
  ArrowLeftRight,
  KeyRound,
  Terminal,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import type { VmPrerequisites } from '../types';

interface DocumentationViewProps {
  prereqs: VmPrerequisites;
}

export const DocumentationView: React.FC<DocumentationViewProps> = ({
  prereqs,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const geminiPromptSnippet = `Important pour le déploiement : cette application web sera servie derrière un reverse-proxy Caddy dans un sous-chemin (ex: https://atelierconceptionjeu.fr/mon-outil/). Utilise uniquement des chemins relatifs dans le HTML et le JavaScript (ex: fetch('api/...') et href="static/..." sans slash initial '/') afin que tous les appels API et fichiers statiques fonctionnent dans un sous-chemin.`;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-2">
        <div className="text-xs font-mono text-emerald-400">
          Documentation opérationnelle · Zéro dépôt requis sur vos PC (Ubuntu & Windows 11)
        </div>
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
          Guide de Déploiement de Bout en Bout & Étapes Manuelles Résiduelles
        </h1>
        <p className="text-sm text-slate-400 max-w-4xl leading-relaxed">
          Ce portail centralise tous vos déploiements directement sur la VM Oracle (<span className="font-mono text-slate-200">141.145.218.127</span>). Vous n’avez plus besoin de maintenir de dépôts Git locaux sur votre PC Windows 11 ni sur votre PC Ubuntu.
        </p>
      </div>

      {/* 3 Core Workflows */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Source 1 */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <GitBranch className="w-4 h-4" />
              <span>Cas 1 · Source Google AI Studio (GitHub)</span>
            </div>
            <h2 className="text-base font-bold text-slate-100">
              Déployer depuis AI Studio (Outil ou Portail)
            </h2>
            <ol className="text-xs text-slate-300 space-y-2.5 list-decimal list-inside leading-relaxed">
              <li>
                Dans <strong>Google AI Studio</strong>, cliquez en haut à droite sur l’icône <strong>GitHub (Save to GitHub)</strong> pour pousser votre code sur <span className="font-mono text-slate-200">antoineacquaviva/&lt;projet&gt;</span>.
              </li>
              <li>
                Ouvrez ce portail sur <span className="font-mono text-slate-200">atelierconceptionjeu.fr</span> :
                <ul className="pl-4 mt-1 space-y-1 text-slate-400 list-disc list-inside">
                  <li>
                    <strong>Pour un outil</strong> : cliquez sur <em>Déployer une nouvelle version</em> ➔ <em>Source 1 (GitHub)</em> ➔ <em>Tirer depuis GitHub & Redémarrer</em>.
                  </li>
                  <li>
                    <strong>Pour ce portail lui-même</strong> : cliquez sur le bouton <em>Mettre à jour le Portail</em> en haut à droite de la barre de navigation.
                  </li>
                </ul>
              </li>
            </ol>
          </div>
          <div className="pt-3 border-t border-slate-800 text-[11px] font-mono text-slate-400">
            Aucun téléchargement ni commande locale sur votre PC.
          </div>
        </div>

        {/* Source 2 */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <FileArchive className="w-4 h-4" />
              <span>Cas 2 · Source Discussion Gemini (.zip)</span>
            </div>
            <h2 className="text-base font-bold text-slate-100">
              Déployer une archive .zip téléchargée
            </h2>
            <ol className="text-xs text-slate-300 space-y-2.5 list-decimal list-inside leading-relaxed">
              <li>
                Dans votre discussion Gemini (depuis Ubuntu ou Windows 11), téléchargez l’archive <span className="font-mono text-slate-200">.zip</span> générée.
              </li>
              <li>
                Sur la carte de l’outil dans ce portail, cliquez sur <strong>Déployer une nouvelle version</strong> ➔ choisissez <strong>Source 2 : Discussion Gemini (.zip)</strong>.
              </li>
              <li>
                Sélectionnez votre fichier <span className="font-mono text-slate-200">.zip</span> et cliquez sur <strong>Déployer le ZIP & Pousser sur GitHub</strong>.
              </li>
              <li>
                La VM décompresse l’archive (sans toucher à vos datasets/modèles), redémarre le service <span className="font-mono">systemd</span> et fait automatiquement <span className="font-mono">git commit + git push</span> vers GitHub.
              </li>
            </ol>
          </div>
          <div className="pt-3 border-t border-slate-800 text-[11px] font-mono text-slate-400">
            Vous pouvez supprimer le .zip de vos Téléchargements ensuite.
          </div>
        </div>

        {/* Switching between sources */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <ArrowLeftRight className="w-4 h-4" />
              <span>Cas 3 · Basculer entre les 2 sources</span>
            </div>
            <h2 className="text-base font-bold text-slate-100">
              Passer de Gemini (.zip) à AI Studio (et inversement)
            </h2>
            <div className="text-xs text-slate-300 space-y-2.5 leading-relaxed">
              <p>
                Puisque la VM pousse chaque archive <span className="font-mono text-slate-200">.zip</span> sur le dépôt GitHub de l’outil, <strong>GitHub contient toujours la toute dernière version</strong>, quelle que soit la source utilisée :
              </p>
              <ul className="space-y-2 text-slate-400 list-disc list-inside">
                <li>
                  <strong className="text-slate-200">D’AI Studio vers une discussion Gemini</strong> : donnez l’URL GitHub ou le ZIP du dépôt à Gemini, puis déployez le nouveau ZIP via <em>Source 2</em>.
                </li>
                <li>
                  <strong className="text-slate-200">D’une discussion Gemini vers AI Studio</strong> : importez le dépôt GitHub (mis à jour par la VM) dans AI Studio, puis déployez les versions suivantes via <em>Source 1</em>.
                </li>
              </ul>
            </div>
          </div>
          <div className="pt-3 border-t border-slate-800 text-[11px] font-mono text-slate-400">
            1 outil = 1 dépôt GitHub toujours synchronisé par la VM.
          </div>
        </div>
      </div>

      {/* Residual Manual Steps Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
        <div className="border-b border-slate-800 pb-4 space-y-1">
          <h2 className="text-lg font-bold text-slate-100">
            Étapes Manuelles Résiduelles (Ce qui ne peut pas être automatisé sans vous)
          </h2>
          <p className="text-xs text-slate-400">
            Voici les seules opérations manuelles à connaître (les étapes A et B ne se font qu’une seule fois dans la vie de la VM).
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Manual Step A: VM SSH Key for GitHub push */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <KeyRound className="w-4 h-4" />
                <span>A. Autoriser la VM à faire « git push » vers votre GitHub (1 seule fois)</span>
              </div>
              <a
                href="https://github.com/settings/ssh/new"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-emerald-400 hover:underline flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                Ouvrir GitHub SSH Keys
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Pour que la VM puisse pousser automatiquement sur GitHub lorsque vous téléversez un fichier <span className="font-mono">.zip</span> Gemini, copiez la clé publique SSH de votre VM ci-dessous et ajoutez-la une seule fois dans vos clés SSH GitHub :
            </p>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 font-mono text-[11px] text-slate-200 break-all">
              {prereqs.sshPublicKey}
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-500 font-mono">
                Fichier VM : /home/opc/.ssh/id_ed25519.pub
              </span>
              <button
                type="button"
                onClick={() => copyText('ssh-key', prereqs.sshPublicKey)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5"
              >
                {copiedId === 'ssh-key' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copiedId === 'ssh-key' ? 'Clé copiée' : 'Copier la clé SSH de la VM'}
              </button>
            </div>
          </div>

          {/* Manual Step B: Sudoers permission for Caddy & systemd creation */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <Terminal className="w-4 h-4" />
                <span>B. Autoriser la création auto de services & Caddyfile (1 seule fois)</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Lorsque vous utilisez le bouton <strong>+ Déployer un nouvel outil</strong>, la VM crée un fichier dans <span className="font-mono">/etc/systemd/system/</span> et met à jour <span className="font-mono">/etc/caddy/Caddyfile</span>. Si ce n’est pas encore fait, lancez cette commande une fois en SSH sur la VM :
            </p>
            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-3 font-mono text-[11px] text-emerald-300 overflow-x-auto">
              {prereqs.sudoersCommand}
            </pre>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => copyText('sudoers', prereqs.sudoersCommand)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5"
              >
                {copiedId === 'sudoers' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copiedId === 'sudoers' ? 'Commande copiée' : 'Copier la commande SSH'}
              </button>
            </div>
          </div>

          {/* Manual Step C: Creating empty GitHub repo for a brand new tool */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <GitBranch className="w-4 h-4" />
                <span>C. Lors de l’ajout d’un tout nouvel outil : créer le dépôt vide sur GitHub</span>
              </div>
              <a
                href="https://github.com/new"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-emerald-400 hover:underline flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                github.com/new
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Avant d’utiliser <strong>+ Déployer un nouvel outil</strong> à partir d’une archive <span className="font-mono">.zip</span> Gemini, créez simplement la coquille vide du dépôt sur <a href="https://github.com/new" target="_blank" rel="noopener noreferrer" className="text-slate-200 underline">github.com/new</a> (sans README) pour que la VM puisse y pousser le premier commit.
            </p>
          </div>

          {/* Manual Step D: Gemini Prompt Tip for Subpaths */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <Sparkles className="w-4 h-4" />
                <span>D. Consigne à glisser à Gemini lors de la création d’une interface Web</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Même si ce portail patche automatiquement les fichiers HTML/JS courants, vous pouvez coller cette phrase dans vos discussions Gemini pour que le code généré soit nativement compatible avec un sous-chemin Caddy (<span className="font-mono">/lab/</span>, <span className="font-mono">/lora/</span>) :
            </p>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-300 italic leading-relaxed">
              « {geminiPromptSnippet} »
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => copyText('prompt', geminiPromptSnippet)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5"
              >
                {copiedId === 'prompt' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copiedId === 'prompt' ? 'Consigne copiée' : 'Copier la consigne pour Gemini'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
