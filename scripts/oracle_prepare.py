#!/usr/bin/env python3
"""Phase P only. No service management, active data access or secret generation."""
import argparse
import contextlib
import ctypes
import errno
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import urllib.request

AMAZONIA = "efdb787ad3edad845dfc60c6124f6bca2cd4dd6e"
PORTAL = "f62ef8148cdf18873272a169b48195443b532ce8"
BACKUP = Path('/home/opc/atelier-preparation-1c2-20261108-184942')
HISTORY = Path('/home/opc/amazonia-data-backup-20261108-125739')
REGISTRY = Path('/srv/jeu/tools-registry.json')
NAMES = ('applications.tar', 'configurations.tar', 'registre.json')
ROUTES = {'/lora': 5050, '/lab': 8080, '/bga': 8082, '/amazonia': 8083}
# Oracle Linux places administrative commands (notably getenforce) in sbin.
# This list is fixed; the caller's PATH is never appended or inherited.
SYSTEM_PATH = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'


class Stop(Exception):
    """Only fixed codes are exposed, never raw subprocess output or user data."""


def need(ok, code):
    if not ok:
        raise Stop(code)


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def canonical(path, exists=True):
    p = Path(path)
    need(p.is_absolute() and '..' not in p.parts and p != Path('/'), 'PATH_UNSAFE')
    need(p.resolve() == p and not p.is_symlink(), 'PATH_LINK')
    if exists:
        need(p.exists(), 'PATH_MISSING')
    return p


def private(path):
    p = canonical(path)
    s = p.stat()
    need(s.st_uid == os.getuid() and stat.S_IMODE(s.st_mode) == 0o700 and p.is_dir(), 'WORKSPACE_PERMISSIONS')


def owned_dir(path):
    p = canonical(path, exists=False)
    if not p.exists():
        p.mkdir(mode=0o700)
    private(p)
    return p


def inventory(root):
    root = canonical(root)
    need(root.is_dir(), 'TREE_MISSING')
    result = {}
    for p in sorted(root.rglob('*')):
        s = p.lstat()
        need(not p.is_symlink() and (stat.S_ISREG(s.st_mode) or stat.S_ISDIR(s.st_mode)), 'TREE_SPECIAL_FILE')
        if p.is_file():
            result[p.relative_to(root).as_posix()] = sha(p)
    return result


def history_inventory(data):
    data = canonical(data)
    need((data / 'campaigns').is_dir() and not (data / 'data').exists(), 'HISTORY_LAYOUT')
    files = inventory(data)
    need(len(files) == 16 and all(n.endswith('.json') for n in files), 'HISTORY_COUNT')
    need(sum(PurePosixPath(n).parent == PurePosixPath('campaigns') for n in files) == 11, 'HISTORY_CAMPAIGNS')
    need(sum((data / n).stat().st_size == 0 for n in files) == 2, 'HISTORY_EMPTY_FILES')
    return files


def sums(path, base, expected):
    """Accept sha256sum basenames or exact source absolute names, no traversal."""
    result = {}
    for line in Path(path).read_text().splitlines():
        m = re.fullmatch(r'([a-fA-F0-9]{64}) [ *](.+)', line)
        need(m is not None, 'MANIFEST_FORMAT')
        name = m[2]
        if name.startswith('./'):
            name = name[2:]
        if name.startswith('/'):
            need(str(Path(name).parent) == str(base), 'MANIFEST_PATH')
            name = Path(name).name
        need(name in expected and name not in result, 'MANIFEST_MEMBERS')
        need(not (base / name).is_symlink() and (base / name).is_file(), 'MANIFEST_FILE')
        need(sha(base / name) == m[1].lower(), 'CHECKSUM_MISMATCH')
        result[name] = m[1].lower()
    need(set(result) == set(expected), 'MANIFEST_INCOMPLETE')
    return result


def archive_size(path):
    total = 0
    with tarfile.open(path, 'r:*') as t:
        for item in t:
            n = PurePosixPath(item.name)
            need(not n.is_absolute() and '..' not in n.parts, 'ARCHIVE_PATH')
            total += item.size
    return total


def disk_check(path, required):
    p = canonical(path)
    while not p.is_dir():
        p = p.parent
    need(shutil.disk_usage(p).free >= required, 'DISK_BUDGET')
    need(os.statvfs(p).f_favail >= 10000, 'INODE_BUDGET')


def write_new(path, content):
    p = Path(path)
    need(not p.exists() and not p.is_symlink(), 'DESTINATION_EXISTS')
    fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write(content)
        f.flush()
        os.fsync(f.fileno())


def publish(path, text):
    # Only mutable state/report inside an owned 0700 workspace, never backups.
    p = Path(path)
    need(not p.is_symlink(), 'STATE_LINK')
    number = 0
    tmp = p.with_name(p.name + '.next')
    while tmp.exists() or tmp.is_symlink():
        number += 1
        tmp = p.with_name(p.name + f'.next-{number}')
    write_new(tmp, text)
    os.replace(tmp, p)


