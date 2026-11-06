"""Local runner lifecycle tests. Mock subprocesses; never start PostgreSQL."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from typing import Any
from types import SimpleNamespace
from unittest.mock import Mock, patch


class RunnerCleanupTests(unittest.TestCase):
    def load_runner(self) -> Any:
        path = Path(__file__).with_name('runner.py')
        spec = importlib.util.spec_from_file_location('area12_cleanup_fixture', path)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        previous = sys.dont_write_bytecode
        try:
            sys.dont_write_bytecode = True
            spec.loader.exec_module(module)
        finally:
            sys.dont_write_bytecode = previous
        return module

    def exercise_start_failure(self, failure, *, shutdown_confirmed=True, broken_session=False):
        module = self.load_runner()
        calls = []
        if broken_session:
            process = Mock()
            process.poll.return_value = None
            process.kill.side_effect = ProcessLookupError('synthetic process-exit race')
            module.SESSIONS.append(SimpleNamespace(p=process))
        with tempfile.TemporaryDirectory(prefix='area12-cleanup-unit-', dir=module.SCRATCH) as root:
            module.HERE = Path(root)
            module.SCRATCH = Path(root) / 'scratch'
            module.SCRATCH.mkdir()

            def command(args, **kwargs):
                action = str(args[-1])
                calls.append(action)
                if action == 'start':
                    if isinstance(failure, Exception):
                        raise failure
                    return subprocess.CompletedProcess(args, failure, '', '')
                if action == 'stop' and not shutdown_confirmed:
                    return subprocess.CompletedProcess(args, 1, '', '')
                if action == 'status':
                    return subprocess.CompletedProcess(args, 3 if shutdown_confirmed else 0, '', '')
                return subprocess.CompletedProcess(args, 0, '', '')

            with patch.object(module, 'provenance'), patch.object(module, 'command', side_effect=command), \
                 patch.object(sys, 'argv', ['runner.py']), contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises((RuntimeError, subprocess.TimeoutExpired, ProcessLookupError)):
                    module.main()
            report = json.loads((module.HERE / 'results.json').read_text())
            self.assertIn('stop', calls, 'failed startup must still attempt owned-cluster shutdown')
            self.assertIn('status', calls, 'shutdown must be independently checked')
            self.assertEqual(report['serverStopped'], shutdown_confirmed)
            if not shutdown_confirmed:
                retained = Path(report.get('retainedScratchDirectory', ''))
                self.assertTrue(retained.is_dir() and retained.parent == module.SCRATCH,
                                'never remove owned cluster data while shutdown is unconfirmed')
            else:
                self.assertEqual(list(module.SCRATCH.iterdir()), [])
            self.assertFalse(report['complete'], 'startup failure must not count as a completed experiment')

    def test_unconfirmed_shutdown_retains_owned_data(self):
        self.exercise_start_failure(1, shutdown_confirmed=False)

    def test_nonzero_startup_still_shuts_down(self):
        self.exercise_start_failure(1)

    def test_startup_timeout_still_shuts_down(self):
        self.exercise_start_failure(subprocess.TimeoutExpired('fixture pg_ctl start', 40))

    def test_session_cleanup_race_cannot_skip_cluster_shutdown(self):
        self.exercise_start_failure(1, broken_session=True)


    def test_keyboard_interrupt_reports_incomplete_and_still_stops(self):
        module = self.load_runner()
        calls = []
        with tempfile.TemporaryDirectory(prefix='area12-interrupt-unit-', dir=module.SCRATCH) as root:
            module.HERE = Path(root)
            module.SCRATCH = Path(root) / 'scratch'
            module.SCRATCH.mkdir()

            def command(args, **kwargs):
                action = str(args[-1])
                calls.append(action)
                return subprocess.CompletedProcess(args, 3 if action == 'status' else 0, '', '')

            with patch.object(module, 'provenance'), patch.object(module, 'command', side_effect=command), \
                 patch.object(module, 'ok', return_value='t'), \
                 patch.object(module, 'experiment', side_effect=KeyboardInterrupt()), \
                 patch.object(sys, 'argv', ['runner.py']), contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(KeyboardInterrupt):
                    module.main()
            report = json.loads((module.HERE / 'results.json').read_text())
            self.assertIn('stop', calls)
            self.assertIn('status', calls)
            self.assertTrue(report['serverStopped'])
            self.assertFalse(report['complete'], 'interrupted experiment must never count as complete')
            self.assertIn('KeyboardInterrupt', report.get('error', ''))


if __name__ == '__main__':
    unittest.main()
