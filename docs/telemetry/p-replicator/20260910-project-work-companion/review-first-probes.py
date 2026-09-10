"""Independent probes; writes only temporary fixture files under /tmp."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'project-work-companion/tests'))
from test_validate_record import Fixture, digest

results = []

def probe(name, modify, expected, delivered=True):
    f = Fixture()
    try:
        # Freeze independent CLI expectations BEFORE changing the work record.
        command = f.command(expectations=delivered)
        modify(f)
        f.save()
        before = {str(p.relative_to(f.root)): digest(p) for p in f.root.rglob('*') if p.is_file()}
        r = subprocess.run(command, cwd='/tmp', text=True, capture_output=True)
        after = {str(p.relative_to(f.root)): digest(p) for p in f.root.rglob('*') if p.is_file()}
        result = {'name': name, 'expected_exit': expected, 'actual_exit': r.returncode,
                  'matches_expected': r.returncode == expected, 'files_unchanged': before == after,
                  'stdout': r.stdout.strip(), 'stderr': r.stderr.strip()}
        results.append(result)
        print(json.dumps(result, ensure_ascii=False))
    finally:
        f.cleanup()

def stale_preflight(f):
    # Leave launch, receipt, checks, delivery and CLI on source-r1/build-r1.
    f.record['source'].update(current_revision='source-old', build_revision='build-old')
    f.record['source']['continuity'].update(expected_revision='source-old', observed_revision='source-old')
    f.record['preflight'].update(source_revision='source-old', build_revision='build-old')
    f.record['delivery']['e2e_claim'] = 'pass'

def waiting_plan(f, paused):
    f.pause()
    f.record['pause'].update(from_stage='plan', approval_ids=[],
                             blockers=['waiting for owner approval'], next_allowed_step='obtain plan approval')
    f.record['approval']['evidence'] = None
    f.record['preflight'] = None
    f.record['routes'] = f.record['routes'][:1]
    if not paused:
        f.record['stage'] = 'plan'
        f.record['pause'] = None

def evidence(f, kind):
    p = f.root / 'evidence/receipt.md'
    if kind == 'missing':
        p.unlink()
    elif kind == 'empty':
        p.write_text('')
        f.record['receipts'][0]['sha256'] = digest(p)
    elif kind == 'failed':
        p.write_text(p.read_text().replace('Verdict: pass', 'Verdict: fail'))
        f.record['receipts'][0]['sha256'] = digest(p)
    elif kind == 'duplicate':
        f.record['receipts'].append(dict(f.record['receipts'][0]))
    elif kind == 'dead_pid_no_receipt':
        f.record['pid'] = 999999999
        p.unlink()

probe('baseline', lambda f: None, 0)
probe('stale_source_build_preflight_with_current_delivery', stale_preflight, 1)
probe('plan_waiting_for_required_approval', lambda f: waiting_plan(f, False), 0, False)
probe('paused_plan_waiting_for_required_approval', lambda f: waiting_plan(f, True), 0, False)
for kind, code in [('missing', 2), ('empty', 1), ('failed', 1), ('duplicate', 1), ('dead_pid_no_receipt', 2)]:
    probe('receipt_' + kind, lambda f, kind=kind: evidence(f, kind), code)
probe('missing_implementation_route', lambda f: f.record['routes'].pop(), 1)

def inert_command(f):
    f.record['preflight']['test_command'] = 'touch ' + str(f.root / 'UNAUTHORIZED_ACTION')
    f.record['checks'][0]['command'] = f.record['preflight']['test_command']

probe('stored_commands_remain_inert', inert_command, 0)
(HERE / 'probe-results.json').write_text(json.dumps(results, indent=2, ensure_ascii=False) + '\n')
