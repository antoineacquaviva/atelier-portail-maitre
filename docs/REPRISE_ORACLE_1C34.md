# Mission 1C.3.4 — reprise groupée de P, sans déploiement

Cette livraison corrige les obstacles logiciels connus. Aucune commande n'a été
exécutée sur Oracle. Les résultats locaux ne valident ni l'état de la VM, ni une
bascule. Les procédures B/R de 1C.2 restent hors de cette intervention.

## Versions immuables et ordre des commits

| Usage | Commit exact |
|---|---|
| Amazonia à préparer, dépôt inchangé | `e81bcf2076972b7617f6202d2bbfe94314144c17` |
| Portail applicatif corrigé (A) | `9924ab535dace8c49bda208508d2384dcd56090d` |
| Scripts à transférer (B), même dépôt portail | `1d14521e6915ac1204db7d58dee5c99bf0b91850` |

A supprime `devDependencies.esbuild` et ajoute le lockfile npm. B, descendant de A,
épingle A dans `oracle_prepare.py`. Le commit documentaire suivant B ne modifie
aucun script. L'application préparée contient donc les scripts antérieurs,
inertes : ils ne sont pas les scripts à transférer/exécuter. Aucune référence ne
pointe vers son propre commit, vers un commit futur ou vers `main`.

**Fusionner cette PR par création d'un commit de fusion conservant A et B.**
Cette méthode est autorisée dans les paramètres du dépôt vérifiés lors de la
mission. Ne pas utiliser squash/rebase : ces méthodes peuvent retirer les objets
épinglés de l'historique accessible à un nouveau clone. Ne pas supprimer la branche
avant cette conservation. Si la méthode de fusion est changée, arrêter la procédure
et préparer un nouvel épinglage/documentaire après fusion ; cette variante n'est
pas finalisée par cette livraison. Avec la fusion conservant les commits, aucune
correction de SHA après fusion n'est nécessaire.

Empreintes des trois scripts au commit B (SHA-256) :

```text
7159f90ca58a995d5880927a044c1cd1fb20b74f91cd510b517b64503dc9f007  oracle_prepare.py
16fb4016e8946de433592367f1ff7518429420c2d7ec696524d2a249fa95d07f  oracle_provision.py
d6eb9774c83a07cb0404754e8bd7d1b74bb023ba325c93e0e2d6ebe24fb7fd00  Get-OraclePreparation.ps1
```

## Cause et correction

Installation propre de `main` reproduite : Node 24.22.1/npm 11.9.0 donne
`ERESOLVE`, esbuild 0.25.12 ne satisfaisant pas le peer optionnel de Vite 8.3.6
(`^0.27.0 || ^0.28.0`). Aucun import d'esbuild par le portail ni script npm
l'utilisant. `compileTypeScriptWorkers` dans `server.ts` recherche le binaire
dans **le dossier de l'outil cible** (`tool.vmPath/node_modules/.bin/esbuild`),
pas dans les dépendances du portail. Cette fonction reste inchangée.

Suppression du pin direct inutile ; esbuild 0.28.2 est résolu via tsx/Vite.
Le lockfile du portail fige la résolution validée. Installation puis `npm ci`
réussissent sans `--force` ni `--legacy-peer-deps`. L'orchestrateur garde son
installation normale `npm install --include=dev`, qui utilise ce lockfile.
Amazonia n'a pas de lockfile versionné : son commit est épinglé, mais sa résolution
npm future peut varier ; l'inventaire et le lockfile générés restent dans l'export.
Tout nouveau conflit doit arrêter P, sans contournement.

## Prochaine intervention du propriétaire, après revue et accord P

1. Sur le poste de préparation, récupérer le dépôt et vérifier les objets A et B,
   puis exporter **les trois scripts de B**, sans mettre à jour le checkout en
   production. Exemple dans un clone local de confiance :

   ```bash
   git cat-file -e 9924ab535dace8c49bda208508d2384dcd56090d^{commit}
   git cat-file -e 1d14521e6915ac1204db7d58dee5c99bf0b91850^{commit}
   git merge-base --is-ancestor 9924ab535dace8c49bda208508d2384dcd56090d 1d14521e6915ac1204db7d58dee5c99bf0b91850
   git archive 1d14521e6915ac1204db7d58dee5c99bf0b91850 scripts/oracle_prepare.py scripts/oracle_provision.py scripts/Get-OraclePreparation.ps1 > scripts-1c34.tar
   ```

   Après fusion, vérifier aussi que B est ancêtre du commit de fusion retenu.
   Vérifier l'objet Amazonia dans son clone de lecture. Ne pas substituer un SHA
   différent si un objet est absent.
2. Conserver intégralement tous les anciens workspaces (dont
   `/home/opc/atelier-preparation-1c3-20261108-01`), scripts, fiches, journaux privés,
   runtimes, exports et tentatives partielles. Ne modifier aucun `owner.json`,
   `state.json`, marqueur ou empreinte. Ne pas publier les logs npm bruts.
3. Dans la session habituelle du propriétaire, vérifier **avant transfert et avant
   préparation** `df -h /home/opc` et `df -i /home/opc`. Comparer l'espace libre à la
   taille du nouveau dossier de scripts, au budget de préparation, aux deux clones,
   runtime/cache, restauration et exports. Les anciens workspaces restent présents :
   leur espace n'est pas récupérable pour cette tentative. Le budget de la fiche
   (exemple 8 Gio) est un minimum, pas une garantie ; le script applique aussi son
   estimation et ses réserves avant étapes/exports. En cas d'insuffisance, arrêter,
   sans effacer les anciens résultats ni réduire les gardes.
