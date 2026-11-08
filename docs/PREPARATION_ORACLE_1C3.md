# Mission 1C.3 — préparation automatique, sans déploiement

**Livraison de scripts pour revue. Aucun de ces scripts n'a été exécuté sur Oracle par Codex.** Le [plan 1C.2 fusionné](DEPLOIEMENT_ORACLE_1C2.md) reste la référence pour B/R et le retour arrière. Cette mission prépare seulement P. La fusion d'une PR n'autorise pas son exécution.

Le complément 1C.3 du propriétaire précise que SELinux est Enforcing, Caddy est en 2.11.7, le registre réel contient quatre outils, et BGA est un projet futur vide, sans service. Ces informations remplacent pour cette préparation les inconnues correspondantes de 1C.2 : **conserver BGA, ne pas exiger sa santé, ne pas créer/démarrer son unité**. LoRA/Forêt/Amazonia/portail doivent rester actifs. Les ports 3000/5050 ouverts et les écoutes globales sont signalés comme travaux futurs B, jamais modifiés en P.

## Trois opérations pour le propriétaire, après revue et accord P

1. Transférer les trois scripts relus `oracle_prepare.py`, `oracle_provision.py` et `Get-OraclePreparation.ps1` dans un dossier personnel, **sans mettre à jour le checkout installé du portail**. Les deux fichiers Python restent côte à côte. Conserver leur version exacte durant une préparation/reprise. Python 3.9+, Git, tar, getenforce, systemctl et les binaires déjà installés sont requis ; aucun pip ni paquet système n'est installé par l'orchestrateur. Réserver une connexion de confiance vers GitHub, nodejs.org et npm. Les scripts npm des deux dépôts de confiance exécutent du code : ils font partie de l'accord P.
2. Créer une fiche JSON locale, sans secret, nommée par exemple `preparation.json`. Choisir un workspace **nouveau**, fils direct de `/home/opc`, de forme `atelier-preparation-1c3-IDENTIFIANT`, sur le disque persistant. Choisir une version Node 24 officielle exacte et faire approuver son SHA-256 obtenu par un accès de confiance aux métadonnées officielles. **Ne pas recopier une valeur inventée ou la chaîne explicative ci-dessous.** 24.22.1 est un exemple de référence des recettes, pas une version imposée.

```json
{
  "workspace": "/home/opc/atelier-preparation-1c3-IDENTIFIANT",
  "node_version": "v24.22.1",
  "node_sha256": "REMPLACER_PAR_64_CARACTERES_HEXADECIMAUX_APPROUVES",
  "disk_budget_gib": 8,
  "npm_legacy_peer_deps": false
}
```

Le script refuse cette fiche tant que le checksum n'est pas remplacé. `npm_legacy_peer_deps` est facultatif et vaut false : les conflits npm arrêtent la préparation. Les recettes précédentes ont rencontré un conflit peer ; mettre true seulement après décision explicite sur cette résolution, dans une **nouvelle fiche/nouveau workspace** si une préparation a déjà commencé. Aucun `--force` ni repli de version automatique. Les lockfiles et dépendances réellement installées sont conservés dans les copies et l'export.

3. Dans la session Oracle habituelle du propriétaire (aucune commande SSH à recopier depuis ce document), lancer la même entrée avec le mode voulu :

```bash
# Contrôles seulement : aucune création de workspace, installation ou écriture.
python3 oracle_prepare.py --config preparation.json

# Après accord P : préparation non sensible, sans privilèges ni secrets.
python3 oracle_prepare.py --config preparation.json --prepare
```

La deuxième commande est le point d'entrée principal. Elle affiche l'étape en cours, vérifie à nouveau tout résultat déjà réussi et ne la réexécute pas si ses empreintes sont intactes. `report.txt` est le bilan lisible, `report.json` sa version structurée. **Un succès P n'est jamais un feu vert B** : `ready_for_deployment` reste false et liste les décisions restantes. Aucune clé, aucun hash Basic, aucun fichier service.env n'est généré.

## Ce que P vérifie et prépare

