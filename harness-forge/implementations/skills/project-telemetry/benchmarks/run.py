#!/usr/bin/env python3
"""Frozen-case benchmark, importing a chosen analyzer; stdout JSON, no source writes."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import statistics
import tempfile
import time


def lookup(value, path):
    try:
        for part in path.split('.'):
            value = value[int(part)] if isinstance(value, list) else value[part]
        return value
    except (KeyError, IndexError, TypeError, ValueError):
        return {'benchmark_missing_field': path}


def check_result(actual, check):
    if 'equals' in check:
        if isinstance(actual, bool) != isinstance(check['equals'], bool):
            return False
        return actual == check['equals']
    if 'contains' in check:
        if isinstance(actual, (list, dict, str)):
            return any(check['contains'] in str(item) for item in actual) if isinstance(actual, list) else check['contains'] in actual
        return False
    raise ValueError('Unknown assertion operator')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--analyzer', required=True)
    parser.add_argument('--suite', action='append', required=True)
    parser.add_argument('--repeat', type=int, default=5)
    args = parser.parse_args()
    if not 1 <= args.repeat <= 50:
        parser.error('repeat must be 1..50')
    script = Path(args.analyzer).resolve()
    spec = importlib.util.spec_from_file_location('candidate_analyzer', script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    suites, results = [], []
    for filename in args.suite:
        path = Path(filename)
        cases = json.loads(path.read_text())
        suites.append({'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'case_count': len(cases)})
        for case in cases:
            if not case.get('checks'):
                raise ValueError('Case without assertions: ' + case['id'])
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                (root / 'run.json').write_text(json.dumps(case['run']))
                if case.get('events') is not None:
                    (root / 'events.jsonl').write_text('\n'.join(json.dumps(x) for x in case['events']))
                timings, output = [], None
                error = None
                before = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in root.iterdir()}
                for _ in range(args.repeat):
                    start = time.perf_counter_ns()
                    try:
                        output = module.analyze(root)
                    except Exception as exc:
                        error = type(exc).__name__ + ': ' + str(exc)
                        break
                    timings.append((time.perf_counter_ns() - start) / 1_000_000)
                unchanged = before == {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in root.iterdir()}
                checks = []
                for check in case['checks']:
                    actual = lookup(output, check['path'])
                    checks.append({**check, 'actual': actual, 'passed': error is None and check_result(actual, check)})
                results.append({'id': case['id'], 'passed': unchanged and all(x['passed'] for x in checks),
                                'checks': checks, 'exception': error, 'sources_unchanged': unchanged,
                                'median_extract_ms': statistics.median(timings) if timings else None})
    report = {'benchmark_version': 'project-telemetry-benchmark-v1',
              'runner_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'analyzer_sha256': hashlib.sha256(script.read_bytes()).hexdigest(), 'suites': suites,
              'repeat': args.repeat, 'cases_passed': sum(x['passed'] for x in results),
              'cases_total': len(results), 'checks_passed': sum(c['passed'] for x in results for c in x['checks']),
              'checks_total': sum(len(x['checks']) for x in results), 'results': results,
              'limits': 'Local extraction microbenchmark, not end-to-end agent latency, tokens, forecast calibration or a representative accuracy estimate'}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if all(x['passed'] for x in results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
