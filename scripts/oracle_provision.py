#!/usr/bin/env python3
"""Optional, reviewed phase-P privilege boundary. No service/SELinux changes."""
import argparse
import grp
import json
import os
from pathlib import Path
import pwd
import re
import stat
import subprocess
import sys

sys.dont_write_bytecode = True
from oracle_prepare import Stop, need, canonical, sha, extract_node


def account(name):
    need(name in ('amazonia', 'atelier-portail'), 'ACCOUNT_NAME')
    try:
        p = pwd.getpwnam(name)
    except KeyError:
        subprocess.run(['/usr/sbin/useradd', '--system', '--user-group', '--no-create-home',
                        '--shell', '/sbin/nologin', name], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        p = pwd.getpwnam(name)
    need(0 < p.pw_uid < 1000 and p.pw_shell == '/sbin/nologin', 'EXISTING_ACCOUNT_REVIEW')
    need(grp.getgrgid(p.pw_gid).gr_name == name, 'ACCOUNT_GROUP')
    need(not [g for g in grp.getgrall() if name in g.gr_mem and g.gr_gid != p.pw_gid], 'ACCOUNT_EXTRA_GROUPS')
    return p


def dedicated(path, user):
    """Never fix existing permissions, never recurse or change shared parents."""
    p = canonical(path, exists=False)
    if not p.exists():
        p.mkdir(mode=0o700)
        os.chown(p, user.pw_uid, user.pw_gid)
    s = p.stat()
    need(p.is_dir() and s.st_uid == user.pw_uid and s.st_gid == user.pw_gid
         and stat.S_IMODE(s.st_mode) == 0o700, 'EXISTING_DIRECTORY_REVIEW')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', required=True, type=Path)
    parser.add_argument('--version', required=True)
    parser.add_argument('--sha256', required=True)
    a = parser.parse_args()
    try:
        need(os.geteuid() == 0, 'ROOT_REQUIRED')
        workspace = canonical(a.workspace)
        need(workspace.parent == Path('/home/opc') and re.fullmatch(r'atelier-preparation-1c3-[A-Za-z0-9-]+', workspace.name), 'WORKSPACE_PATH')
        operator = pwd.getpwnam('opc')
        need(workspace.stat().st_uid == operator.pw_uid and stat.S_IMODE(workspace.stat().st_mode) == 0o700, 'WORKSPACE_PERMISSIONS')
        need(re.fullmatch(r'v24\.[0-9]+\.[0-9]+', a.version) and re.fullmatch(r'[a-f0-9]{64}', a.sha256), 'NODE_PARAMETERS')
        archive = canonical(workspace / 'runtime' / f'node-{a.version}-linux-x64.tar.xz')
        need(sha(archive) == a.sha256, 'NODE_CHECKSUM')
        # /opt must already be a trusted root-owned shared parent. Do not chmod it.
        opt = canonical('/opt')
        need(opt.stat().st_uid == 0 and not opt.stat().st_mode & 0o022, 'OPT_PERMISSIONS')
        dest = opt / f'node-{a.version}-linux-x64'
        if dest.exists():
            need(dest.stat().st_uid == 0 and not dest.stat().st_mode & 0o022, 'NODE_OWNER')
        if dest.exists():
            extract_node(archive, dest, a.version)
        else:
            number = 0
            attempt = opt / (dest.name + '.preparing-0')
            while attempt.exists() or attempt.is_symlink():
                number += 1
                attempt = opt / (dest.name + f'.preparing-{number}')
            extract_node(archive, attempt, a.version)
            attempt.rename(dest)
        for p in [dest, *dest.rglob('*')]:
            need(p.lstat().st_uid == 0 and (p.is_symlink() or not p.stat().st_mode & 0o022), 'NODE_OWNER_MODE')
        amazonia, portal = account('amazonia'), account('atelier-portail')
        for path, owner in [('/var/lib/amazonia', amazonia), ('/var/lib/amazonia/data', amazonia),
                            ('/var/lib/amazonia/data/campaigns', amazonia),
                            ('/etc/amazonia', amazonia), ('/etc/atelier-portail', portal)]:
            dedicated(path, owner)
        # No marker, no secrets, no data copy into production storage in phase P.
        need(not list(Path('/var/lib/amazonia/data/campaigns').iterdir()), 'PRODUCTION_STORAGE_NOT_EMPTY')
        need(list(Path('/var/lib/amazonia/data').iterdir()) == [Path('/var/lib/amazonia/data/campaigns')], 'PRODUCTION_STORAGE_NOT_EMPTY')
        for owner in (amazonia, portal):
            subprocess.run(['/usr/sbin/runuser', '-u', owner.pw_name, '--', str(dest / 'bin/node'),
                            '-e', 'require("node:sqlite")'], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           env={'PATH': '/usr/bin:/bin'})
        print('Comptes/dossiers dédiés et Node parallèle vérifiés. Aucun service modifié.')
        return 0
    except Exception as e:
        print('Provisionnement arrêté : ' + (str(e) if isinstance(e, Stop) else 'PROVISION_FAILED'), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
