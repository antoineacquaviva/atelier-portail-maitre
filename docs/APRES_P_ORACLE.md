# Amazonia après P — diagnostic et décisions avant bascule

État transmis par le propriétaire le **9 novembre 2026**. Cette PR prépare du
code, des tests et des instructions dans Codex ; elle n'autorise aucune opération
sur Oracle, aucune fusion et aucun déploiement. Sa fusion éventuelle ne vaut pas
autorisation d'exécution. Aucun résultat Oracle n'est revendiqué par Codex.

## Notice pour le propriétaire

La préparation a réussi. **Ne relancez pas P**, même pour ajouter le
provisionnement. Conservez ses dossiers, scripts, marqueurs, exports et toutes
les anciennes sauvegardes. Il reste à vérifier les accès, les protections Caddy,
les droits et la place nécessaire avant de choisir les opérations réelles.

La prochaine proposition est un diagnostic groupé, sans changement de service,
sans installation et sans secret créé. Le nouveau script se place dans un dossier
distinct ; il ne remplace aucun fichier conservé. Son rapport peut contenir des
« UNKNOWN » : cela demande une vérification, ce n'est pas la preuve d'un échec.
Un administrateur doit compléter les parties privées, puis le propriétaire
approuver séparément le provisionnement, la bascule B et la recette R.

## 1. Acquis, constats et inconnues

Sources : [plan 1C.2](DEPLOIEMENT_ORACLE_1C2.md),
[préparation 1C.3](PREPARATION_ORACLE_1C3.md),
[reprise historique 1C.3.4](REPRISE_ORACLE_1C34.md), scripts/tests associés et
bilan du propriétaire. Les anciennes consignes de nouvelle tentative sont
historiques pour cette opération : les étapes réussies ne sont pas à refaire.

| Référence figée | Valeur à conserver |
|---|---|
| Amazonia | `e81bcf2076972b7617f6202d2bbfe94314144c17` |
| Portail préparé | `9924ab535dace8c49bda208508d2384dcd56090d` |
| Scripts P conservés | `1d14521e6915ac1204db7d58dee5c99bf0b91850` |
| Workspace P | `/home/opc/atelier-preparation-1c3-20261109-01` |
| Dossier scripts P | `/home/opc/atelier-scripts-1c34-20261109` |
| Export | `export-00000`, rapport identique à celui du workspace |

**Résultat P transmis :** code 0, `phase=P_ONLY`, `success=true`,
`ready_for_deployment=false` ; cinq étapes réussies : node, amazonia, portal,
restoration, candidates. Aucun service/réseau modifié, aucun secret créé. La
restauration et les candidats sont des résultats de préparation isolée, pas la
sauvegarde froide finale ni la preuve de fonctionnement public.

Les `blockers` de `Preparation.report()` sont une liste de décisions/prérequis
restants, générée même en cas de succès. Ils ne sont pas un compte rendu de tests
tous exécutés et échoués. Un test conditionnel ignoré ne devient pas réussi parce
que `npm test` a terminé avec 0. Ne pas réécrire le rapport P pour retirer ces
blocages ; joindre les nouvelles preuves séparément.

