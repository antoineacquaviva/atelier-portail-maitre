#!/usr/bin/env python3
"""Diagnostic post-P en lecture seule, sans sudo, réseau HTTP ni installation.

À exécuter seulement par le propriétaire après accord de diagnostic Oracle.
stdout est une projection JSON : jamais de sortie brute ni de message d'exception.
Ce collecteur n'est pas un validateur de déploiement.
"""
import argparse
import ipaddress
import json
import math
import os
from pathlib import Path
import pwd
import re
import stat
import subprocess
import sys

SYSTEM_PATH = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
SERVICES = ('amazonia', 'atelier-portail', 'caddy', 'lora-studio', 'foret-lab')
ROOTS = {'amazonia': '/srv/jeu/amazonia', 'atelier-portail': '/srv/jeu/atelier-portail-maitre'}
ROUTES = {'/lora': 5050, '/lab': 8080, '/bga': 8082, '/amazonia': 8083}
GIB = 1024**3


class Unknown(Exception):
    pass


def run(args):
    # No user PATH/config, preloads, process environment, shell or interactive sudo.
    env = {'PATH': SYSTEM_PATH, 'LC_ALL': 'C', 'GIT_OPTIONAL_LOCKS': '0',
           'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null',
           'GIT_TERMINAL_PROMPT': '0'}
    try:
        p = subprocess.run(args, env=env, stdin=subprocess.DEVNULL,
                           stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=20)
        if p.returncode:
            raise Unknown()
        return p.stdout.decode('utf-8', errors='strict')
    except (OSError, subprocess.TimeoutExpired, UnicodeError):
        raise Unknown() from None


def probe(fn):
    try:
        return {'status': 'OBSERVED', 'summary': fn()}
    except Exception:
        # Neither permission denial, missing tool nor parse error means absence.
        return {'status': 'UNKNOWN', 'reason': 'UNAVAILABLE_DENIED_OR_UNRECOGNIZED'}


def metadata(raw):
    path = Path(raw)
    # An inaccessible ancestor or symlink is not proof of absence of its children.
    for parent in [*reversed(path.parents), path]:
        try:
            info = parent.lstat()
        except FileNotFoundError:
            return {'state': 'ABSENT_AT_OBSERVATION'}
        if stat.S_ISLNK(info.st_mode):
            return {'state': 'SYMLINK_REQUIRES_PRIVATE_REVIEW'}
    return {'state': 'PRESENT', 'uid': info.st_uid, 'gid': info.st_gid,
            'mode': oct(stat.S_IMODE(info.st_mode)),
            'directory': stat.S_ISDIR(info.st_mode), 'regular': stat.S_ISREG(info.st_mode)}


def account(name):
    try:
        user = pwd.getpwnam(name)
    except KeyError:
        return {'state': 'ABSENT_AT_OBSERVATION'}
    return {'state': 'PRESENT', 'uid': user.pw_uid, 'gid': user.pw_gid,
            'nologin': user.pw_shell in ('/sbin/nologin', '/usr/sbin/nologin')}


def unit(name):
    fields = 'LoadState,ActiveState,SubState,User,Group,WorkingDirectory,MainPID,FragmentPath,DropInPaths'
    text = run(['systemctl', 'show', name + '.service', '--property=' + fields])
    values = dict(line.split('=', 1) for line in text.splitlines() if '=' in line)
    if not all(k in values for k in fields.split(',')):
        raise Unknown()
    def enum(key, allowed):
        return values[key] if values[key] in allowed else 'OTHER_REDACTED'
    return {'load': enum('LoadState', ('loaded', 'not-found', 'masked', 'error')),
            'active': enum('ActiveState', ('active', 'inactive', 'failed', 'activating', 'deactivating')),
            'running': values['SubState'] == 'running', 'has_pid': values['MainPID'].isdigit() and int(values['MainPID']) > 0,
            'user': enum('User', ('opc', 'caddy', 'amazonia', 'atelier-portail', 'root')),
            'group_matches_user': values['Group'] == values['User'],
            'cwd_matches_known': values['WorkingDirectory'] == ROOTS[name] if name in ROOTS else None,
            'fragment_present': bool(values['FragmentPath']),
            'dropins_present': bool(values['DropInPaths'])}


