"""Oracle executable layout fixtures; no real system/privileged command is run."""
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
import oracle_prepare as p
import oracle_provision as provision
import test_oracle_prepare as fixtures


class OraclePathTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.Fixtures('test_checks_are_read_only_and_disk_checked_before_write')
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.base = self.fixture.base
        self.dirs = [self.base / n for n in ('usr/local/bin', 'usr/bin', 'bin', 'usr/sbin', 'sbin')]
        for directory in self.dirs:
            directory.mkdir(parents=True, exist_ok=True)
        self.controlled = ':'.join(map(str, self.dirs))
        self.user_bin = self.base / 'untrusted-user-bin'
        self.user_bin.mkdir()

    def executable(self, directory, name, output):
        file = directory / name
        file.write_text('#!/bin/sh\nprintf "%s\\n" "' + output + '"\n')
        file.chmod(0o755)
        return file

    def test_getenforce_only_in_usr_sbin_and_hostile_user_path(self):
        self.assertIn('/usr/sbin', p.SYSTEM_PATH.split(':'))
        self.assertIn('/sbin', p.SYSTEM_PATH.split(':'))
        self.executable(self.dirs[3], 'getenforce', 'Enforcing')
        self.executable(self.user_bin, 'getenforce', 'UNTRUSTED')
        with patch.dict(os.environ, {'PATH': str(self.user_bin)}):
            # Reproduce the previous bin-only failure before exercising the fix.
            with patch.object(p, 'SYSTEM_PATH', ':'.join(map(str, self.dirs[:3]))):
                with self.assertRaisesRegex(p.Stop, 'COMMAND_FAILED'):
                    p.command(['getenforce'])
            with patch.object(p, 'SYSTEM_PATH', self.controlled):
                self.assertEqual(p.command(['getenforce']).strip(), 'Enforcing')
                self.assertEqual(p.safe_env()['PATH'], self.controlled)
                self.assertNotIn(str(self.user_bin), p.safe_env()['PATH'])

    def test_node_prefix_keeps_fixed_system_directories_and_filters_preloads(self):
        node = self.base / 'prepared-node/bin'
        with patch.dict(os.environ, {'PATH': str(self.user_bin), 'NODE_OPTIONS': '--require=UNTRUSTED'}):
            env = p.safe_env(node)
        self.assertEqual(env['PATH'], str(node) + ':' + p.SYSTEM_PATH)
        self.assertNotIn('NODE_OPTIONS', env)
        self.assertNotIn(str(self.user_bin), env['PATH'])

    def test_checks_accept_oracle_layout_without_creating_workspace(self):
        for name, output in [('id', 'opc'), ('systemctl', 'active'), ('python3', ''), ('git', ''), ('tar', '')]:
            self.executable(self.dirs[1], name, output)
        self.executable(self.dirs[3], 'getenforce', 'Enforcing')
        self.executable(self.user_bin, 'getenforce', 'UNTRUSTED')
        original_command, original_read = p.command, Path.read_text
        def command(args, **kwargs):
            if args[0] == '/usr/bin/node': return 'v20.20.2\n'
            if args[0] == '/usr/bin/caddy': return 'v2.11.7\n'
            return original_command(args, **kwargs)
        def read(path, *args, **kwargs):
            if path == Path('/etc/os-release'): return 'ID="ol"\nVERSION_ID="9.8"\n'
            return original_read(path, *args, **kwargs)
        with patch.object(p, 'SYSTEM_PATH', self.controlled), patch.dict(os.environ, {'PATH': str(self.user_bin)}), \
             patch.object(p, 'command', side_effect=command), patch.object(Path, 'read_text', read), \
             patch.object(p.os, 'geteuid', return_value=1000), \
             patch.object(p.platform, 'machine', return_value='x86_64'), patch.object(p.os, 'cpu_count', return_value=16), \
             patch.object(p.os, 'sysconf', side_effect=lambda key: 4096 if key == 'SC_PAGE_SIZE' else 4194304), \
             patch.object(self.fixture.prep, 'active', return_value={'fixture': 'unchanged'}), patch.object(p, 'disk_check'):
            self.fixture.prep.checks(oracle=True)
        self.assertFalse(self.fixture.prep.root.exists())

    def test_prerequisite_found_only_in_user_path_is_refused(self):
        self.executable(self.dirs[1], 'python3', '')
        self.executable(self.dirs[1], 'tar', '')
        for name in ('python3', 'git', 'tar'):
            self.executable(self.user_bin, name, '')
        with patch.object(p, 'SYSTEM_PATH', self.controlled), patch.dict(os.environ, {'PATH': str(self.user_bin)}):
            with self.assertRaisesRegex(p.Stop, 'PREREQUISITE_MISSING'):
                self.fixture.prep.checks(oracle=False)
        self.assertFalse(self.fixture.prep.root.exists())

    def test_absolute_useradd_receives_controlled_environment(self):
        user = SimpleNamespace(pw_uid=120, pw_gid=120, pw_shell='/sbin/nologin')
        group = SimpleNamespace(gr_name='amazonia', gr_mem=[])
        with patch.dict(os.environ, {'PATH': str(self.user_bin)}), \
             patch.object(provision.pwd, 'getpwnam', side_effect=[KeyError(), user]), \
             patch.object(provision.pwd, 'getpwall', return_value=[user]), \
             patch.object(provision.grp, 'getgrgid', return_value=group), \
             patch.object(provision.grp, 'getgrall', return_value=[]), \
             patch.object(provision.subprocess, 'run') as run:
            provision.account('amazonia')
        self.assertEqual(run.call_args.args[0][0], '/usr/sbin/useradd')
        self.assertEqual(run.call_args.kwargs['env']['PATH'], p.SYSTEM_PATH)


if __name__ == '__main__':
    unittest.main()