| Sujet | Fait observé transmis / résultat P | Écart ou inconnue qui bloque l'action concernée |
|---|---|---|
| Exécution | Amazonia, portail, LoRA et Forêt actifs sous opc ; Caddy actif sous caddy ; Node actif v20.20.2 | Unités, drop-ins, wrappers, enfants, exécutables, cwd, modifications locales et écrivains actuels à réconcilier avant déplacement de code/data |
| Runtime | Node préparé v24.22.1 ; Caddy v2.11.7 | Installation parallèle finale, lecture/exécution sous comptes réels et SELinux non attestées ; ne pas substituer Node ou des releases plus récentes |
| Comptes / privés | Comptes amazonia et atelier-portail absents | Créer comptes et secrets exige un accord distinct. Chemins privés sous /etc et /var/lib/amazonia/data absents **ou inaccessibles** : absence non établie |
| Réseau hôte | firewalld actif, SELinux Enforcing ; écoutes IPv4 globales 3000/5050/8080/8083, 22 et 111 ; Caddy 80/443 et admin 127.0.0.1:2019 | Une écoute ne prouve pas l'exposition Internet. Vérifier IPv6, toutes zones/règles/plages/policies/NAT, runtime et permanent ; traiter aussi 111 et les plages larges selon usages confirmés, préserver SSH |
| OCI / Internet | Non vérifiés actuellement | Security Lists et tous NSG de toutes VNIC/sous-réseaux, sources IPv4/IPv6, protocoles/plages, règles larges, routage/LB/NAT et essais externes manuels nécessaires avant fermeture puis validation |
| Caddy | Disque : 5 reverse proxies, aucun import ni Basic détecté ; candidat : 5 reverse proxies, 1 Basic détecté | Ces comptages ne prouvent ni l'ordre des protections ni l'état mémoire. Réconcilier disque, unité, options de démarrage/reprise, mémoire et candidat ; conserver TLS/hôtes/options/protections locales |
| Registre / voisins | /lora→5050, /lab→8080, /bga→8082, /amazonia→8083 | Préserver le fichier réel et tous ses champs ; LoRA/Forêt doivent passer la recette sous Basic. BGA reste configuré, sans service créé/démarré ni santé exigée |
| Données / sauvegardes | Restauration P réussie ; anciens états conservés | Données actives et écrivains peuvent avoir évolué ; IDs/états/compteurs à revoir sur copie finale. Copie hors VM de la sauvegarde finale non attestée |
| Disque | 12,8 Gio libres sous /home/opc lors du constat | Pas un budget validé. Chiffrer maximum simultané, volumes/inodes, copies froides/migration/échec et croissance, sans libérer les archives |

Cette PR ne modifie aucun code applicatif, règle du jeu, bot ou interface. La V4
attend sa spécification validée. Si une incompatibilité exige un correctif
applicatif, préparer un changement séparé avec nouveau SHA et validation des
artefacts affectés (dépendances/build/tests, restauration si nécessaire, recette
croisée). Les preuves P des anciennes releases restent historiques ; ne jamais
substituer ce correctif dans leurs copies ni modifier leurs marqueurs.

## 2. Diagnostic regroupé proposé (accord D, pas encore obtenu)

L'accord précis proposé : **autoriser le propriétaire à transférer le seul
`scripts/oracle_post_p.py` relu dans un nouveau dossier personnel privé, distinct
de tous les dossiers P, puis à lancer une collecte locale sous opc sans sudo ;
autoriser séparément les lectures administrateur listées ci-dessous.** Aucun
accès Oracle par Codex. Effets : lectures et éventuelle journalisation système ;
seuls le nouveau dossier de transfert et le rapport redirigé sont créés par
l'opérateur, jamais par le collecteur. Rien n'est installé automatiquement.

Après D, dans ce **nouveau dossier** (aucune commande SSH fournie), pour un nom
de rapport neuf, choisi hors P :

```bash
(umask 077; set -C; python3 -B ./oracle_post_p.py > diagnostic-post-p.json)
```

`set -C` interdit d'écraser un rapport existant. Python 3.9+ seulement, bibliothèque
standard ; pas de dépendance à installer. Le script refuse root et ne propose
aucun mode sudo/provisionnement/bascule. Ne pas l'exécuter avec sudo pour combler
les UNKNOWN. Aucun appel HTTP, API applicative, API Caddy, SSH, lecture
`/proc/*/environ`, contenu de service.env/clé, journal brut ou `systemctl cat`.
Ne jamais appeler l'ancien `/api/overview` ou le chargeur de registre pour cet
inventaire : ils peuvent modifier l'état.

La collecte utilise un PATH système fixe incluant sbin, sans environnement utilisateur
hérité, ni shell, ni commande fournie en paramètre. Les sous-commandes ont un délai
de 20 secondes chacune. Les erreurs/stderr restent supprimées. Des permissions
insuffisantes, outils absents, délais dépassés ou formats inconnus donnent
`UNKNOWN`, jamais « absent », « fermé » ou « réussi ». Un chemin n'est déclaré
absent qu'après recherche sans refus d'accès dans ses ancêtres ; un lien impose
une revue. UID/GID/modes sont des métadonnées, pas une validation ACL/SELinux.