| Catégorie | Comportement |
|---|---|
| Sans modification | Oracle Linux 9.8/x86_64, utilisateur opc non root, ressources attendues, SELinux Enforcing, Node 20 et Caddy 2.11.7 inchangés, cinq services actifs ; aucun appel aux API applicatives ni lecture d'environnement de processus |
| Sauvegardes réutilisées | `/home/opc/atelier-preparation-1c2-20261108-184942` : applications.tar, configurations.tar, registre.json et SHA256SUMS ; lecture/checksums/inspection des archives, **aucune recréation ni extraction de ces archives sensibles** |
| Historique | `/home/opc/amazonia-data-backup-20261108-125739/data` seulement : 16 JSON, onze sous campaigns, deux vides. Aucun CampaignManager ni copie depuis `/srv/jeu/amazonia/data` |
| Capacité | Avant création, minimum de la fiche, estimation des archives développées, copies et marge ; réserve de 2 Gio avant étape écrivant et budget spécifique avant chaque export ; inodes contrôlés |
| Emplacement privé | Nouveau workspace 0700 possédé par opc, état/config/code de l'orchestrateur liés par empreintes, verrou exclusif ; un dossier existant sans marqueur compatible est refusé |
| Node parallèle | Archive officielle Linux x64, version exacte, double correspondance du pin approuvé et de SHASUMS256 officiel. Extraction uniquement dans une zone temporaire marquée ; vérification complète puis publication atomique sans remplacement. Une installation publiée existante est seulement lue et comparée : aucun fichier manquant n'est recréé. Exécution du nouveau Node et import SQLite en mémoire, jamais remplacement de `/usr/bin/node` ni PATH global |
| Releases préparées | Amazonia `efdb787ad3edad845dfc60c6124f6bca2cd4dd6e` et portail `f62ef8148cdf18873272a169b48195443b532ce8` dans les seules copies privées ; npm install local, lint, tests et build avec les bases `/amazonia/` et `/` ; aucune auto-mise à jour du portail installé |
| Restauration isolée | Nouvelle génération `restore-N/data/campaigns`, conservation octet par octet des 16 JSON dont editions/seeds ; vrai gestionnaire, backup et restore SQLite dans la copie ; relecture des mêmes ID/états/compteurs. Aucune création/reprise de campagne, aucune suppression/réparation de JSON vide |
| Registre / voisins | Empreinte du registre réel égale à sa sauvegarde, copie exacte, quatre routes conservées dont BGA ; validation applicative par prepare-caddy sur copie, aucune utilisation des DEFAULT_TOOLS |
| Propositions | Fichiers `.proposed` sous candidates seulement, Basic avant branches, preuve interne prévue par variables Caddy, unités à Node absolu et comptes dédiés. Aucun install dans /etc/systemd, daemon-reload, validate/reload/restart Caddy ou appel admin |

Les comptes et le Node pour les futurs services peuvent être provisionnés lors de la même commande **seulement après un accord supplémentaire explicite** :

```bash
python3 oracle_prepare.py --config preparation.json --prepare --provision-approved
```

Cette option appelle via sudo le helper relu : Node sous `/opt/node-VERSION-linux-x64`, comptes système `amazonia` et `atelier-portail` sans connexion/sudo ajouté, stockage dédié 0700 `/var/lib/amazonia`, `data`, `data/campaigns`. Les dossiers de configuration sous `/etc` utilisent la structure root ci-dessous. Aucun secret, marqueur de stockage ou donnée n'est créé dans ce futur stockage. Le helper ne modifie jamais un propriétaire/mode existant : une incompatibilité arrête l'opération. Aucun chown/chmod récursif des parents partagés, du code installé ou des voisins. Le Node installé est essayé sous les comptes dédiés ; un refus SELinux arrête le parcours, sans désactiver SELinux ni appliquer un étiquetage inventé.

### Permissions corrigées après revue (également reportées dans P11 de 1C.2)

| Objet | Propriétaire:groupe | Mode | Effet pour le service |
|---|---|---|---|
| `/etc/amazonia` | root:amazonia | 0750 | Traversée/lecture des noms, aucune écriture sur les entrées |
| `/etc/atelier-portail` | root:atelier-portail | 0750 | Même règle, groupe distinct et exclusif |
| Chaque futur `service.env` | root:root | 0600 | Aucun accès direct ; systemd root lit le fichier pour démarrer le service |
| Chaque future `internal-key` | service concerné:groupe du service | 0400 | Lecture de sa seule clé ; pas de renommage, remplacement ou suppression via le parent |