def git_state(root):
    # Disable optional writes and fsmonitor helpers; never diff or print filenames/remotes.
    base = ['git', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-C', root]
    head = run(base + ['rev-parse', '--verify', 'HEAD']).strip()
    if not re.fullmatch('[a-f0-9]{40}', head):
        raise Unknown()
    records = run(base + ['status', '--porcelain=v1', '-z', '--untracked-files=normal']).split('\0')
    tracked = untracked = 0
    i = 0
    while i < len(records):
        record = records[i]
        i += 1
        if not record:
            continue
        if len(record) < 4 or record[2] != ' ' or any(c not in ' MADRCU?!' for c in record[:2]):
            raise Unknown()
        if record.startswith('?? '):
            untracked += 1
        else:
            tracked += 1
        if 'R' in record[:2] or 'C' in record[:2]:
            if i >= len(records) or not records[i]:
                raise Unknown()
            i += 1  # second pathname is never interpreted or published
    return {'head': head, 'tracked_changes': tracked, 'untracked_entries': untracked,
            'ignored_files_and_deployed_artifact': 'PRIVATE_REVIEW_REQUIRED'}


def sockets(family):
    text = run(['ss', '-H', '-lntu' + family])
    result = set()
    for line in text.splitlines():
        cols = line.split()
        if len(cols) < 6 or cols[0] not in ('tcp', 'udp'):
            raise Unknown()
        host, port = cols[4].rsplit(':', 1)
        host = host.strip('[]').split('%')[0]
        if not port.isdigit() or not 0 <= int(port) <= 65535:
            raise Unknown()
        if host == '*':
            scope = 'WILDCARD'
        else:
            address = ipaddress.ip_address(host)
            scope = 'LOOPBACK' if address.is_loopback else ('WILDCARD' if address.is_unspecified else 'NON_LOOPBACK')
        result.add((cols[0], int(port), scope))
    return [{'protocol': proto, 'port': port, 'scope': scope} for proto, port, scope in sorted(result)]


def addresses():
    data = json.loads(run(['ip', '-j', 'address', 'show']))
    return {family: sum(1 for link in data for a in link.get('addr_info', [])
                        if a.get('family') == family and a.get('scope') == 'global')
            for family in ('inet', 'inet6')}


def firewall(permanent=False):
    args = ['firewall-cmd'] + (['--permanent'] if permanent else []) + ['--list-all-zones']
    text = run(args)
    if not text.strip() or 'target:' not in text:
        raise Unknown()
    # No source addresses, zone names, rich rules or private comments are published.
    return {'accept_targets': len(re.findall(r'^\s*target:\s*ACCEPT\s*$', text, re.M)),
            'port_ranges_present': bool(re.search(r'\d+-\d+/(?:tcp|udp)', text)),
            'rich_rules_present': bool(re.search(r'^\s*rule\b', text, re.M)),
            'full_ipv4_ipv6_policy': 'PRIVATE_REVIEW_REQUIRED'}


def nftables():
    data = json.loads(run(['nft', '-j', 'list', 'ruleset']))['nftables']
    return {'rules': sum('rule' in item for item in data),
            'accept_policy_chains': sum(item.get('chain', {}).get('policy') == 'accept' for item in data),
            'wide_accept_rules_and_nat': 'PRIVATE_REVIEW_REQUIRED'}


def direct_rules(permanent=False):
    args = ['firewall-cmd'] + (['--permanent'] if permanent else []) + ['--direct', '--get-all-rules']
    return {'rule_lines': len(run(args).splitlines()), 'coverage_and_broad_rules': 'PRIVATE_REVIEW_REQUIRED'}


def registry():
    # Read JSON only; never import the old loader, which can rewrite this file.
    data = private_json(Path('/srv/jeu/tools-registry.json'), require_private=False)
    if not isinstance(data, list):
        raise Unknown()
    return {'entries': len(data), 'routes_match_expected': len(data) == 4 and
            {x.get('subpath'): x.get('port') for x in data} == ROUTES,
            'other_fields_and_real_process_path': 'PRIVATE_REVIEW_REQUIRED',
            'bga': 'PRESERVE_CONFIGURATION_NO_SERVICE_OR_HEALTH_REQUIRED'}


def private_json(path, require_private=True):
    path = Path(path)
    if not path.is_absolute() or path.resolve() != path:
        raise Unknown()
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > 8 * 1024 * 1024:
            raise Unknown()
        if require_private and (info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077 or info.st_nlink != 1):
            raise Unknown()
        raw = stream.read(8 * 1024 * 1024 + 1)
        if len(raw) > 8 * 1024 * 1024:
            raise Unknown()
        def unique(pairs):
            out = {}
            for key, value in pairs:
                if key in out:
                    raise Unknown()
                out[key] = value
            return out
        def reject_constant(_):
            raise Unknown()
        def finite_float(value):
            number = float(value)
            if not math.isfinite(number):
                raise Unknown()
            return number
        return json.loads(raw, object_pairs_hook=unique, parse_constant=reject_constant, parse_float=finite_float)


def compare_caddy(effective, candidate):
    live, next_ = private_json(effective), private_json(candidate)
    if not all(isinstance(v, dict) and isinstance(v.get('apps', {}).get('http', {}).get('servers'), dict)
               and v['apps']['http']['servers'] for v in (live, next_)):
        raise Unknown()
    # Equality of full parsed JSON includes route ordering; counts do not validate protection.
    # Canonical encoding also distinguishes JSON booleans from numbers (True == 1 in Python).
    return {'parsed_json_equal': json.dumps(live, sort_keys=True, allow_nan=False) ==
                                json.dumps(next_, sort_keys=True, allow_nan=False),
            'provenance_freshness_auth_order_tls_routes': 'PRIVATE_REVIEW_REQUIRED',
            'deployment_validated': False}


def volume(path):
    v = os.statvfs(path)
    return {'free_bytes': v.f_bavail * v.f_frsize, 'free_inodes': v.f_favail,
            'device': os.stat(path).st_dev}


def size(path):
    result = {'live_measurement_not_cold_backup': True}
    for key, options in (('allocated_bytes', []), ('apparent_bytes', ['--apparent-size'])):
        output = run(['du', '-sx', '-B1', *options, '--', path])
        value = output.split('\t', 1)[0]
        if not value.isdigit():
            raise Unknown()
        result[key] = int(value)
    return result


BUDGET_FIELDS = ('cold_data_archive', 'cold_code_config_archive', 'migration_copy',
                 'migration_scratch', 'rollback_post_switch_reserve', 'margin', 'required_inodes')


def budget_estimate(spec, free):
    if set(spec) != set(BUDGET_FIELDS) or any(type(v) is not int or v <= 0 for v in spec.values()):
        raise Unknown()
    if spec['margin'] < 2 * GIB:
        raise Unknown()
    required = sum(spec[k] for k in BUDGET_FIELDS if k != 'required_inodes')
    return {'required_bytes': required, 'required_inodes': spec['required_inodes'],
            'fits_at_observation': free['free_bytes'] >= required and free['free_inodes'] >= spec['required_inodes'],
            'sizes_growth_mounts_and_peak_overlap': 'OWNER_REVIEW_REQUIRED',
            'deployment_validated': False}


def collect(effective=None, candidate=None, budget=None):
    report = {'format': 1, 'phase': 'POST_P_READ_ONLY', 'ready_for_deployment': False,
              'oracle_validation_by_codex': False, 'atomic_snapshot': False,
              'p_result': 'OWNER_REPORTED_SEPARATELY_NOT_REEXECUTED',
              'services': {}, 'git': {}, 'paths': {}, 'accounts': {}, 'volumes': {}, 'sizes': {}}
    for name in SERVICES:
        report['services'][name] = probe(lambda n=name: unit(n))
    for name, root in ROOTS.items():
        report['git'][name] = probe(lambda r=root: git_state(r))
    for name in ('amazonia', 'atelier-portail', 'caddy', 'opc'):
        report['accounts'][name] = probe(lambda n=name: account(n))
    for path in ('/etc/amazonia', '/etc/atelier-portail', '/etc/caddy/Caddyfile',
                 '/var/lib/amazonia/data', '/opt/node-v24.22.1-linux-x64/bin/node'):
        report['paths'][path] = probe(lambda p=path: metadata(p))
    for path in ('/home/opc', '/srv/jeu', '/var/lib'):
        report['volumes'][path] = probe(lambda p=path: volume(p))
    for path in (*ROOTS.values(), '/srv/jeu/amazonia/data', '/etc/caddy', '/etc/systemd/system'):
        report['sizes'][path] = probe(lambda p=path: size(p))
    report['network'] = {'ipv4': probe(lambda: sockets('4')), 'ipv6': probe(lambda: sockets('6')),
                         'global_address_counts': probe(addresses),
                         'firewalld_runtime': probe(firewall),
                         'firewalld_permanent': probe(lambda: firewall(True)),
                         'direct_runtime': probe(direct_rules),
                         'direct_permanent': probe(lambda: direct_rules(True)),
                         'nftables': probe(nftables),
                         'oci_and_external_reachability': 'MANUAL_NOT_TESTED'}
    def selinux():
        value = run(['getenforce']).strip()
        if value not in ('Enforcing', 'Permissive', 'Disabled'):
            raise Unknown()
        return value
    report['selinux'] = probe(selinux)
    report['registry_known_path'] = probe(registry)
    report['caddy_comparison'] = (probe(lambda: compare_caddy(effective, candidate)) if effective and candidate
                                  else {'status': 'NOT_SUPPLIED'})
    report['disk_budget'] = (probe(lambda: budget_estimate(private_json(budget), volume('/home/opc'))) if budget
                             else {'status': 'NOT_SUPPLIED'})
    report['required_private_reviews'] = [
        'ALL_ZONES_POLICIES_DIRECT_RULES_NFT_IPV4_IPV6_NAT_OCI_SSH_RESCUE',
        'UNITS_DROPINS_EXECUTABLES_WRAPPERS_WRITERS_TIMERS_LOCAL_PATCHES',
        'CADDY_DISK_MEMORY_CANDIDATE_PROVENANCE_TLS_AUTH_ROUTE_ORDER',
        'ACCOUNTS_GROUPS_ANCESTORS_ACL_SELINUX_CONTEXTS_LIMITED_SUDO',
        'REGISTRY_ACTUAL_PATH_ALL_FIELDS_NEIGHBOR_AUTH_COMPATIBILITY',
        'DISK_MOUNTS_PEAK_BYTES_INODES_GROWTH_OFF_VM_COLD_BACKUP',
        'ISOLATED_RECIPE_THEN_DISTINCT_PROVISION_B_R_APPROVALS']
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--caddy-effective-json', type=Path)
    parser.add_argument('--caddy-candidate-json', type=Path)
    parser.add_argument('--budget-json', type=Path)
    args = parser.parse_args(argv)
    if bool(args.caddy_effective_json) != bool(args.caddy_candidate_json):
        print('{"status":"STOP","reason":"CADDY_PAIR_REQUIRED","ready_for_deployment":false}')
        return 1
    if os.geteuid() == 0:
        print('{"status":"STOP","reason":"RUN_AS_OPERATOR_WITHOUT_SUDO","ready_for_deployment":false}')
        return 1
    print(json.dumps(collect(args.caddy_effective_json, args.caddy_candidate_json, args.budget_json), indent=2))
    return 0  # Collection completed, including UNKNOWNs. Never authorizes an action.


if __name__ == '__main__':
    sys.exit(main())
