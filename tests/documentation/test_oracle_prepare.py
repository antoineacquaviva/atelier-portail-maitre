"""Local fixtures only. Never invokes the production CLI against Oracle paths."""
import contextlib
import fcntl
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[2] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
import oracle_prepare as p
import oracle_provision as provision


def snapshot(root):
    result = {}
    for f in [root, *sorted(root.rglob('*'))]:
        s = f.lstat()
        result[str(f.relative_to(root))] = (s.st_mode, s.st_uid, s.st_gid, s.st_size, s.st_mtime_ns,
                                           p.sha(f) if f.is_file() and not f.is_symlink() else None)
    return result


def node_archive(path):
    """Small authenticated-distribution stand-in; never an executable Node."""
    prefix = 'node-v24.22.1-linux-x64'
    with tarfile.open(path, 'w:xz') as t:
        for n in ('', '/bin', '/lib'):
            item = tarfile.TarInfo(prefix + n)
            item.type = tarfile.DIRTYPE
            item.mode = 0o755
            t.addfile(item)
        for n, data, mode in [('bin/node', b'fixture-node', 0o755), ('lib/npm.mjs', b'fixture-npm', 0o644)]:
            item = tarfile.TarInfo(prefix + '/' + n)
            item.size, item.mode = len(data), mode
            t.addfile(item, io.BytesIO(data))
        item = tarfile.TarInfo(prefix + '/bin/npm')
        item.type, item.linkname = tarfile.SYMTYPE, '../lib/npm.mjs'
        t.addfile(item)