4. Choisir un **nouveau nom libre** pour le dossier personnel de scripts et pour
   `/home/opc/atelier-preparation-1c3-IDENTIFIANT-NOUVEAU`. Sous `umask 077`, créer
   exclusivement le nouveau dossier de scripts (0700), y transférer l'archive,
   extraire les trois fichiers côte à côte et vérifier leurs empreintes ci-dessus
   avec `sha256sum`. Refuser un dossier déjà présent, un lien, un SHA différent ou
   un transfert incomplet. Garder les scripts et la fiche privés ; ne rien écrire
   sous `/srv/jeu`, `/etc` ou `/opt`. Le workspace sera créé par le script.
5. Préparer une **nouvelle fiche** selon [1C.3](PREPARATION_ORACLE_1C3.md), avec ce
   nouveau workspace, la version Node 24 exacte retenue et son SHA officiel déjà
   approuvé. Ne pas inventer de checksum. Conserver `npm_legacy_peer_deps: false`.
   Garder les sauvegardes complémentaires et historiques d'origine en lecture seule.
6. Depuis le nouveau dossier de scripts, lancer d'abord les contrôles seuls, puis
   après leur succès et accord P, la préparation :

   ```bash
   python3 oracle_prepare.py --config preparation.json
   python3 oracle_prepare.py --config preparation.json --prepare
   ```

   **Ne pas ajouter `--provision-approved`, ni sudo.** Aucun compte système, secret,
   service, configuration Caddy, accès réseau ou donnée historique ne doit changer.
   BGA reste un emplacement futur sans service à exiger.
7. Contrôler `report.json` et `report.txt` : `phase: P_ONLY`, `success: true`,
   `ready_for_deployment: false`, les deux SHA du tableau, les étapes `node`,
   `amazonia`, `portal`, `restoration`, `candidates`, le round-trip SQLite,
   les inventaires des dépendances et les empreintes de l'export. Les services/PID,
   Node actif et sources doivent rester inchangés. Les propositions restent dans
   `candidates`, sans activation. Le provisionnement doit rester en attente.
8. Arrêter sur tout code d'erreur, objet Git/checksum manquant, garde de disque,
   permissions, état actif ou empreinte différent, échec npm/tests/lint/build,
   restauration divergente ou `WORKSPACE_INCOMPATIBLE`. Conserver le nouveau
   workspace et ses diagnostics privés pour analyse. Une reprise n'est possible
   qu'avec les mêmes scripts, fiche et inputs, sous les contrôles existants ; ne
   jamais adapter les marqueurs pour forcer une reprise.

Un succès P autorise seulement l'examen de ses résultats. Provisionnement,
recette Caddy/Chromium, secrets, sauvegarde froide et décisions B/R demeurent des
opérations séparées. Aucun build réussi ni cette PR n'autorise un déploiement.

## Vérifications locales réellement exécutées

Node **24.22.1**, npm **11.9.0** ; aucune connexion Oracle.

| Vérification | Résultat |
|---|---|
| Installation propre portail avant correction | Échec attendu `ERESOLVE` reproduit |
| Amazonia au SHA cible : installation sans contournement | Réussite, 179 paquets, inventaire `npm ls --all --json` valide |
| Portail A : installation, puis installation propre `npm ci` (aussi dans un clone exact de A, sous `npm_env()` isolé) | Réussite, 179 paquets ; Vite 8.3.6/esbuild 0.28.2/tsx 4.23.15 |
| Tests Amazonia (`AMAZONIA_WORKERS=1`, données temporaires) | 90 réussis, aucun ignoré |
| Tests portail, dont sécurité | 7 réussis, 2 ignorés faute de recette Caddy/Chromium configurée |
| TypeScript des deux applications | `npm run lint` réussi |
| Builds Amazonia `/amazonia/` et portail `/` | Réussis |
| Python orchestration/configuration/npm/PATH/reprise | 31 réussis sur 35 ; 4 tests root séparés ci-dessous |
| Permissions Unix en conteneur Python jetable, réseau désactivé, dépôt en lecture seule | 4 réussis |
| Restauration réelle de l'orchestrateur avec Amazonia cible et tsx réels | Réussie, JSON fictifs, SQLite réel, interruption et nouvelle génération, originaux fictifs inchangés |
| Blocs documentaires 1C.2 au SHA Amazonia cible | 9 groupes réussis : copies 16 JSON/11 campagnes/2 vides, refus racines/liens, backup/restore SQLite, contrôles de checksum, migration et retour arrière sur fixtures |

Le harnais `oracle_restore_1c2.py` accepte explicitement les deux SHA immuables
(historique par défaut, cible 1C.3.4 avec `--amazonia-commit`). Il refuse un checkout
différent ou modifié ; aucune modification du dépôt Amazonia n'est livrée.
Les tests Python de la séquence complète remplacent les commandes Oracle, clones,
services et téléchargements par des doubles ; ce sont des **simulations**, pas une
exécution de P sur une VM. Les installations, tests Node, builds et restaurations
mentionnés ci-dessus utilisent réellement les outils locaux.

**Non exécutés :** contrôles Oracle réels, P sur Oracle, provisionnement, transfert
SSH/SCP réel, tests PowerShell (runtime absent de l'hôte), les deux recettes de
sécurité Caddy/Chromium conditionnelles, campagne de production et déploiement.
Les tests d'Amazonia utilisent uniquement leurs propres fixtures temporaires.
Les historiques réels et les services actifs n'ont jamais été consultés.

Les obstacles npm connus sont corrigés. La nouvelle tentative P reste conditionnée
à la revue/fusion conservant les commits, à l'accord P et aux vérifications de la
VM par le propriétaire ; son succès n'est pas affirmé avant exécution.
