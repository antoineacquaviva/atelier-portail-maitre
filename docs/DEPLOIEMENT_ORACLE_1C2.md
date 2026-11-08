# Mission 1C.2 — plan coordonné Amazonia / portail sur Oracle

**Statut : préparation documentaire seulement, 8 novembre 2026. Aucune commande de ce document n'a été exécutée sur Oracle.**

Livrable à faire relire par ChatGPT et le propriétaire. La fusion de cette PR ne vaut pas autorisation d'intervenir. Toutes les commandes ci-dessous sont des instructions **futures**, à exécuter manuellement après les accords correspondants, une étape à la fois. Ne pas copier le document entier dans un terminal. Une erreur, une différence inexpliquée ou une condition d'arrêt impose de suspendre la procédure ; ne pas poursuivre avec les commandes suivantes.

## 1. Sources et niveau de certitude

Sources lues :

- [Amazonia, intégration 1B.5](https://github.com/antoineacquaviva/Amazonia/blob/efdb787ad3edad845dfc60c6124f6bca2cd4dd6e/docs/PORTAL_INTEGRATION_1B5.md).
- [Amazonia, sécurité / backup 1B.4](https://github.com/antoineacquaviva/Amazonia/blob/efdb787ad3edad845dfc60c6124f6bca2cd4dd6e/docs/SECURITY_DEPLOYMENT_1B4.md).
- [Portail, intégration 1B.5](INTEGRATION_1B5.md).
- [Guide de diagnostic 1C.1, PR #7 encore non fusionnée](https://github.com/antoineacquaviva/Amazonia/blob/6f9d0d6fb6735f135c4f3470be50a407dee77df8/docs/ORACLE_DIAGNOSTIC_1C1.md), et bilan 1C.1 communiqué par le propriétaire dans la demande 1C.2. Le guide prépare une collecte ; il ne constitue pas le rapport brut Oracle. Les conclusions ci-dessous viennent du bilan communiqué, sans nouvelle observation de la VM.
- Code Amazonia aux commits `244858f40286678b68a75521813490b11afe549c` (ancien) et `efdb787ad3edad845dfc60c6124f6bca2cd4dd6e` (fusion #6), portail `f62ef8148cdf18873272a169b48195443b532ce8` (fusion #1).

| Sujet | Confirmé par le bilan Oracle 1C.1 | Livré dans le code fusionné, pas attesté sur Oracle | À vérifier avant intervention |
|---|---|---|---|
| VM | Oracle Linux 9.8 x86_64, 16 CPU logiques, RAM ~15,5 Go, racine 30 Go / ~16 Go libres | Ressources Amazonia paramétrables | Place et inodes pour archives, deux releases, dépendances, copies et marge ; SELinux |
| Node | `/usr/bin/node` v20.20.2, sans `node:sqlite` | Les deux projets demandent Node >=24 | Version 24 exacte disponible, checksum et import sous comptes réels |
| Amazonia | `amazonia.service`, `opc`, `/srv/jeu/amazonia`, ancien commit ci-dessus | Backend loopback, SQLite/WAL, gardes 1B.5 | Lancement effectif, enfants, données / artefact réellement utilisés |
| Portail | `atelier-portail.service`, `opc`, `/srv/jeu/atelier-portail-maitre`, `456199e66814958edc40d5580a0f73744fecc2ac` | Garde avant toutes routes, loopback:3000, recette backend dédiée | Registre réel, permissions, sudo existant, configs privées |
| Caddy | `/usr/bin/caddy`, `caddy.service` sous `caddy`, fichier de démarrage `/etc/caddy/Caddyfile` | Générateur Basic commun, `admin off`, preuve interne filtrée | Version, imports, configuration en mémoire, protections locales et hôtes exacts |
| Routes | `/lora/`→5050, `/lab/`→8080, `/bga/`→8082, `/amazonia/`→8083, `/`→3000, upstreams 127.0.0.1, `handle_path` | Même retrait des préfixes | Routes supplémentaires, API racine, redirects, cookies et WS/SSE |
| Réseau | 22/80/443 autorisés ; 3000/5050 ouverts dans règles OCI et zone publique examinées ; plusieurs écoutes globales | Nouveaux backends Amazonia/portail loopback | Toutes zones, règles riches/directes, NSG, IPv6 et plages de ports |
| Données | `/srv/jeu/amazonia/data`, ~109 Mo, 16 JSON dont 11 sous `campaigns`, deux fichiers vides, deux campagnes visibles COMPLETED, aucun worker lors du constat ; pas de SQLite/WAL/SHM recensé | Chargement historique dans la racine de campagnes, copie de quarantaine sans suppression des originaux | Écrivains actuels, inventaire complet, ID/compteurs des deux campagnes et compatibilité sur copie |
| Backup | `/home/opc/amazonia-data-backup-20261108-125739`, copie Windows dans Téléchargements, 16 SHA-256 identiques | Script backup/restauration SQLite | Restauration isolée non faite, cohérence au moment de la copie non prouvée |
| Voisins | LoRA et Forêt fonctionnent ; unités `lora-studio.service`, `foret-lab.service` actives | Transparence testée sur outil témoin seulement | BGA non testé, son unité n'est pas confirmée ; ne rien supprimer |

Le code ancien examiné écrit les JSON par `writeFile` direct et son chargeur peut supprimer des historiques jugés incompatibles ; une erreur de parsing peut aussi interrompre la boucle de chargement. **Ce constat Git ne prouve pas que ce code exact s'exécute sans patch sur Oracle.** Il interdit de compter sur une copie à chaud ou de relancer l'ancien code sur les seules données originales. Le nouveau chargeur conserve les octets et noms d'origine, copie les invalides dans `quarantine` par hash, et peut donc regrouper les deux fichiers vides dans une seule copie de quarantaine : les deux originaux doivent néanmoins subsister.

## 2. Accords et mode d'emploi

| Accord explicite, à dater dans le tableau final | Autorise | N'autorise pas |
|---|---|---|
| P — après revue ChatGPT de cette PR | Compléments en lecture seule, sauvegardes, staging, installation parallèle Node, comptes, fichiers privés et restauration sur copie | Arrêt des services publics, changement de routes/pare-feu/OCI, données de production |
| B — après remise des résultats P et résolution des inconnues | Fenêtre d'indisponibilité, isolement réseau, arrêts des deux applications, copie finale à froid, activation coordonnée et sondes de lecture | Création/reprise/suppression de campagne réelle, redéploiement des voisins |
| R — après vérification des refus et lectures | Une petite campagne identifiée, pause/reprise et redémarrage contrôlé d'Amazonia pour prouver la persistance ; recette fonctionnelle des voisins | Campagne massive, suppression historique, changement scientifique |
| A — après résultats R | Acceptation de l'état final, programmation séparée des sauvegardes | Purge automatique des anciens états et archives |

L'accord B doit aussi autoriser le **retour arrière fermé** de la section 7 si un contrôle échoue. Une approbation absente ne devient jamais implicite avec le temps. En cas de panne après B, fermer l'accès concerné et préserver les données en attendant décision plutôt que rouvrir l'ancien portail.

Utiliser la session Oracle habituelle du propriétaire, obtenue par son moyen existant : aucune commande SSH ni adresse de VM n'est fournie ici. Garder deux sessions d'administration et l'accès console OCI de secours pendant B. Ne pas utiliser `set -x`, ne pas coller configurations, historiques de terminal, HAR ou logs bruts dans GitHub. Les outils d'édition mentionnés ouvrent un éditeur local : enregistrer puis quitter, ne pas poursuivre tant que la revue privée n'est pas faite.

Pour chaque bloc numéroté, le paragraphe qui le précède donne **objectif / effets / attendu / arrêt** et s'applique à chacune de ses commandes. Tous les fichiers de sauvegarde ou de validation privés restent hors Git, y compris hashes Basic et captures de configuration Caddy développée.

## 3. Préparation P — compléter l'inventaire sans démarrer les applications

### P01 — établir le contexte et les capacités

**Objectif :** vérifier la VM connue. **Effets :** lectures seulement (journalisation système possible). **Attendu :** caractéristiques du bilan, outils disponibles, espace calculé suffisant. **Arrêt :** autre machine, commande absente ou budget de disque non chiffré. Les composants manquants exigent une préparation revue, jamais une installation improvisée.

```bash
hostname
cat /etc/os-release
uname -m
getconf _NPROCESSORS_ONLN
free -m
df -h / /srv/jeu /home/opc
df -i / /srv/jeu /home/opc
getenforce
command -v git python3 tar sha256sum curl xz sudo systemctl firewall-cmd ss namei openssl findmnt
findmnt -T /srv/jeu/amazonia/data
/usr/bin/node --version
/usr/bin/caddy version
```

### P02 — relever unités et processus en privé

**Objectif :** identifier les vrais fichiers de configuration, wrappers, enfants et dépendances. **Effets :** lectures privilégiées ; certaines sorties peuvent contenir des secrets, les consulter uniquement localement. **Attendu :** comptes/cwd/versions du bilan et correspondance PID→binaire ; les drop-ins et EnvironmentFile sont notés dans une liste privée. **Arrêt :** divergence inexpliquée, autre écrivain, superviseur ou stockage non identifié. Ne pas afficher `/proc/*/environ`.

```bash
systemctl show amazonia.service atelier-portail.service caddy.service lora-studio.service foret-lab.service --property=User,Group,WorkingDirectory,MainPID,FragmentPath,DropInPaths,ActiveState
sudo systemctl cat amazonia.service atelier-portail.service caddy.service
sudo ss -lntup
systemctl list-units --type=service --all
systemctl list-timers --all
sudo less /etc/caddy/Caddyfile
git -C /srv/jeu/amazonia rev-parse HEAD
git -C /srv/jeu/amazonia status --short
git -C /srv/jeu/atelier-portail-maitre rev-parse HEAD
git -C /srv/jeu/atelier-portail-maitre status --short
sudo find /srv/jeu/amazonia/data -xdev -type l -print
sudo find /srv/jeu/amazonia/data -xdev -type f -printf '%P\t%s octets\n'
sudo du -sh /srv/jeu/amazonia/data /srv/jeu/amazonia/node_modules /srv/jeu/atelier-portail-maitre/node_modules
```

Suivre manuellement les imports du Caddyfile et les fichiers de configuration référencés par les unités ; les ajouter à la liste privée d'archives P05. Vérifier si Caddy a été lancé avec `--resume` ou modifié par son API : le fichier disque seul ne prouve pas l'état en mémoire. Si la configuration effective ne peut pas être reconstituée de manière privée et sûre, **B est bloqué** ; ne pas publier un `caddy adapt` ou un GET admin pour compléter le rapport. Confirmer aussi les certificats, stockage Caddy, en-têtes, limites de corps, timeouts et éventuelles protections existantes à conserver.

Observer les PID, cgroups et exécutables avec les PID réellement relevés, sans deviner de numéro. Comparer localement le code déployé au commit ancien, notamment les écritures et le chargement des JSON. Une différence locale doit être sauvegardée et expliquée, pas écrasée par Git. Inventorier les tâches planifiées et autres lecteurs/écrivains des données, y compris les services hors systemd.

### P03 — identifier le registre et le périmètre réseau

**Objectif :** constater les fichiers/règles réels. **Effets :** lectures privées. **Attendu :** registre contenant toutes les routes existantes, inventaire complet firewalld et OCI. **Arrêt :** registre manquant/vide/invalide ou référence à un service inconnu. Ne pas appeler `/api/overview` de l'ancien portail pour cet inventaire.

```bash
rg -n 'REGISTRY_PATH|tools-registry|loadToolsRegistry' /srv/jeu/atelier-portail-maitre/server.ts
sudo firewall-cmd --get-active-zones
sudo firewall-cmd --list-all-zones
sudo firewall-cmd --permanent --list-all-zones
sudo firewall-cmd --direct --get-all-rules
sudo nft list ruleset
sudo -l -U opc
```

`rg` peut être absent sur Oracle : dans ce cas utiliser `grep -nE` avec le même motif, sans installer un paquet. Le nouveau code choisit `/srv/jeu/tools-registry.json` si `/home/opc` et `/etc/systemd/system` existent ; **c'est un chemin prévu par le code, pas encore un fichier confirmé**. Relever le chemin choisi par l'ancien processus, lire son fichier en privé et comparer au nouveau chemin. Ne pas exécuter `loadToolsRegistry()` : absent, invalide ou vide, il appelle `saveToolsRegistry(DEFAULT_TOOLS)` et peut remplacer le registre.

Dans la console OCI, sans rien modifier à ce stade : ouvrir la bonne région/tenancy → instance → VNIC attachées → sous-réseaux → toutes les Security Lists ; ouvrir aussi chacun des NSG des VNIC. Noter en privé les OCID et IDs des règles, IPv4/IPv6, source, protocole, plage de ports, règles stateful/stateless, accès IPv6 et éventuel load balancer/NAT/redirection. Une règle large « tous TCP » peut encore ouvrir 3000/5050 même après suppression de deux règles dédiées. Exporter/capturer l'état privé, sans données d'accès dans la PR. Confirmer le chemin de secours console et la règle SSH à préserver.

### P04 — fiche de paramètres, sans valeur inventée

**Objectif :** définir les chemins nouveaux et les valeurs observées. **Effets :** variables de cette session seulement. **Attendu :** toutes valeurs réelles/choisies puis relues ; aucune valeur secrète ici. **Arrêt :** champ vide, chemin relatif, lien symbolique, destination existante inattendue, collision ou espace. Les affectations calculées ne dispensent pas de la revue.

```bash
umask 077
read -r -p 'Chemin absolu du registre Oracle réellement identifié : ' REGISTRY
read -r -p 'Répertoire NOUVEAU de préparation et archives privées : ' STAGE
read -r -p 'Version Node 24 exacte approuvée, au format v24.x.y : ' NODE_VERSION
read -r -p 'Répertoire NOUVEAU installation parallèle Node (absolu) : ' NODE_ROOT
read -r -p 'Répertoire NOUVEAU copie complète data hors checkout : ' DATA_NEW
read -r -p 'Compte dédié portail approuvé (à créer, distinct de opc/amazonia/caddy) : ' PORTAL_USER
read -r -p 'Origine HTTPS principale réellement confirmée, sans slash final : ' PUBLIC_ORIGIN
read -r -p 'Liste exacte des origines HTTPS autorisées séparées par virgule : ' PUBLIC_ORIGINS
read -r -p 'Nom unique de cette opération (lettres/chiffres/tirets) : ' RUN_ID
NODE_BIN="$NODE_ROOT/bin/node"
CAMPAIGNS_NEW="$DATA_NEW/campaigns"
AMAZONIA_SHA=efdb787ad3edad845dfc60c6124f6bca2cd4dd6e
PORTAL_SHA=f62ef8148cdf18873272a169b48195443b532ce8
```

**Choix proposés seulement**, à approuver et vérifier libres : staging `/home/opc/mission-1c2-<identifiant>`, Node `/opt/node-<version-exacte>-linux-x64`, données `/var/lib/amazonia/data`, compte portail `atelier-portail`. Ce ne sont pas des constats Oracle. Node 24.22.1 est la référence des recettes précédentes, **pas une preuve de disponibilité ni un choix imposé**. Ne jamais substituer silencieusement « latest ».

Le code du portail contraint les checkouts à `/srv/jeu/<nom>` ou `/home/opc/<nom>`, un seul composant sous ces parents. Pour cette opération, les unités conserveront les cwd connus `/srv/jeu/amazonia` et `/srv/jeu/atelier-portail-maitre` ; B déplacera les anciens répertoires entiers en archives privées puis placera des releases préparées à ces mêmes chemins. Pas de `git reset --hard`, pas de données uniques dans les nouvelles releases. Le registre conserve ces vmPath ; une modification de port/service/subpath est hors périmètre sauf résolution revue d'une incompatibilité.

Relever les réponses dans une fiche **privée non sourcée**. Après reconnexion, reconstituer les variables avec les mêmes valeurs, sans recopier de commande contenant un secret. Tous les prérequis P doivent être terminés avant B.

**Objectif :** refuser les paramètres dangereux avant la première création. **Effets :** vérification locale seulement. **Attendu :** message de validation, aucune cible existante et parents canoniques persistants. **Arrêt :** toute assertion échoue ; ne pas raccourcir la vérification pour contourner le refus. Si le parent de DATA_NEW reste à créer, choisir et faire approuver ce parent dédié puis le provisionner séparément ; les commandes suivantes ne modifient pas un parent partagé.

```bash
python3 - "$REGISTRY" "$STAGE" "$NODE_ROOT" "$DATA_NEW" "$PORTAL_USER" "$RUN_ID" "$PUBLIC_ORIGIN" "$PUBLIC_ORIGINS" <<'PY'
import pathlib,re,sys,urllib.parse
registry,stage,node,data,user,run,origin,origins=sys.argv[1:]
for raw in (registry,stage,node,data):
    p=pathlib.Path(raw)
    assert re.fullmatch(r'/[A-Za-z0-9_./-]+',raw) and p.is_absolute() and str(p)==raw
    assert p.resolve()==p and '..' not in p.parts and raw!='/'
assert pathlib.Path(registry).is_file()
for raw in (stage,node,data): assert not pathlib.Path(raw).exists(), 'Cible déjà existante'
for raw in (stage,node): assert pathlib.Path(raw).parent.is_dir(), 'Parent absent'
assert not data.startswith(('/srv/jeu/','/home/opc/','/tmp/','/run/','/dev/'))
assert re.fullmatch(r'[a-z][a-z0-9-]{0,30}',user) and user not in ('opc','amazonia','caddy','root')
assert re.fullmatch(r'[A-Za-z0-9-]{1,64}',run)
for value in origins.split(','):
    u=urllib.parse.urlsplit(value)
    assert u.scheme=='https' and u.netloc and not u.path and not u.query and not u.fragment and not u.username
assert origin in origins.split(',')
print('Paramètres contrôlés ; disponibilité/capacité des volumes encore à confirmer')
PY
```

### P05 — sauvegarder code, artefacts, configurations et registre avant préparation

**Objectif :** conserver un état initial complet et ses métadonnées. **Effets :** création de STAGE, archives privées ; aucune modification des sources. **Attendu :** archives lisibles, hashes vérifiés, copie hors VM vérifiée. **Arrêt :** STAGE préexistant, erreur tar, manque de place, fichier oublié ou changeant. Ces archives de données à chaud sont seulement préliminaires : B fera la copie cohérente à froid.

```bash
test ! -e "$STAGE"
mkdir -m 700 "$STAGE"
mkdir -m 700 "$STAGE/artifacts" "$STAGE/reports" "$STAGE/candidates" "$STAGE/retired"
test -f "$REGISTRY"
test ! -L "$REGISTRY"
cp -p -- "$REGISTRY" "$STAGE/registry.before.json"
sudo tar --acls --xattrs --selinux --numeric-owner -cpf "$STAGE/config.before.tar" /etc/caddy /etc/systemd/system /etc/firewalld
sudo tar --acls --xattrs --selinux --numeric-owner -cpf "$STAGE/code.before.tar" /srv/jeu/amazonia /srv/jeu/atelier-portail-maitre
sudo tar --acls --xattrs --selinux --numeric-owner -cpf "$STAGE/data.preliminary.tar" /srv/jeu/amazonia/data
sudo chown opc:opc "$STAGE/config.before.tar" "$STAGE/code.before.tar" "$STAGE/data.preliminary.tar"
chmod 600 "$STAGE/registry.before.json" "$STAGE/config.before.tar" "$STAGE/code.before.tar" "$STAGE/data.preliminary.tar"
tar -tf "$STAGE/config.before.tar" > "$STAGE/reports/config.entries.private.txt"
tar -tf "$STAGE/code.before.tar" > "$STAGE/reports/code.entries.private.txt"
sha256sum "$STAGE/registry.before.json" "$STAGE/config.before.tar" "$STAGE/code.before.tar" "$STAGE/data.preliminary.tar" > "$STAGE/reports/archives.sha256"
sha256sum -c "$STAGE/reports/archives.sha256"
```

Le message tar « Removing leading / » est normal ; tout fichier changé pendant lecture exige une reprise après gel B. `tar` conserve propriétaires/modes, fichiers ignorés par Git, `.git`, `dist`, dépendances et données ; cela ne dispense pas de sauvegarder les unités fournisseur ailleurs que `/etc/systemd/system`, les exécutables et tous les EnvironmentFile, imports Caddy, secrets existants et données portail référencés par P02. Faire une **liste exacte privée** de ces chemins, les archiver avec la même commande tar dans une archive supplémentaire, la protéger et la hasher. Ne pas copier l'intégralité des disques ni modifier leurs propriétaires. Les fichiers privés futurs recevront une seconde sauvegarde privée avant B.

Transférer ces archives et leurs manifestes hors VM par le canal de transfert privé déjà maîtrisé du propriétaire (outil Windows existant, sans en inventer les paramètres). Vérifier SHA-256 côté Windows, par exemple `Get-FileHash -Algorithm SHA256 -LiteralPath` suivi du **chemin réellement téléchargé**. Le nom dans Téléchargements n'est pas connu : ne pas le deviner. Conserver les copies antérieures du 8 novembre ; aucune écriture dessus. Ne pas considérer une simple liste tar ou deux hashes égaux comme un test de restauration.

### P06 — préparer les deux releases sans toucher aux checkouts actifs

**Objectif :** figer exactement le code fusionné. **Effets :** clones de préparation uniquement. **Attendu :** commits ci-dessus, pas de données réelles dans les clones. **Arrêt :** SHA absent/différent ou scripts npm non revus. Relire les scripts des dépendances avant autorisation d'installation ; les projets n'ont pas de lockfile garanti, donc conserver les dépendances effectivement résolues.

```bash
git clone https://github.com/antoineacquaviva/Amazonia.git "$STAGE/amazonia.next"
git -C "$STAGE/amazonia.next" checkout --detach "$AMAZONIA_SHA"
git -C "$STAGE/amazonia.next" rev-parse HEAD
git clone https://github.com/antoineacquaviva/atelier-portail-maitre.git "$STAGE/portail.next"
git -C "$STAGE/portail.next" checkout --detach "$PORTAL_SHA"
git -C "$STAGE/portail.next" rev-parse HEAD
```

### P07 — Node 24 en parallèle, jamais remplacer /usr/bin/node

**Objectif :** télécharger et vérifier une distribution officielle Linux x64 approuvée, puis installer dans NODE_ROOT choisi. **Effets :** téléchargements STAGE, création exclusive NODE_ROOT ; aucun changement PATH global, alternatives, symlink système, Node 20 ou services. **Attendu :** version exacte 24, hash validé et import SQLite mémoire. **Arrêt :** version non approuvée, URL indisponible, hash incorrect, archive inattendue, dépendance système manquante, cible existante ou problème SELinux. Ne pas contourner SELinux ni passer `setenforce 0`.

```bash
[[ "$NODE_VERSION" =~ ^v24\.[0-9]+\.[0-9]+$ ]]
test ! -e "$NODE_ROOT"
curl --fail --show-error --location --proto '=https' --proto-redir '=https' "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt" -o "$STAGE/SHASUMS256.txt"
curl --fail --show-error --location --proto '=https' --proto-redir '=https' "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.xz" -o "$STAGE/node-$NODE_VERSION-linux-x64.tar.xz"
cd "$STAGE"
grep -E "  node-$NODE_VERSION-linux-x64.tar.xz$" SHASUMS256.txt > node.selected.sha256
test "$(wc -l < node.selected.sha256)" -eq 1
sha256sum -c node.selected.sha256
tar -tJf "node-$NODE_VERSION-linux-x64.tar.xz" > reports/node.entries.txt
```

Comparer le checksum avec les métadonnées officielles approuvées sur un second accès de confiance ; la liste téléchargée sur le même site protège contre la corruption, pas à elle seule contre une compromission de la source. Examiner la liste d'archive avant extraction : unique préfixe attendu, aucun chemin absolu/`..` ni lien sortant. L'installation suit seulement cette revue :

**Objectif :** extraire le binaire contrôlé. **Effets :** nouveau répertoire root-owned seulement. **Attendu :** Node canonique, executable par les comptes, SQLite disponible, ancien Node inchangé. **Arrêt :** chaque échec ; ne pas modifier des parents partagés pour le résoudre.

```bash
sudo install -d -m 755 "$NODE_ROOT"
sudo tar -xJf "$STAGE/node-$NODE_VERSION-linux-x64.tar.xz" --strip-components=1 --no-same-owner -C "$NODE_ROOT"
readlink -f "$NODE_BIN"
"$NODE_BIN" --version
"$NODE_BIN" -e 'const {DatabaseSync}=require("node:sqlite"); const d=new DatabaseSync(":memory:"); console.log(d.prepare("select 1 as ok").get()); d.close()'
/usr/bin/node --version
```

### P08 — dépendances, builds et conservation des artefacts

**Objectif :** construire les releases préparées avec ce Node et conserver leur résolution. **Effets :** node_modules, lockfiles locaux et dist dans STAGE seulement ; scripts npm autorisés ici après revue P06. **Attendu :** lint/tests/build réussis, base frontend `/amazonia/` et portail `/`, manifestes conservés. **Arrêt :** erreurs de peer/engine/build/test ; ne pas ajouter silencieusement `--force` ou `--legacy-peer-deps`. Les précédentes recettes ont utilisé une résolution spécifique : si nécessaire la documenter, la faire approuver et refaire les vérifications.

```bash
export PATH="$NODE_ROOT/bin:$PATH"
cd "$STAGE/amazonia.next"
"$NODE_BIN" "$NODE_ROOT/lib/node_modules/npm/bin/npm-cli.js" install --include=dev
"$NODE_BIN" "$NODE_ROOT/lib/node_modules/npm/bin/npm-cli.js" run lint
"$NODE_BIN" "$NODE_ROOT/lib/node_modules/npm/bin/npm-cli.js" test
"$NODE_BIN" "$NODE_ROOT/lib/node_modules/npm/bin/npm-cli.js" run build -- --base=/amazonia/
"$NODE_BIN" "$NODE_ROOT/lib/node_modules/npm/bin/npm-cli.js" ls --all --json > "$STAGE/reports/amazonia.dependencies.json"
cd "$STAGE/portail.next"
"$NODE_BIN" "$NODE_ROOT/lib/node_modules/npm/bin/npm-cli.js" install --include=dev
"$NODE_BIN" "$NODE_ROOT/lib/node_modules/npm/bin/npm-cli.js" run lint
"$NODE_BIN" "$NODE_ROOT/lib/node_modules/npm/bin/npm-cli.js" test
"$NODE_BIN" "$NODE_ROOT/lib/node_modules/npm/bin/npm-cli.js" run build -- --base=/
"$NODE_BIN" "$NODE_ROOT/lib/node_modules/npm/bin/npm-cli.js" ls --all --json > "$STAGE/reports/portail.dependencies.json"
```

Les tests Caddy/Chromium du portail sont conditionnels : un « skip » n'est pas un succès d'intégration. Avant B, exiger une recette isolée complète selon INTEGRATION_1B5 avec des **identifiants fictifs**, des versions Caddy/Chromium réellement identifiées et sans contact Oracle public. Si les outils locaux manquent, faire cette recette sur une autre machine de confiance et joindre seulement les résultats expurgés. Ce plan n'installe ni ne démarre Caddy de test. Archiver les clones construits avec node_modules/dist/lockfiles et Node exact dans STAGE/artifacts, hasher et transférer hors VM avant B. Ne pas déployer le HEAD de cette PR de documentation à la place du SHA applicatif fixé.

### P09 — registre : valider une copie sans remplacer ses entrées

**Objectif :** garantir toutes les entrées historiques et les contraintes du nouveau code. **Effets :** sortie de métadonnées privées, génération d'un candidat Caddy inactif. **Attendu :** registre non vide, chaque entrée valide, aucune collision, routes 5050/8080/8082/8083 présentes et racine 3000 séparée. **Arrêt :** entrée absente/incompatible ; ne jamais utiliser DEFAULT_TOOLS pour la réparer.

```bash
cd "$STAGE/portail.next"
"$NODE_BIN" --import tsx --input-type=module - "$STAGE/registry.before.json" <<'JS'
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {validateTool} from './src/server/validation.ts';
import {generateCaddyfile} from './src/server/caddyConfig.ts';
const tools=JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
assert(Array.isArray(tools) && tools.length>0);
for (const t of tools) validateTool(t);
generateCaddyfile(tools);
for (const [subpath,port] of [['/lora',5050],['/lab',8080],['/bga',8082],['/amazonia',8083]])
  assert(tools.some(t=>t.subpath===subpath && t.port===port), `Route manquante ${subpath}`);
console.table(tools.map(({id,subpath,port,vmPath,systemdUnit})=>({id,subpath,port,vmPath,systemdUnit})));
JS
"$NODE_BIN" --import tsx scripts/prepare-caddy.ts "$STAGE/registry.before.json" "$STAGE/candidates/Caddyfile.generated"
```

Vérifier tous les champs localement, surtout `execStart`, `buildCmd`, repo/branch et droits administratifs : le registre est une configuration de confiance. Conserver LoRA/Forêt/BGA et toute autre entrée observée, pas uniquement les quatre routes connues. Si l'ancien registre est à un autre emplacement que `/srv/jeu/tools-registry.json`, préparer une copie exacte à ce nouveau chemin **uniquement pendant B**, après sauvegarde des deux emplacements éventuels et décision revue. Une erreur de lecture/écriture peut être masquée par le portail ; tester les accès du futur compte avant son démarrage.

### P10 — comptes, stockage externe et permissions ciblées

**Objectif :** séparer les services sans changer les voisins. **Effets :** création de deux comptes système sans connexion et d'un stockage vide ; aucune modification de /srv/jeu ni /home/opc. **Attendu :** aucun sudo Amazonia, aucun sudo portail attribué dans cette mission ; comptes absents avant création et groupes privés créés. **Arrêt :** compte déjà existant non audité, nom invalide, cible data existante/liée ou sous checkout/home opc. Les commandes useradd ne sont pas à rejouer si les comptes ont été créés.

```bash
getent passwd amazonia
getent passwd "$PORTAL_USER"
```

Ici, absence (code 2) est attendue pour de nouveaux comptes. Si présents, arrêter et auditer au lieu de recréer. Après vérification des noms et du parent canonique du stockage :

**Objectif :** provisionner les cibles approuvées. **Effets :** comptes/dossiers dédiés seulement. **Attendu :** uid distincts, shell nologin, dossiers 0700. **Arrêt :** erreur ou propriétaire inattendu.

```bash
sudo useradd --system --user-group --no-create-home --shell /sbin/nologin amazonia
sudo useradd --system --user-group --no-create-home --shell /sbin/nologin "$PORTAL_USER"
sudo install -d -o amazonia -g amazonia -m 700 "$DATA_NEW"
sudo install -d -o amazonia -g amazonia -m 700 "$CAMPAIGNS_NEW"
id amazonia
id "$PORTAL_USER"
sudo -l -U amazonia
sudo -l -U "$PORTAL_USER"
```

Sans sudo portail, les opérations privilégiées de l'interface resteront indisponibles : c'est le choix de cette première mise en service manuelle. La recette vérifie le refus propre et ne clique pas « déployer », « mise à jour », « supprimer », « réparer » ou « redémarrer » d'un voisin. Si le propriétaire exige ensuite ces fonctions, préparer une politique minimale sur les unités et opérations exactes ou un helper séparé, à revoir ; aucun `NOPASSWD: ALL`, aucun accès écriture aux unités root. Les mises à jour Git du portail sont aussi hors recette.

### P11 — préparer les fichiers privés, uniquement après accord P

**Aucun secret ou hash réel n'est fourni ni généré par cette PR.** Les commandes suivantes ne seront exécutées que par le propriétaire dans son terminal privé, après P. Ne pas utiliser de mot de passe en argument, variable exportée, URL, screenshot ou journal. Ne pas sourcer un EnvironmentFile systemd dans Bash (le hash contient des `$`, les grammaires diffèrent).

**Objectif :** créer les répertoires privés normalisés par ce plan. **Effets :** nouvelles cibles seulement, pas de remplacement aveugle. **Attendu :** parents 0700 pour chaque backend. **Arrêt :** dossier/fichier déjà existant non audité. `/etc/amazonia/service.env` est requis par la recette du code ; les autres chemins ci-dessous sont des **cibles nouvelles proposées**, pas des constats.

```bash
sudo install -d -o amazonia -g amazonia -m 700 /etc/amazonia
sudo install -d -o "$PORTAL_USER" -g "$PORTAL_USER" -m 700 /etc/atelier-portail
/usr/bin/caddy hash-password
```

Saisir un mot de passe fort à l'invite interactive ; copier le hash uniquement dans l'éditeur privé ci-dessous, jamais dans le rapport. Choisir un identifiant Basic unique (non secret) et conserver le mot de passe dans le gestionnaire privé du propriétaire.

**Objectif :** créer une clé interne unique et ses deux copies sans affichage. **Effets :** trois fichiers nouveaux 0600 ; une clé hexadécimale de 32 octets. **Attendu :** fichiers égaux accessibles aux seuls comptes concernés. **Arrêt :** cible déjà existante, erreur de copie ou comparaison ; aucune rotation partielle.

```bash
sudo python3 - "$PORTAL_USER" <<'PY'
import os, pwd, secrets
p=pwd.getpwnam(__import__('sys').argv[1]); a=pwd.getpwnam('amazonia')
paths=['/etc/amazonia/internal-key','/etc/atelier-portail/internal-key','/etc/caddy/atelier-entry.env']
assert all(not os.path.lexists(x) for x in paths)
key=secrets.token_hex(32)
for path,uid,gid,content in [(paths[0],a.pw_uid,a.pw_gid,key+'\n'),(paths[1],p.pw_uid,p.pw_gid,key+'\n'),(paths[2],0,0,'ATELIER_INTERNAL_KEY='+key+'\n')]:
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f: f.write(content)
    os.chown(path,uid,gid)
PY
sudo cmp /etc/amazonia/internal-key /etc/atelier-portail/internal-key
sudoedit /etc/caddy/atelier-entry.env
sudoedit /etc/amazonia/service.env
sudoedit /etc/atelier-portail/service.env
```

Dans `atelier-entry.env`, conserver la ligne de clé, ajouter `ATELIER_BASIC_USER=` puis l'identifiant choisi et `ATELIER_BASIC_HASH=` puis le hash interactif, sans guillemets shell ni backslash ajoutés. Le hash reste privé. Ne jamais afficher `caddy environ` ou la configuration développée.

Dans `/etc/amazonia/service.env`, saisir les valeurs réellement choisies, sans les marqueurs explicatifs entre chevrons :

```text
NODE_ENV=production
AMAZONIA_CAMPAIGNS_DIR=<valeur canonique de CAMPAIGNS_NEW>
ATELIER_INTERNAL_KEY_FILE=/etc/amazonia/internal-key
ATELIER_PUBLIC_ORIGINS=<valeur de PUBLIC_ORIGINS>
AMAZONIA_WORKERS=2
AMAZONIA_BATCH_SIZE=5
AMAZONIA_CAMPAIGNS=1
```

Les limites 2 workers / lot 5 / une campagne sont des **choix prudents de recette**, pas un dimensionnement validé pour toutes charges. La configuration doit être identique sur copie isolée et en production. Pas d'augmentation automatique après acceptation.

Dans `/etc/atelier-portail/service.env` : `NODE_ENV=production`, `ATELIER_INTERNAL_KEY_FILE=/etc/atelier-portail/internal-key`, `ATELIER_PUBLIC_ORIGINS=` avec la même liste, `AMAZONIA_NODE_BINARY=` avec NODE_BIN canonique, `AMAZONIA_CAMPAIGNS_DIR=` avec CAMPAIGNS_NEW. Reprendre en privé toute autre variable nécessaire du portail ancien après examen (pas de secret perdu, pas de reprise aveugle de l'environnement complet).

**Objectif :** protéger et comparer les configurations sans les afficher. **Effets :** modes/propriétaires des seuls fichiers nouveaux. **Attendu :** 0600, clés égales, tous les chemins traversables uniquement par les comptes nécessaires. **Arrêt :** échec des contrôles ; ne pas assouplir vers 0644.

```bash
sudo chown root:root /etc/caddy/atelier-entry.env /etc/amazonia/service.env /etc/atelier-portail/service.env
sudo chmod 600 /etc/caddy/atelier-entry.env /etc/amazonia/service.env /etc/atelier-portail/service.env
sudo stat -c '%U %G %a %n' /etc/caddy/atelier-entry.env /etc/amazonia/internal-key /etc/atelier-portail/internal-key /etc/amazonia/service.env /etc/atelier-portail/service.env
sudo -u amazonia test -r /etc/amazonia/internal-key
sudo -u "$PORTAL_USER" test -r /etc/atelier-portail/internal-key
sudo -u amazonia test ! -r /etc/atelier-portail/internal-key
sudo -u "$PORTAL_USER" test ! -r /etc/amazonia/internal-key
sudo -u amazonia "$NODE_BIN" -e 'require("node:sqlite"); console.log(process.execPath,process.version)'
sudo -u "$PORTAL_USER" "$NODE_BIN" -e 'require("node:sqlite"); console.log(process.execPath,process.version)'
```

Comparer en privé avec Python les valeurs non affichées : les trois clés identiques, les deux origines identiques, les deux chemins campagnes identiques et NODE_BIN égal au fichier canonique. L'environnement root-owned est lu par systemd puis transmis au service, il n'a pas à être lisible directement par le compte. Les clés, elles, doivent être lisibles directement. Préparer une sauvegarde privée de ces nouveaux fichiers avec leur propriétaire/mode et copie hors VM, sans les ajouter à Git.

**Objectif :** effectuer cette comparaison sans exposer de valeur. **Effets :** lecture privée seulement. **Attendu :** « Contrats privés cohérents ». **Arrêt :** erreur de syntaxe, valeur différente/manquante ou fichier non régulier/canonique. Le plan impose ici une syntaxe simple `NOM=valeur` sans guillemets, commentaires sur ligne séparée, aucune expansion ; ne pas utiliser cette lecture pour des EnvironmentFile arbitraires.

```bash
sudo python3 - "$CAMPAIGNS_NEW" "$NODE_BIN" "$PUBLIC_ORIGINS" <<'PY'
import pathlib,re,sys,stat
def env(path):
    p=pathlib.Path(path); assert p.resolve()==p and p.is_file() and not p.is_symlink()
    assert stat.S_IMODE(p.stat().st_mode)==0o600 and p.stat().st_uid==0
    result={}
    for line in p.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith('#'): continue
        k,v=line.split('=',1); assert re.fullmatch(r'[A-Z][A-Z0-9_]*',k) and k not in result
        assert v and not any(c in v for c in '\"\'\\\r\n')
        result[k]=v
    return result
c=env('/etc/caddy/atelier-entry.env'); a=env('/etc/amazonia/service.env'); p=env('/etc/atelier-portail/service.env')
assert c['ATELIER_BASIC_USER'] and c['ATELIER_BASIC_HASH'].startswith('$2')
key=c['ATELIER_INTERNAL_KEY']; assert re.fullmatch(r'[a-f0-9]{64,128}',key)
for e in (a,p):
    f=pathlib.Path(e['ATELIER_INTERNAL_KEY_FILE'])
    assert f.resolve()==f and f.is_file() and not f.is_symlink()
    assert stat.S_IMODE(f.stat().st_mode) in (0o400,0o600) and f.read_text().strip()==key
    assert e['NODE_ENV']=='production' and e['AMAZONIA_CAMPAIGNS_DIR']==sys.argv[1]
    assert e['ATELIER_PUBLIC_ORIGINS']==sys.argv[3]
assert p['AMAZONIA_NODE_BINARY']==sys.argv[2] and str(pathlib.Path(sys.argv[2]).resolve())==sys.argv[2]
print('Contrats privés cohérents')
PY
```

### P12 — restaurer une copie JSON isolée et constater les campagnes

**Objectif :** prouver la restauration de la sauvegarde existante sans toucher à ses octets ni lancer l'ancien chargeur. **Effets :** nouvelle copie sous STAGE, création SQLite/quarantaine uniquement dans cette copie. Aucun port ouvert, aucune campagne créée/reprise, aucun service démarré. **Attendu :** 16 fichiers et hashes d'origine préservés, deux vides recensés, campagnes attendues retrouvées avec ID/état/compteurs ; toute différence est expliquée. **Arrêt :** chemin ou compte différent, lien, SQLite source inattendue, copie incomplète, changement d'historique ou campagne manquante. L'accord P autorise cet essai sur copie, pas sur la production.

Le dossier de sauvegarde contient lui-même `data`. La copie complète doit donc donner `restore-json/data/campaigns`, **jamais** `restore-json/campaigns`. Le constructeur CampaignManager peut créer un répertoire manquant : ne jamais l'utiliser pour détecter la bonne racine. Les contrôles suivants doivent réussir **avant** son appel. Les effectifs 16/11/2 sont ceux du bilan initial ; toute variation arrête le parcours pour nouvel inventaire et revue, sans ignorer ou réparer les fichiers.

<!-- 1c2:p12-copy -->
```bash
test ! -e "$STAGE/restore-json"
test ! -L "$STAGE/restore-json"
test -d /home/opc/amazonia-data-backup-20261108-125739/data/campaigns
cp -a /home/opc/amazonia-data-backup-20261108-125739 "$STAGE/restore-json"
SOURCE_DATA=/home/opc/amazonia-data-backup-20261108-125739/data
RESTORE_DATA="$STAGE/restore-json/data"
RESTORE_CAMPAIGNS="$RESTORE_DATA/campaigns"
```

**Objectif :** comparer l'arborescence `data` entière avant initialisation. **Effets :** lectures seulement. **Attendu :** 16 JSON à leurs chemins relatifs, 11 directement dans campaigns, deux vides et aucune SQLite préalable. **Arrêt :** racine absente, non canonique, symbolique, identique/imbriquée avec la source, dossier inattendu ou différence. Cette vérification est aussi celle de B02 avant chargement de sa copie finale ; y reprendre les variables définies à B02, sans refaire la copie P12.

<!-- 1c2:verify-json-copy -->
```bash
python3 - "$SOURCE_DATA" "$RESTORE_DATA" "$STAGE" <<'PY'
import pathlib,sys,hashlib,stat
src,dst,stage=map(pathlib.Path,sys.argv[1:])
for p in (src,dst,stage):
    assert p.is_absolute() and p.resolve()==p and p.is_dir() and not p.is_symlink(), 'Racine invalide'
assert dst.is_relative_to(stage) and dst!=stage, 'Copie hors staging'
assert src!=dst and not src.is_relative_to(dst) and not dst.is_relative_to(src), 'Source et copie non isolées'
assert dst.name=='data' and (dst/'campaigns').is_dir(), 'Arborescence data/campaigns requise'
def inv(root):
    d={}
    for p in root.rglob('*'):
        assert not p.is_symlink(), 'Lien interdit'
        assert p.is_dir() or stat.S_ISREG(p.stat().st_mode), 'Type de fichier inattendu'
        if p.is_file(): d[str(p.relative_to(root))]=(p.stat().st_size,hashlib.sha256(p.read_bytes()).hexdigest())
    return d
a,b=inv(src),inv(dst)
assert a==b, 'Copie différente'
assert len(a)==16 and all(p.endswith('.json') for p in a), 'Inventaire initial inattendu'
assert sum(pathlib.PurePosixPath(p).parent==pathlib.PurePosixPath('campaigns') for p in a)==11, 'Racine campaigns incorrecte'
assert sum(size==0 for size,h in a.values())==2, 'Fichiers vides inattendus'
assert not (dst/'data').exists() and not (dst/'campaigns'/'campaigns').exists(), 'Double niveau inattendu'
print('Copie vérifiée : 16 JSON, 11 campagnes, deux fichiers vides')
PY
```

**Objectif :** lire uniquement la copie validée. **Effets :** création SQLite/quarantaine dans RESTORE_CAMPAIGNS seulement. **Attendu :** rapport de campagnes compatibles ; aucune création/reprise de campagne. **Arrêt :** contrôle de chemin/état refusé ou campagne attendue manquante. L'argument `json` signifie une copie complète sous `data/campaigns` ; `sqlite` signifie la destination directe de l'outil restore, contenant déjà `orchestration.sqlite`. Toujours utiliser un chemin **existant sous STAGE**, jamais la source ni le stockage de production.

<!-- 1c2:load-restored -->
```bash
cd "$STAGE/amazonia.next"
AMAZONIA_WORKERS=2 AMAZONIA_CAMPAIGNS=1 AMAZONIA_BATCH_SIZE=5 "$NODE_BIN" --import tsx --input-type=module - "$RESTORE_CAMPAIGNS" "$STAGE" json > "$STAGE/reports/restored-campaigns.private.json" 2> "$STAGE/reports/restored-loader.private.log" <<'JS'
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {CampaignManager} from './src/server/campaignManager.ts';
const [root,stage,kind]=process.argv.slice(2);
assert(['json','sqlite'].includes(kind), 'Type de restauration inconnu');
for (const p of [root,stage]) assert(path.isAbsolute(p) && fs.realpathSync(p)===p && fs.statSync(p).isDirectory(), 'Racine existante canonique requise');
assert(root.startsWith(stage+path.sep), 'Gestionnaire limité à la copie sous STAGE');
if(kind==='json') assert(path.basename(root)==='campaigns' && path.basename(path.dirname(root))==='data', 'Racine data/campaigns requise');
if(kind==='sqlite') assert(fs.lstatSync(path.join(root,'orchestration.sqlite')).isFile() && !fs.lstatSync(path.join(root,'orchestration.sqlite')).isSymbolicLink(), 'SQLite restaurée requise');
assert(!fs.existsSync(path.join(root,'data')) && !fs.existsSync(path.join(root,'campaigns')), 'Niveau de campagnes inattendu');
for(const item of fs.readdirSync(root,{withFileTypes:true})) assert(!item.isSymbolicLink(), 'Lien interdit');
assert(fs.readdirSync(root).filter(n=>n.endsWith('.json')).length===11, 'Onze historiques JSON attendus');
const m=new CampaignManager({campaignsDir:root});
try { console.log(JSON.stringify(m.listCampaigns().map(c=>({id:c.id,status:c.status,progress:c.progress})),null,2)); }
finally {await m.close();}
JS
```

Comparer la copie des 16 fichiers à nouveau avec le même inventaire Python, en comparant **tous les chemins source à leur copie** et en autorisant uniquement les nouveaux fichiers SQLite/quarantaine dans la destination. Ne pas exiger une égalité de toute l'arborescence après initialisation. Lire le rapport et les erreurs en privé. Les fichiers vides ne se réparent pas ; la quarantaine attendue n'est pas une perte. Le nombre visible peut différer de l'ancien chargeur qui s'arrêtait à la première erreur : expliquer chaque ID supplémentaire/manquant et obtenir décision humaine avant B. Refaire cet essai sur la copie finale à froid de B avant démarrage public.

**Objectif :** sauvegarder et restaurer la SQLite nouvellement créée dans la copie. **Effets :** deux nouveaux répertoires de recette seulement. **Attendu :** manifeste et integrity_check valides, seconde restauration lisible, mêmes états/compteurs. **Arrêt :** erreur, archive partielle, bail/WAL/SHM inattendu ; ne rien effacer pour faire réussir l'outil.

<!-- 1c2:sqlite-roundtrip -->
```bash
cd "$STAGE/amazonia.next"
"$NODE_BIN" --import tsx scripts/backup.ts backup "$RESTORE_CAMPAIGNS" "$STAGE/sqlite-test-backup"
"$NODE_BIN" --import tsx scripts/backup.ts restore "$STAGE/sqlite-test-backup" "$STAGE/sqlite-test-restored"
```

L'outil SQLite restaure **le contenu de campaigns directement** dans `sqlite-test-restored` : sa racine est `$STAGE/sqlite-test-restored`, sans ajouter `/data/campaigns`. Relancer le bloc `1c2:load-restored` avec `RESTORE_CAMPAIGNS="$STAGE/sqlite-test-restored"`, l'argument `sqlite` à la place de `json`, et deux nouveaux fichiers de rapport (ne pas écraser les premiers), puis comparer les ID/états/compteurs. Jamais de gestionnaire sur l'archive. Le script intègre les empreintes et `integrity_check`, normalise uniquement l'archive, retire uniquement son bail et finalise son journal ; aucun `rm *-wal`, `rm *-shm` ou suppression manuelle du bail. Pour une future SQLite active, utiliser ce script avec WAL via l'API backup, pas `cp` du seul fichier. Il n'archive que la racine campagnes/quarantaine/JSON concernés : les cinq JSON hors campaigns et autres données restent dans la sauvegarde complète DATA_NEW séparée.

### P13 — compatibilité réelle des voisins, avant de choisir le Caddyfile final

Faire une référence fonctionnelle actuelle, puis la même recette sous Basic sur une entrée de recette isolée approuvée ou sur copie des outils. Aucun démarrage/arrêt des services publics pendant P. Ne pas transmettre de HAR brut : `Authorization`, Cookie, Set-Cookie, tokens de query et corps peuvent être secrets.

| Outil (route maintenue) | Référence actuelle | Vérifications obligatoires avec le propriétaire | Arrêt avant B |
|---|---|---|---|
| LoRA `/lora/`→5050 | Fonctionne selon bilan | Connexion/déconnexion propre, galerie, requête API réelle, upload/export autorisé non destructif, cookies, éventuel flux long | Bearer/Basic propre dans Authorization, API `/api` hors préfixe, redirection/cookie cassé, upload requis impossible |
| Forêt `/lab/`→8080 | Fonctionne selon bilan | Interface et fonction principale courte autorisée, assets, chargement/enregistrement/export selon usage réel, WS/SSE s'ils existent | Même critères ; ne pas lancer une recherche longue pour tester |
| BGA `/bga/`→8082 | Non testé | Identifier processus/unité réelle, tester la fonction disponible avec le propriétaire, noter précisément la référence | Inconnu persistant ou besoin de changement non revu ; ni déclaration « fonctionne », ni suppression |

Pour chaque outil relever : endpoints réellement utilisés, méthode/type/taille de corps, authentification `Authorization` ou cookie/autre header, Path/Domain/Secure/SameSite et collisions de cookies, `Location` et redirects absolus, URLs d'assets/API commençant à `/`, upgrades WS (101) et reconnexion, SSE avec `curl -N` seulement sur endpoint réellement identifié. Utiliser les DevTools du navigateur, comparer les requêtes avant/après et les fonctions, pas seulement un HTML 200.

Le Basic commun consomme `Authorization` et le supprime avant les backends : **un outil qui exige cet en-tête pour sa propre auth est incompatible en l'état**. Corriger via un mécanisme de session ou une entrée distincte protégée revue avant B, jamais une exception publique sans auth. Les cookies des voisins sont conservés sans réécriture ; le retrait du préfixe reste `handle_path`. Le repli API par Referer est supprimé : adapter les clients, ne pas le rétablir. Les WebSockets passent par Caddy natif ; le proxy Express du portail ne gère pas les upgrades, et conserve une limite JSON 256 Kio. Tester la route Caddy directe, les formulaires multipart et exports binaires réellement nécessaires ; pas de promesse générale de compatibilité issue des tests témoins.

### P14 — candidats systemd/Caddy et revue finale P

Préparer les fichiers texte suivants dans `$STAGE/candidates` via un éditeur, **sans les installer ni appeler daemon-reload**. Remplacer les chevrons avec les valeurs approuvées. Ils sont des propositions nouvelles ; réconcilier les directives locales utiles des unités existantes (limites, dépendances, confinement, SELinux). Ne pas copier de directives privilégiées inutiles. Si SELinux bloque le binaire sous /opt, faire établir un étiquetage/politique ciblé compatible par l'administrateur et le revoir ; ne pas inventer `chcon` ni wrapper permissif.

Amazonia, fichier candidat `amazonia.service` :

```ini
[Unit]
Description=Amazonia Node backend
After=network.target
[Service]
Type=simple
User=amazonia
Group=amazonia
WorkingDirectory=/srv/jeu/amazonia
Environment=NODE_ENV=production
Environment=PORT=8083
EnvironmentFile=/etc/amazonia/service.env
ExecStart=<NODE_BIN canonique> --import tsx server.ts
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=true
[Install]
WantedBy=multi-user.target
```

Portail, fichier candidat `atelier-portail.service` :

```ini
[Unit]
Description=Atelier portail maitre
After=network.target
[Service]
Type=simple
User=<PORTAL_USER>
Group=<PORTAL_USER>
WorkingDirectory=/srv/jeu/atelier-portail-maitre
Environment=NODE_ENV=production
EnvironmentFile=/etc/atelier-portail/service.env
ExecStart=<NODE_BIN canonique> --import tsx server.ts
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=true
[Install]
WantedBy=multi-user.target
```

Drop-in Caddy candidat `caddy-entry.conf` :

```ini
[Service]
EnvironmentFile=/etc/caddy/atelier-entry.env
```

Pas de remplacement du compte, du binaire, du stockage TLS, de l'ExecStart/ExecReload Caddy ou de sa configuration fournisseur sans besoin démontré. La configuration finale porte `admin off` : l'activation exigera un redémarrage, pas `caddy reload`. L'interruption des connexions WS/SSE des voisins doit être annoncée et leur reconnexion vérifiée.

Copier `Caddyfile.generated` vers un **nouveau** `Caddyfile.reviewed`, réconcilier manuellement les hôtes réels, imports, protections et options existantes. Ne pas copier le générateur directement dans `/etc/caddy/Caddyfile`. Vérifier dans le candidat :

- `basic_auth` à l'intérieur d'un `route` avant toutes branches et redirections de chaque hôte HTTPS ; aucun hôte alternatif ou accès IP ne donne une entrée ouverte ; HTTP ne sert que redirection HTTPS, sans réception d'identifiants en clair.
- Conservation `/lora`, `/lab`, `/bga`, `/amazonia` avec slash et sans slash ; `handle_path` retire le préfixe ; racine/API portail protégées.
- `Authorization`, X-User, X-Forwarded-User, Remote-User supprimés ; X-Atelier-Internal **écrasé**, jamais ajouté à une valeur cliente, pour portail/Amazonia seulement ; retiré pour tous les autres upstreams ; cookies conservés chez les voisins, retirés chez portail/Amazonia.
- Toutes les variables Caddy requises présentes, aucune clé littérale dans le candidat, aucune exception admin/API ; éventuels logs ne capturent pas les headers secrets.

**Objectif :** valider la syntaxe des unités candidates sans activation. **Effets :** lecture des candidats seulement. **Attendu :** aucune erreur. **Arrêt :** placeholder restant, directive invalide, dépendance manquante ou propriété locale non réconciliée.

```bash
systemd-analyze verify "$STAGE/candidates/amazonia.service" "$STAGE/candidates/atelier-portail.service"
```

La validation Caddy réelle sera faite par une unité transitoire **oneshot de validation uniquement** pendant B, avec son binaire, son compte et ses EnvironmentFile exacts. P ne démarre aucun service. Avant accord B, joindre au rapport : fiche des paramètres non secrets, inventaire complet, référence voisins/BGA, artefacts hachés hors VM, restauration réussie, candidats revus, chemins de rollback et matrice réseau exacte. Toutes les inconnues doivent être résolues ou bloquer B explicitement.

## 4. Bascule B — contrôles immédiatement avant modification

Avant chaque commande B, confirmer l'accord B daté, fenêtre annoncée et moyens de secours. Réactualiser les états campagnes connus avec le propriétaire, sans appeler une mutation. Si campagne RUNNING ou état inconnu, arrêter cette procédure : aucune interruption n'est autorisée implicitement par l'ancien bilan « deux COMPLETED ». Ne pas utiliser les actions administratives du portail pour déployer.

### B01 — isoler les accès directs dans OCI et firewalld, préserver SSH

Dans OCI, effectuer uniquement les changements **exacts préparés à P03**, règle par règle : retirer les autorisations directes 3000 et 5050 de chaque Security List et NSG concerné, ainsi que toute plage/protocole/source IPv4/IPv6 qui maintient l'accès aux backends. Préserver 22 et ses sources actuelles, 80/443 et les besoins non applicatifs inventoriés. Si une règle large inclut SSH, ajouter d'abord les règles de conservation revues puis retirer la règle large ; ne jamais supprimer puis tenter de recréer SSH. Ne supprimer ni VNIC, ni sous-réseau, ni NSG complet. Consigner ID de règle avant/après et preuve de reconnexion depuis une **nouvelle session**.

Pour les deux règles simples connues seulement, après confirmation de leur présence exacte en runtime et permanent dans la zone public :

**Objectif :** fermer ces deux entrées hôte sans rechargement global. **Effets :** retrait ciblé, runtime puis permanent. **Attendu :** SSH et HTTPS restent joignables, backends inaccessibles extérieurement IPv4/IPv6. **Arrêt :** zone/règle différente, SSH non préservé, autre ouverture couvrant les ports. Les autres zones/règles riches/directes doivent avoir leurs commandes exactes revues à P03 : ne pas improviser leur suppression.

```bash
sudo firewall-cmd --zone=public --query-port=3000/tcp
sudo firewall-cmd --zone=public --query-port=5050/tcp
sudo firewall-cmd --zone=public --remove-port=3000/tcp
sudo firewall-cmd --zone=public --remove-port=5050/tcp
sudo firewall-cmd --permanent --zone=public --remove-port=3000/tcp
sudo firewall-cmd --permanent --zone=public --remove-port=5050/tcp
sudo firewall-cmd --list-all-zones
sudo firewall-cmd --permanent --list-all-zones
sudo ss -lntup
```

Ne pas faire `firewall-cmd --reload` ni `--runtime-to-permanent` : cela pourrait appliquer/capturer d'autres changements. Tester depuis un poste extérieur (pas depuis la VM) les IP réelles IPv4 **et IPv6 si assignée**, ports 3000/5050/8080/8082/8083 et tout autre backend inventorié. Par exemple Windows `Test-NetConnection -ComputerName` avec l'adresse réelle et `-Port` avec chaque port : `TcpTestSucceeded=False` attendu pour les backends, `True` pour 22 et 443. Ces paramètres doivent provenir de P03 ; aucune IP n'est inventée ici. Des règles hôte/OCI fermées protègent aussi les voisins encore sur toutes interfaces. Prévoir séparément leur écoute loopback avec leur option propre validée ; ne pas redémarrer LoRA/Forêt/BGA pour deviner cette option.

### B02 — figer les applications et sauvegarder à froid

**Objectif :** arrêter tous les écrivains connus des deux applications avant copie finale. **Effets :** indisponibilité portail/Amazonia ; Caddy et voisins restent actifs. **Attendu :** unités inactives et cgroups/processus enfants vides. **Arrêt :** écrivain survivant/inconnu, nouvelle campagne ou arrêt échoué. Ne pas employer `fuser -k` ni tuer un port.

```bash
sudo systemctl stop atelier-portail.service
sudo systemctl stop amazonia.service
systemctl show atelier-portail.service amazonia.service --property=ActiveState,SubState,MainPID,ControlGroup
sudo ss -lntup
sudo systemd-cgls
```

`MainPID=0` seul ne suffit pas : vérifier aussi superviseurs, tâches planifiées, conteneurs et autres écrivains recensés. Les deux ports 3000/8083 doivent être libres. Ne pas démarrer un gestionnaire pour savoir si les fichiers sont utilisés.

**Objectif :** sauver un état froid daté et le registre exact puis vérifier. **Effets :** nouvelles archives/manifestes uniquement. **Attendu :** hashes complets et fichiers vides inchangés, code/config/version archivés, place suffisante. **Arrêt :** erreur, changement pendant copie, SQLite/WAL/SHM nouvellement découvert : basculer vers la procédure SQLite revue avant de poursuivre, pas vers une copie JSON seule.

```bash
sudo tar --acls --xattrs --selinux --numeric-owner -cpf "$STAGE/data.final.tar" -C /srv/jeu/amazonia data
sudo tar --acls --xattrs --selinux --numeric-owner -cpf "$STAGE/code.final.tar" /srv/jeu/amazonia /srv/jeu/atelier-portail-maitre
sudo tar --acls --xattrs --selinux --numeric-owner -cpf "$STAGE/config.final.tar" /etc/caddy /etc/systemd/system /etc/firewalld /etc/amazonia /etc/atelier-portail
cp -p -- "$REGISTRY" "$STAGE/registry.final.json"
sudo chown opc:opc "$STAGE/data.final.tar" "$STAGE/code.final.tar" "$STAGE/config.final.tar"
chmod 600 "$STAGE/data.final.tar" "$STAGE/code.final.tar" "$STAGE/config.final.tar" "$STAGE/registry.final.json"
sha256sum "$STAGE/data.final.tar" "$STAGE/code.final.tar" "$STAGE/config.final.tar" "$STAGE/registry.final.json" > "$STAGE/reports/final.sha256"
sha256sum -c "$STAGE/reports/final.sha256"
cmp "$STAGE/registry.before.json" "$STAGE/registry.final.json"
```

Toute différence de registre impose une nouvelle validation P09/P14 et revue, pas un écrasement avec la copie périmée. Inclure aussi dans config.final.tar les fichiers externes identifiés P02/P05. Copier l'état final hors VM et vérifier les hashes avant remplacement.

**Objectif :** restaurer l'archive froide pour recette isolée. **Effets :** nouvelle copie sous STAGE seulement. **Attendu :** `restore-final/data/campaigns`, car B02 archive le membre relatif `data` avec `-C /srv/jeu/amazonia data`. **Arrêt :** cible déjà existante/liée, archive dont les membres ne sont pas ceux attendus sous `data/`, ou erreur d'extraction ; ne pas l'aplatir. Examiner `tar -tf` avant extraction (aucun chemin absolu/`..`, lien ou fichier spécial). Les archives viennent de la source inventoriée sans liens, pas d'un tiers.

<!-- 1c2:b02-extract -->
```bash
test ! -e "$STAGE/restore-final"
test ! -L "$STAGE/restore-final"
mkdir -m 700 "$STAGE/restore-final"
sudo tar --acls --xattrs --selinux --numeric-owner -xpf "$STAGE/data.final.tar" -C "$STAGE/restore-final"
SOURCE_DATA=/srv/jeu/amazonia/data
RESTORE_DATA="$STAGE/restore-final/data"
RESTORE_CAMPAIGNS="$RESTORE_DATA/campaigns"
```

Rejouer ensuite les seuls blocs P12 `1c2:verify-json-copy` et `1c2:load-restored` avec **ces variables**, en choisissant des noms de rapports nouveaux. Ne pas rejouer la copie de la vieille sauvegarde P12, qui ne testerait pas l'archive finale. Si les propriétaires restaurés nécessitent des droits pour lire la copie, faire ajuster les permissions de cette seule copie par l'opérateur ; ne jamais modifier la source pour cet essai. Décider ensuite si tous les historiques attendus sont disponibles. Ces opérations prolongent l'indisponibilité : réserver cette durée dans B.

### B03 — copier tout data dans le stockage dédié, sans aplatir campaigns

**Objectif :** migrer tous les fichiers, pas seulement les deux campagnes visibles. **Effets :** écritures dans DATA_NEW uniquement ; originaux conservés. **Attendu :** égalité des chemins relatifs / tailles / hashes, dont les deux vides et les JSON hors campaigns. **Arrêt :** destination non vide inattendue, lien ou différence.

```bash
sudo find "$DATA_NEW" -mindepth 1 -print
```

À ce stade seul le répertoire `campaigns` vide créé en P10 doit apparaître. Après vérification visuelle de ce point :

**Objectif :** refuser une mauvaise racine ou une destination déjà utilisée avant copie. **Effets :** lectures seulement. **Attendu :** source canonique avec campaigns et 16 fichiers JSON, destination canonique distincte contenant seulement campaigns vide. **Arrêt :** toute assertion échoue, y compris lien cassé, destination non vide ou confusion data/campaigns ; aucun fichier n'est copié.

<!-- 1c2:b03-preflight -->
```bash
sudo python3 - /srv/jeu/amazonia/data "$DATA_NEW" "$CAMPAIGNS_NEW" <<'PY'
import pathlib,sys,stat
src,dst,campaigns=map(pathlib.Path,sys.argv[1:])
for p in (src,dst,campaigns):
    assert p.is_absolute() and p.resolve()==p and p.is_dir() and not p.is_symlink(), 'Racine invalide'
assert src!=dst and not src.is_relative_to(dst) and not dst.is_relative_to(src), 'Racines non isolées'
assert campaigns==dst/'campaigns' and (src/'campaigns').is_dir(), 'Racine campaigns incorrecte'
assert list(dst.iterdir())==[campaigns] and not list(campaigns.iterdir()), 'Destination non vide inattendue'
files=[]
for p in src.rglob('*'):
    assert not p.is_symlink(), 'Lien source interdit'
    assert p.is_dir() or stat.S_ISREG(p.stat().st_mode), 'Type source inattendu'
    if p.is_file(): files.append(p)
assert len(files)==16 and all(p.suffix=='.json' for p in files), 'Inventaire source inattendu'
assert sum(p.parent==src/'campaigns' for p in files)==11, 'Onze JSON campagnes attendus'
assert sum(p.stat().st_size==0 for p in files)==2, 'Deux fichiers vides attendus'
assert not (src/'data').exists() and not (src/'campaigns'/'campaigns').exists(), 'Double niveau inattendu'
print('Migration prête : racines distinctes, 16 JSON, destination vide')
PY
```

**Objectif :** copier sans suivre de liens ni omettre de fichier caché. **Effets :** copie des données froides ; droits resserrés sur cette seule arborescence nouvelle. **Attendu :** aucune différence de contenu et accès du compte amazonia. **Arrêt :** chemin DATA_NEW non canonique/hors checkout, erreur de copie ou hash différent. Aucun chown/chmod des parents partagés ni des voisins.

<!-- 1c2:b03-copy -->
```bash
sudo cp -a --no-dereference /srv/jeu/amazonia/data/. "$DATA_NEW/"
sudo find "$DATA_NEW" -type d -exec chown amazonia:amazonia {} +
sudo find "$DATA_NEW" -type f -exec chown amazonia:amazonia {} +
sudo find "$DATA_NEW" -type d -exec chmod 700 {} +
sudo find "$DATA_NEW" -type f -exec chmod 600 {} +
sudo python3 - /srv/jeu/amazonia/data "$DATA_NEW" <<'PY'
import pathlib,hashlib,sys
def inv(root):
    result={}
    for p in pathlib.Path(root).rglob('*'):
        assert not p.is_symlink(), 'Lien interdit'
        if p.is_file(): result[str(p.relative_to(root))]=(p.stat().st_size,hashlib.sha256(p.read_bytes()).hexdigest())
    return result
a,b=map(inv,sys.argv[1:]); assert a==b, 'Migration différente'; print('Copie vérifiée:',len(a),'fichiers')
PY
sudo -u amazonia test -w "$CAMPAIGNS_NEW"
```

**Objectif :** autoriser explicitement la première création SQLite après inventaire. **Effets :** seul marqueur nouveau dans CAMPAIGNS_NEW. **Attendu :** pas de SQLite préexistante, marqueur exclusif 0600. **Arrêt :** base/marqueur déjà présent non expliqué ; ne jamais écraser.

```bash
sudo -u amazonia python3 - "$CAMPAIGNS_NEW" <<'PY'
import pathlib,os,sys
p=pathlib.Path(sys.argv[1]); assert p.resolve()==p and p.is_dir()
assert not any(p.glob('*.sqlite*')), 'SQLite inattendue'
fd=os.open(p/'.amazonia-storage',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
os.close(fd)
PY
```

Les onze JSON campagnes vont dans DATA_NEW/campaigns, pas DATA_NEW/campaigns/campaigns. Les autres JSON restent dans DATA_NEW à leurs chemins relatifs. Le nouveau gestionnaire crée SQLite dans CAMPAIGNS_NEW et lit les historiques à ce même niveau ; aucune conversion massive ni réparation des vides.

Ne pas exécuter le bloc de lecture de recette P12 sur DATA_NEW/CAMPAIGNS_NEW : c'est le futur stockage de production. Sa lecture réelle commence uniquement lors de B05 après les contrôles et accords prévus. Les essais du gestionnaire se font sur `restore-json/data/campaigns`, `restore-final/data/campaigns` ou une nouvelle restauration isolée, jamais sur les originaux.

### B04 — placer les releases sans réécrire les anciennes

**Objectif :** archiver les anciens checkouts complets puis mettre les nouveaux à leur cwd connu. **Effets :** renommages et copie des releases préparées ; aucune unité encore redémarrée. **Attendu :** anciens checkouts accessibles dans retired, SHA/dist/deps nouveaux exacts, propriétaires ciblés. **Arrêt :** cible retired existante, manque de place, données non sauvegardées ou erreur après premier déplacement ; utiliser section 7, ne pas poursuivre à moitié.

```bash
test ! -e "$STAGE/retired/amazonia"
test ! -e "$STAGE/retired/atelier-portail-maitre"
sudo mv /srv/jeu/amazonia "$STAGE/retired/amazonia"
sudo mv /srv/jeu/atelier-portail-maitre "$STAGE/retired/atelier-portail-maitre"
sudo cp -a "$STAGE/amazonia.next" /srv/jeu/amazonia
sudo cp -a "$STAGE/portail.next" /srv/jeu/atelier-portail-maitre
sudo chown -R root:root /srv/jeu/amazonia
sudo chown -R "$PORTAL_USER:$PORTAL_USER" /srv/jeu/atelier-portail-maitre
sudo -u amazonia test -r /srv/jeu/amazonia/server.ts
sudo -u amazonia test -x /srv/jeu/amazonia/node_modules/.bin/tsx
sudo -u "$PORTAL_USER" test -r /srv/jeu/atelier-portail-maitre/server.ts
```

Les deux chown récursifs ci-dessus concernent **uniquement les nouvelles releases identifiées**, jamais `/srv/jeu`, un parent ou une ancienne release ; vérifier absence de lien sortant avant exécution. Amazonia lit du code root-owned, écrit uniquement dans DATA_NEW et ses fichiers de service autorisés ; portail ne devient pas propriétaire Amazonia. Le choix root-owned désactive de fait la mise à jour Amazonia par le portail : mises à jour manuelles pour ce déploiement, à expliquer dans la recette.

Donner au compte portail lecture/écriture sur **le seul fichier registre réel** après sauvegarde, sans droits sur /srv/jeu :

**Objectif :** préserver le registre tout en permettant son usage normal. **Effets :** propriétaire/mode de ce seul fichier. **Attendu :** hash identique à registry.final.json, comptes voisins inchangés. **Arrêt :** registre réel non égal au chemin attendu du nouveau code ou accès parent insuffisant ; préparer une résolution ciblée revue, aucun chown récursif.

```bash
sudo chown "$PORTAL_USER:$PORTAL_USER" "$REGISTRY"
sudo chmod 600 "$REGISTRY"
sudo -u "$PORTAL_USER" test -r "$REGISTRY"
sudo -u "$PORTAL_USER" test -w "$REGISTRY"
cmp "$REGISTRY" "$STAGE/registry.final.json"
namei -l /srv/jeu/amazonia/server.ts
namei -l /srv/jeu/atelier-portail-maitre/server.ts
namei -l "$CAMPAIGNS_NEW"
```

### B05 — installer les unités revues, démarrer les backends fermés

**Objectif :** activer exactement les deux unités revues et l'environnement Caddy. **Effets :** installation ciblée des fichiers, daemon-reload, démarrage des deux nouveaux backends. **Attendu :** comptes dédiés, Node exact, 127.0.0.1:8083/3000 ; Caddy ancien ne fournit pas encore la preuve, donc accès backend refusé pendant cette transition. **Arrêt :** drop-in préexistant contradictoire, SELinux AVC, restart loop, configuration erronée ; ne pas retirer les gardes ni essayer Node 20.

```bash
sudo install -o root -g root -m 644 "$STAGE/candidates/amazonia.service" /etc/systemd/system/amazonia.service
sudo install -o root -g root -m 644 "$STAGE/candidates/atelier-portail.service" /etc/systemd/system/atelier-portail.service
sudo install -d -o root -g root -m 755 /etc/systemd/system/caddy.service.d
sudo install -o root -g root -m 644 "$STAGE/candidates/caddy-entry.conf" /etc/systemd/system/caddy.service.d/atelier-entry.conf
sudo restorecon -F /etc/systemd/system/amazonia.service /etc/systemd/system/atelier-portail.service /etc/systemd/system/caddy.service.d/atelier-entry.conf
sudo systemctl daemon-reload
sudo systemctl start amazonia.service
sudo systemctl start atelier-portail.service
systemctl show amazonia.service atelier-portail.service --property=ActiveState,SubState,User,MainPID,WorkingDirectory
sudo ss -lntup
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' http://127.0.0.1:8083/api/health
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' http://127.0.0.1:3000/api/overview
```

Les deux sondes directes doivent rendre **403**, pas 200 ; 503 signifie configuration manquante et bloque la suite. Vérifier le binaire via `/proc/<PID réellement relevé>/exe` et cwd, sans lire l'environnement. Examiner en privé les logs récents ciblés et les AVC SELinux si échec. Le nouveau gestionnaire peut créer SQLite/quarantaine maintenant ; comparer encore tous les JSON source contre leurs copies sans exiger l'absence de nouveaux fichiers. Pas de campagne RUNNING spontanée.

### B06 — valider Caddy sous son vrai environnement, sans publier ses sorties

**Objectif :** valider le candidat avec `/usr/bin/caddy`, compte caddy et EnvironmentFile réel via systemd, sans shell interprétant le hash. **Effets :** oneshot de validation, fichier de sortie privé uniquement ; aucune ouverture de port et aucun remplacement du Caddy actif. **Attendu :** exit 0 et candidate inchangé. **Arrêt :** variable manquante ou validation refusée ; garder les backends fermés. P02 doit confirmer qu'aucun autre EnvironmentFile/paramètre nécessaire à Caddy n'est omis ; sinon compléter cette commande lors de la revue P.

```bash
sudo install -o root -g caddy -m 640 "$STAGE/candidates/Caddyfile.reviewed" /etc/caddy/Caddyfile.1c2-candidate
sudo systemd-run --unit="caddy-validate-$RUN_ID" --wait --collect --service-type=oneshot --property=User=caddy --property=Group=caddy --property=EnvironmentFile=/etc/caddy/atelier-entry.env --property="StandardOutput=append:$STAGE/reports/caddy-validation.private.log" --property="StandardError=append:$STAGE/reports/caddy-validation.private.log" /usr/bin/caddy validate --config /etc/caddy/Caddyfile.1c2-candidate --adapter caddyfile
```

Contrôler **avant** cette commande, sans afficher les valeurs, la présence/non-vacuité des trois variables et le format de clé ; `caddy validate` seul ne constitue pas une preuve que tous les secrets sont corrects. Les propriétés de confinement/stockage du vrai service sont à comparer, car une unité transitoire n'hérite pas automatiquement des options de caddy.service. En cas d'erreur lire le fichier privé localement, ne pas le coller dans la PR. Ne pas faire `caddy adapt --pretty`, ni exposer l'API admin.

### B07 — activer l'entrée Basic commune

**Objectif :** remplacer le fichier relu puis redémarrer Caddy, seule coupure commune aux outils. **Effets :** nouveau Caddyfile et redémarrage caddy.service ; connexions longues interrompues. **Attendu :** Caddy actif, HTTPS valide, authentification partout, reconnections des voisins. **Arrêt :** démarrage échoué, exposition anonyme, erreur TLS ou route perdue ; section 7 immédiatement, jamais restauration publique du Caddyfile ancien non protégé.

```bash
sudo install -o root -g caddy -m 640 /etc/caddy/Caddyfile.1c2-candidate /etc/caddy/Caddyfile
sudo restorecon -F /etc/caddy/Caddyfile
sudo systemctl restart caddy.service
systemctl is-active caddy.service
```

Ne pas utiliser reload : `admin off` retire son API. Ne pas lancer le générateur depuis l'interface. Après chaque modification de config/secret, il faudrait refaire validation et activation coordonnées, pas tourner les clés d'un seul service.

## 5. Vérifications B sans mutation de campagne

### B08 — vérifier la frontière publique et directe

**Objectif :** contrôler le Basic et les lectures, sans secret en ligne de commande. **Effets :** requêtes de lecture publiques seulement. **Attendu :** sans Basic 401 sur chaque route HTTPS, bon Basic 200 JSON sur santé et campagnes, faux headers ne passent pas. **Arrêt :** 200 anonyme, 3xx avant contrôle Basic en HTTPS, HTML à la place de JSON, 5xx ou mauvais certificat. Ne pas utiliser `-k` ; ne pas suivre silencieusement les redirects.

```bash
for suffix in / /api/overview /lora /lora/ /lab /lab/ /bga /bga/ /amazonia /amazonia/ /amazonia/api/health /amazonia/api/campaigns; do
  curl --silent --show-error --output /dev/null --write-out "$suffix %{http_code}\n" "$PUBLIC_ORIGIN$suffix"
done
curl --silent --show-error --header 'X-User: admin' --header 'X-Atelier-Internal: invalid' --output /dev/null --write-out '%{http_code}\n' "$PUBLIC_ORIGIN/amazonia/api/health"
read -r -p 'Identifiant Basic choisi (pas le mot de passe) : ' BASIC_USER
curl --fail --silent --show-error --user "$BASIC_USER" "$PUBLIC_ORIGIN/amazonia/api/health" --output "$STAGE/reports/health.private.json"
curl --fail --silent --show-error --user "$BASIC_USER" "$PUBLIC_ORIGIN/amazonia/api/campaigns" --output "$STAGE/reports/campaigns.private.json"
curl --silent --show-error --header 'X-User: admin' --header 'X-Atelier-Internal: invalid' --output /dev/null --write-out '%{http_code}\n' http://127.0.0.1:8083/api/health
curl --silent --show-error --header 'X-User: admin' --header 'X-Atelier-Internal: invalid' --output /dev/null --write-out '%{http_code}\n' http://127.0.0.1:3000/api/overview
```

`curl --user` avec le seul identifiant demande le mot de passe sans l'inscrire dans l'historique. Répéter avec mot de passe incorrect saisi à l'invite : 401 attendu. Répéter pour **chaque hôte confirmé**, www compris ; HTTP doit rediriger HTTPS sans Basic envoyé sur HTTP. Avec Basic valide, un header interne faux doit être écrasé par Caddy et la lecture doit réussir ; sans Basic il reste refusé. En accès direct loopback, Basic valide seul doit encore donner 403 ; les ports publics restent fermés, IPv6 compris. Si besoin d'un test authentifié CSRF, le faire uniquement sur l'ID de recette après accord R ou sur copie, jamais via un POST supposé inoffensif sur un ID historique.

Lire les rapports JSON en privé et comparer ID, états COMPLETED et compteurs attendus à P12/B02 ; ouvrir/exporter les historiques requis depuis le navigateur sans reprise ni suppression. Confirmer les empreintes et les deux fichiers vides intacts. Examiner les logs privés pour éviter fuite de clé/Basic ; un résultat de test expurgé suffit au compte rendu. Vérifier Caddy admin non écouté, Node exact/comptes dédiés, services voisins toujours actifs, registre inchangé et absence de redéploiement automatique au démarrage portail.

## 6. Accord R — petite campagne persistante et recette complète

Le propriétaire autorise maintenant une campagne **nouvelle et seule** de recette ; ne jamais reprendre ni supprimer une campagne historique. Prendre une sauvegarde SQLite avec scripts/backup.ts et une archive complète DATA_NEW avant l'essai ; destinations nouvelles et copie hors VM vérifiée. Réutiliser **seulement les commandes backup/restore** P12 : la source du backup est alors CAMPAIGNS_NEW, mais la destination restore est un répertoire nouveau sous STAGE, directement racine de campagnes. Le gestionnaire de recette ne reçoit jamais CAMPAIGNS_NEW : il reçoit cette nouvelle copie restaurée, avec l'argument `sqlite` et de nouveaux rapports. Ne pas rejouer la vérification « 16 JSON avant initialisation » sur une racine qui contient désormais SQLite. Le compte effectif doit avoir accès à la destination sans donner au portail les données Amazonia.

### R01 — préparer une configuration de dix parties sans lancer le calcul

**Objectif :** produire un JSON de recette borné depuis les constantes de la release. **Effets :** fichier local dans STAGE seulement. **Attendu :** protocole historique, une variante, une table, dix parties, validation réussie. **Arrêt :** ID existant, nombre différent ou erreur de validation. Les paramètres sont un **choix de recette**, pas une modification du moteur.

```bash
cd /srv/jeu/amazonia
"$NODE_BIN" --import tsx --input-type=module - "$STAGE/recipe-campaign.json" "$RUN_ID" <<'JS'
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {DEFAULT_SWEEP_INPUT as S} from './src/sim/i18n.ts';
import {expandParameterSweep} from './src/sim/evaluator.ts';
import {validateCampaignConfig} from './src/server/campaignValidation.ts';
const sweep=Object.fromEntries(Object.entries(S).map(([k,v])=>[k,Array.isArray(v)?[v[0]]:v]));
const c={id:'recette-1c2-'+process.argv[3],name:'Recette 1C.2 — 10 parties',type:'MONTE_CARLO_SWEEP',gamesPerVariantAndTable:10,baseSeed:42,sweep,selectedTableConfigs:[{id:'recette',name:'Recette',description:'Essai autorisé',botProfiles:['COORD_HYBRID']}],includeCalibrationTables:false};
validateCampaignConfig(c); assert.equal(expandParameterSweep(c.sweep).length,1);
fs.writeFileSync(process.argv[2],JSON.stringify(c,null,2),{flag:'wx',mode:0o600});
console.log('Configuration prête, aucune campagne créée');
JS
```

### R02 — créer une seule campagne après relecture

**Objectif :** lancer exactement cette campagne. **Effets :** écriture SQLite et workers bornés, dix parties. **Attendu :** réponse JSON avec l'ID prévu, aucun doublon. **Arrêt :** erreur/timeout/réponse ambiguë ; consulter la liste avant toute nouvelle tentative, jamais renvoyer le POST à l'aveugle.

```bash
curl --fail --silent --show-error --user "$BASIC_USER" --header "Origin: $PUBLIC_ORIGIN" --header 'Content-Type: application/json' --data-binary "@$STAGE/recipe-campaign.json" "$PUBLIC_ORIGIN/amazonia/api/campaigns" --output "$STAGE/reports/recipe-created.private.json"
```

Pour prouver l'absence de dépendance au navigateur, fermer **complètement** le navigateur pendant un calcul observé RUNNING puis consulter depuis un second appareil/session neuve via Basic. Si dix parties finissent trop vite, ne pas prétendre avoir observé la déconnexion pendant calcul : demander une extension bornée, chiffrée et approuvée de la recette, pas une campagne massive automatique. La commande curl ferme déjà sa connexion après la réponse, mais cela ne remplace pas l'observation navigateur demandée.

### R03 — contrôles de refus et checkpoints sur le seul ID de recette

Depuis l'interface sur le bon ID, vérifier pause → stabilisation du compteur après les lots en vol → reprise explicite → progression sans doublon. Si l'essai est déjà COMPLETED, ne pas inventer une pause réussie : faire approuver un essai assez long et borné sur copie ou une seconde recette distincte. Pour les sondes, relever l'ID dans le rapport réel puis :

**Objectif :** vérifier CSRF avant une action valide sur la seule campagne de recette. **Effets :** les trois premières requêtes doivent être refusées sans mutation ; la dernière peut suspendre la recette. **Attendu :** 403, 403, 403 puis succès JSON uniquement si l'état permet pause. **Arrêt :** une mutation refusée passe ; fermer l'entrée et examiner avant de poursuivre.

```bash
read -r -p 'ID exact de la campagne de recette créée : ' RECIPE_ID
curl --silent --show-error --user "$BASIC_USER" --header 'Content-Type: application/json' --data '{}' --output /dev/null --write-out '%{http_code}\n' "$PUBLIC_ORIGIN/amazonia/api/campaigns/$RECIPE_ID/pause"
curl --silent --show-error --user "$BASIC_USER" --header 'Origin: https://origine-invalide.example' --header 'Content-Type: application/json' --data '{}' --output /dev/null --write-out '%{http_code}\n' "$PUBLIC_ORIGIN/amazonia/api/campaigns/$RECIPE_ID/pause"
curl --silent --show-error --user "$BASIC_USER" --header "Origin: $PUBLIC_ORIGIN" --header 'Content-Type: text/plain' --data '{}' --output /dev/null --write-out '%{http_code}\n' "$PUBLIC_ORIGIN/amazonia/api/campaigns/$RECIPE_ID/pause"
curl --fail --silent --show-error --user "$BASIC_USER" --header "Origin: $PUBLIC_ORIGIN" --header 'Content-Type: application/json' --data '{}' "$PUBLIC_ORIGIN/amazonia/api/campaigns/$RECIPE_ID/pause" --output "$STAGE/reports/recipe-paused.private.json"
```

Pour reprendre, utiliser la même dernière commande avec le suffixe `/resume` et un **nouveau** fichier de rapport. Réserver `/stop` à la recette prévue pour l'arrêt ; ne pas tester DELETE sur les historiques. Les mutations du portail ne doivent pas être testées avec un POST qui pourrait déployer/redémarrer un voisin.

### R04 — persistance après redémarrage contrôlé d'Amazonia

**Objectif :** prouver le stockage durable et la reprise exclusivement explicite. **Effets :** interruption d'Amazonia uniquement, sans Caddy/portail/voisins. **Attendu :** ID/compteurs conservés, campagne interrompue PAUSED, aucune nouvelle campagne automatique, reprise explicite sans doublon puis total exact ; si déjà COMPLETED, persistance de cet état uniquement démontrée. **Arrêt :** campagne réelle active, incohérence, changement de version, reprise spontanée. Ce redémarrage doit être couvert explicitement par R.

```bash
sudo systemctl restart amazonia.service
systemctl is-active amazonia.service
curl --fail --silent --show-error --user "$BASIC_USER" "$PUBLIC_ORIGIN/amazonia/api/campaigns/$RECIPE_ID" --output "$STAGE/reports/recipe-after-restart.private.json"
free -m
df -h "$DATA_NEW"
sudo du -sh "$DATA_NEW"
systemctl show amazonia.service --property=MemoryCurrent,CPUUsageNSec,TasksCurrent
```

Comparer total planifié/exécuté, génération/checkpoints et résultats/export. Vérifier CPU/RAM/disque/WAL durant la recette ; garder assez de marge pour sauvegarde et rollback, sans swap/OOM ni saturation des voisins. Si limite atteinte, suspendre la recette via sa commande autorisée, pas une campagne historique. Prouver aussi une **nouvelle restauration SQLite isolée de la sauvegarde contenant cette recette**, lecture même ID/compteurs avec la release exacte et aucune reprise automatique ; utiliser les commandes backup/restore P12 puis le gestionnaire en mode `sqlite` sur la destination directe restaurée sous STAGE, sans pointer le gestionnaire sur l'archive ni le stockage actif. La sauvegarde complète séparée conserve les fichiers hors campaigns ; ne pas prétendre que l'archive SQLite seule restaure les 16 JSON dans leur arborescence data.

### R05 — rejouer la matrice des voisins et accepter

Rejouer P13 sur l'entrée publique Basic, y compris connexion/logout propre, upload/export, corps/formulaire, cookies, redirects, assets/API, WS/SSE et reconnexion après B07. Le panneau portail doit répertorier tous les outils conservés ; les fonctions sudo indisponibles sont identifiées comme telles, sans donner des droits généraux pour les faire passer. BGA doit avoir une référence et un résultat documentés ; tout écart bloque l'acceptation et exige correction revue ou retour arrière fermé. Ne pas masquer une régression par un retrait de route.

Conserver la recette identifiée et ses exports, prendre une nouvelle sauvegarde complète + SQLite vérifiée hors VM, consigner version Node et commits effectivement servis. Faire accepter par le propriétaire ; ne supprimer aucune ancienne release, archive, JSON vide ou quarantaine dans cette mission. Planifier ensuite fréquence/rétention/test périodique de restauration dans une demande distincte.

## 7. Retour arrière fermé (autorisé avec B, jamais exécuté ici)

### Principe et décision

| Moment de l'échec | Action autorisée et données |
|---|---|
| Pendant P, avant B | Garder les services actifs inchangés. Archiver les résultats P ; ne pas nettoyer en masse. Aucun retour de configuration nécessaire. |
| B02/B04 avant nouvelle écriture | Garder les deux applications arrêtées. Réparer/replacer les releases depuis retired seulement dans une entrée fermée ; données originales préservées. |
| Auth, TLS, route ou voisin cassé après B | Fermer l'entrée publique ; arrêter les deux nouvelles applications ; conserver le réseau fermé. Ne pas remettre publiquement l'ancien portail ni l'ancien Caddyfile sans protection. |
| SQLite/checkpoints créés, campagne de recette acceptée | Sauvegarder l'état nouveau via backup SQLite et archive data à froid, garder ses campagnes séparées ; restaurer uniquement une version compatible sur un **nouveau** stockage propre. Aucun ancien code JSON contre la SQLite nouvelle. |

La disponibilité vient après la protection : si aucune release compatible protégée n'a été prévalidée, l'issue sûre est l'indisponibilité contrôlée jusqu'à correction. L'ancien portail a des opérations administratives non gardées ; l'ancien code Amazonia peut supprimer certains JSON au chargement. Aucun démarrage de ces anciens programmes contre les originaux, même pour « voir si ça marche ». Une reprise historique SCIENTIFIC_V1 peut refuser à cause de schéma/provenance ; ne jamais falsifier les empreintes ni le manifeste.

### RB01 — contenir immédiatement

**Objectif :** empêcher toute exposition lors d'un échec de sécurité. **Effets :** indisponibilité de l'entrée commune (LoRA/Forêt/BGA deviennent temporairement inaccessibles sans arrêt de leurs unités), puis arrêt des deux applications. **Attendu :** aucune route publique ne sert l'administration, SSH conservé. **Arrêt :** arrêt impossible ; appliquer le plan de fermeture 80/443 OCI préparé à P03 en conservant 22, puis vérifier depuis l'extérieur. Ce plan de secours doit être approuvé dans B.

```bash
sudo systemctl stop caddy.service
sudo systemctl stop atelier-portail.service
sudo systemctl stop amazonia.service
sudo ss -lntup
systemctl show caddy.service atelier-portail.service amazonia.service --property=ActiveState,MainPID
```

Si une panne applicative ne touche pas la frontière Basic prouvée, on peut garder Caddy protégé et les voisins accessibles ; conserver les deux backends défaillants fermés. Ne jamais restaurer les ouvertures 3000/5050 ou les règles larges sauvegardées pour « revenir comme avant ».

### RB02 — archiver l'état échoué avant toute restauration

**Objectif :** préserver les écritures postérieures à la sauvegarde et les versions/configurations associées. **Effets :** nouvelles archives privées, aucun écrasement. **Attendu :** aucun écrivain, état courant sauvegardé/restaurable séparément ; copie hors VM. **Arrêt :** écrivain survivant, espace insuffisant ou archive partielle. En cas de SQLite valide, créer d'abord le snapshot cohérent par l'outil 1B.4, puis l'archive complète froide.

```bash
cd /srv/jeu/amazonia
sudo "$NODE_BIN" --import tsx scripts/backup.ts backup "$CAMPAIGNS_NEW" "$STAGE/failed-sqlite-backup"
sudo tar --acls --xattrs --selinux --numeric-owner -cpf "$STAGE/failed-data.tar" "$DATA_NEW"
sudo tar --acls --xattrs --selinux --numeric-owner -cpf "$STAGE/failed-config.tar" /etc/caddy /etc/systemd/system /etc/amazonia /etc/atelier-portail
sudo sha256sum "$STAGE/failed-data.tar" "$STAGE/failed-config.tar" > "$STAGE/reports/failed.sha256"
```

Si aucune SQLite n'existe encore ou si le backup échoue, ne pas créer une base pour réussir : préserver l'archive brute froide et faire diagnostiquer l'intégrité sur copie. Les archives sous STAGE 0700 restent privées ; protéger aussi leur transfert. Ne supprimer ni bail, WAL, SHM ni campagnes postérieures à la sauvegarde.

### RB03 — restaurer dans des cibles nouvelles, toujours entrée fermée

Les commandes suivantes restaurent des **copies de revue**, pas les fichiers actifs :

**Objectif :** reconstruire la configuration/code/data antérieurs pour comparaison et choisir une version compatible. **Effets :** nouveaux dossiers dans STAGE uniquement. **Attendu :** métadonnées archivées retrouvées, différences expliquées. **Arrêt :** cible préexistante, archive/hash invalide, fichier externe manquant ou manque de place.

```bash
mkdir -m 700 "$STAGE/rollback-config" "$STAGE/rollback-code" "$STAGE/rollback-json"
sudo tar --acls --xattrs --selinux --numeric-owner -xpf "$STAGE/config.final.tar" -C "$STAGE/rollback-config"
sudo tar --acls --xattrs --selinux --numeric-owner -xpf "$STAGE/code.final.tar" -C "$STAGE/rollback-code"
sudo tar --acls --xattrs --selinux --numeric-owner -xpf "$STAGE/data.final.tar" -C "$STAGE/rollback-json"
```

Cette extraction donne **`$STAGE/rollback-json/data/campaigns`**, pas `rollback-json/campaigns`. Pour lire cette seule copie avec la release ciblée : `SOURCE_DATA` désigne la source froide inventoriée, `RESTORE_DATA="$STAGE/rollback-json/data"` et `RESTORE_CAMPAIGNS="$RESTORE_DATA/campaigns"`. Rejouer la vérification JSON P12 avant le gestionnaire et créer de nouveaux rapports. Ce parcours s'applique à l'archive JSON initiale ; une archive postérieure contenant SQLite ne doit pas être présentée comme une archive JSON de 16 fichiers. Suivre alors la restauration SQLite ci-dessous.

Pour restaurer une sauvegarde SQLite compatible, employer la release/Node exacts de son manifeste : `scripts/backup.ts restore` avec chemin archive identifié et **nouvelle destination inexistante** ; même commande P12, pas d'invention de nom de sauvegarde ni restauration sur CAMPAIGNS_NEW. Affecter seulement les fichiers restaurés au compte dédié et vérifier sur copie les ID/compteurs, schéma/provenance, absence de reprise automatique. Conserver les campagnes plus récentes dans `failed-sqlite-backup` / `failed-data.tar`, séparées, sans fusion de bases.

Pour revenir aux anciens répertoires de code aux cwd initiaux, **après archives RB02 et seulement si aucun service ne tourne**, retirer les nouvelles releases par renommage vers des destinations nouvelles approuvées dans STAGE, puis déplacer les dossiers `retired/amazonia` et `retired/atelier-portail-maitre` à leurs cwd d'origine. Ne pas les démarrer ; les originaux et données anciennes restent ainsi disponibles pour expertise. Une exécution de l'ancien code, si elle devient nécessaire, utilisera un clone de ces données dans un contexte isolé revu, jamais leur seule copie.

Ne pas extraire config.final.tar sur `/` : restaurer explicitement les seuls fichiers unitaires/drop-ins concernés depuis rollback-config après comparaison privée, garder Caddy arrêté ou un Caddyfile protégé prévalidé. Ne pas restaurer le pare-feu ancien. Après correction, refaire `systemd-analyze verify`, validation Caddy avec ses vrais EnvironmentFile, puis l'ordre B05→B08 et accord R si nouvelle recette. Sans candidats compatibles et protégés approuvés, **arrêter ici et faire approuver le correctif concret**. Pas de retour public automatique à l'ancienne stack.

## 8. Tableau opérateur à remplir (aucun secret)

| Étape | Responsable | Accord / date Europe-Paris | Preuve attendue expurgée | État / décision |
|---|---|---|---|---|
| Revue de cette PR par ChatGPT | Propriétaire | À renseigner | Lien PR et observations | À faire |
| P autorisée | Propriétaire | À renseigner | Accord explicite de préparation seulement | Bloquant |
| P01–P04 inventaire | Opérateur | À renseigner | Unités/versions/registre/Caddy effectif/réseau et paramètres confirmés | À faire |
| P05 sauvegardes | Opérateur | À renseigner | Archives privées, hashes, copie hors VM | À faire |
| P06–P08 releases/Node | Opérateur | À renseigner | SHAs, version/hash Node, builds/tests, artefacts conservés | À faire |
| P09 registre et routes | Opérateur | À renseigner | Toutes entrées conservées/validées, aucune substitution DEFAULT_TOOLS | À faire |
| P10–P11 comptes/privés | Opérateur | À renseigner | Droits ciblés et égalité des preuves, sans leurs valeurs | À faire |
| P12 restauration | Opérateur | À renseigner | Historiques/vides intacts, ID/compteurs, backup SQLite restauré | Bloquant |
| P13 voisins | Propriétaire | À renseigner | LoRA/Forêt et référence BGA, Authorization/API/cookies/WS résolus | Bloquant |
| P14 candidats | Relecteur | À renseigner | Caddy réconcilié, unités/SELinux, matrice réseau et secours revus | À faire |
| B autorisée, rollback fermé compris | Propriétaire | À renseigner | Créneau/durée/indisponibilité et secours approuvés | Bloquant |
| B01 fermeture directe | Opérateur | À renseigner | OCI + hôte + IPv6, nouvelle session SSH réussie | À faire |
| B02–B04 froid / migration | Opérateur | À renseigner | Aucun écrivain, backup final hors VM, restauration, hashes égaux | À faire |
| B05–B07 activation | Opérateur | À renseigner | Comptes/Node/loopback, refus directs, validation Caddy et TLS | À faire |
| B08 lectures / sécurité | Propriétaire | À renseigner | 401/403, lectures JSON et historiques, registre/voisins | Bloquant |
| R autorisée | Propriétaire | À renseigner | ID/budget de recette et redémarrage Amazonia autorisés | Bloquant |
| R01–R04 campagne/persistance | Opérateur | À renseigner | Compteurs exacts, second appareil, pause/reprise/redémarrage, restauration | À faire |
| R05 voisins | Propriétaire | À renseigner | Matrice fonctionnelle complète, BGA inclus | À faire |
| A acceptation / ou rollback fermé | Propriétaire | À renseigner | Sauvegarde finale hors VM, écarts/résolution, décision explicite | À faire |

## 9. Validation de cette livraison documentaire

Cette PR ajoute ce document et son [test documentaire sur fixtures](../tests/documentation/oracle_restore_1c2.py). Aucun code applicatif, moteur, bot, dépendance du projet, registre, donnée réelle ou secret n'est modifié. Aucun appel SSH ou HTTP vers Oracle, aucune gestion de service, aucune installation Node et aucune génération de secret réel. Les contrôles de syntaxe sont distincts de l'essai fonctionnel ci-dessous. Les résultats antérieurs 1B.5 ne sont pas présentés comme une recette Oracle ni comme des tests réexécutés pour cette PR.

### Correction après revue — parcours de restauration réellement exercé sur fixtures

P12 lit désormais `restore-json/data/campaigns`, B02 `restore-final/data/campaigns`, B03 copie le **contenu** de data vers DATA_NEW (`data/.`, aucun niveau data supplémentaire) et RB03 lit `rollback-json/data/campaigns`. Une restauration par `scripts/backup.ts restore` donne directement la racine campagnes, sans ajouter data/campaigns. Les réutilisations de P12 après initialisation utilisent cette branche SQLite et ne relancent pas le contrôle de copie JSON vierge.

Commande effectivement exécutée **dans Codex uniquement**, avec des dépendances de test isolées sous `/tmp` (tsx 4.21.0, aucun changement des dépendances des dépôts) et Node 24.22.1 déjà présent :

```bash
python3 tests/documentation/oracle_restore_1c2.py --amazonia-root /workspace/Amazonia --tsx-loader /tmp/amazonia-1c2-doc-test-deps/node_modules/tsx/dist/loader.mjs
```

Le test exige le checkout Amazonia propre au commit `efdb787ad3edad845dfc60c6124f6bca2cd4dd6e` et extrait les blocs marqués de ce document, afin de contrôler les commandes écrites et leurs arguments. Il remplace les seuls chemins Oracle par les racines temporaires, le chargeur tsx par son chemin local, les rapports de seconde lecture par de nouveaux noms, et retire sudo des seules opérations de fichiers testées. Le lecteur du gestionnaire utilise un worker configuré au lieu de deux sur cet hôte de test à deux CPU disponibles ; il ne lance ni calcul, ni serveur HTTP, ni service. Les changements de propriétaire, SELinux, unités, comptes, secrets et règles réseau ne sont pas exécutés ni validés par cet essai.

**Résultats : neuf groupes de validation fonctionnelle réussis.** Copie `cp -a`, archive `tar -C parent data`, extraction et copie `data/.` réellement exécutées sur 16 JSON fictifs : onze dans campaigns, cinq hors campaigns, dont deux fichiers vides préservés. Deux historiques compatibles COMPLETED sont réellement lus par CampaignManager avec compteurs 10/20 ; sept JSON incompatibles fictifs sont conservés avec quarantaine. L'outil Amazonia réel crée une sauvegarde SQLite, valide intégrité/manifeste et restaure une nouvelle destination ; celle-ci retrouve les mêmes ID/états/compteurs. La lecture de la copie ne change pas l'archive.

Les refus sont exercés pour racine absente, confusion data/campaigns, racine source originale, chemin symbolique, fichier supplémentaire, JSON vide altéré, destination de migration non vide, racines source/destination identiques, réextraction et restauration sur cible existante, et empreinte d'archive falsifiée. L'instantané des sources fictives (contenu, arborescence, tailles, modes, UID/GID et mtime, hors atime) est identique avant/après. Les originaux ne sont jamais ouverts par CampaignManager. Le checkout Amazonia reste inchangé.

Limite : la SQLite de cet essai contient le schéma d'orchestration réel ; les campagnes historiques demeurent dans leurs JSON comme le prévoit cette version. L'essai ne crée pas de campagne durable, ne simule pas une charge worker ni un WAL actif, et ne remplace ni la restauration des données réelles après accord P ni la recette R sur Oracle. Les suites applicatives complètes ne sont pas relancées pour cette correction documentaire. Analyse syntaxique des blocs Bash/Python/JavaScript et `git diff --cached --check` également réussis ; ces contrôles ne sont pas la preuve fonctionnelle.

Limites bloquantes conservées : Caddy effectif complet, registre, règles OCI/IPv6, BGA et authentification des voisins, version Node choisie/disponible, permissions/SELinux, restauration et cohérence réelle des copies. Le plan peut être revu maintenant ; **il n'est pas un feu vert d'exécution tant que ces éléments et les accords P/B/R ne sont pas acquis**. La mission 1C.2 se termine à la PR du plan, non fusionnée.