class Fixtures(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='oracle-P-fixtures-')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.history = self.base / 'historical-backup'
        data = self.history / 'data'
        (data / 'campaigns').mkdir(parents=True)
        (data / 'editions').mkdir()
        (data / 'seeds').mkdir()
        for i in range(2):
            record = {'id': f'compatible-{i}', 'status': 'COMPLETED',
                      'startedAt': f'2026-11-0{i+1}T00:00:00Z',
                      'config': {'type': 'MONTE_CARLO_SWEEP', 'sweep': {'parryHsRuleValues': ['SYNERGY_TRAP_SAB']}},
                      'variantResults': [], 'progress': {'completedGames': 10 * (i+1)}}
            (data / 'campaigns' / f'compatible-{i}.json').write_text(json.dumps(record))
        for i in range(7):
            (data / 'campaigns' / f'old-{i}.json').write_text(json.dumps({'incompatible': i}))
        for i in range(2):
            (data / 'campaigns' / f'empty-{i}.json').write_bytes(b'')
        for i in range(5):
            (data / ('editions' if i < 2 else 'seeds') / f'{i}.json').write_text('{}')
        self.backup = self.base / 'complementary-backup'
        self.backup.mkdir()
        self.backup.chmod(0o700)
        self.history.chmod(0o700)
        self.registry = self.base / 'registry.json'
        tools = [{'id': str(i), 'subpath': n, 'port': port, 'private': 'DO_NOT_PRINT_SECRET'}
                 for i, (n, port) in enumerate(p.ROUTES.items())]
        self.registry.write_text(json.dumps(tools))
        (self.backup / 'registre.json').write_bytes(self.registry.read_bytes())
        for n in ('applications.tar', 'configurations.tar'):
            with tarfile.open(self.backup / n, 'w') as t:
                b = b'DO_NOT_PRINT_SECRET'
                info = tarfile.TarInfo('preserved/config.txt')
                info.size = len(b)
                t.addfile(info, io.BytesIO(b))
        (self.backup / 'SHA256SUMS').write_text(''.join(p.sha(self.backup / n) + '  ' + n + '\n' for n in p.NAMES))
        self.c = {'workspace': str(self.base / 'preparation'), 'node_version': 'v24.22.1',
                  'node_sha256': 'a' * 64, 'disk_budget_gib': 6}
        self.prep = p.Preparation(self.c, self.backup, self.history, self.registry)
        self.initial_backup = snapshot(self.backup)
        self.initial_history = snapshot(self.history)

    def opened(self):
        self.prep.initial = self.prep.inputs()
        return self.prep.open()

    def test_checks_are_read_only_and_disk_checked_before_write(self):
        with patch.object(p, 'disk_check', side_effect=p.Stop('DISK_BUDGET')):
            with self.assertRaisesRegex(p.Stop, 'DISK_BUDGET'):
                self.prep.checks(oracle=False)
        self.assertFalse(self.prep.root.exists())
        self.assertEqual(snapshot(self.backup), self.initial_backup)
        self.assertEqual(snapshot(self.history), self.initial_history)

    def test_existing_backups_checksum_and_archive_errors(self):
        self.prep.inputs()
        (self.backup / 'applications.tar').write_bytes(b'broken')
        with self.assertRaisesRegex(p.Stop, 'CHECKSUM'):
            self.prep.inputs()
        with self.assertRaises(tarfile.TarError):
            p.archive_size(self.backup / 'applications.tar')

    def test_permissions_and_foreign_destinations_refused(self):
        self.prep.root.mkdir()
        (self.prep.root / 'keep').write_text('preserve')
        with self.assertRaises(p.Stop):
            self.prep.open()
        self.assertEqual((self.prep.root / 'keep').read_text(), 'preserve')
        self.prep.root.chmod(0o700)
        with self.assertRaisesRegex(p.Stop, 'WORKSPACE_UNOWNED'):
            self.prep.open()

    def test_resume_completed_steps_verified_not_reexecuted(self):
        prep = self.opened()
        with patch.object(p, 'disk_check'):
            prep.step('first', ['first.txt'], lambda: p.write_new(prep.root / 'first.txt', 'complete'))
            def interrupted():
                raise InterruptedError()
            with self.assertRaises(InterruptedError):
                prep.step('second', ['second.txt'], interrupted)
        again = p.Preparation(self.c, self.backup, self.history, self.registry)
        again.initial = again.inputs()
        again.open()
        with patch.object(p, 'disk_check'):
            again.step('first', ['first.txt'], lambda: self.fail('completed operation repeated'))
            again.step('second', ['second.txt'], lambda: p.write_new(prep.root / 'second.txt', 'recovered'))
        (prep.root / 'first.txt').write_text('changed')
        with self.assertRaisesRegex(p.Stop, 'STEP_OUTPUT_CHANGED'):
            again.step('first', ['first.txt'], lambda: None)

    def test_portal_sync_requires_fresh_workspace_and_preserves_old_one(self):
        self.assertEqual(p.AMAZONIA, 'e81bcf2076972b7617f6202d2bbfe94314144c17')
        self.assertEqual(p.PORTAL, '9924ab535dace8c49bda208508d2384dcd56090d')
        # Reconstruct the script before 1C.3.4: only the portal pin changed.
        source = (SCRIPTS / 'oracle_prepare.py').read_bytes()
        old_source = source.replace(p.PORTAL.encode(),
                                    b'f62ef8148cdf18873272a169b48195443b532ce8')
        old_identity = hashlib.sha256(old_source).hexdigest() + p.sha(SCRIPTS / 'oracle_provision.py')
        self.assertNotEqual(old_identity, self.prep.state['implementation'])
        original_sha = p.sha
        def previous_sha(path):
            if Path(path) == SCRIPTS / 'oracle_prepare.py':
                return hashlib.sha256(old_source).hexdigest()
            return original_sha(path)
        with patch.object(p, 'sha', side_effect=previous_sha):
            previous = p.Preparation(self.c, self.backup, self.history, self.registry)
        previous.initial = previous.inputs()
        previous.open()
        with patch.object(p, 'disk_check'):
            previous.step('node', ['runtime'], lambda: (previous.root / 'runtime').mkdir())
        before = snapshot(previous.root)
        self.prep.initial = self.prep.inputs()
        with self.assertRaisesRegex(p.Stop, '^WORKSPACE_INCOMPATIBLE$'):
            self.prep.run()
        self.assertEqual(snapshot(previous.root), before)
        config = dict(self.c, workspace=str(self.base / 'preparation-new'))
        fresh = p.Preparation(config, self.backup, self.history, self.registry)
        with patch.object(p, 'disk_check'):
            fresh.checks(oracle=False)
        self.assertFalse(fresh.root.exists())
        fresh.open()
        fresh.npm_env()
        self.assertEqual(snapshot(previous.root), before)
        self.assertEqual(snapshot(self.backup), self.initial_backup)
        self.assertEqual(snapshot(self.history), self.initial_history)

    def test_interrupted_state_publication_and_lock_source_changes(self):
        prep = self.opened()
        p.write_new(prep.root / 'state.json.next', 'interrupted write')
        p.atomic(prep.root / 'state.json', {'inputs': prep.initial, 'config': self.c, 'steps': {}})
        self.assertEqual((prep.root / 'state.json.next').read_text(), 'interrupted write')
        (self.registry).write_text('[]')
        with self.assertRaises(p.Stop):
            prep.inputs()

    def test_npm_install_failure_resumes_only_with_identical_scripts(self):
        prep = self.opened()
        dest = prep.root / 'amazonia.next'
        calls = []
        def launch(args, **kwargs):
            calls.append(args)
            if args[0] == 'git':
                if args[1] == 'clone':
                    (dest / '.git').mkdir()
                return p.AMAZONIA
            if args[2] == 'install' and sum(c[2:3] == ['install'] for c in calls) == 1:
                p.write_new(dest / 'partial-install', 'preserve')
                raise p.Stop('COMMAND_FAILED')
            (dest / 'dist').mkdir(exist_ok=True)
            (dest / 'dist/index.html').write_text('fixture')
            (dest / 'package-lock.json').write_text('{}')
            return '{}'
        with patch.object(p, 'disk_check'), patch.object(p, 'command', side_effect=launch):
            prep.step('node', ['runtime'], lambda: (prep.root / 'runtime').mkdir())
            with self.assertRaisesRegex(p.Stop, '^NPM_INSTALL_FAILED$'):
                prep.step('amazonia', ['amazonia.next', 'amazonia.next.dependencies.json'],
                          lambda: prep.clone_build('amazonia.next', p.AMAZONIA))
            self.assertNotIn('amazonia', json.loads((prep.root / 'state.json').read_text())['steps'])
            again = p.Preparation(self.c, self.backup, self.history, self.registry)
            again.initial = again.inputs()
            again.open()
            again.step('node', ['runtime'], lambda: self.fail('Node must not be rerun'))
            again.step('amazonia', ['amazonia.next', 'amazonia.next.dependencies.json'],
                       lambda: again.clone_build('amazonia.next', p.AMAZONIA))
        self.assertEqual(sum(c[0:2] == ['git', 'clone'] for c in calls), 1)
        self.assertEqual(sum(c[2:3] == ['install'] for c in calls), 2)
        self.assertEqual((dest / 'partial-install').read_text(), 'preserve')
        # A corrected prepare script OR changed helper invalidates this identity.
        original_sha = p.sha
        for script in ('oracle_prepare.py', 'oracle_provision.py'):
            before = snapshot(prep.root)
            def changed_sha(path):
                return '0' * 64 if Path(path) == SCRIPTS / script else original_sha(path)
            with patch.object(p, 'sha', side_effect=changed_sha):
                changed = p.Preparation(self.c, self.backup, self.history, self.registry)
            changed.initial = prep.initial
            with self.assertRaisesRegex(p.Stop, '^WORKSPACE_INCOMPATIBLE$'):
                changed.run()
            self.assertEqual(snapshot(prep.root), before)
        self.assertEqual(snapshot(self.backup), self.initial_backup)
        self.assertEqual(snapshot(self.history), self.initial_history)

    def test_safe_report_no_raw_errors_or_registry_secrets(self):
        prep = self.opened()
        prep.phase = 'restoration'
        prep.report('HISTORY_LOAD_FAILED')
        report = (prep.root / 'report.txt').read_text() + (prep.root / 'report.json').read_text()
        self.assertNotIn('DO_NOT_PRINT_SECRET', report)
        self.assertNotIn(str(self.registry), report)
        self.assertFalse(json.loads((prep.root / 'report.json').read_text())['ready_for_deployment'])
        with patch.object(p, 'disk_check'):
            first = prep.bundle(include_products=False)
            second = prep.bundle(include_products=False)
        self.assertEqual(first, second)  # unchanged, fully verified export reused
        p.sums(first / 'SHA256SUMS', first, ('report.json', 'report.txt', 'preparation.tar'))
        self.assertEqual(snapshot(self.backup), self.initial_backup)
        (first / 'preparation.tar').write_bytes(b'tampered')
        with self.assertRaisesRegex(p.Stop, 'CHECKSUM_MISMATCH'):
            prep.bundle(include_products=False)

    def test_download_failure_checksum_and_exclusive_destination(self):
        dest = self.base / 'node.tar.xz'
        with patch.object(p.urllib.request, 'urlopen', side_effect=OSError('DO_NOT_PRINT_SECRET')):
            with self.assertRaisesRegex(p.Stop, '^DOWNLOAD_FAILED$'):
                p.download('https://nodejs.org/dist/v24.22.1/node.tar.xz', dest, 'a'*64)
        class Response(io.BytesIO):
            def geturl(self):
                return 'https://nodejs.org/dist/v24.22.1/node.tar.xz'
        with patch.object(p.urllib.request, 'urlopen', return_value=Response(b'wrong')):
            with self.assertRaisesRegex(p.Stop, 'DOWNLOAD_CHECKSUM'):
                p.download('https://nodejs.org/dist/v24.22.1/node.tar.xz', dest, 'a'*64)
        self.assertFalse(dest.exists())
        with patch.object(p.urllib.request, 'urlopen', return_value=Response(b'right')):
            p.download('https://nodejs.org/dist/v24.22.1/node.tar.xz', dest, hashlib.sha256(b'right').hexdigest())
        before = snapshot(dest.parent)
        with self.assertRaisesRegex(p.Stop, 'DOWNLOAD_EXISTING'):
            p.download('https://nodejs.org/dist/v24.22.1/node.tar.xz', dest, 'a'*64)
        self.assertEqual(snapshot(dest.parent), before)

    def test_node_extraction_resume_rejects_traversal_and_foreign_content(self):
        archive = self.base / 'node.tar.xz'
        with tarfile.open(archive, 'w:xz') as t:
            for n, data in [('node-v24.22.1-linux-x64', None), ('node-v24.22.1-linux-x64/bin', None), ('node-v24.22.1-linux-x64/bin/node', b'fixture')]:
                i = tarfile.TarInfo(n)
                if data is None:
                    i.type = tarfile.DIRTYPE
                else:
                    i.size = len(data)
                t.addfile(i, None if data is None else io.BytesIO(data))
        target = self.base / 'node.preparing-0'
        p.extract_node(archive, target, 'v24.22.1')
        p.extract_node(archive, target, 'v24.22.1', resume=True)
        (target / 'bin/node').write_text('foreign')
        with self.assertRaisesRegex(p.Stop, 'NODE_TARGET_DIFFERENT'):
            p.extract_node(archive, target, 'v24.22.1', resume=True)
        evil = self.base / 'evil.tar.xz'
        with tarfile.open(evil, 'w:xz') as t:
            i = tarfile.TarInfo('node-v24.22.1-linux-x64/../../escape')
            i.size = 0
            t.addfile(i, io.BytesIO())
        with self.assertRaisesRegex(p.Stop, 'NODE_ARCHIVE_PATH'):
            p.extract_node(evil, self.base / 'evil.preparing-0', 'v24.22.1')
        self.assertFalse((self.base / 'escape').exists())

    def test_published_node_is_verified_without_any_write(self):
        archive = self.base / 'complete-node.tar.xz'
        node_archive(archive)
        temp = self.base / 'node.preparing-0'
        target = self.base / 'node-v24.22.1-linux-x64'
        p.extract_node(archive, temp, 'v24.22.1')
        p.publish_node(temp, target)
        before = snapshot(self.base)
        p.verify_node(archive, target, 'v24.22.1')
        self.assertEqual(snapshot(self.base), before)
        # Even a caller accidentally choosing extract may not repair a final path.
        with self.assertRaisesRegex(p.Stop, 'NODE_TEMP_PATH'):
            p.extract_node(archive, target, 'v24.22.1', resume=True)
        self.assertEqual(snapshot(self.base), before)

    def test_published_node_rejects_missing_content_links_modes_without_repair(self):
        archive = self.base / 'complete-node.tar.xz'
        node_archive(archive)
        def missing_file(root):
            (root / 'lib/npm.mjs').unlink()
        def extra_file(root):
            (root / 'extra').write_text('unexpected')
        def changed_file(root):
            (root / 'bin/node').write_bytes(b'wrong bytes')
        def bad_mode(root):
            (root / 'bin/node').chmod(0o777)
        def bad_directory_mode(root):
            (root / 'lib').chmod(0o700)
        def bad_link(root):
            (root / 'bin/npm').unlink()
            (root / 'bin/npm').symlink_to('/etc/passwd')
        def bad_hardlink(root):
            os.link(root / 'bin/node', self.base / ('hardlink-' + root.name))
        for number, mutate in enumerate((missing_file, extra_file, changed_file, bad_mode, bad_directory_mode, bad_link, bad_hardlink)):
            with self.subTest(mutate=mutate.__name__):
                temp = self.base / f'node.preparing-{number}'
                final = self.base / f'published-{number}'
                p.extract_node(archive, temp, 'v24.22.1')
                p.publish_node(temp, final)
                mutate(final)
                before = snapshot(self.base)
                with self.assertRaises(p.Stop):
                    p.verify_node(archive, final, 'v24.22.1')
                self.assertEqual(snapshot(self.base), before)

    def test_only_owned_temporary_node_can_resume_missing_files(self):
        archive = self.base / 'complete-node.tar.xz'
        node_archive(archive)
        temp = self.base / 'node.preparing-0'
        old_mask = os.umask(0o077)
        try:
            p.extract_node(archive, temp, 'v24.22.1')
        finally:
            os.umask(old_mask)
        (temp / 'lib/npm.mjs').unlink()
        before = snapshot(temp)
        with self.assertRaisesRegex(p.Stop, 'NODE_TEMP_UNOWNED'):
            p.extract_node(archive, temp, 'v24.22.1')
        self.assertEqual(snapshot(temp), before)
        p.extract_node(archive, temp, 'v24.22.1', resume=True)
        p.verify_node(archive, temp, 'v24.22.1')
        foreign = self.base / 'foreign.preparing-0'
        foreign.mkdir()
        before = snapshot(foreign)
        with self.assertRaisesRegex(p.Stop, 'NODE_TEMP_UNOWNED'):
            p.extract_node(archive, foreign, 'v24.22.1', resume=True)
        self.assertEqual(snapshot(foreign), before)

    def test_node_publication_refuses_even_an_empty_existing_destination(self):
        archive = self.base / 'complete-node.tar.xz'
        node_archive(archive)
        temp = self.base / 'node.preparing-0'
        p.extract_node(archive, temp, 'v24.22.1')
        final = self.base / 'already-published'
        final.mkdir()
        before = snapshot(self.base)
        with self.assertRaisesRegex(p.Stop, 'NODE_DESTINATION_EXISTS'):
            p.publish_node(temp, final)
        self.assertEqual(snapshot(self.base), before)

    def test_dedicated_existing_directory_is_never_chowned_or_chmodded(self):
        user = type('User', (), {'pw_uid': os.getuid(), 'pw_gid': os.getgid()})()
        dest = self.base / 'dedicated'
        with patch.object(provision.os, 'chown') as chown:
            provision.dedicated(dest, user)
            self.assertEqual(chown.call_count, 1)
            provision.dedicated(dest, user)
            self.assertEqual(chown.call_count, 1)
            dest.chmod(0o755)
            with self.assertRaisesRegex(p.Stop, 'EXISTING_DIRECTORY_REVIEW'):
                provision.dedicated(dest, user)
            self.assertEqual(stat_mode(dest), 0o755)

    def test_configuration_group_must_be_exclusive_to_its_service(self):
        from types import SimpleNamespace
        user = SimpleNamespace(pw_uid=120, pw_gid=120, pw_shell='/sbin/nologin')
        group = SimpleNamespace(gr_name='amazonia', gr_mem=['neighbor'])
        with patch.object(provision.pwd, 'getpwnam', return_value=user), \
             patch.object(provision.grp, 'getgrgid', return_value=group):
            with self.assertRaisesRegex(p.Stop, 'ACCOUNT_GROUP'):
                provision.account('amazonia')
            group.gr_mem = []
            other = SimpleNamespace(pw_uid=121, pw_gid=120)
            with patch.object(provision.pwd, 'getpwall', return_value=[user, other]):
                with self.assertRaisesRegex(p.Stop, 'ACCOUNT_SHARED_GROUP'):
                    provision.account('amazonia')

    def test_history_layout_links_counts_and_empty_files(self):
        self.assertEqual(len(p.history_inventory(self.history / 'data')), 16)
        with self.assertRaises(p.Stop):
            p.history_inventory(self.history / 'campaigns')
        empty = self.history / 'data/campaigns/empty-0.json'
        empty.write_text('changed')
        with self.assertRaisesRegex(p.Stop, 'HISTORY_EMPTY_FILES'):
            p.history_inventory(self.history / 'data')

    def test_neighbors_and_backups_unchanged_on_preparation_failure(self):
        neighbors = self.base / 'neighbors'
        for n in ('lora', 'foret', 'bga'):
            (neighbors / n).mkdir(parents=True)
            (neighbors / n / 'unchanged').write_text('keep')
        before = snapshot(neighbors)
        prep = self.opened()
        with patch.object(prep, 'node', side_effect=p.Stop('DOWNLOAD_FAILED')), patch.object(p, 'disk_check'):
            with self.assertRaisesRegex(p.Stop, 'DOWNLOAD_FAILED'):
                prep.run()
        self.assertEqual(snapshot(neighbors), before)
        self.assertEqual(snapshot(self.backup), self.initial_backup)
        self.assertEqual(snapshot(self.history), self.initial_history)

    def test_whole_orchestration_resumes_after_build_failure(self):
        prep = self.opened()
        calls = []
        def node():
            calls.append('node')
            (prep.root / 'runtime').mkdir()
            p.write_new(prep.root / 'runtime/verified', 'node')
        def build(name, commit):
            calls.append(name)
            if name == 'portail.next' and calls.count(name) == 1:
                raise p.Stop('COMMAND_FAILED')
            (prep.root / name).mkdir()
            p.write_new(prep.root / name / 'commit', commit)
            p.write_new(prep.root / (name + '.dependencies.json'), '{}')
        def restore():
            (prep.root / 'restore-0').mkdir()
            shutil.copytree(self.history / 'data', prep.root / 'restore-0/data')
            p.write_new(prep.root / 'restoration.json', json.dumps({
                'directory': 'restore-0', 'digest': p.tree_digest(prep.root / 'restore-0')}))
        def candidates():
            (prep.root / 'candidates').mkdir()
            p.write_new(prep.root / 'candidates/inactive', 'no activation')
            p.write_new(prep.root / 'registry.copy.json', self.registry.read_text())
        with patch.object(prep, 'node', side_effect=node), patch.object(prep, 'clone_build', side_effect=build), \
             patch.object(prep, 'restore', side_effect=restore), patch.object(prep, 'candidates', side_effect=candidates), \
             patch.object(p, 'disk_check'):
            with self.assertRaisesRegex(p.Stop, 'COMMAND_FAILED'):
                prep.run()
            self.assertFalse(json.loads((prep.root / 'report.json').read_text())['success'])
            prep.run()
            self.assertTrue(json.loads((prep.root / 'report.json').read_text())['success'])
            prep.run()
            # No privileged command is executed: check the real launch boundary.
            with patch.dict(os.environ, {'PATH': '/untrusted-user-path'}), \
                 patch.object(p.subprocess, 'run') as launch:
                launch.return_value.returncode = 0
                prep.run(provision=True)
            launch.assert_called_once()
            self.assertEqual(launch.call_args.args[0][0:2], ['sudo', '/usr/bin/python3'])
            self.assertEqual(launch.call_args.kwargs['env']['PATH'], p.SYSTEM_PATH)
        self.assertEqual(calls.count('node'), 1)
        self.assertEqual(calls.count('amazonia.next'), 1)
        self.assertEqual(calls.count('portail.next'), 2)
        self.assertEqual((prep.root / 'amazonia.next/commit').read_text(), p.AMAZONIA)
        self.assertEqual((prep.root / 'portail.next/commit').read_text(), p.PORTAL)
        report = json.loads((prep.root / 'report.json').read_text())
        self.assertEqual(report['commits'], {'amazonia': p.AMAZONIA, 'portal': p.PORTAL})
        self.assertFalse(report['ready_for_deployment'])
        self.assertEqual(p.sha(prep.root / 'registry.copy.json'), p.sha(self.registry))
        self.assertEqual(snapshot(self.backup), self.initial_backup)
        self.assertEqual(snapshot(self.history), self.initial_history)

    def test_exclusive_lock_prevents_second_preparation(self):
        prep = self.opened()
        p.write_new(prep.root / 'lock', '')
        with (prep.root / 'lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(p.Stop, 'PREPARATION_RUNNING'):
                prep.run()

    @unittest.skipUnless(os.environ.get('TSX_FIXTURE_PACKAGE'), 'tsx fixture not configured')
    def test_real_caddy_candidates_preserve_four_routes_and_bga(self):
        prep = self.opened()
        tools = []
        for route, port in p.ROUTES.items():
            name = route[1:]
            tools.append({'id': name, 'name': name, 'subpath': route, 'port': port,
                          'repo': 'antoineacquaviva/' + ('Amazonia' if name == 'amazonia' else name),
                          'branch': 'main', 'vmPath': '/srv/jeu/' + name,
                          'systemdUnit': name + '.service'})
        # This separate test defines a new fixture baseline, never a live registry.
        self.registry.write_text(json.dumps(tools))
        prep.initial['registry'] = p.sha(self.registry)
        portal = prep.root / 'portail.next'
        portal.mkdir()
        repo = SCRIPTS.parent
        shutil.copytree(repo / 'src', portal / 'src')
        (portal / 'scripts').mkdir()
        shutil.copyfile(repo / 'scripts/prepare-caddy.ts', portal / 'scripts/prepare-caddy.ts')
        (portal / 'package.json').write_text('{"type":"module"}')
        (portal / 'node_modules').mkdir()
        (portal / 'node_modules/tsx').symlink_to(Path(os.environ['TSX_FIXTURE_PACKAGE']).resolve())
        binary = prep.root / 'runtime/node/bin'
        binary.mkdir(parents=True)
        (binary / 'node').symlink_to(Path(shutil.which('node')).resolve())
        before = p.sha(self.registry)
        prep.candidates()
        candidate = (prep.root / 'candidates/Caddyfile.proposed').read_text()
        for route in p.ROUTES:
            self.assertIn('handle_path ' + route + '/*', candidate)
        self.assertLess(candidate.index('basic_auth'), candidate.index('handle_path'))
        self.assertIn('admin off', candidate)
        self.assertEqual(before, p.sha(self.registry))
        (prep.root / 'candidates/Caddyfile.proposed').write_text('foreign configuration')
        with self.assertRaisesRegex(p.Stop, 'CANDIDATE_CHANGED'):
            prep.candidates()

    @unittest.skipUnless(os.environ.get('AMAZONIA_FIXTURE_ROOT') and os.environ.get('TSX_FIXTURE_PACKAGE'), 'real Amazonia/tsx fixtures not configured')
    def test_real_restore_backup_restore_and_retry_after_interruption(self):
        prep = self.opened()
        code = Path(os.environ['AMAZONIA_FIXTURE_ROOT']).resolve()
        head = subprocess.check_output(['git', '-C', str(code), 'rev-parse', 'HEAD'], text=True).strip()
        self.assertEqual(head, p.AMAZONIA)
        shutil.copytree(code, prep.root / 'amazonia.next', symlinks=True, ignore=shutil.ignore_patterns('.git', 'node_modules'))
        modules = prep.root / 'amazonia.next/node_modules'
        modules.mkdir()
        (modules / 'tsx').symlink_to(Path(os.environ['TSX_FIXTURE_PACKAGE']).resolve(), target_is_directory=True)
        node = Path(shutil.which('node')).resolve()
        binary = prep.root / 'runtime/node/bin'
        binary.mkdir(parents=True)
        (binary / 'node').symlink_to(node)
        # A genuinely interrupted attempt is kept; next generation is used.
        (prep.root / 'restore-0').mkdir()
        (prep.root / 'restore-0/partial').write_text('interrupted')
        prep.restore()
        record = json.loads((prep.root / 'restoration.json').read_text())
        self.assertEqual(record['directory'], 'restore-1')
        self.assertEqual(record['compatible_records'], 2)
        self.assertTrue(record['roundtrip'])
        self.assertTrue((prep.root / 'restore-1/sqlite-restored/orchestration.sqlite').is_file())
        self.assertEqual(snapshot(self.history), self.initial_history)
        self.assertEqual(snapshot(self.backup), self.initial_backup)
        self.assertEqual((prep.root / 'restore-0/partial').read_text(), 'interrupted')
        # Loading failure creates no false success marker.
        (prep.root / 'restoration.json').rename(prep.root / 'restoration.previous.json')
        with patch.object(p.subprocess, 'run', side_effect=subprocess.TimeoutExpired('fixture', 1)):
            with self.assertRaisesRegex(p.Stop, 'HISTORY_LOAD_FAILED'):
                prep.restore()
        self.assertFalse((prep.root / 'restoration.json').exists())


def stat_mode(path):
    return path.stat().st_mode & 0o777


if __name__ == '__main__':
    unittest.main()