Le helper prépare uniquement les dossiers. Il ne crée ni ne lit le contenu des futurs secrets ; s'ils existent déjà, il vérifie leurs propriétaires/types/modes et refuse les liens ou les fichiers inattendus, sans les réparer. Les anciens parents appartenant au service en 0700 sont refusés : leur migration nécessite une revue et une action d'administration distinctes. Les groupes de configuration doivent être privés : aucun membre d'une autre application, y compris via son groupe principal.

Les adaptateurs 1B.5 restent **inchangés** : aucune permission groupe/autres sur une clé (donc pas de 0440/0640 ni d'ACL destinée à contourner cette règle). Le choix service:service 0400 permet la lecture conforme à ce contrat. Comme tout propriétaire Unix, le service peut changer le mode de son propre fichier de clé ; cette structure ne prétend pas rendre son contenu immuable face à un service compromis. Elle garantit qu'il ne contrôle pas les entrées du parent ni le `service.env` root-owned. Une immutabilité de clé exigerait un autre mécanisme revu séparément, sans affaiblir les gardes existantes.

Ne jamais accorder sudo permanent/général à ces scripts ou comptes. Le helper et ses imports sont du code privilégié de confiance **après revue**, pas une sandbox contre un utilisateur opc malveillant. Sudo conserve son fonctionnement interactif habituel ; aucun mot de passe n'est passé en argument ou enregistré par le script. Sans cette option, toute la préparation non sensible se termine et le rapport conserve le provisionnement comme décision restante.

## Reprise et conditions d'arrêt

### Correctif 1C.3.1 — résolution des commandes Oracle Linux

Le premier contrôle Oracle s'arrêtait avant création du workspace : `getenforce`, présent dans `/usr/sbin`, n'était pas accessible dans le PATH contrôlé. Le dispositif utilise désormais la liste fixe `/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`, jamais le PATH utilisateur. Le seul préfixe supplémentaire reste le `bin` du Node préparé pour les commandes qui en ont besoin ; aucun PATH global n'est modifié.

L'audit des deux scripts confirme : `id`, `getenforce`, `systemctl`, `git` et `sudo` passent par cet environnement fixe ; les vérifications `which` de Python/Git/tar utilisent la même liste. L'appel sudo reçoit maintenant lui aussi `safe_env()` au lieu d'hériter l'environnement utilisateur. Python du helper (`/usr/bin/python3`), Node/Caddy actifs (`/usr/bin/node`, `/usr/bin/caddy`), Node préparé, `/usr/sbin/useradd`, `/usr/sbin/runuser` et `/sbin/nologin` restent des chemins explicites. `useradd` et le Node lancé par `runuser` reçoivent également un PATH contrôlé. Les commandes npm et les outils TypeScript sont lancés par le Node absolu sélectionné. Aucun autre repli vers une commande utilisateur ou SSH n'est ajouté.

Les nouveaux tests reproduisent l'échec avec un PATH limité à bin, puis exécutent un faux `getenforce` situé uniquement dans une arborescence temporaire `usr/sbin`, malgré un PATH utilisateur hostile. Le parcours de contrôles Oracle simulé termine sans créer de workspace ; un prérequis disponible uniquement dans le PATH utilisateur est refusé. Les lancements sudo/useradd sont contrôlés avec des doubles de test, sans opération privilégiée réelle. Les garanties d'écriture, les empreintes de reprise et les restrictions P restent identiques. Comme aucun workspace n'a été créé lors de l'échec Oracle signalé, il suffit, après revue de ce correctif, de transférer les deux scripts Python correspondants et de relancer les contrôles avec la fiche existante ; ne pas contourner le contrôle des empreintes si un autre workspace existe déjà.

Validation locale 1C.3.1 : cinq nouveaux tests de résolution, les 20 tests Python existants (dont le lancement sudo étendu), quatre tests Unix en conteneur jetable et sept groupes PowerShell. La restauration Amazonia réelle reste testée sur fixtures au commit ciblé ; le transport SSH PowerShell reste simulé. Aucun test ne contacte Oracle. Les effectifs effectivement réussis sont également consignés dans la PR dédiée ; la branche NTFS/Windows et la validation Oracle réelle restent à effectuer par le propriétaire après revue.

### Règles de reprise inchangées

- Relancer **la même commande et la même fiche**. Les inputs (sauvegardes, historique, registre), versions du dispositif et produits de chaque étape sont revérifiés ; un marqueur de succès seul ne suffit pas. Les produits de restauration sont eux-mêmes hachés. Un changement de fiche/code/input ou d'artefact fini impose revue et nouvelle préparation, pas écrasement.
- Un transfert Node interrompu et une extraction/clone incomplets sont conservés dans des tentatives distinctes. Les étapes réussies ne sont pas refaites ; un npm interrompu est réexécuté uniquement dans sa copie possédée. Les essais de restauration incomplets restent dans restore-N et l'essai suivant utilise N+1. Aucun nettoyage automatique ni `git reset --hard`.
- Un Node **publié** existant, sous `/opt` ou dans le runtime préparé, doit correspondre intégralement à l'archive : liste exacte, octets de tous les fichiers, types, cibles des liens internes, absence de liens physiques inexpliqués, propriétaires et modes exacts (dossiers 0755, fichiers 0644/0755). Sous `/opt`, UID/GID root sont exigés. Un fichier manquant, supplémentaire, un propriétaire/mode erroné ou un lien altéré arrête la préparation **sans écriture dans cette cible**. La publication utilise renameat2/RENAME_NOREPLACE ; même une destination vide déjà créée est refusée.
- La reprise d'une extraction partielle n'est autorisée que dans un dossier `.preparing-N` possédé par l'orchestrateur, avec un marqueur adjacent 0600 correspondant à sa cible, version et empreinte d'archive. Les membres présents sont vérifiés avant tout ajout, jamais écrasés. Un fichier partiel aux octets incorrects est refusé ; la commande principale conserve cette tentative et en crée une nouvelle. Aucun marqueur ne donne le droit de réparer une installation publiée.
- Les dossiers des deux sauvegardes doivent déjà être privés 0700 et accessibles à opc. S'ils ne le sont pas, le contrôle s'arrête : le script ne change pas leurs permissions. Corriger ce prérequis séparément après revue, sans jamais publier les archives/configurations ou leurs contenus.
- CHECKSUM / MANIFEST : transfert ou archive non fiable ; ne pas utiliser l'ensemble partiel. DISK / INODE : capacité insuffisante, aucune suppression automatique. WORKSPACE / STEP_OUTPUT / INPUTS_CHANGED : cible étrangère ou altérée, conserver et examiner. NPM_INSTALL / LINT / TEST / BUILD : échec du code préparé, aucune bascule. HISTORY / SQLITE_RESTORE : restauration invalide, conserver les sources et toutes les tentatives.
- Les erreurs brutes de commandes (npm, clés, registre) ne sont pas recopiées dans les rapports. Un code fixe et l'étape sont fournis. La priorité est un rapport partageable sans secret ; si un diagnostic supplémentaire est nécessaire, l'effectuer localement en privé sur la seule copie, sans transmettre les logs bruts.
- Les tests portail Caddy/Chromium peuvent être ignorés par la suite applicative quand leurs outils manquent. Le rapport garde donc **toujours** la recette croisée comme condition B ; un npm test réussi ne prouve pas son exécution.

## Récupération Windows

PowerShell **7.2+** et OpenSSH scp sont requis. L'hôte doit être déjà connu dans known_hosts ; le script exige StrictHostKeyChecking=yes et BatchMode=yes (clé existante ou agent). Il n'installe pas de clé, ne change pas la confiance SSH et ne demande aucun secret en argument. Le nom/IP et la clé réelle ne sont pas connus ici : les paramètres ci-dessous sont des **exemples à remplacer**. Exécuter sur le PC propriétaire après la préparation autorisée, pas dans Codex pendant cette mission.

```powershell
.\Get-OraclePreparation.ps1 -HostName 'HOTE_REEL' -RemoteWorkspace '/home/opc/atelier-preparation-1c3-IDENTIFIANT' -Destination 'C:\CHEMIN_REEL\NOUVEAU_DOSSIER'
```

`-User opc`, `-Port 22` sont les défauts ; `-IdentityFile` accepte seulement le chemin d'une clé existante, jamais sa valeur. Le dossier local doit être nouveau et son parent exister, sans junction/lien. Les fichiers existants ne sont jamais écrasés ; en cas d'interruption, conserver le dossier partiel et choisir une nouvelle destination. Sur Windows, le dossier est privé par ACL pour l'utilisateur courant ; les parents liés sont refusés.

Le script récupère les trois fichiers de la sauvegarde complémentaire **existante**, leur SHA256SUMS, puis le dernier export immuable indiqué par latest-export.json. Cet export contient report.txt/report.json, preparation.tar et leurs empreintes. Le tar contient les copies de release avec dépendances/dist/lockfiles, les propositions, le bilan et la sauvegarde SQLite de la restauration isolée réussie, la distribution Node exacte et ses métadonnées officielles ; il ne copie pas à nouveau les archives Oracle existantes. Les exports sont numérotés et jamais remplacés. En cas d'échec de préparation, un petit export de rapport d'échec est produit si l'espace permet ; il n'est pas une préparation valide.

Comparer les SHA après transfert détecte une corruption, pas une signature indépendante : la confiance dans l'hôte SSH et le pin officiel Node reste nécessaire. Les archives existantes contiennent potentiellement des configurations privées : **ne pas déposer ces fichiers dans GitHub**, même si leurs rapports synthétiques sont expurgés. Le rapport n'atteste jamais la copie Windows ; la réussite du script PowerShell est la preuve de transfert à conserver séparément.

## Tests et limites de la livraison

Commandes locales de tests, sans Oracle :

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/documentation -p test_oracle_path.py -v
PYTHONDONTWRITEBYTECODE=1 AMAZONIA_FIXTURE_ROOT=/workspace/Amazonia TSX_FIXTURE_PACKAGE=/tmp/amazonia-1c2-doc-test-deps/node_modules/tsx python3 -m unittest discover -s tests/documentation -p test_oracle_prepare.py -v
pwsh -NoLogo -NoProfile -File tests/documentation/OraclePreparation.Tests.ps1
```

Les chemins de test sont des exemples locaux du workspace Codex, pas des chemins Oracle. Sans les deux variables de fixture, le test de restauration Amazonia réelle est explicitement ignoré. Les tests PowerShell utilisent un transport de fichiers simulé, jamais SSH. La branche NTFS/Windows, le provisionnement privilégié complet, SELinux/systemd sur Oracle, les téléchargements officiels Node et les builds complets des deux releases restent à vérifier lors de P après accord ; les tests ne les présentent pas comme réalisés. Les tests de reprise de l'orchestrateur simulent les commandes externes de build ; la restauration utilise réellement le gestionnaire et les outils backup/restore du commit ciblé sur 16 fichiers fictifs.

Résultats après correction dans Codex : **20 tests Python ordinaires et quatre tests Unix privilégiés réussis, aucun ignoré**, avec Node 24.22.1 et Amazonia au SHA ciblé pour la restauration. Les tests Unix sont exécutés dans un conteneur jetable root avec des sous-processus sous UID/GID fictifs distincts (aucun compte créé). Ils vérifient les refus d'écriture/remplacement/renommage/suppression, l'isolation entre services, ainsi que le refus du helper de réparer un Node publié. Le dépôt est monté en lecture seule, le réseau du conteneur est désactivé et tous ses fichiers modifiables sont sous `/tmp`. Les autres tests couvrent l'installation compatible en lecture seule, les fichiers manquants/supplémentaires/corrompus, modes et liens, la reprise temporaire avec marqueur et la publication sans remplacement. La génération Caddy réelle conserve les quatre routes dont BGA. **Sept groupes PowerShell réussis sous PowerShell 7.5.4/Linux**, avec transport simulé ; contrôles de syntaxe et diff-check également effectués. Aucun résultat de production n'est revendiqué et aucun script n'a contacté Oracle.

Le test privilégié est reproductible dans un conteneur Linux jetable, **pas sur Oracle** (image de test officielle Python 3.11 slim ; aucun Docker privilégié/host-network, aucun montage en écriture du dépôt) :

```bash
docker run --rm --network none --read-only --tmpfs /tmp:rw,exec,mode=1777,size=64m --mount type=bind,src="$PWD",dst=/code,readonly -w /code python:3.11-slim python3 -B -m unittest discover -s tests/documentation -p test_oracle_privileges.py -v
```

Restent des décisions humaines : secrets privés séparés, réconciliation Caddy effectif (hôtes, imports, TLS, protections et options locales), compatibilité réelle des outils sous Basic (Authorization, cookies, API, redirections, WS), contexte SELinux des futures unités, sudoers limité, sauvegarde finale froide B, copie Windows vérifiée et accords B/R. Les propositions ne sont jamais activables sans cette revue. Le rollback 1C.2 fermé reste obligatoire : aucune réouverture de l'ancien portail/ports pour contourner un échec.
