"""Read-only delivery scope verification; run from repository root."""
import hashlib
import json
from pathlib import Path
import subprocess

BASE = '50bf296'
EVIDENCE = Path(__file__).parent
EXACT = {'AGENTS.md', 'CLAUDE.md', 'harness-forge/implementations/README.md',
         '.claude/rules/project-work-companion-local.md',
         'docs/development/telemetry/project-work-companion-plan/run.json',
         'docs/development/telemetry/project-work-companion-plan/events.jsonl'}
PREFIXES = ('.claude/skills/project-work-companion/',
            'harness-forge/implementations/skills/project-work-companion/',
            str(EVIDENCE) + '/')


def forbidden(paths):
    return sorted(p for p in paths if p not in EXACT and not p.startswith(PREFIXES))


def main():
    changed = subprocess.check_output(['git', 'diff', '--name-only', BASE], text=True).splitlines()
    new = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], text=True).splitlines()
    paths = sorted(set(changed + new))
    baseline = json.loads((EVIDENCE / 'protected-baseline.json').read_text())
    damaged = [p for p, sha in baseline.items() if not Path(p).is_file()
               or hashlib.sha256(Path(p).read_bytes()).hexdigest() != sha]
    controls = forbidden(['projects/01-testimonials-senja/unexpected.py']) == ['projects/01-testimonials-senja/unexpected.py']
    controls = controls and forbidden(['.claude/commands/go.md']) == ['.claude/commands/go.md']
    controls = controls and not forbidden(['.claude/skills/project-work-companion/SKILL.md'])
    result = {'scope_passed': not forbidden(paths), 'forbidden_paths': forbidden(paths),
              'protected_files': len(baseline), 'protected_unchanged': not damaged,
              'damaged_paths': damaged, 'negative_controls_passed': controls, 'changed_paths': paths}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['scope_passed'] and not damaged and controls else 1


if __name__ == '__main__':
    raise SystemExit(main())
