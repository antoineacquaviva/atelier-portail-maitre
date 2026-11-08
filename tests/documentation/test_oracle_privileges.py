"""Real Unix permission tests in a disposable root container, never on Oracle.

No accounts are created. Child processes drop to numeric test UID/GID pairs.
All paths are inside TemporaryDirectory; the repository can be mounted read-only.
"""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
import oracle_prepare as p
import oracle_provision as provision
from test_oracle_prepare import snapshot, node_archive


@unittest.skipUnless(os.geteuid() == 0, 'requires disposable root container for numeric UID/GID fixtures')
class PrivilegeFixtures(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='oracle-private-fixtures-')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.base.chmod(0o755)
        self.users = [SimpleNamespace(pw_uid=12001, pw_gid=12001),
                      SimpleNamespace(pw_uid=12002, pw_gid=12002)]
        self.directories = [self.base / 'etc-amazonia', self.base / 'etc-atelier-portail']
        for directory, user in zip(self.directories, self.users):
            provision.configuration(directory, user)
            p.write_new(directory / 'service.env', 'FIXTURE_ONLY=true\n')
            # Fixed fake value, never a generated production secret.
            p.write_new(directory / 'internal-key', 'a' * 64 + '\n')
            os.chown(directory / 'internal-key', user.pw_uid, user.pw_gid)
            (directory / 'internal-key').chmod(0o400)
            role = self.base / str(user.pw_uid)
            role.mkdir(mode=0o700)
            os.chown(role, user.pw_uid, user.pw_gid)
            p.write_new(role / 'replacement', 'fixture replacement')
            os.chown(role / 'replacement', user.pw_uid, user.pw_gid)

    def attempt(self, user, target, operation, allowed=False):
        def drop():
            os.setgroups([])
            os.setgid(user.pw_gid)
            os.setuid(user.pw_uid)
        code = '''import os,sys
from pathlib import Path
target,operation,source=Path(sys.argv[1]),sys.argv[2],Path(sys.argv[3])
try:
    if operation=='read': target.read_bytes()
    elif operation=='write':
        with target.open('r+b') as f: f.write(b'forbidden')
    elif operation=='delete': target.unlink()
    elif operation=='rename': target.rename(target.with_name('renamed'))
    elif operation=='replace': os.replace(source,target)
    elif operation=='create': (target/'new-file').write_text('forbidden')
    elif operation=='chmod': target.chmod(0o666)
    else: raise AssertionError('unknown operation')
except PermissionError: sys.exit(13)
'''
        before = snapshot(self.base)
        result = subprocess.run([sys.executable, '-B', '-c', code, str(target), operation,
                                 str(self.base / str(user.pw_uid) / 'replacement')],
                                preexec_fn=drop, capture_output=True, text=True,
                                env={'PATH': '/usr/bin:/bin', 'PYTHONDONTWRITEBYTECODE': '1'})
        self.assertEqual(result.returncode, 0 if allowed else 13, result.stderr)
        self.assertEqual(snapshot(self.base), before, 'permission probe changed a fixture')

    def test_application_can_only_read_its_key_not_write_replace_or_delete(self):
        for user, directory in zip(self.users, self.directories):
            with self.subTest(uid=user.pw_uid):
                self.attempt(user, directory / 'internal-key', 'read', allowed=True)
                self.attempt(user, directory / 'internal-key', 'write')
                for name in ('internal-key', 'service.env'):
                    for operation in ('replace', 'delete', 'rename'):
                        self.attempt(user, directory / name, operation)
                for operation in ('read', 'write', 'chmod'):
                    self.attempt(user, directory / 'service.env', operation)
                self.attempt(user, directory, 'create')
                self.attempt(user, directory, 'chmod')
                # The existing adapters' no group/other bits contract is unchanged.
                self.assertEqual((directory / 'internal-key').stat().st_mode & 0o777, 0o400)
                self.assertEqual((directory / 'internal-key').stat().st_mode & 0o077, 0)

    def test_other_application_cannot_read_or_modify_neighbor_configuration(self):
        for user, other in zip(self.users, reversed(self.directories)):
            self.attempt(user, other / 'internal-key', 'read')
            self.attempt(user, other / 'service.env', 'read')
            self.attempt(user, other, 'create')
            for operation in ('write', 'delete', 'rename', 'replace'):
                self.attempt(user, other / 'service.env', operation)

    def test_configuration_reuse_validates_without_repair(self):
        directory, user = self.directories[0], self.users[0]
        before = snapshot(self.base)
        with patch.object(provision.os, 'chown', side_effect=AssertionError('existing owner changed')):
            provision.configuration(directory, user)
        self.assertEqual(snapshot(self.base), before)
        os.chown(directory, user.pw_uid, user.pw_gid)
        before = snapshot(self.base)
        with self.assertRaisesRegex(p.Stop, 'CONFIG_DIRECTORY_REVIEW'):
            provision.configuration(directory, user)
        self.assertEqual(snapshot(self.base), before)
        os.chown(directory, 0, user.pw_gid)
        (directory / 'internal-key').chmod(0o640)
        before = snapshot(self.base)
        with self.assertRaisesRegex(p.Stop, 'CONFIG_FILE_REVIEW'):
            provision.configuration(directory, user)
        self.assertEqual(snapshot(self.base), before)

    def test_root_helper_existing_node_is_verify_only_for_all_mismatches(self):
        archive = self.base / 'node.tar.xz'
        node_archive(archive)
        dest = self.base / 'node-v24.22.1-linux-x64'
        empty = self.base / 'empty-existing'
        empty.mkdir(mode=0o755)
        before = snapshot(self.base)
        with patch.object(provision, 'extract_node', side_effect=AssertionError('empty published target repaired')):
            with self.assertRaisesRegex(p.Stop, 'NODE_TARGET_INCOMPLETE'):
                provision.install_node(archive, empty, 'v24.22.1')
        self.assertEqual(snapshot(self.base), before)
        provision.install_node(archive, dest, 'v24.22.1')
        before = snapshot(self.base)
        with patch.object(provision, 'extract_node', side_effect=AssertionError('published target extracted')):
            provision.install_node(archive, dest, 'v24.22.1')
        self.assertEqual(snapshot(self.base), before)
        changes = [('missing', lambda: (dest / 'lib/npm.mjs').unlink()),
                   ('owner', lambda: os.chown(dest / 'bin/node', 12001, 12001)),
                   ('mode', lambda: (dest / 'lib').chmod(0o777)),
                   ('root-mode', lambda: dest.chmod(0o700)),
                   ('link', lambda: ((dest / 'bin/npm').unlink(), (dest / 'bin/npm').symlink_to('/etc/passwd')))]
        for name, mutate in changes:
            with self.subTest(change=name):
                # Rebuild a NEW fixture, never repair the deliberately corrupted one.
                if name != 'missing':
                    dest.rename(self.base / ('corrupt-' + name))
                    provision.install_node(archive, dest, 'v24.22.1')
                mutate()
                before = snapshot(self.base)
                with patch.object(provision, 'extract_node', side_effect=AssertionError('silent repair')):
                    with self.assertRaises(p.Stop):
                        provision.install_node(archive, dest, 'v24.22.1')
                self.assertEqual(snapshot(self.base), before)


if __name__ == '__main__':
    unittest.main()