Le JSON partageable contient seulement : états filtrés des cinq services (pas
BGA), SHA Git et nombres de modifications (pas leurs noms/contenus), métadonnées
de chemins fixes, comptes connus, tailles agrégées, capacités des volumes,
ports/protocoles avec portée loopback/non-loopback (pas d'IP), indices de règles
larges, comparaison des quatre routes et SELinux. Aucun nom d'hôte, source de
règle, configuration, hash de secret ou ligne d'erreur n'est recopié.

**Code 0 signifie collecte terminée**, même avec des UNKNOWN ;
`ready_for_deployment` reste toujours false. Le diagnostic n'est pas atomique et
n'arrête aucun écrivain. Un champ `OBSERVED` atteste la lecture de cette mesure,
pas la conformité de l'ensemble. Conserver la date, la version exacte du script
et les conclusions humaines séparément ; ne jamais remplacer le rapport P.

### Complément privé d'administration, regroupé avec la même séance

Ces lectures peuvent exiger sudo habituel, accès console OCI et un opérateur
compétent. Elles ne sont pas exécutées par le collecteur. Faire approuver leur
périmètre avec D ; consulter localement, puis ne partager que verdicts/écarts
expurgés. Aucun copier-coller de sorties brutes dans GitHub.

| Lecture privée à compléter | Résultat partageable attendu / arrêt |
|---|---|
| firewalld : zones actives/interfaces/sources, **toutes** zones runtime/permanent, services autorisés, plages, rich/direct rules, policies ; nftables complet IPv4/IPv6 et NAT | Matrice protocole/port/portée, règles larges identifiées, SSH/console de secours confirmés ; si backend/outils indisponibles, inconnue bloquante. Les compteurs du script ne détectent pas toutes les règles larges |
| OCI console, toutes VNIC/Security Lists/NSG et éventuels LB/routage | Règles IPv4/IPv6 et leurs interactions, y compris all-protocol/all-TCP et stateless ; ne rien modifier. Références des règles conservées en privé |
| Unités et drop-ins des cinq services, ExecStart/wrappers, PID/cgroups/enfants, `/proc/PID/exe` et cwd, timers/cron/autres superviseurs et écrivains | Correspondance code réellement exécuté/données/registre/exécutables ; différences locales archivables, pas de reset. Ne pas lire l'environnement des processus, ni publier arguments ou fichiers privés |
| Git et artefacts déployés, fichiers ignorés, configs hors Git, montages/liens | Inventaire de ce qui doit être préservé. Un arbre Git propre seul ne prouve pas le binaire/dist chargé ni l'absence de patch ignoré |
| Parents privés, `namei`/stat, groupes primaires et secondaires, ACL, contextes SELinux et refus AVC ciblés, sudoers existant | Compte/groupe/mode/accès requis et droits sudo précisément bornés. Pas de journaux bruts partagés ; ne désactiver ni SELinux ni gardes et ne corriger aucun droit pendant D |
| Taille logique **et** allouée des données/code/configs, montages, inodes, archives conservées, éventuels snapshots/reflinks et autres consommateurs | Budget par volume du maximum simultané ; mesure à chaud indicative, refaire immédiatement avant toute écriture |

### Réconcilier Caddy sans diffuser sa configuration

L'administrateur établit en privé le fichier réellement chargé, unité/drop-ins,
arguments (`--resume` notamment), imports éventuels, stockage/autosave et provenance
de l'état mémoire. L'écoute admin 127.0.0.1:2019 ne prouve pas l'égalité avec le
disque. Si besoin et après revue D, lire **uniquement** la configuration via le
GET `/config/` de cette administration locale connue, sans publication ni appel
POST/PUT/PATCH/DELETE/reload. Aucun export admin distant, aucun ancien endpoint
applicatif. Un accès refusé ou une provenance indémontrable bloque B.

Adapter le disque et le candidat en privé avec la version Caddy confirmée et les
substitutions réelles, sans `source` de fichier secret ni secret dans les arguments.
Ne pas publier JSON adapté, hashes Basic, clés, hôtes ou stdout d'adaptation. Cette
adaptation ne vaut pas validation et aucune validation/recharge active n'a lieu
pendant D. Les fichiers privés dérivés se placent hors P, 0600, propriétaire opc,
sans liens ; l'administrateur organise ce transfert de lecture sans exposer les
valeurs. Capturer horodatage/provenance et recontrôler les changements concurrents.

En option, une **nouvelle** collecte peut comparer deux JSON privés déjà préparés :

```bash
# Chemins absolus réels à renseigner ; ne pas utiliser littéralement les exemples.
python3 -B ./oracle_post_p.py --caddy-effective-json /CHEMIN_PRIVE/effectif.json --caddy-candidate-json /CHEMIN_PRIVE/candidat.json
```

Seule l'égalité complète des objets JSON est publiée ; l'ordre des tableaux de
routes compte. Une inégalité est normale avant ajout des protections, mais chaque
différence doit être justifiée localement ; une égalité ne valide ni la provenance
ni l'authentification. Comparer aussi disque↔mémoire dans une paire distincte.
Entrées manquantes/inaccessibles/malformées/liées ou non privées : UNKNOWN ; aucune
conclusion automatique. Le script ne parcourt pas les imports et ne juge pas
l'ordre Basic par comptage.

La revue doit couvrir tous hôtes/alias HTTP/HTTPS, TLS/certificats, redirects,
en-têtes, limites/timeouts, chaque branche de route et sa protection **avant** tout
proxy/redirect en HTTPS, écrasement des preuves internes envoyées par le client,
API/cookies/WS/SSE et options locales conservées. Conserver `/`→3000 et les quatre
routes du registre, avec leurs sémantiques de préfixe. BGA : refus anonyme commun
attendu, mais ni succès backend ni santé à exiger avec authentification.

### Budget disque bloquant

Les 12,8 Gio sont un constat, pas une réservation. Le besoin **supplémentaire**
inclut simultanément : archive finale data non compressée, archives code/config
(éviter de compter data deux fois sans l'expliquer), copie de migration complète,
SQLite/WAL/quarantaine/dépendances temporaires éventuelles, et réserve pour
archiver les écritures post-bascule et restaurer sur de nouvelles cibles. Ajouter
croissance pendant le créneau et marge d'au moins 2 Gio ; chiffrer les inodes.
Les anciens workspaces/exports/archives occupent déjà l'espace utilisé : aucune
suppression ni hypothèse de récupération de cet espace.

Option `--budget-json /CHEMIN_PRIVE/budget.json` : fichier 0600 propriétaire opc,
sans lien, contenant **exactement** les sept champs suivants. Les six premiers
sont des octets entiers strictement positifs, le dernier des inodes ; renseigner
des mesures/bornes revues, jamais les null ci-dessous :

```json
{
  "cold_data_archive": null,
  "cold_code_config_archive": null,
  "migration_copy": null,
  "migration_scratch": null,
  "rollback_post_switch_reserve": null,
  "margin": null,
  "required_inodes": null
}
```

Le script additionne ces besoins et compare au libre de `/home/opc` à cet instant.
`fits_at_observation` ne couvre **que ce volume** et ces hypothèses : affecter chaque
chemin à son volume réel, ajouter les besoins de `/var/lib`, `/srv/jeu` et `/opt`
si distincts, évaluer le pic des copies de restauration et de rollback ainsi que
les tailles logiques (fichiers creux/reflinks). Inconnue de taille/volume, manque
d'espace/inodes ou copie hors VM non prévue : arrêt avant provisionnement/B.

## 3. Parcours court avec points d'arrêt

Pas de nouveau mode privilégié : les paramètres et effets ne sont pas établis.
Réutiliser les propositions et résultats P, et les mécanismes de copie/restauration
1C.2/1C.3 là où leurs paramètres sont confirmés. Ne pas exécuter les anciens blocs
de préparation en bloc ni relancer `--prepare --provision-approved` : cela
réouvrirait P et ses rapports/exports. Préparer ensuite une fiche d'exécution
privée avec chemins, empreintes des candidats dérivés, droits, commandes ciblées,
espace et secours **résolus**, à faire approuver avant toute action.

| Lot compatible | Accord et effets futurs | Preuve et point d'arrêt obligatoire |
|---|---|---|
| D : collecte et revue privée réseau/unités/Caddy/droits/disque | Accord diagnostic seul ; lectures, nouveau rapport hors P | Toutes inconnues affectant le lot suivant résolues ; pas d'API applicative, d'installation, de correction ni de secret |
| S : provisionnement ciblé et secrets privés | Accord distinct sur fiche concrète : Node parallèle exact, comptes/groupes, dossiers/permissions et secrets coordonnés, sans activation publique | Réutiliser les contrôles du helper existant après revue de ses paramètres ; pas de sudo général, pas de réparation récursive ni modification P. Parents /etc root:service 0750, service.env root:root 0600, internal-key service:service 0400, groupes exclusifs ; SELinux réel confirmé. Tout objet existant incompatible bloque |
| I : recette isolée Caddy/portail/Amazonia + voisins | Accord d'essai sur copies avec nouveaux espaces/ports loopback vérifiés libres et secrets de test indépendants ; instances de test seulement | Matrice réelle Caddy/navigateur exécutée, aucun skip assimilé à un succès ; pas de production ni données uniques. Ports, chemins, hôtes, droits et effets non établis bloquent le lancement |
| B1 : fermeture des accès directs | **B préalable**, créneau et retour arrière fermé compris ; règles hôte **et OCI** ciblées, IPv4/IPv6 ; garder SSH | Deux sessions admin et console de secours, nouvelle session SSH réussie. Aucun port direct résiduel via règle large ; vérifier depuis un poste externe. Si la fermeture exige des changements voisins, les faire revoir explicitement avant B |
| B2 : froid final et copie hors VM | Même B, seulement après B1 ; arrêter Amazonia/portail et tous leurs écrivains, garder LoRA/Forêt ; archives nouvelles et migration sur copie | Aucun écrivain, code/config/registre/data et métadonnées archivés ; manifeste/checksums, copie hors VM vérifiée par destinataire et restauration isolée avant activation. L'export P ne remplace pas cette preuve. Un échec garde l'entrée fermée |
| B3 : bascule coordonnée et lectures | Même B et preuves B2 ; installer uniquement les releases/candidats revus, Node et comptes dédiés ; backends loopback fermés puis Caddy protégé | Unités et drop-ins réconciliés, validation sous vrai contexte Caddy, refus directs 403 et refus anonymes 401 HTTPS avant routes ; TLS/routes/lectures et IDs/compteurs historiques conservés. Pas de requête mutante de campagne |
| R : recette réelle | **R distinct après B**, sur un seul nouvel ID, budget borné et redémarrage Amazonia explicitement autorisés | Création, pause/reprise, persistance après redémarrage et refus CSRF/limites sur cet ID seulement ; recette fonctionnelle LoRA/Forêt. BGA reste futur ; aucun besoin de santé/service |
| A : acceptation | Décision après résultats R et sauvegarde finale hors VM | Prévoir les sauvegardes récurrentes séparément ; aucune purge des archives/historiques |

I doit exercer : Basic absent/incorrect/valide, headers internes falsifiés,
accès directs sans preuve, hôtes/alias, préfixes slash/non-slash, endpoints santé
et lectures via Caddy, JSON attendu et redirects, cookies/Authorization/API/WS/SSE
LoRA/Forêt. Employer des instances/copies représentatives des voisins sans
redémarrer ni modifier leurs services actifs. Si elles ne sont pas disponibles,
la compatibilité reste inconnue et bloque B. Les essais mutables de copies sont
à déclarer comme tels ; les mutations de recette réelle attendent R. Le registre
réel reste intact ; ne pas utiliser DEFAULT_TOOLS comme solution de secours.

## 4. Retour arrière fermé et préservation des écritures

Conserver la [section 7 de 1C.2](DEPLOIEMENT_ORACLE_1C2.md#7-retour-arrière-fermé-autorisé-avec-b-jamais-exécuté-ici),
adaptée aux chemins/SHAs réels de la fiche revue. B autorise explicitement cette
réponse à l'échec : contenir l'accès concerné, arrêter les écrivains concernés,
garder SSH et les services voisins, puis préserver l'état échoué avant restauration.
Si nécessaire arrêter l'entrée Caddy en dernier recours : coupure commune à
annoncer, jamais retour à un proxy public non protégé.

Archiver à froid les données post-bascule avec WAL/SHM/JSON/quarantaine et leurs
code/config/versions ; snapshot SQLite cohérent si possible, sinon archive brute
conservée pour analyse sur copie. Vérifier une nouvelle copie hors VM. L'absence
d'espace ou une archive incomplète interdit une restauration destructive : rester
fermé et demander une décision concrète, sans effacer les états pour faire place.

Restaurer uniquement vers de nouvelles destinations, avec version compatible et
vérification des ID/compteurs/provenance. Ne jamais lancer l'ancien code contre
les seules données originales, rétablir l'ancien pare-feu, rouvrir automatiquement
3000/5050/8080/8083 ou un ancien portail/Caddy sans protection. Conserver séparément
les nouvelles écritures, sans fusion automatique de bases ni retour silencieux à
une sauvegarde plus ancienne. Une remise en ligne attend une solution protégée
revue, la validation B correspondante et un accord R si nouvelle recette.

## 5. Validation de cette PR et limites

Les tests de `tests/documentation/test_oracle_post_p.py` utilisent des fichiers
temporaires et des doubles de commandes. Ils vérifient la confidentialité même
avec sorties hostiles, les refus/UNKNOWN, IPv4/IPv6, l'ordre Caddy conservé dans
la comparaison, les budgets insuffisants, les liens et l'absence d'écriture dans
les fixtures. Ce sont des simulations de l'hôte Oracle ; les lectures Git et
JSON sur fixtures sont réelles. Ils ne valident ni firewalld/systemd/SELinux/OCI
réels, ni accès Internet, ni Caddy en mémoire, ni restauration de production.

Commande reproductible dans le développement, jamais sur Oracle :

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/documentation -p 'test_oracle*.py' -v
```

Résultat local de cette PR : **55 tests recensés, 49 réussis, 6 ignorés, aucun
échec** ; les 20 nouveaux tests réussissent tous. Les six ignorés sont les deux
tests existants demandant les fixtures Amazonia/tsx non configurées et les quatre
tests de permissions réservés à un conteneur root jetable. Le test npm 11 réel
réussit sur son paquet local sans dépendances ni installation ; le scénario de
configuration/PATH/orchestration reste simulé. Les tests Git et `du` du nouveau
collecteur exécutent réellement ces outils sur un dépôt et un fichier creux
jetables. Aucune collecte de l'hôte Oracle n'est effectuée.

Un test npm existant comparait aussi atime, qui peut changer à la lecture sous
relatime ; il vérifie désormais les métadonnées de modification, inode, liens,
droits et propriétaires, hors atime. Aucun script P n'est modifié. Les tests
PowerShell, les recettes croisées Caddy/Chromium, les suites/builds applicatifs
des releases et le provisionnement ne sont pas réexécutés pour cette PR.
Pas de nouvelle validation des releases applicatives immuables : aucun
changement applicatif. `git diff --check` et syntaxe des blocs Bash/JSON réussis.

**Prochaine opération proposée :** accord D précis de la section 2, transfert du
nouveau collecteur dans un nouveau dossier hors P et diagnostic sous opc, complété
par les seules lectures privées approuvées. Effets attendus : un nouveau rapport
expurgé et une liste d'écarts résolus/restants ; aucune intervention de service,
réseau, provisionnement, secret ou donnée. Sans cet accord, aucune exécution Oracle.