def atomic(path, value):
    publish(path, json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def download(url, destination, expected=None, limit=200 * 1024 * 1024):
    need(url.startswith('https://nodejs.org/dist/'), 'DOWNLOAD_SOURCE')
    dest = Path(destination)
    if dest.exists():
        need(not dest.is_symlink() and expected is not None and sha(dest) == expected, 'DOWNLOAD_EXISTING')
        return
    partial = dest.with_name(dest.name + '.partial')
    # A failed transfer is retained; choose a new attempt, never truncate it.
    index = 0
    while partial.exists() or partial.is_symlink():
        index += 1
        partial = dest.with_name(dest.name + f'.partial-{index}')
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            need(r.geturl().startswith('https://nodejs.org/dist/'), 'DOWNLOAD_REDIRECT')
            with partial.open('xb') as f:
                os.chmod(partial, 0o600)
                total = 0
                while True:
                    block = r.read(1024 * 1024)
                    if not block:
                        break
                    total += len(block)
                    need(total <= limit, 'DOWNLOAD_SIZE')
                    f.write(block)
        if expected:
            need(sha(partial) == expected, 'DOWNLOAD_CHECKSUM')
        need(not dest.exists() and not dest.is_symlink(), 'DESTINATION_EXISTS')
        os.link(partial, dest)  # exclusive publication, keep attempt evidence
    except Stop:
        raise
    except Exception:
        raise Stop('DOWNLOAD_FAILED') from None


def node_members(t, target, version):
    """Parse the authenticated archive without writing or trusting target links."""
    prefix = f'node-{version}-linux-x64'
    members = {}
    for m in t.getmembers():
        parts = PurePosixPath(m.name).parts
        need(parts and parts[0] == prefix and '..' not in parts and not m.name.startswith('/'), 'NODE_ARCHIVE_PATH')
        rel = Path(*parts[1:]).as_posix()
        need(rel not in members, 'NODE_ARCHIVE_DUPLICATE')
        need(m.isdir() or m.isfile() or m.issym(), 'NODE_ARCHIVE_TYPE')
        if m.issym():
            need(not PurePosixPath(m.linkname).is_absolute(), 'NODE_ARCHIVE_LINK')
            normalized = Path(os.path.normpath(target / Path(rel).parent / m.linkname))
            need(normalized.is_relative_to(target), 'NODE_ARCHIVE_LINK')
        members[rel] = m
    need('.' in members and members['.'].isdir(), 'NODE_ARCHIVE_ROOT')
    for rel in members:
        parent = Path(rel).parent
        while str(parent) != '.':
            need(parent.as_posix() in members and members[parent.as_posix()].isdir(), 'NODE_ARCHIVE_PARENT')
            parent = parent.parent
    return members


def inspect_node(t, target, members, uid, gid, complete=True):
    """Read-only, full comparison. Never mkdir/chmod/chown/write a Node member."""
    actual = {'.': target}
    actual.update({p.relative_to(target).as_posix(): p for p in target.rglob('*')})
    need(set(actual) <= set(members), 'NODE_TARGET_EXTRA')
    if complete:
        need(set(actual) == set(members), 'NODE_TARGET_INCOMPLETE')
    # Validate all types/permissions before opening files or resolving symlinks.
    for rel, path in actual.items():
        m, s = members[rel], path.lstat()
        need(s.st_uid == uid and s.st_gid == gid, 'NODE_TARGET_OWNER')
        if m.isdir():
            need(stat.S_ISDIR(s.st_mode) and stat.S_IMODE(s.st_mode) == 0o755, 'NODE_TARGET_MODE')
        elif m.issym():
            need(stat.S_ISLNK(s.st_mode) and stat.S_IMODE(s.st_mode) == 0o777
                 and os.readlink(path) == m.linkname, 'NODE_TARGET_LINK')
        else:
            mode = 0o755 if m.mode & 0o111 else 0o644
            need(stat.S_ISREG(s.st_mode) and stat.S_IMODE(s.st_mode) == mode, 'NODE_TARGET_MODE')
            need(s.st_nlink == 1, 'NODE_TARGET_HARDLINK')
    for rel, path in actual.items():
        m = members[rel]
        if m.isfile():
            with t.extractfile(m) as f:
                need(sha(path) == hashlib.sha256(f.read()).hexdigest(), 'NODE_TARGET_DIFFERENT')
        elif m.issym() and complete:
            try:
                resolved = path.resolve(strict=True)
            except (OSError, RuntimeError):
                raise Stop('NODE_TARGET_LINK') from None
            need(resolved.is_relative_to(target), 'NODE_TARGET_LINK')


def verify_node(archive, target, version, uid=None, gid=None):
    """Existing published installations are ONLY verified, never repaired."""
    target = canonical(target)
    need(target.is_dir(), 'NODE_TARGET')
    with tarfile.open(archive, 'r:xz') as t:
        members = node_members(t, target, version)
        inspect_node(t, target, members, os.geteuid() if uid is None else uid,
                     os.getegid() if gid is None else gid)


def extract_node(archive, target, version, resume=False):
    """Extract ONLY in an explicitly owned temporary .preparing-N directory.

    A matching adjacent 0600 marker is mandatory for partial resume. Published
    destinations never pass through this function, even when incomplete.
    """
    target = canonical(target, exists=False)
    need(re.fullmatch(r'[A-Za-z0-9_.-]+\.preparing-[0-9]+', target.name), 'NODE_TEMP_PATH')
    parent = canonical(target.parent)
    need(parent.stat().st_uid == os.geteuid() and not parent.stat().st_mode & 0o022, 'NODE_TEMP_PARENT')
    marker = target.with_name(target.name + '.owner.json')
    identity = {'format': 1, 'target': str(target), 'version': version, 'archive': sha(archive)}
    with tarfile.open(archive, 'r:xz') as t:
        members = node_members(t, target, version)
        if target.exists() or marker.exists() or marker.is_symlink():
            need(resume and marker.is_file() and not marker.is_symlink(), 'NODE_TEMP_UNOWNED')
            s = marker.stat()
            need(s.st_uid == os.geteuid() and s.st_gid == os.getegid()
                 and stat.S_IMODE(s.st_mode) == 0o600 and s.st_nlink == 1
                 and json.loads(marker.read_text()) == identity, 'NODE_TEMP_UNOWNED')
        else:
            write_new(marker, json.dumps(identity))
        if not target.exists():
            target.mkdir(mode=0o755)
            target.chmod(0o755)  # newly created only; independent of operator umask
        inspect_node(t, target, members, os.geteuid(), os.getegid(), complete=False)
        # Directories first, then ordinary files, symlinks last. Existing entries
        # were fully verified above and are never rewritten, including on resume.
        ordered = sorted(members.items(), key=lambda pair: (0 if pair[1].isdir() else 2 if pair[1].issym() else 1, len(Path(pair[0]).parts)))
        for rel, m in ordered:
            path = target / rel
            if path.exists() or path.is_symlink():
                continue
            if m.isdir():
                path.mkdir(mode=0o755)
                path.chmod(0o755)
            elif m.issym():
                path.symlink_to(m.linkname)
            else:
                with t.extractfile(m) as source, path.open('xb') as dest:
                    shutil.copyfileobj(source, dest)
                path.chmod(0o755 if m.mode & 0o111 else 0o644)
        inspect_node(t, target, members, os.geteuid(), os.getegid())


def publish_node(source, target):
    """Linux atomic publication with NO replacement, including empty targets."""
    libc = ctypes.CDLL(None, use_errno=True)
    try:
        rename = libc.renameat2
    except AttributeError:
        raise Stop('NODE_PUBLISH_UNSUPPORTED') from None
    rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    if rename(-100, os.fsencode(source), -100, os.fsencode(target), 1) != 0:
        code = ctypes.get_errno()
        raise Stop('NODE_DESTINATION_EXISTS' if code in (errno.EEXIST, errno.ENOTEMPTY) else 'NODE_PUBLISH_FAILED')


def tree_digest(root):
    # Release node_modules contain legitimate links: hash them, never follow.
    result = {}
    for p in sorted(Path(root).rglob('*')):
        n = p.relative_to(root).as_posix()
        if p.is_symlink():
            need(p.resolve().is_relative_to(Path(root).resolve()), 'RELEASE_EXTERNAL_LINK')
            result[n] = ['link', os.readlink(p), p.lstat().st_uid, p.lstat().st_gid]
        elif p.is_file():
            result[n] = ['file', sha(p), stat.S_IMODE(p.stat().st_mode), p.stat().st_uid, p.stat().st_gid]
        else:
            need(p.is_dir(), 'RELEASE_SPECIAL')
            result[n] = ['directory', stat.S_IMODE(p.stat().st_mode), p.stat().st_uid, p.stat().st_gid]
    return hashlib.sha256(json.dumps(result, sort_keys=True).encode()).hexdigest()


def safe_env(node_dir=None):
    # No production credentials/preloads inherited by copies or npm scripts.
    keys = ('HOME', 'USER', 'LANG', 'LC_ALL', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
            'http_proxy', 'https_proxy', 'no_proxy', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS')
    e = {k: os.environ[k] for k in keys if k in os.environ}
    e['PATH'] = (str(node_dir) + ':' if node_dir else '') + SYSTEM_PATH
    e['GIT_TERMINAL_PROMPT'] = '0'
    e['GIT_CONFIG_NOSYSTEM'] = '1'
    e['GIT_CONFIG_GLOBAL'] = '/dev/null'
    e['AMAZONIA_WORKERS'] = '1'
    return e


def command(args, cwd=None, env=None, timeout=1800):
    try:
        p = subprocess.run([str(a) for a in args], cwd=cwd, env=env or safe_env(),
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
        need(p.returncode == 0, 'COMMAND_FAILED')
        return p.stdout.decode('utf8', errors='replace')
    except (subprocess.TimeoutExpired, OSError):
        raise Stop('COMMAND_FAILED') from None


def checked(args, code, **kwargs):
    try:
        return command(args, **kwargs)
    except Stop:
        raise Stop(code) from None


def registry_check(path):
    tools = json.loads(Path(path).read_text())
    need(isinstance(tools, list) and len(tools) == 4, 'REGISTRY_COUNT')
    need({t['subpath']: t['port'] for t in tools} == ROUTES, 'REGISTRY_ROUTES')
    need(len({t['id'] for t in tools}) == 4, 'REGISTRY_IDS')
    # Preserve every byte/field; strict application validation runs on the copy.
    return sha(path)


def config_read(path):
    c = json.loads(Path(path).read_text())
    c.setdefault('npm_legacy_peer_deps', False)
    need(set(c) == {'workspace', 'node_version', 'node_sha256', 'disk_budget_gib', 'npm_legacy_peer_deps'}, 'CONFIG_FIELDS')
    need(type(c['npm_legacy_peer_deps']) is bool, 'NPM_POLICY')
    need(re.fullmatch(r'v24\.[0-9]+\.[0-9]+', c['node_version']), 'NODE_VERSION')
    need(re.fullmatch(r'[a-f0-9]{64}', c['node_sha256']), 'NODE_SHA256')
    need(isinstance(c['disk_budget_gib'], int) and 6 <= c['disk_budget_gib'] <= 100, 'DISK_BUDGET_CONFIG')
    workspace = canonical(c['workspace'], exists=False)
    need(workspace.parent == Path('/home/opc') and re.fullmatch(r'atelier-preparation-1c3-[a-zA-Z0-9-]+', workspace.name), 'WORKSPACE_PATH')
    return c


class Preparation:
    def __init__(self, config, backup=BACKUP, history=HISTORY, registry=REGISTRY):
        self.c = config
        self.root = Path(config['workspace'])
        self.backup, self.history, self.registry = map(Path, (backup, history, registry))
        self.state = {'format': 1, 'config': config, 'steps': {},
                      'implementation': sha(Path(__file__)) + sha(Path(__file__).with_name('oracle_provision.py'))}
        self.phase = 'checks'
        self.initial = None
        self.observed = {}
        self.active_snapshot = None

    def active(self):
        values = {'node': sha('/usr/bin/node'), 'caddy': sha('/usr/bin/caddy')}
        for unit in ('amazonia.service', 'atelier-portail.service', 'lora-studio.service', 'foret-lab.service', 'caddy.service'):
            need(command(['systemctl', 'is-active', unit]).strip() == 'active', 'SERVICE_STATE')
            values[unit] = command(['systemctl', 'show', unit, '--property=MainPID', '--value']).strip()
        for name in ('amazonia', 'atelier-portail-maitre'):
            s = Path('/srv/jeu', name).stat()
            values[name] = (s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode))
        return values

    def checks(self, oracle=True):
        if oracle:
            need(os.geteuid() != 0 and command(['id', '-un']).strip() == 'opc', 'RUN_AS_OPC')
            need(platform.machine() == 'x86_64', 'ARCHITECTURE')
            release = Path('/etc/os-release').read_text()
            need('ID="ol"' in release and 'VERSION_ID="9.8"' in release, 'ORACLE_RELEASE')
            need(command(['getenforce']).strip() == 'Enforcing', 'SELINUX_STATE')
            need(command(['/usr/bin/node', '--version']).strip() == 'v20.20.2', 'NODE20_CHANGED')
            need(command(['/usr/bin/caddy', 'version']).startswith('v2.11.7'), 'CADDY_VERSION')
            ram = os.sysconf('SC_PAGE_SIZE') * os.sysconf('SC_PHYS_PAGES')
            need(os.cpu_count() == 16 and ram >= 14 * 1024**3, 'RESOURCES_CHANGED')
            self.observed = {'cpu': os.cpu_count(), 'ram_gib': round(ram/1024**3, 1),
                             'selinux': 'Enforcing', 'node_active': 'v20.20.2', 'caddy': 'v2.11.7'}
            for unit in ('amazonia.service', 'atelier-portail.service', 'lora-studio.service', 'foret-lab.service', 'caddy.service'):
                need(command(['systemctl', 'is-active', unit]).strip() == 'active', 'SERVICE_STATE')
            self.active_snapshot = self.active()
        for tool in ('python3', 'git', 'tar'):
            need(shutil.which(tool, path=SYSTEM_PATH), 'PREREQUISITE_MISSING')
        private(self.backup)
        private(self.history)
        canonical(self.root.parent)
        self.initial = self.inputs()
        sizes = sum((self.backup / n).stat().st_size for n in NAMES)
        expanded = archive_size(self.backup / 'applications.tar') + archive_size(self.backup / 'configurations.tar')
        # User budget must cover expanded archives, copies, builds and transfer bundle.
        required = max(self.c['disk_budget_gib'] * 1024**3, expanded * 2 + sizes * 2 + 2 * 1024**3)
        disk_check(self.root.parent, required)
        return required

    def inputs(self):
        manifest = sums(self.backup / 'SHA256SUMS', self.backup, NAMES)
        # Reuse existing archives; never recreate them or open active data.
        need(registry_check(self.registry) == manifest['registre.json'], 'REGISTRY_BACKUP_DIFFERS')
        return {'archives': manifest, 'history': history_inventory(self.history / 'data'),
                'registry': sha(self.registry), 'sha256sums': sha(self.backup / 'SHA256SUMS')}

    def open(self):
        identity = {'format': 1, 'config': self.c, 'implementation': self.state['implementation']}
        if not self.root.exists():
            self.root.mkdir(mode=0o700)
            write_new(self.root / 'owner.json', json.dumps(identity))
        private(self.root)
        marker = self.root / 'owner.json'
        need(marker.is_file() and not marker.is_symlink(), 'WORKSPACE_UNOWNED')
        need(json.loads(marker.read_text()) == identity, 'WORKSPACE_INCOMPATIBLE')
        path = self.root / 'state.json'
        if path.exists():
            need(not path.is_symlink() and stat.S_IMODE(path.stat().st_mode) == 0o600, 'STATE_PERMISSIONS')
            restored = json.loads(path.read_text())
            need(restored['config'] == self.c and restored['inputs'] == self.initial
                 and restored.get('implementation') == self.state['implementation'], 'INPUTS_CHANGED')
            self.state = restored
        else:
            self.state['inputs'] = self.initial
        return self

    def step(self, name, outputs, operation):
        self.phase = name
        prior = self.state['steps'].get(name)
        if prior:
            need(prior == self.output_hashes(outputs), 'STEP_OUTPUT_CHANGED')
            print('Étape ' + name + ' : résultat antérieur revérifié.')
            return
        print('Étape ' + name + ' : préparation en cours.', flush=True)
        disk_check(self.root, 2 * 1024**3)
        operation()
        self.state['steps'][name] = self.output_hashes(outputs)
        atomic(self.root / 'state.json', self.state)

    def output_hashes(self, outputs):
        result = {}
        for n in outputs:
            p = self.root / n
            canonical(p)
            result[n] = tree_digest(p) if p.is_dir() else sha(p)
        return result

    def node(self):
        version = self.c['node_version']
        folder = owned_dir(self.root / 'runtime')
        archive = folder / f'node-{version}-linux-x64.tar.xz'
        download(f'https://nodejs.org/dist/{version}/{archive.name}', archive, self.c['node_sha256'])
        listing = folder / 'SHASUMS256.txt'
        if not listing.exists():
            download(f'https://nodejs.org/dist/{version}/SHASUMS256.txt', listing, limit=1024*1024)
        lines = listing.read_text().splitlines()
        need(f"{self.c['node_sha256']}  {archive.name}" in lines, 'OFFICIAL_CHECKSUM_MISMATCH')
        final = folder / 'node'
        if final.exists() or final.is_symlink():
            verify_node(archive, final, version)
        else:
            attempt = 0
            candidate = folder / 'node.preparing-0'
            while candidate.exists() or candidate.is_symlink() or candidate.with_name(candidate.name + '.owner.json').exists():
                attempt += 1
                candidate = folder / f'node.preparing-{attempt}'
            extract_node(archive, candidate, version)
            need(command([candidate / 'bin/node', '--version']).strip() == version, 'NODE_RUNTIME_VERSION')
            publish_node(candidate, final)
        self.node_binary = folder / 'node/bin/node'
        need(command([self.node_binary, '--version']).strip() == version, 'NODE_RUNTIME_VERSION')
        checked([self.node_binary, '-e', 'const {DatabaseSync}=require("node:sqlite"); const d=new DatabaseSync(":memory:"); d.close()'], 'SQLITE_IMPORT_FAILED')

    def clone_build(self, name, commit):
        dest = self.root / name
        marker = self.root / (name + '.owned')
        cloned = self.root / (name + '.clone-complete')
        if not dest.exists():
            # Establish an ownership marker before clone, permitting an interrupted clone retry.
            dest.mkdir(mode=0o700)
            if not marker.exists():
                write_new(marker, commit)
        need(marker.is_file() and not marker.is_symlink() and marker.read_text() == commit, 'RELEASE_UNOWNED')
        need(not dest.is_symlink() and dest.is_dir(), 'RELEASE_PATH')
        if not cloned.exists() and list(dest.iterdir()):
            number = 0
            failed = self.root / (name + '.interrupted-0')
            while failed.exists() or failed.is_symlink():
                number += 1
                failed = self.root / (name + f'.interrupted-{number}')
            dest.rename(failed)  # preserve the interrupted, owned copy in full
            dest.mkdir(mode=0o700)
        if not (dest / '.git').exists():
            need(not list(dest.iterdir()), 'CLONE_PARTIAL_REVIEW_REQUIRED')
            repo = 'Amazonia' if name == 'amazonia.next' else 'atelier-portail-maitre'
            command(['git', 'clone', 'https://github.com/antoineacquaviva/' + repo + '.git', dest])
        # checkout only preparatory copies, never installed repositories; no reset/clean.
        command(['git', '-C', dest, 'checkout', '--detach', commit])
        need(command(['git', '-C', dest, 'rev-parse', 'HEAD']).strip() == commit, 'RELEASE_COMMIT')
        if not cloned.exists():
            write_new(cloned, commit)
        need(not cloned.is_symlink() and cloned.read_text() == commit, 'RELEASE_MARKER')
        node = self.root / 'runtime/node/bin/node'
        npm = self.root / 'runtime/node/lib/node_modules/npm/bin/npm-cli.js'
        e = self.npm_env()
        install = [node, npm, 'install', '--include=dev']
        if self.c.get('npm_legacy_peer_deps', False):
            install.append('--legacy-peer-deps')
        checked(install, 'NPM_INSTALL_FAILED', cwd=dest, env=e)
        for task in ('lint', 'test'):
            checked([node, npm, 'run', task], task.upper() + '_FAILED', cwd=dest, env=e)
        checked([node, npm, 'run', 'build', '--', '--base=' + ('/amazonia/' if name == 'amazonia.next' else '/')], 'BUILD_FAILED', cwd=dest, env=e)
        dependencies = command([node, npm, 'ls', '--all', '--json'], cwd=dest, env=e)
        path = self.root / (name + '.dependencies.json')
        if not path.exists():
            write_new(path, dependencies)
        need((dest / 'dist/index.html').is_file() and (dest / 'package-lock.json').is_file(), 'BUILD_ARTIFACTS')

    def npm_env(self):
        # npm 11 refuses loading one path as both user and global config.
        # Explicit empty files also exclude personal/global npmrc credentials.
        private(self.root)
        configs = owned_dir(self.root / 'npm-config')
        e = safe_env(self.root / 'runtime/node/bin')
        for kind in ('user', 'global'):
            path = canonical(configs / (kind + '.npmrc'), exists=False)
            if not path.exists():
                write_new(path, '')
            s = path.lstat()
            need(stat.S_ISREG(s.st_mode) and s.st_uid == os.getuid()
                 and stat.S_IMODE(s.st_mode) == 0o600 and s.st_nlink == 1
                 and path.read_bytes() == b'', 'NPM_CONFIG_UNSAFE')
            e['npm_config_' + kind + 'config'] = str(path)
        e.update(npm_config_cache=str(self.root / 'npm-cache'),
                 npm_config_audit='false', npm_config_fund='false')
        return e

    def restore(self):
        """Fresh generation per interrupted attempt. Failed copies kept, never reused."""
        index = 0
        while (self.root / f'restore-{index}').exists():
            index += 1
        work = self.root / f'restore-{index}'
        work.mkdir(mode=0o700)
        before = history_inventory(self.history / 'data')
        shutil.copytree(self.history / 'data', work / 'data', symlinks=True)
        need(history_inventory(work / 'data') == before, 'RESTORE_COPY_DIFFERENT')
        root = canonical(work / 'data/campaigns')
        need(root.is_relative_to(self.root) and root.name == 'campaigns', 'RESTORE_ROOT')
        code = self.root / 'amazonia.next'
        node = self.root / 'runtime/node/bin/node'
        e = safe_env(node.parent)
        js = '''import {CampaignManager} from './src/server/campaignManager.ts';
const m=new CampaignManager({campaignsDir:process.argv[2]});
try {console.log(JSON.stringify(m.listCampaigns().map(c=>({id:c.id,status:c.status,progress:c.progress}))));}
finally {await m.close();}'''
        def load(path):
            path = canonical(path)
            need(path.is_relative_to(work) and path.is_dir(), 'MANAGER_NOT_ISOLATED')
            try:
                p = subprocess.run([str(node), '--import', 'tsx', '--input-type=module', '-', str(path)],
                                   input=js, text=True, cwd=code, env=e, capture_output=True, timeout=120)
                need(p.returncode == 0, 'HISTORY_LOAD_FAILED')
                records = json.loads(p.stdout)
                need(len(records) >= 2 and all(r['status'] != 'RUNNING' for r in records), 'HISTORY_RECORDS')
                return records
            except (ValueError, subprocess.TimeoutExpired):
                raise Stop('HISTORY_LOAD_FAILED') from None
        first = load(root)
        checked([node, '--import', 'tsx', 'scripts/backup.ts', 'backup', root, work / 'sqlite-backup'], 'SQLITE_BACKUP_FAILED', cwd=code, env=e)
        checked([node, '--import', 'tsx', 'scripts/backup.ts', 'restore', work / 'sqlite-backup', work / 'sqlite-restored'], 'SQLITE_RESTORE_FAILED', cwd=code, env=e)
        need(load(work / 'sqlite-restored') == first, 'RESTORE_RECORDS_DIFFER')
        need(all(sha(work / 'data' / n) == h for n, h in before.items()), 'HISTORY_CHANGED')
        need(history_inventory(self.history / 'data') == before, 'HISTORY_SOURCE_CHANGED')
        write_new(self.root / 'restoration.json', json.dumps({'format': 1, 'directory': work.name,
                  'files': 16, 'empty': 2, 'compatible_records': len(first), 'roundtrip': True,
                  'digest': tree_digest(work)}))

    def candidates(self):
        folder = owned_dir(self.root / 'candidates')
        node = self.root / 'runtime/node/bin/node'
        code = self.root / 'portail.next'
        copied = self.root / 'registry.copy.json'
        if not copied.exists():
            write_new(copied, self.registry.read_text())
        canonical(copied)
        need(sha(copied) == self.initial['registry'], 'REGISTRY_COPY_CHANGED')
        caddy = folder / 'Caddyfile.proposed'
        number = 0
        generated = folder / 'Caddyfile.generated-0'
        while generated.exists() or generated.is_symlink():
            number += 1
            generated = folder / f'Caddyfile.generated-{number}'
        command([node, '--import', 'tsx', 'scripts/prepare-caddy.ts', copied, generated], cwd=code, env=safe_env(node.parent))
        if caddy.exists() or caddy.is_symlink():
            need(not caddy.is_symlink() and caddy.read_bytes() == generated.read_bytes(), 'CANDIDATE_CHANGED')
        else:
            os.link(generated, caddy)
        final_node = f"/opt/node-{self.c['node_version']}-linux-x64/bin/node"
        for name, user, port in [('amazonia', 'amazonia', 8083), ('atelier-portail', 'atelier-portail', 3000)]:
            checkout = 'amazonia' if name == 'amazonia' else 'atelier-portail-maitre'
            text = f'''# PROPOSITION PHASE P — NON ACTIVE
[Unit]
Description={name}
After=network.target
[Service]
Type=simple
User={user}
Group={user}
WorkingDirectory=/srv/jeu/{checkout}
Environment=NODE_ENV=production
Environment=PORT={port}
EnvironmentFile=/etc/{name}/service.env
ExecStart={final_node} --import tsx server.ts
Restart=on-failure
UMask=0077
NoNewPrivileges=true
[Install]
WantedBy=multi-user.target
'''
            p = folder / (name + '.service.proposed')
            if not p.exists():
                write_new(p, text)
            need(p.read_text() == text, 'CANDIDATE_CHANGED')
        env = folder / 'caddy-entry.conf.proposed'
        if not env.exists():
            write_new(env, '[Service]\nEnvironmentFile=/etc/caddy/atelier-entry.env\n')
        need(not env.is_symlink() and env.read_text() == '[Service]\nEnvironmentFile=/etc/caddy/atelier-entry.env\n', 'CANDIDATE_CHANGED')

    def report(self, error=None, provisioned=False):
        blockers = ['SECRETS_PRIVATE_APPROVAL', 'CADDY_EFFECTIVE_RECONCILIATION',
                    'NEIGHBOR_AUTH_COMPATIBILITY', 'NETWORK_B_REVIEW_NO_CHANGE_IN_P',
                    'COLD_FINAL_BACKUP_B', 'CADDY_CHROMIUM_CROSS_RECIPE', 'OWNER_B_R_APPROVAL',
                    'HISTORICAL_IDS_COUNTERS_REVIEW', 'SELINUX_SYSTEMD_CONTEXT_AND_SUDO_REVIEW']
        if not provisioned:
            blockers += ['DEDICATED_ACCOUNTS_AND_OPT_NODE_PENDING']
        report = {'format': 1, 'phase': 'P_ONLY', 'ready_for_deployment': False,
                  'success': error is None, 'completed_steps': list(self.state['steps']),
                  'error': error, 'blocked_step': self.phase if error else None,
                  'blockers': blockers, 'bga': 'FUTURE_CONFIG_PRESERVED_NOT_STARTED',
                  'secrets': 'NOT_CREATED', 'services': 'NOT_CHANGED', 'network': 'NOT_CHANGED',
                  'observed': self.observed, 'prepared_node': self.c['node_version'],
                  'commits': {'amazonia': AMAZONIA, 'portal': PORTAL},
                  'npm_legacy_peer_deps': self.c.get('npm_legacy_peer_deps', False)}
        atomic(self.root / 'report.json', report)
        labels = {'checks': 'Contrôles', 'node': 'Node parallèle', 'amazonia': 'Amazonia préparé',
                  'portal': 'Portail préparé', 'restoration': 'Restauration isolée', 'candidates': 'Propositions inactives'}
        lines = ['Préparation Oracle — phase P seulement',
                 'Préparation terminée.' if error is None else 'ARRÊT : une vérification a échoué.',
                 *[labels.get(s, s) + ' : vérifié' for s in self.state['steps']],
                 'BGA : configuration conservée, projet futur, aucun démarrage.',
                 'Sauvegardes existantes : trois fichiers vérifiés, sans recréation.',
                 'Node préparé : ' + self.c['node_version'] + ' ; Node actif inchangé.',
                 'Secrets : opération privée séparée encore nécessaire.',
                 'Aucun déploiement. Aucun service ni accès réseau modifié.',
                 'Avant toute bascule : préparer les secrets en privé ; réconcilier Caddy ;',
                 'tester les fonctions et authentifications LoRA/Forêt ; vérifier le réseau',
                 'et SELinux/sudo ; comparer les historiques ; faire la recette croisée ;',
                 'obtenir une sauvegarde froide finale et les accords B/R du propriétaire.']
        if not provisioned:
            lines.append('Comptes dédiés et Node sous /opt : accord de provisionnement encore nécessaire.')
        if error:
            lines += ['Code : ' + error, 'Étape : ' + self.phase]
        publish(self.root / 'report.txt', '\n'.join(lines) + '\n')

    def bundle(self, include_products=True):
        # Export only explicit products. Never include npm cache/raw output/state
        # or whole VM configuration. Existing complementary backup stays in place.
        pointer = self.root / 'latest-export.json'
        if pointer.exists() or pointer.is_symlink():
            canonical(pointer)
            directory = json.loads(pointer.read_text())['directory']
            need(re.fullmatch(r'export-[0-9]{5}', directory), 'EXPORT_POINTER')
            prior = canonical(self.root / directory)
            sums(prior / 'SHA256SUMS', prior, ('report.json', 'report.txt', 'preparation.tar'))
            if all(sha(prior / n) == sha(self.root / n) for n in ('report.json', 'report.txt')):
                return prior  # verified identical report/products; avoid redundant archives
        products = ['candidates', 'restoration.json', 'amazonia.next', 'portail.next',
                    'amazonia.next.dependencies.json', 'portail.next.dependencies.json',
                    f"runtime/node-{self.c['node_version']}-linux-x64.tar.xz", 'runtime/SHASUMS256.txt'] if include_products else []
        if include_products and (self.root / 'restoration.json').exists():
            directory = json.loads((self.root / 'restoration.json').read_text())['directory']
            need(re.fullmatch(r'restore-[0-9]+', directory), 'RESTORE_EXPORT_PATH')
            products.append(directory + '/sqlite-backup')
        total = 0
        for n in products:
            path = self.root / n
            for f in ([path] if path.is_file() else path.rglob('*')):
                if f.is_file() and not f.is_symlink():
                    total += f.stat().st_size
        disk_check(self.root, total + 2 * 1024**3)
        for number in range(100000):
            export = self.root / f'export-{number:05d}'
            if not export.exists():
                export.mkdir(mode=0o700)
                break
        else:
            raise Stop('EXPORT_LIMIT')
        for n in ('report.json', 'report.txt'):
            shutil.copyfile(self.root / n, export / n)
            (export / n).chmod(0o600)
        archive = export / 'preparation.tar'
        with tarfile.open(archive, 'x') as t:
            for n in products:
                if (self.root / n).exists():
                    t.add(self.root / n, arcname=n, recursive=True)
        archive.chmod(0o600)
        names = ('report.json', 'report.txt', 'preparation.tar')
        write_new(export / 'SHA256SUMS', ''.join(sha(export / n) + '  ' + n + '\n' for n in names))
        # Pointer contains only a validated relative directory, never arbitrary paths.
        atomic(self.root / 'latest-export.json', {'directory': export.name})
        return export

    def run(self, provision=False):
        self.open()
        lock_path = self.root / 'lock'
        need(not lock_path.is_symlink(), 'LOCK_LINK')
        fd = os.open(lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'a') as lock:
            need(os.fstat(lock.fileno()).st_uid == os.getuid()
                 and stat.S_IMODE(os.fstat(lock.fileno()).st_mode) == 0o600, 'LOCK_PERMISSIONS')
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise Stop('PREPARATION_RUNNING') from None
            try:
                self.step('node', ['runtime'], self.node)
                self.step('amazonia', ['amazonia.next', 'amazonia.next.dependencies.json'], lambda: self.clone_build('amazonia.next', AMAZONIA))
                self.step('portal', ['portail.next', 'portail.next.dependencies.json'], lambda: self.clone_build('portail.next', PORTAL))
                self.step('restoration', ['restoration.json'], self.restore)
                # Verify the actual restored tree on every resume, not a success flag.
                rec = json.loads((self.root / 'restoration.json').read_text())
                w = self.root / rec['directory']
                need(w.parent == self.root and tree_digest(w) == rec['digest'] and all(sha(w / 'data' / n) == h for n, h in self.initial['history'].items()), 'RESTORE_RESUME_CHANGED')
                self.step('candidates', ['candidates', 'registry.copy.json'], self.candidates)
                self.phase = 'provision'
                if provision:
                    helper = Path(__file__).with_name('oracle_provision.py')
                    p = subprocess.run(['sudo', '/usr/bin/python3', str(helper), '--workspace', str(self.root),
                                        '--version', self.c['node_version'], '--sha256', self.c['node_sha256']],
                                       env=safe_env())
                    need(p.returncode == 0, 'PROVISION_FAILED')
                need(self.inputs() == self.initial, 'INPUTS_CHANGED_DURING_PREPARATION')
                if self.active_snapshot is not None:
                    need(self.active() == self.active_snapshot, 'ACTIVE_STATE_CHANGED')
                self.report(provisioned=provision)
                export = self.bundle()
                print('Préparation non sensible vérifiée. Aucun déploiement. Export : ' + export.name)
            except Exception as exc:
                code = str(exc) if isinstance(exc, Stop) else 'UNEXPECTED_ERROR'
                self.report(code)
                with contextlib.suppress(Exception):
                    self.bundle(include_products=False)
                raise Stop(code) from None


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--config', required=True, type=Path)
    p.add_argument('--prepare', action='store_true', help='Accord P obtenu : autorise écritures préparatoires')
    p.add_argument('--provision-approved', action='store_true', help='Accord distinct comptes/dossiers et Node sous /opt via sudo')
    a = p.parse_args()
    try:
        need(not a.provision_approved or a.prepare, 'PROVISION_REQUIRES_PREPARE')
        prep = Preparation(config_read(a.config))
        required = prep.checks()
        if not a.prepare:
            print('Contrôles réussis, aucune écriture. Budget réservé : ' + str(required // 1024**3) + ' Gio.')
        else:
            prep.run(a.provision_approved)
    except Stop as e:
        print('Préparation arrêtée : ' + str(e) + '. Consulter la notice ; ne pas basculer.', file=sys.stderr)
        return 1
    except Exception:
        print('Préparation arrêtée : UNEXPECTED_ERROR. Aucun déploiement.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
