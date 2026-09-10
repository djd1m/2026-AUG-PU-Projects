#!/usr/bin/env python3
"""Read-only inventory. Claims stay claims; no inferred billing or acceptance."""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys

MAX_BYTES = 16 * 1024 * 1024
STATUS_VALUES = {'running', 'accepted', 'complete', 'completed', 'failed', 'blocked',
                 'interrupted', 'unknown', 'plan_ready_awaiting_approval',
                 'completed_with_caveats', 'completed_with_scope_limits',
                 'awaiting_external_acceptance'}
INTERVAL_TYPES = {'attempt_started', 'attempt_finished', 'wait_started', 'wait_finished'}
KNOWN_TYPES = INTERVAL_TYPES | {'model_changed', 'gate_result', 'usage_sample',
                              'finding', 'correction', 'run_finished'}


def strict_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f'duplicate JSON key: {key}')
        result[key] = value
    return result


def decode(raw):
    value = json.loads(raw, object_pairs_hook=strict_object,
                       parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite JSON')))
    if not isinstance(value, dict):
        raise ValueError('expected JSON object')
    return value


def read_source(path, root):
    if path.is_symlink() or not path.resolve().is_relative_to(root):
        raise ValueError('symlink or path outside scope')
    with path.open('rb') as stream:
        raw = stream.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError('source exceeds 16 MiB limit')
    return raw, hashlib.sha256(raw).hexdigest()


def field(data, key):
    for part in key.split('.'):
        if not isinstance(data, dict) or part not in data:
            return None
        data = data[part]
    return data


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= value < float('inf')


def timestamp(value):
    try:
        date = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return date.timestamp() if date.tzinfo is not None else None
    except (AttributeError, TypeError, ValueError, OverflowError):
        return None


def metric(data, aliases, issues):
    values = []
    invalid = False
    for key, scale in aliases:
        value = field(data, key)
        if value is None:
            continue
        if not number(value):
            issues.append(f'invalid metric: {key}')
            invalid = True
        else:
            try:
                seconds = value * scale
                if not number(seconds):
                    raise ValueError('nonfinite duration')
                values.append({'field': key, 'seconds': seconds})
            except (OverflowError, ValueError):
                issues.append(f'invalid scaled metric: {key}')
                invalid = True
    if values and any(not math.isclose(v['seconds'], values[0]['seconds'], rel_tol=0, abs_tol=1e-9)
                      for v in values[1:]):
        issues.append('conflicting metric aliases: ' + ', '.join(v['field'] for v in values))
        invalid = True
    return {'seconds': values[0]['seconds'] if values and not invalid else None,
            'sources': values}


def union_seconds(intervals):
    total, end = 0, None
    for start, stop in sorted(intervals):
        total += max(0, stop - max(start, end if end is not None else start))
        end = max(stop, end if end is not None else stop)
    return total


def status_claim(data, issues):
    sources = []
    for key in ('status', 'stage'):
        value = data.get(key)
        if value is None:
            continue
        if not isinstance(value, str) or not value.strip():
            if key == 'status':
                issues.append('invalid passport field: status')
            continue
        if key == 'status' or value in STATUS_VALUES:
            sources.append({'field': key, 'value': value})
    if len({s['value'] for s in sources}) > 1:
        issues.append('conflicting status aliases')
        return None, sources
    if not sources:
        issues.append('missing or invalid passport field: status')
    return sources[0]['value'] if sources else None, sources


def model_claims(data, issues):
    claims, invalid = [], False
    for key in ('actual_model', 'actual_models'):
        value = data.get(key)
        if value is None:
            continue
        values = [value] if isinstance(value, str) else value
        if not isinstance(values, list) or not values or not all(isinstance(v, str) and v.strip() for v in values):
            issues.append('invalid model claim: ' + key)
            invalid = True
            continue
        claims.append({'field': key, 'values': values, 'verification': 'unverified_claim'})
    if len({tuple(sorted(set(c['values']))) for c in claims}) > 1:
        issues.append('conflicting model aliases')
        invalid = True
    return claims, (not invalid if claims or invalid else None)


def events_summary(path, root, issues, expected_run=None):
    if not path.exists():
        issues.append('events.jsonl missing; chronology unknown')
        return None
    raw, digest = read_source(path, root)
    if not raw.strip():
        issues.append('events.jsonl empty; chronology unknown')
    events, seen, duplicates = [], set(), set()
    lines = raw.decode('utf-8').splitlines()
    for line, text in enumerate(lines, 1):
        try:
            event = decode(text)
            eid = event.get('event_id')
            if eid is not None:
                if not isinstance(eid, str):
                    raise ValueError('invalid event_id')
                if eid in seen:
                    duplicates.add(eid)
                    raise ValueError('duplicate event_id; all occurrences excluded')
                seen.add(eid)
            events.append((line, event))
        except (ValueError, TypeError) as exc:
            issues.append(f'events.jsonl:{line}: {exc}')
    events = [(line, event) for line, event in events if event.get('event_id') not in duplicates]
    pairs = defaultdict(lambda: {'start': [], 'finish': []})
    types, unsupported = Counter(), Counter()
    interval_event_count = 0
    for line, event in events:
        conflicts = []
        if event.get('type') is not None and event.get('event') is not None and event['type'] != event['event']:
            conflicts.append('type/event')
        if event.get('timestamp') is not None and event.get('at') is not None:
            first, second = timestamp(event['timestamp']), timestamp(event['at'])
            if first is None or second is None or first != second:
                conflicts.append('timestamp/at')
        if expected_run is not None and event.get('run_id') is not None and event['run_id'] != expected_run:
            conflicts.append('run_id differs from passport')
        if conflicts:
            issues.append(f'events.jsonl:{line}: conflicting ' + ', '.join(conflicts))
            continue
        kind = event.get('type', event.get('event'))
        if not isinstance(kind, str):
            issues.append(f'events.jsonl:{line}: missing event type')
            continue
        types[kind] += 1
        if kind not in KNOWN_TYPES:
            unsupported[kind] += 1
        if kind not in INTERVAL_TYPES:
            continue
        interval_event_count += 1
        category = kind.split('_')[0]
        identity = event.get(category + '_id')
        time = timestamp(event.get('timestamp', event.get('at')))
        if not isinstance(identity, str) or time is None:
            issues.append(f'events.jsonl:{line}: missing ID or timezone timestamp')
            continue
        pairs[(category, identity)]['start' if kind.endswith('started') else 'finish'].append((time, line, event))
    durations, waits = [], []
    for (category, identity), pair in pairs.items():
        if len(pair['start']) != 1 or len(pair['finish']) != 1:
            issues.append(f'{category} {identity}: incomplete or ambiguous interval')
            continue
        start, stop = pair['start'][0], pair['finish'][0]
        if any(start[2].get(key) is not None and stop[2].get(key) is not None
               and start[2][key] != stop[2][key] for key in ('stage', 'run_id')):
            issues.append(f'{category} {identity}: conflicting endpoint stage/run_id')
            continue
        if stop[0] < start[0]:
            issues.append(f'{category} {identity}: negative interval')
            continue
        if category == 'wait':
            waits.append((start[0], stop[0]))
        else:
            durations.append({'attempt_id': identity, 'stage_claimed': start[2].get('stage'),
                              'seconds': stop[0] - start[0], 'lines': [start[1], stop[1]],
                              'status_claimed': stop[2].get('status')})
    if unsupported:
        issues.append('unsupported event types; inventory only: ' + ', '.join(sorted(unsupported)))
    return {'sha256': digest, 'parsed_lines': len(events), 'event_counts_observed': dict(types),
            'coverage': {'line_count': len(lines), 'retained_events': len(events),
                         'counted_events': sum(types.values()), 'interval_event_count': interval_event_count,
                         'paired_interval_count': len(durations) + len(waits),
                         'unsupported_event_types': dict(unsupported),
                         'completeness': 'not_established'},
            'attempt_intervals_observed': durations,
            'paired_wait_union_seconds': union_seconds(waits) if waits else None,
            'interpretation': 'Observed intervals only; no completeness, causality or critical-path claim'}


def analyze_run(path, root):
    issues = []
    record = {'path': str(path.relative_to(root)), 'issues': issues}
    try:
        raw, record['sha256'] = read_source(path, root)
        data = decode(raw)
        for required in ('run_id', 'started_at'):
            if not isinstance(data.get(required), str) or not data[required].strip():
                issues.append(f'missing or invalid passport field: {required}')
        status, status_sources = status_claim(data, issues)
        record.update(run_id=data.get('run_id'), status_claimed=status, status_sources=status_sources,
                      profile_claimed=data.get('profile'), started_at=data.get('started_at'))
        record['elapsed'] = metric(data, [('elapsed_wall_ms', .001), ('metrics.elapsed_wall_ms', .001),
                                          ('metrics.wall_elapsed_seconds', 1), ('metrics.wall_clock_seconds', 1),
                                          ('metrics.elapsed_seconds', 1)], issues)
        record['active'] = metric(data, [('active_wall_ms', .001), ('metrics.active_wall_ms', .001),
                                         ('metrics.active_elapsed_seconds', 1)], issues)
        start = timestamp(data.get('started_at'))
        ends = [(key, timestamp(data[key])) for key in ('ended_at', 'finished_at', 'completed_at') if data.get(key) is not None]
        record['end_sources'] = [{'field': key, 'value': data[key]} for key, _ in ends]
        if data.get('started_at') is not None and start is None:
            issues.append('invalid started_at timestamp')
        if any(end is None for _, end in ends) or len({end for _, end in ends}) > 1:
            issues.append('invalid or conflicting end timestamps')
        elif start is not None and ends:
            elapsed = ends[0][1] - start
            if elapsed < 0:
                issues.append('negative timestamp duration')
            else:
                record['elapsed_from_timestamps_seconds'] = elapsed
                claimed = record['elapsed']['seconds']
                if claimed is not None and abs(claimed - elapsed) > 1:
                    issues.append('timestamp duration conflicts with elapsed metric (>1s)')
        # Locators only: arbitrary raw usage may include private host exports.
        record['usage_locations'] = [key for key in ('usage', 'metrics.usage', 'metrics.tokens',
                                                     'metrics.measured_usage_snapshot', 'metrics.worker_usage')
                                     if field(data, key) is not None]
        record['model_claims'], record['model_claims_consistent'] = model_claims(data, issues)
        record['actual_model_locations_unverified'] = [key for key in ('actual_model', 'actual_models', 'agents')
                                                        if field(data, key) is not None]
        record['events'] = events_summary(path.with_name('events.jsonl'), root, issues, data.get('run_id'))
    except (OSError, ValueError, UnicodeError, TypeError) as exc:
        issues.append(f'unreadable source: {exc}')
    return record


def analyze(root, selected=()):
    root = Path(root).absolute()
    if root.is_symlink() or not root.is_dir():
        raise ValueError('root must be an existing non-symlink telemetry directory')
    root = root.resolve()
    records = [analyze_run(path, root) for path in sorted(root.rglob('run.json'))]
    if selected:
        records = [r for r in records if r.get('run_id') in selected or Path(r['path']).parent.name in selected]
    issues = []
    ids = [r['run_id'] for r in records if isinstance(r.get('run_id'), str)]
    for identity, count in Counter(ids).items():
        if count > 1:
            issues.append(f'duplicate run_id: {identity}; do not aggregate')
    for selection in selected:
        if not any(r.get('run_id') == selection or Path(r['path']).parent.name == selection for r in records):
            issues.append(f'requested run not found: {selection}')
    if not records:
        issues.append('no run.json records found in scope')
    return {'schema_version': 'project-telemetry-analysis-v2',
            'read_at': datetime.now(timezone.utc).isoformat(), 'root': str(root),
            'run_count': len(records), 'issues': issues, 'runs': records,
            'limits': ['No automatic usage aggregation, cost, forecast or verified acceptance',
                       'Source hashes identify bytes; repository revision must be recorded by caller',
                       'Snapshots are per-file, not an atomic snapshot of an active run']}


def markdown(report):
    def cell(value):
        return str(value if value is not None else 'unknown').replace('|', '\\|').replace('\n', ' ')
    lines = ['# Инвентаризация телеметрии', '', f"Прогонов: {report['run_count']}", '',
             '| Паспорт | Заявленный статус | Wall, s | Active, s | Проблем чтения |',
             '|---|---|---:|---:|---:|']
    for record in report['runs']:
        values = [record['path'], record.get('status_claimed'), record.get('elapsed', {}).get('seconds'),
                  record.get('active', {}).get('seconds'), len(record['issues'])]
        lines.append('| ' + ' | '.join(cell(value) for value in values) + ' |')
    lines.extend(['', '## Ограничения и проблемы', ''])
    lines.extend('- ' + cell(issue) for issue in report['limits'] + report['issues'])
    for record in report['runs']:
        lines.extend('- ' + cell(record['path'] + ': ' + issue) for issue in record['issues'])
    return '\n'.join(lines) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True)
    parser.add_argument('--run', action='append', default=[])
    parser.add_argument('--format', choices=('json', 'markdown'), default='json')
    args = parser.parse_args()
    try:
        report = analyze(args.root, args.run)
    except (OSError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2) if args.format == 'json' else markdown(report))
    return 2 if report['issues'] or any(r['issues'] for r in report['runs']) else 0


if __name__ == '__main__':
    sys.exit(main())
