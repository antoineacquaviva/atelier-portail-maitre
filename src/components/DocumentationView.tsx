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
  Download,
  FileText,
} from 'lucide-react';
import type { VmPrerequisites } from '../types';

interface DocumentationViewProps {
  prereqs: VmPrerequisites;
}

export const AI_STUDIO_INTEGRATION_DOC = `# ANNEXE TECHNIQUE : CONTRAT D'INTÉGRATION AU PORTAIL « ATELIER CONCEPTION JEU »
*(Document à joindre ou coller en complément du cahier des charges fonctionnel dans Google AI Studio)*

## 1. Contexte d'exécution (Double Environnement)
Cette application doit fonctionner de manière transparente dans **deux environnements** sans aucune modification manuelle du code entre les deux :
1. **Aperçu Google AI Studio (Preview Sandbox)** : servie à la racine \`/\` sur le port \`3000\`.
2. **Production sur VM Oracle (\`https://atelierconceptionjeu.fr/<sous-chemin>/\`)** :
   - Déployée dans \`/srv/jeu/<nom-outil>/\` et compilée avec \`npx vite build --base=/<sous-chemin>/\`.
   - Exécutée via un service \`systemd\` avec \`NODE_ENV=production\` et un port dédié fourni par la variable d'environnement \`PORT\` (ex: \`8080\`, \`8082\`, \`8084\`... car le port \`3000\` de la VM est déjà occupé par le Portail Maître).
   - Placée derrière un reverse-proxy **Caddy** configuré avec \`handle_path /<sous-chemin>/*\` (Caddy retire le préfixe \`/<sous-chemin>\` avant de transmettre la requête HTTP à \`127.0.0.1:<PORT>\`).

---

## 2. Règles d'architecture obligatoires à respecter dans le code

### A. Port d'écoute du serveur (\`server.ts\`) — INTERDICTION de figer le port 3000
Si l'application utilise un backend Express (\`server.ts\`), le port **doit obligatoirement** lire \`process.env.PORT\` avec repli sur \`3000\` :
\`\`\`ts
const PORT = Number(process.env.PORT) || 3000;
// ...
app.listen(PORT, '0.0.0.0', () => {
  console.log(\`Serveur actif sur http://0.0.0.0:\${PORT}\`);
});
\`\`\`
*Pourquoi : dans AI Studio, \`process.env.PORT\` n'est pas défini donc l'app écoute sur \`3000\`. Sur la VM Oracle, \`systemd\` injecte \`PORT=808X\` pour éviter tout conflit \`EADDRINUSE\` avec le Portail Maître qui occupe le port \`3000\`.*

### B. Appels API Frontend (\`fetch\`) — Chemins relatifs OBLIGATOIRES (sans \`/\` initial)
Tous les appels \`fetch()\` du frontend React vers le backend Express doivent utiliser un **chemin relatif sans slash initial** :
- ✅ **CORRECT** : \`fetch('api/simulations')\` ou \`fetch(\`\${import.meta.env.BASE_URL}api/simulations\`)\`
- ❌ **INTERDIT** : \`fetch('/api/simulations')\`

*Pourquoi : dans le navigateur, sur \`https://atelierconceptionjeu.fr/mon-outil/\`, un appel \`fetch('/api/...')\` avec un slash initial interrogerait la racine \`https://atelierconceptionjeu.fr/api/...\` (c'est-à-dire le Portail Maître sur le port 3000 !) au lieu de \`https://atelierconceptionjeu.fr/mon-outil/api/...\`. Avec \`fetch('api/...')\`, le navigateur appelle \`/mon-outil/api/...\`, Caddy (\`handle_path\`) retire \`/mon-outil\` et votre \`server.ts\` reçoit proprement \`GET /api/...\`. Et dans l'aperçu AI Studio (à la racine \`/\`), \`fetch('api/...')\` appelle aussi \`/api/...\` !*

### C. Routage Frontend & Fichiers Statiques
1. **Navigation interne** : Privilégier une navigation par état React (\`useState\`) ou \`HashRouter\`. Si \`BrowserRouter\` est utilisé, toujours lui passer \`basename={import.meta.env.BASE_URL}\`.
2. **\`index.html\` propre** : Ne **jamais** écrire de balise \`<base href="...">\` en dur dans \`index.html\` (Vite gère automatiquement la réécriture des chemins d'assets via \`--base=/<sous-chemin>/\` lors du build de production).
3. **Distribution de \`dist/\` en production dans \`server.ts\`** :
\`\`\`ts
if (process.env.NODE_ENV !== 'production') {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}
\`\`\`

### D. Persistance des données et exécution Python sur la VM (Optionnel)
- Si l'outil sauvegarde des fichiers (JSON, SQLite, CSV, résultats de campagnes), les écrire dans un sous-dossier local \`./data/\` ou \`./outputs/\` (créé via \`fs.mkdirSync(..., { recursive: true })\`) pour qu'ils soient préservés lors des mises à jour Git/ZIP.
- Si l'outil lance des scripts scientifiques Python sur la VM Oracle (16 vCPUs), utiliser l'interpréteur \`/home/opc/venv/bin/python3\` s'il existe sur le système (\`fs.existsSync('/home/opc/venv/bin/python3') ? '/home/opc/venv/bin/python3' : 'python3'\`), qui contient déjà \`numpy\`, \`numba\`, \`scipy\`, etc.

### E. Ergonomie d'intégration au Portail
- Ajouter dans l'en-tête (header) de l'application un lien discret permettant de revenir en un clic au portail principal :
  \`<a href="https://atelierconceptionjeu.fr" target="_top">← Portail Atelier</a>\`
`;

