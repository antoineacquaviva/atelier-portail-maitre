"""npm 11 runs only local, dependency-free fixtures; no install or Oracle access."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
import oracle_prepare as p


class NpmEnvironment(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='oracle-npm-fixture-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.prep = p.Preparation({'workspace': str(self.root)})

    def test_private_empty_configs_are_distinct_and_reusable(self):
        with patch.dict(os.environ, {'PATH': '/hostile', 'NODE_OPTIONS': '--hostile',
                                    'NPM_CONFIG_USERCONFIG': '/personal',
                                    'npm_config_globalconfig': '/global'}):
            env = self.prep.npm_env()
        self.assertEqual(env['PATH'], str(self.root / 'runtime/node/bin') + ':' + p.SYSTEM_PATH)
        self.assertNotIn('NODE_OPTIONS', env)
        self.assertNotIn('NPM_CONFIG_USERCONFIG', env)
        user, glob = [Path(env['npm_config_' + k + 'config']) for k in ('user', 'global')]
        self.assertFalse(os.path.samefile(user, glob))
        for path in (user, glob):
            self.assertEqual(path.read_bytes(), b'')
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        before = {path: path.stat().st_mtime_ns for path in (user, glob)}
        self.assertEqual(self.prep.npm_env(), env)
        self.assertEqual(before, {path: path.stat().st_mtime_ns for path in (user, glob)})

    def test_altered_configs_are_refused_without_repair(self):
        for kind in ('user', 'global'):
            for alteration in ('content', 'mode', 'symlink', 'hardlink'):
                with self.subTest(kind=kind, alteration=alteration):
                    env = self.prep.npm_env()
                    path = Path(env['npm_config_' + kind + 'config'])
                    if alteration == 'content':
                        path.write_text('registry=https://fixture.invalid/\n')
                    elif alteration == 'mode':
                        path.chmod(0o644)
                    elif alteration == 'symlink':
                        path.unlink()
                        path.symlink_to('/dev/null')
                    else:
                        os.link(path, self.root / 'hardlink')
                    before = path.lstat()
                    with self.assertRaises(p.Stop):
                        self.prep.npm_env()
                    # Reading a rejected nonempty config may update atime under
                    # relatime. Check actual mutations, not the read timestamp.
                    after = path.lstat()
                    for field in ('st_mode', 'st_ino', 'st_dev', 'st_nlink', 'st_uid',
                                  'st_gid', 'st_size', 'st_mtime_ns', 'st_ctime_ns'):
                        self.assertEqual(getattr(before, field), getattr(after, field), field)
                    path.unlink()
                    if alteration == 'hardlink':
                        (self.root / 'hardlink').unlink()

    def test_all_release_npm_launches_share_isolation(self):
        for name, commit, base in (('amazonia.next', p.AMAZONIA, '/amazonia/'),
                                   ('portail.next', p.PORTAL, '/')):
            with self.subTest(name=name):
                dest = self.root / name
                (dest / '.git').mkdir(parents=True)
                (dest / 'dist').mkdir()
                (dest / 'dist/index.html').write_text('fixture')
                (dest / 'package-lock.json').write_text('{}')
                p.write_new(self.root / (name + '.owned'), commit)
                p.write_new(self.root / (name + '.clone-complete'), commit)
                def command(args, **kwargs):
                    return commit if args[0] == 'git' else '{}'
                with patch.object(p, 'command', side_effect=command) as launch:
                    self.prep.clone_build(name, commit)
                calls = [call for call in launch.call_args_list if call.args[0][0] != 'git']
                self.assertEqual([call.args[0][2:] for call in calls], [
                    ['install', '--include=dev'], ['run', 'lint'], ['run', 'test'],
                    ['run', 'build', '--', '--base=' + base], ['ls', '--all', '--json']])
                for call in calls:
                    self.assertEqual(call.kwargs['cwd'], dest)
                    self.assertEqual(call.kwargs['env'], self.prep.npm_env())
                    self.assertEqual(call.args[0][:2], [self.root / 'runtime/node/bin/node',
                        self.root / 'runtime/node/lib/node_modules/npm/bin/npm-cli.js'])

    @unittest.skipUnless(shutil.which('node') and shutil.which('npm'), 'Node/npm unavailable')
    def test_real_npm11_config_run_and_ls_without_install(self):
        node = Path(shutil.which('node')).resolve()
        npm = Path(os.environ.get('NPM11_CLI', shutil.which('npm'))).resolve()
        # Use the same absolute Node + npm CLI invocation as clone_build.
        home = self.root / 'personal-home'
        home.mkdir()
        (home / '.npmrc').write_text('registry=https://personal.fixture.invalid/\n')
        global_config = self.root / 'personal-global.npmrc'
        global_config.write_text('registry=https://global.fixture.invalid/\n')
        with patch.dict(os.environ, {'HOME': str(home), 'PATH': '/hostile',
                                    'npm_config_userconfig': str(home / '.npmrc'),
                                    'NPM_CONFIG_GLOBALCONFIG': str(global_config),
                                    'npm_config_registry': 'https://env.fixture.invalid/'}):
            env = self.prep.npm_env()
        env.update(npm_config_offline='true', npm_config_update_notifier='false')
        # A private fixture runtime bin provides node for npm run's child scripts.
        binary = self.root / 'runtime/node/bin'
        binary.mkdir(parents=True)
        (binary / 'node').symlink_to(node)
        def run(args, environment=env):
            return subprocess.run([str(node), str(npm), *args], cwd=self.root,
                                  env=environment, capture_output=True, text=True, timeout=30)
        version = run(['--version'])
        self.assertEqual(version.returncode, 0, version.stderr)
        if not version.stdout.strip().startswith('11.'):
            if 'NPM11_CLI' in os.environ:
                self.fail('NPM11_CLI must select npm 11')
            self.skipTest('npm 11 required; select its CLI with NPM11_CLI')
        broken = dict(env, npm_config_userconfig='/dev/null', npm_config_globalconfig='/dev/null')
        failure = run(['config', 'list', '--json'], broken)
        self.assertNotEqual(failure.returncode, 0)
        self.assertIn('double-loading config', failure.stderr)
        result = run(['config', 'list', '--json'])
        self.assertEqual(result.returncode, 0, result.stderr)
        config = json.loads(result.stdout)
        self.assertEqual(config['registry'], 'https://registry.npmjs.org/')
        self.assertEqual(config['userconfig'], env['npm_config_userconfig'])
        self.assertEqual(config['globalconfig'], env['npm_config_globalconfig'])
        self.assertFalse(config['audit'])
        self.assertFalse(config['fund'])
        (self.root / 'task.cjs').write_text('process.exit(0);\n')
        (self.root / 'package.json').write_text(json.dumps({
            'name': 'offline-npm-fixture', 'version': '1.0.0', 'private': True,
            'scripts': {task: 'node task.cjs' for task in ('lint', 'test', 'build')}}))
        for args in (['run', 'lint'], ['run', 'test'], ['run', 'build', '--', '--base=/amazonia/'],
                     ['run', 'build', '--', '--base=/'], ['ls', '--all', '--json']):
            result = run(args)
            self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.root / 'node_modules').exists())
        self.assertFalse((self.root / 'package-lock.json').exists())


if __name__ == '__main__':
    unittest.main()
