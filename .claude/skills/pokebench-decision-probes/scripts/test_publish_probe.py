import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('publish_probe.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class PublishTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / 'runs'
        self.source = self.root / 'receipts' / 'study'
        self.lane = self.source / 'gpu0'
        self.lane.mkdir(parents=True)
        self.manifest = {'id': 'study', 'gpuExecutors': ['gpu0'], 'cases': [
            {'id': 'c1', 'run': '2026-10-20T00-00-00_model_abcd', 'turn': 2, 'split': 'new_evaluation'}]}
        (self.source / 'manifest.json').write_text(json.dumps(self.manifest))
        self.status = {'state': 'running', 'started': '2026-10-20T01:00:00Z', 'completed': 1, 'planned': 4}
        (self.lane / 'status.json').write_text(json.dumps(self.status))
        (self.lane / 'samples.jsonl').write_text(json.dumps({'at': '2026-10-20T02:00:00Z'}) + '\n')
        (self.lane / 'provenance.json').write_text('{"model":{"id":"real-model"}}')

    def tearDown(self):
        self.tmp.cleanup()

    def publish(self):
        return publisher.publish(self.root, self.source, 'study', 'Live study')

    def test_live_projection_preserves_originals_and_actual_sampling_time(self):
        original = {p: p.read_bytes() for p in self.source.rglob('*') if p.is_file()}
        view = self.root / 'probe-ledgers' / 'study'
        (view / 'gpu0').mkdir(parents=True)
        (view / 'gpu0' / 'status.json').symlink_to(self.lane / 'status.json')
        self.publish()
        for p, content in original.items():
            self.assertEqual(p.read_bytes(), content)
        self.assertFalse((view / 'gpu0' / 'status.json').is_symlink())
        shown = json.loads((view / 'gpu0' / 'status.json').read_text())
        self.assertEqual(shown['queuedAt'], self.status['started'])
        self.assertEqual(shown['started'], '2026-10-20T02:00:00Z')
        cases = json.loads((view / 'manifest.json').read_text())['cases']
        self.assertEqual(cases[0]['split'], 'heldout')
        self.assertEqual(cases[0]['sourceSplit'], 'new_evaluation')
        with (self.lane / 'samples.jsonl').open('a') as stream:
            stream.write('{"at":"later"}\n')
        self.assertEqual(len((view / 'gpu0' / 'samples.jsonl').read_text().splitlines()), 2)
        self.status.update(completed=2)
        (self.lane / 'status.json').write_text(json.dumps(self.status))
        self.publish()
        self.assertEqual(json.loads((view / 'gpu0' / 'status.json').read_text())['completed'], 2)

    def test_waiting_and_incomplete_are_not_false_success(self):
        (self.lane / 'samples.jsonl').unlink()
        self.status.update(state='waiting_for_compute', completed=0)
        (self.lane / 'status.json').write_text(json.dumps(self.status))
        self.assertEqual(self.publish()[0]['state'], 'unknown')
        self.status.update(state='incomplete')
        (self.lane / 'status.json').write_text(json.dumps(self.status))
        self.assertEqual(self.publish()[0]['state'], 'stopped')

    def test_path_escape_and_unknown_split_are_rejected(self):
        outside = Path(self.tmp.name) / 'outside'
        outside.mkdir()
        with self.assertRaises(ValueError):
            publisher.publish(self.root, outside, 'study', 'title')
        with self.assertRaises(ValueError):
            publisher.publish(self.root, self.source, '../escape', 'title')
        self.manifest['cases'][0]['split'] = 'guess'
        (self.source / 'manifest.json').write_text(json.dumps(self.manifest))
        with self.assertRaises(ValueError):
            self.publish()

    def test_existing_sample_copy_is_not_overwritten(self):
        view = self.root / 'probe-ledgers' / 'study' / 'gpu0'
        view.mkdir(parents=True)
        (view / 'samples.jsonl').write_text('old evidence')
        with self.assertRaises(ValueError):
            self.publish()
        self.assertEqual((view / 'samples.jsonl').read_text(), 'old evidence')


if __name__ == '__main__':
    unittest.main()
