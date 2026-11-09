"""Host collection is simulated. JSON/Git fixtures are real; never contacts Oracle."""
import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
import oracle_post_p as p

SECRET = 'PRIVATE_SECRET_MUST_NEVER_BE_SHARED'


class PostPTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='post-p-fixture-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()

    def private(self, name, value):
        path = self.root / name
        path.write_text(json.dumps(value))
        path.chmod(0o600)
        return path

    def config(self, handlers):
        return {'apps': {'http': {'servers': {'private-host': {
            'routes': [{'handle': handlers}], 'secret': SECRET}}}}}

    def spec(self):
        return {k: (2 * p.GIB if k == 'margin' else 100) for k in p.BUDGET_FIELDS}

    def snapshot(self):
        return {str(f.relative_to(self.root)): (f.lstat().st_mode, f.lstat().st_mtime_ns,
                f.read_bytes() if f.is_file() and not f.is_symlink() else None)
                for f in self.root.rglob('*')}

    def test_command_filters_environment_and_suppresses_stderr(self):
        with patch.dict(os.environ, {'PATH': '/untrusted', 'NODE_OPTIONS': SECRET,
                                     'GIT_CONFIG_COUNT': '1', 'LD_PRELOAD': SECRET}), \
             patch.object(p.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout=b'Enforcing')) as run:
            self.assertEqual(p.run(['getenforce']), 'Enforcing')
        kw = run.call_args.kwargs
        self.assertIn('/usr/sbin', kw['env']['PATH'])
        self.assertNotIn(SECRET, json.dumps(kw['env']))
        self.assertNotIn('GIT_CONFIG_COUNT', kw['env'])
        self.assertEqual(kw['env']['GIT_OPTIONAL_LOCKS'], '0')
        self.assertEqual(kw['stderr'], subprocess.DEVNULL)
        self.assertEqual(kw['stdin'], subprocess.DEVNULL)
        self.assertNotIn('shell', kw)
        self.assertEqual(kw['timeout'], 20)

    def test_failures_do_not_publish_errors_or_imply_absence(self):
        for exc in (PermissionError(SECRET), FileNotFoundError(SECRET),
                    subprocess.TimeoutExpired(SECRET, 20), ValueError(SECRET)):
            with self.subTest(exc=type(exc)), patch.object(p, 'run', side_effect=exc):
                result = p.probe(lambda: p.unit('caddy'))
                self.assertEqual(result['status'], 'UNKNOWN')
                self.assertNotIn(SECRET, json.dumps(result))

    def test_network_keeps_ports_and_families_without_addresses(self):
        v4 = 'tcp LISTEN 0 128 0.0.0.0:8083 0.0.0.0:*\nudp UNCONN 0 0 127.0.0.1:111 0.0.0.0:*\n'
        v6 = 'tcp LISTEN 0 128 [::]:5050 [::]:*\ntcp LISTEN 0 128 [::1]:2019 [::]:*\n'
        with patch.object(p, 'run', side_effect=[v4, v6]):
            ipv4, ipv6 = p.sockets('4'), p.sockets('6')
        self.assertIn({'protocol': 'tcp', 'port': 8083, 'scope': 'WILDCARD'}, ipv4)
        self.assertIn({'protocol': 'tcp', 'port': 5050, 'scope': 'WILDCARD'}, ipv6)
        self.assertIn({'protocol': 'tcp', 'port': 2019, 'scope': 'LOOPBACK'}, ipv6)
        self.assertNotIn('127.0.0.1', json.dumps(ipv4))
        self.assertNotIn('::1', json.dumps(ipv6))

    def test_unrecognized_network_and_unit_output_remain_unknown(self):
        for fn in (lambda: p.sockets('6'), lambda: p.unit('amazonia'), p.firewall, p.nftables):
            with patch.object(p, 'run', return_value=SECRET):
                self.assertEqual(p.probe(fn)['status'], 'UNKNOWN')

    def test_firewall_indicators_never_export_raw_rules(self):
        text = f'{SECRET} (active)\n  target: ACCEPT\n  ports: 1-65535/tcp\n  rich rules:\n    rule family="ipv6" source address="{SECRET}" accept\n'
        with patch.object(p, 'run', return_value=text):
            result = p.firewall()
        self.assertEqual(result['accept_targets'], 1)
        self.assertTrue(result['port_ranges_present'])
        self.assertTrue(result['rich_rules_present'])
        self.assertNotIn(SECRET, json.dumps(result))
        self.assertEqual(result['full_ipv4_ipv6_policy'], 'PRIVATE_REVIEW_REQUIRED')

    def test_unit_only_exports_allowlisted_values(self):
        fields = {'LoadState': 'loaded', 'ActiveState': 'active', 'SubState': 'running',
                  'User': SECRET, 'Group': SECRET, 'WorkingDirectory': '/' + SECRET,
                  'MainPID': '77', 'FragmentPath': '/' + SECRET, 'DropInPaths': '/' + SECRET}
        with patch.object(p, 'run', return_value='\n'.join(k + '=' + v for k, v in fields.items())):
            result = p.unit('amazonia')
        self.assertNotIn(SECRET, json.dumps(result))
        self.assertEqual(result['user'], 'OTHER_REDACTED')
        self.assertFalse(result['cwd_matches_known'])
        self.assertTrue(result['dropins_present'])

    def test_metadata_distinguishes_denied_missing_and_link(self):
        self.assertEqual(p.metadata(self.root / 'absent')['state'], 'ABSENT_AT_OBSERVATION')
        with patch.object(Path, 'lstat', side_effect=PermissionError(SECRET)):
            self.assertEqual(p.probe(lambda: p.metadata('/etc/private/data'))['status'], 'UNKNOWN')
        link = self.root / 'link'
        link.symlink_to(self.root / 'absent')
        self.assertEqual(p.metadata(link / 'data')['state'], 'SYMLINK_REQUIRES_PRIVATE_REVIEW')

    def test_private_json_rejects_permissions_links_duplicates_and_special_files(self):
        good = self.private('good.json', {'secret': SECRET})
        before = self.snapshot()
        self.assertEqual(p.private_json(good), {'secret': SECRET})
        self.assertEqual(before, self.snapshot())
        good.chmod(0o644)
        self.assertEqual(p.probe(lambda: p.private_json(good))['status'], 'UNKNOWN')
        good.chmod(0o600)
        link = self.root / 'link'
        link.symlink_to(good)
        hard = self.root / 'hard'
        os.link(good, hard)
        duplicate = self.root / 'duplicate'
        duplicate.write_text('{"x": 1, "x": 2}')
        duplicate.chmod(0o600)
        fifo = self.root / 'fifo'
        os.mkfifo(fifo, 0o600)
        for path in (good, hard, link, duplicate, fifo, self.root):
            self.assertEqual(p.probe(lambda f=path: p.private_json(f))['status'], 'UNKNOWN')

    def test_private_json_rejects_nonfinite_and_oversize_input(self):
        for value in ('NaN', 'Infinity', '-Infinity', '1e999'):
            path = self.root / value
            path.write_text('{"value":' + value + '}')
            path.chmod(0o600)
            self.assertEqual(p.probe(lambda: p.private_json(path))['status'], 'UNKNOWN')
        path = self.root / 'huge'
        with path.open('wb') as f:
            f.truncate(8 * 1024 * 1024 + 1)
        path.chmod(0o600)
        self.assertEqual(p.probe(lambda: p.private_json(path))['status'], 'UNKNOWN')

    def test_caddy_counts_cannot_mask_authentication_order_change(self):
        basic = {'handler': 'authentication', 'providers': {'http_basic': {'secret': SECRET}}}
        proxy = {'handler': 'reverse_proxy', 'upstreams': [{'dial': SECRET}]}
        effective = self.private('effective.json', self.config([proxy, basic]))
        candidate = self.private('candidate.json', self.config([basic, proxy]))
        before = self.snapshot()
        result = p.compare_caddy(effective, candidate)
        self.assertFalse(result['parsed_json_equal'])
        self.assertFalse(result['deployment_validated'])
        self.assertNotIn(SECRET, json.dumps(result))
        self.assertEqual(self.snapshot(), before)
        effective.write_bytes(candidate.read_bytes())
        result = p.compare_caddy(effective, candidate)
        self.assertTrue(result['parsed_json_equal'])
        self.assertFalse(result['deployment_validated'])

    def test_caddy_boolean_cannot_equal_numeric_config_value(self):
        live = self.config([{'handler': 'reverse_proxy', 'flag': True}])
        candidate = self.config([{'handler': 'reverse_proxy', 'flag': 1}])
        effective = self.private('effective.json', live)
        proposed = self.private('candidate.json', candidate)
        self.assertFalse(p.compare_caddy(effective, proposed)['parsed_json_equal'])

    def test_caddy_requires_usable_pair_and_never_prints_bad_input(self):
        path = self.private('not-caddy.json', {'private': SECRET})
        self.assertEqual(p.probe(lambda: p.compare_caddy(path, path))['status'], 'UNKNOWN')
        for args in (['--caddy-effective-json', str(path)], ['--caddy-candidate-json', str(path)]):
            stream = io.StringIO()
            with contextlib.redirect_stdout(stream):
                self.assertEqual(p.main(args), 1)
            self.assertEqual(json.loads(stream.getvalue())['reason'], 'CADDY_PAIR_REQUIRED')
            self.assertNotIn(str(path), stream.getvalue())

    def test_budget_accounts_for_rollback_margin_and_inodes(self):
        spec = self.spec()
        total = sum(spec[k] for k in spec if k != 'required_inodes')
        self.assertFalse(p.budget_estimate(spec, {'free_bytes': total - 1, 'free_inodes': 1000})['fits_at_observation'])
        self.assertFalse(p.budget_estimate(spec, {'free_bytes': total, 'free_inodes': 99})['fits_at_observation'])
        result = p.budget_estimate(spec, {'free_bytes': total, 'free_inodes': 100})
        self.assertTrue(result['fits_at_observation'])
        self.assertFalse(result['deployment_validated'])
        for key, bad in [('margin', p.GIB), ('rollback_post_switch_reserve', 0),
                         ('migration_copy', -1), ('cold_data_archive', True), ('migration_scratch', None)]:
            with self.subTest(key=key):
                invalid = dict(spec, **{key: bad})
                self.assertEqual(p.probe(lambda: p.budget_estimate(invalid, {}))['status'], 'UNKNOWN')
        self.assertEqual(p.probe(lambda: p.budget_estimate(dict(spec, invented=1), {}))['status'], 'UNKNOWN')

    def test_git_real_fixture_detects_changes_without_writes_or_filename_disclosure(self):
        # Local throwaway repo only. Actual Git status must not refresh the index.
        root = str(self.root)
        def git(*args):
            subprocess.run(['git', '-C', root, *args], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        git('init')
        file = self.root / 'tracked'
        file.write_text('old')
        git('add', 'tracked')
        git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture')
        file.write_text('changed')
        (self.root / (SECRET + '\nfile')).write_text(SECRET)
        before = self.snapshot()
        with patch.dict(os.environ, {'GIT_CONFIG_COUNT': '1', 'GIT_CONFIG_KEY_0': 'core.fsmonitor',
                                     'GIT_CONFIG_VALUE_0': '/nonexistent/' + SECRET}):
            result = p.git_state(root)
        self.assertEqual(result['tracked_changes'], 1)
        self.assertEqual(result['untracked_entries'], 1)
        self.assertNotIn(SECRET, json.dumps(result))
        self.assertEqual(self.snapshot(), before)

    def test_git_rename_filename_is_not_mistaken_for_status(self):
        with patch.object(p, 'run', side_effect=['a' * 40, 'R  new\0?? ' + SECRET + '\0?? real\0']):
            result = p.git_state('/fixture')
        self.assertEqual(result['tracked_changes'], 1)
        self.assertEqual(result['untracked_entries'], 1)
        self.assertNotIn(SECRET, json.dumps(result))

    def test_registry_reads_json_without_importing_old_loader(self):
        data = [{'subpath': route, 'port': port, 'private': SECRET} for route, port in p.ROUTES.items()]
        with patch.object(p, 'private_json', return_value=data):
            result = p.registry()
        self.assertTrue(result['routes_match_expected'])
        self.assertNotIn(SECRET, json.dumps(result))
        with patch.object(p, 'private_json', return_value=data + [data[0]]):
            self.assertFalse(p.registry()['routes_match_expected'])

    def test_sparse_size_includes_logical_copy_budget_without_path_disclosure(self):
        path = self.root / SECRET
        with path.open('wb') as f:
            f.truncate(16 * 1024 * 1024)
        result = p.size(str(path))
        self.assertEqual(result['apparent_bytes'], 16 * 1024 * 1024)
        self.assertNotIn(SECRET, json.dumps(result))

    def test_successful_simulated_collection_still_requires_manual_review(self):
        effective = self.private('effective', self.config([{'handler': 'authentication', 'secret': SECRET}]))
        candidate = self.private('candidate', self.config([{'handler': 'reverse_proxy', 'secret': SECRET}]))
        budget = self.private('budget', self.spec())
        def command(args):
            if args[0] == 'systemctl':
                return '\n'.join(f'{key}={value}' for key, value in {
                    'LoadState': 'loaded', 'ActiveState': 'active', 'SubState': 'running',
                    'User': 'opc', 'Group': SECRET, 'WorkingDirectory': '/' + SECRET,
                    'MainPID': '99', 'FragmentPath': SECRET, 'DropInPaths': SECRET}.items())
            if args[0] == 'git':
                return 'a' * 40 if 'rev-parse' in args else '?? ' + SECRET + '\0'
            if args[0] == 'ss': return 'tcp LISTEN 0 128 [::]:8083 [::]:*\n'
            if args[0] == 'ip': return json.dumps([{'secret': SECRET, 'addr_info': [{'family': 'inet6', 'scope': 'global', 'local': SECRET}]}])
            if args[0] == 'firewall-cmd':
                return SECRET if '--direct' in args else SECRET + '\n  target: ACCEPT\n'
            if args[0] == 'nft': return json.dumps({'nftables': [{'rule': {'private': SECRET}}, {'chain': {'policy': 'accept'}}]})
            if args[0] == 'du': return '100\t' + SECRET + '\n'
            if args[0] == 'getenforce': return 'Enforcing'
            self.fail('Unexpected command')
        actual_json = p.private_json
        def read(path, **kw):
            if str(path) == '/srv/jeu/tools-registry.json':
                return [{'subpath': route, 'port': port, 'secret': SECRET} for route, port in p.ROUTES.items()]
            return actual_json(path, **kw)
        before = self.snapshot()
        with patch.object(p, 'run', side_effect=command), patch.object(p, 'private_json', side_effect=read), \
             patch.object(p, 'metadata', return_value={'state': 'PRESENT'}), \
             patch.object(p, 'account', return_value={'state': 'PRESENT'}), \
             patch.object(p, 'volume', return_value={'free_bytes': 100 * p.GIB, 'free_inodes': 1000, 'device': 1}):
            result = p.collect(effective, candidate, budget)
        self.assertNotIn(SECRET, json.dumps(result))
        self.assertEqual(result['services']['amazonia']['status'], 'OBSERVED')
        self.assertTrue(result['registry_known_path']['summary']['routes_match_expected'])
        self.assertTrue(result['disk_budget']['summary']['fits_at_observation'])
        self.assertFalse(result['caddy_comparison']['summary']['parsed_json_equal'])
        self.assertFalse(result['ready_for_deployment'])
        self.assertTrue(result['required_private_reviews'])
        self.assertEqual(before, self.snapshot())

    def test_full_collection_unavailable_host_is_shareable_and_not_ready(self):
        # Every external read denied; one failed measure must not prevent the rest.
        with patch.object(p, 'run', side_effect=PermissionError(SECRET)) as run, \
             patch.object(p, 'metadata', side_effect=PermissionError(SECRET)), \
             patch.object(p, 'account', side_effect=PermissionError(SECRET)), \
             patch.object(p, 'volume', side_effect=PermissionError(SECRET)), \
             patch.object(p, 'private_json', side_effect=PermissionError(SECRET)):
            before = self.snapshot()
            result = p.collect()
        self.assertFalse(result['ready_for_deployment'])
        self.assertFalse(result['oracle_validation_by_codex'])
        self.assertEqual(result['caddy_comparison']['status'], 'NOT_SUPPLIED')
        self.assertEqual(result['network']['ipv6']['status'], 'UNKNOWN')
        self.assertEqual(result['paths']['/var/lib/amazonia/data']['status'], 'UNKNOWN')
        self.assertNotIn('bga', result['services'])
        self.assertNotIn(SECRET, json.dumps(result))
        self.assertEqual(self.snapshot(), before)
        commands = [c.args[0] for c in run.call_args_list]
        self.assertEqual(len([c for c in commands if c[0] == 'systemctl']), 5)
        self.assertTrue(all(c[1] == 'show' for c in commands if c[0] == 'systemctl'))
        self.assertTrue(all(c[0] in ('systemctl', 'git', 'ss', 'ip', 'firewall-cmd', 'nft', 'du', 'getenforce') for c in commands))
        self.assertNotIn('--prepare', json.dumps(commands))
        self.assertNotIn('/proc/', json.dumps(commands))

    def test_cli_refuses_root_and_collection_zero_never_means_deployment(self):
        output = io.StringIO()
        with patch.object(p.os, 'geteuid', return_value=0), contextlib.redirect_stdout(output), patch.object(p, 'collect') as collect:
            self.assertEqual(p.main([]), 1)
            collect.assert_not_called()
        self.assertEqual(json.loads(output.getvalue())['reason'], 'RUN_AS_OPERATOR_WITHOUT_SUDO')
        output = io.StringIO()
        with patch.object(p.os, 'geteuid', return_value=1000), contextlib.redirect_stdout(output), \
             patch.object(p, 'collect', return_value={'ready_for_deployment': False, 'example': {'status': 'UNKNOWN'}}):
            self.assertEqual(p.main([]), 0)
        self.assertFalse(json.loads(output.getvalue())['ready_for_deployment'])


if __name__ == '__main__':
    unittest.main()