export const DocumentationView: React.FC<DocumentationViewProps> = ({
  prereqs,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const downloadMarkdownDoc = () => {
    const blob = new Blob([AI_STUDIO_INTEGRATION_DOC], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SPEC_INTEGRATION_PORTAIL_ATELIER.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const geminiPromptSnippet = `Important pour le déploiement : cette application web sera servie derrière un reverse-proxy Caddy dans un sous-chemin (ex: https://atelierconceptionjeu.fr/mon-outil/). Utilise uniquement des chemins relatifs sans slash initial pour les appels API (fetch('api/...')) et écoute sur process.env.PORT || 3000 dans server.ts.`;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-2">
        <div className="text-xs font-mono text-emerald-400">
          Documentation opérationnelle · Zéro dépôt requis sur vos PC (Ubuntu & Windows 11)
        </div>
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
          Guide de Déploiement de Bout en Bout & Contrat d’Intégration AI Studio
        </h1>
        <p className="text-sm text-slate-400 max-w-4xl leading-relaxed">
          Ce portail centralise tous vos déploiements directement sur la VM Oracle (<span className="font-mono text-slate-200">141.145.218.127</span>). Vous trouverez ci-dessous le document de spécification technique à joindre à vos demandes Google AI Studio ainsi que les procédures de déploiement.
        </p>
      </div>

      {/* NEW: Featured AI Studio Integration Spec Document Card */}
      <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <FileText className="w-4 h-4" />
              <span>Document d’intégration pour Google AI Studio / Gemini</span>
            </div>
            <h2 className="text-lg font-bold text-slate-100">
              Annexe Technique à joindre lors de la création d’une nouvelle application
            </h2>
            <p className="text-xs text-slate-400">
              Téléchargez ce fichier <span className="font-mono text-slate-200">SPEC_INTEGRATION_PORTAIL_ATELIER.md</span> (pour le glisser en pièce jointe dans Google AI Studio) ou copiez-le à la fin de votre prompt fonctionnel.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => copyText('full-spec', AI_STUDIO_INTEGRATION_DOC)}
              className="px-3.5 py-2.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              {copiedId === 'full-spec' ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4 text-emerald-400" />
              )}
              <span>
                {copiedId === 'full-spec'
                  ? 'Document copié !'
                  : 'Copier tout le document'}
              </span>
            </button>

            <button
              type="button"
              onClick={downloadMarkdownDoc}
              className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>Télécharger (.md)</span>
            </button>
          </div>
        </div>

        <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-80 leading-relaxed whitespace-pre-wrap">
          {AI_STUDIO_INTEGRATION_DOC}
        </pre>
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

          {/* Manual Step D: Short Gemini Prompt Tip for Subpaths */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <Sparkles className="w-4 h-4" />
                <span>D. Version courte (1 phrase) pour une discussion Gemini rapide</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Si vous faites une demande rapide dans une discussion Gemini classique sans joindre le fichier complet :
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
                {copiedId === 'prompt' ? 'Consigne copiée' : 'Copier la version courte'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
