"""Contract tests using isolated files; no product runtime or network."""
import json
from pathlib import Path
import tempfile
import unittest

import analyze


class AnalysisTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def run_file(self, data, events=None, name='one'):
        folder = self.root / name
        folder.mkdir()
        defaults = {'run_id': name, 'status': 'running', 'started_at': '2026-09-10T10:00:00Z'}
        (folder / 'run.json').write_text(json.dumps({**defaults, **data}))
        if events is not None:
            (folder / 'events.jsonl').write_text('\n'.join(json.dumps(e) for e in events))
        return folder

    def result(self):
        return analyze.analyze(self.root)['runs'][0]

    def test_null_is_not_zero_and_seconds_are_normalized(self):
        self.run_file({'metrics': {'wall_elapsed_seconds': 90, 'active_wall_ms': None}})
        r = self.result()
        self.assertEqual(r['elapsed']['seconds'], 90)
        self.assertIsNone(r['active']['seconds'])
        self.assertIsNone(r['events'])

    def test_zero_preserved_and_conflict_not_silently_selected(self):
        self.run_file({'elapsed_wall_ms': 1000, 'metrics': {'wall_elapsed_seconds': 2}, 'active_wall_ms': 0}, [])
        r = self.result()
        self.assertIsNone(r['elapsed']['seconds'])
        self.assertEqual(r['active']['seconds'], 0)
        self.assertTrue(any('conflicting metric' in x for x in r['issues']))

    def test_duplicate_json_keys_not_accepted(self):
        folder = self.run_file({})
        (folder / 'run.json').write_text('{"elapsed_wall_ms": 2, "elapsed_wall_ms": 1}')
        self.assertTrue(any('duplicate JSON key' in x for x in self.result()['issues']))

    def test_malformed_events_and_duplicate_ids_are_reported(self):
        folder = self.run_file({}, [{'event_id': 'x', 'type': 'finding'}, {'event_id': 'x', 'type': 'finding'}])
        with (folder / 'events.jsonl').open('a') as stream:
            stream.write('\n{"partial":')
        r = self.result()
        self.assertEqual(r['events']['parsed_lines'], 0)
        self.assertEqual(len(r['issues']), 2)

    def test_overlapping_waits_union_and_attempts_remain_separate(self):
        events = []
        for kind, identity, start, stop in [('wait', 'w1', 0, 20), ('wait', 'w2', 10, 30),
                                              ('attempt', 'a1', 0, 30), ('attempt', 'a2', 10, 40)]:
            for suffix, sec in [('started', start), ('finished', stop)]:
                events.append({'type': f'{kind}_{suffix}', f'{kind}_id': identity,
                               'timestamp': f'2026-09-10T10:00:{sec:02d}Z', 'stage': 'REVIEW'})
        self.run_file({}, events)
        r = self.result()['events']
        self.assertEqual(r['paired_wait_union_seconds'], 30)
        self.assertEqual([x['seconds'] for x in r['attempt_intervals_observed']], [30, 30])

    def test_open_and_ambiguous_intervals_do_not_become_work_time(self):
        event = {'type': 'attempt_started', 'attempt_id': 'a', 'timestamp': '2026-09-10T10:00:00Z'}
        self.run_file({}, [event, event])
        r = self.result()
        self.assertEqual(r['events']['attempt_intervals_observed'], [])
        self.assertTrue(any('ambiguous' in x for x in r['issues']))

    def test_conflicting_event_aliases_and_endpoints_not_used(self):
        start = {'type': 'attempt_started', 'attempt_id': 'a', 'timestamp': '2026-09-10T10:00:00Z', 'stage': 'PLAN'}
        finish = {'type': 'attempt_finished', 'attempt_id': 'a', 'timestamp': '2026-09-10T10:00:30Z', 'stage': 'PLAN'}
        variants = [({**start, 'event': 'wait_started'}, finish),
                    ({**start, 'at': '2026-09-10T10:00:20Z'}, finish),
                    (start, {**finish, 'stage': 'IMPLEMENT'}),
                    ({**start, 'run_id': 'other'}, {**finish, 'run_id': 'other'}),
                    ({**start, 'run_id': 'own'}, {**finish, 'run_id': 'other'})]
        for i, pair in enumerate(variants):
            folder = self.run_file({'run_id': 'own'}, list(pair), str(i))
            result = analyze.analyze_run(folder / 'run.json', self.root)
            self.assertEqual(result['events']['attempt_intervals_observed'], [])
            self.assertTrue(any('conflict' in x for x in result['issues']))

    def test_usage_left_unaggregated(self):
        self.run_file({'usage': {'input': 100, 'cached': 90}, 'metrics': {'usage': {'input': 100}},
                       'actual_model': 'claimed-model'}, [])
        r = self.result()
        self.assertEqual(r['usage_locations'], ['usage', 'metrics.usage'])
        self.assertNotIn('cost', r)
        self.assertEqual(r['actual_model_locations_unverified'], ['actual_model'])

    def test_timestamp_conflict_and_invalid_number(self):
        self.run_file({'started_at': '2026-09-10T10:00:00Z', 'ended_at': '2026-09-10T10:00:10Z',
                       'elapsed_wall_ms': 1000, 'active_wall_ms': True}, [])
        r = self.result()
        self.assertEqual(r['elapsed_from_timestamps_seconds'], 10)
        self.assertIsNone(r['active']['seconds'])
        self.assertTrue(any('timestamp duration conflicts' in x for x in r['issues']))
        self.assertTrue(any('invalid metric' in x for x in r['issues']))

    def test_empty_passport_and_journal_not_clean(self):
        folder = self.run_file({}, [])
        (folder / 'run.json').write_text('{}')
        r = self.result()
        self.assertTrue(any('passport field: run_id' in x for x in r['issues']))
        self.assertTrue(any('chronology unknown' in x for x in r['issues']))

    def test_symlink_sources_rejected(self):
        source = self.root / 'private.json'
        source.write_text('{"run_id":"private"}')
        folder = self.root / 'one'
        folder.mkdir()
        (folder / 'run.json').symlink_to(source)
        self.assertTrue(any('symlink' in x for x in self.result()['issues']))

    def test_duplicate_run_and_missing_selection_reported(self):
        self.run_file({'run_id': 'same'}, [], 'one')
        self.run_file({'run_id': 'same'}, [], 'two')
        self.assertTrue(analyze.analyze(self.root)['issues'])
        r = analyze.analyze(self.root, ['absent'])
        self.assertEqual(r['run_count'], 0)
        self.assertTrue(any('not found' in x for x in r['issues']))


if __name__ == '__main__':
    unittest.main()
