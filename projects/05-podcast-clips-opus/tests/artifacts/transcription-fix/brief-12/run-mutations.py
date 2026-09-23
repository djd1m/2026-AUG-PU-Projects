"""Run only in the project root, without concurrent source writers/tests."""
import hashlib
import json
from pathlib import Path
import subprocess

root = Path('tests/artifacts/transcription-fix/brief-12')
source = Path('apps/worker/src/stt/merge.ts')
original = source.read_text()
cases = [
    ('text-overlap', 'if (index > 0 && previous && shifted.start < previous.end) continue;',
     "if (index > 0 && word.start <= 2 && words.slice(-30).some(prior => prior.word.trim().toLocaleLowerCase() === shifted.word.trim().toLocaleLowerCase() && Math.abs(prior.start - shifted.start) <= 1)) continue;",
     'different overlap text'),
    ('whole-overlap', 'if (index > 0 && previous && shifted.start < previous.end) continue;',
     'if (index > 0 && word.start < 2) continue;', 'preserves uncovered seam'),
    ('empty-diagnostic', 'throw new TranscriptMergeError(error.timingIssue);',
     'throw new TranscriptMergeError();', 'merge failure names'),
]
results = []
try:
    for name, old, new, test in cases:
        assert original.count(old) == 1, name
        changed = original.replace(old, new)
        assert changed != original
        command = ['npx', 'vitest', 'run', 'tests/transcription-merge.test.ts', '-t', test]
        row = {'name': name, 'command': command, 'mutation_sha256': hashlib.sha256(changed.encode()).hexdigest()}
        try:
            source.write_text(changed)
            with (root / f'{name}-red.txt').open('w') as log:
                row['red_exit'] = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT).returncode
        finally:
            source.write_text(original)
        with (root / f'{name}-green.txt').open('w') as log:
            row['green_exit'] = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT).returncode
        results.append(row)
        (root / 'mutations.json').write_text(json.dumps(results, indent=2) + '\n')
        assert row['red_exit'] == 1 and row['green_exit'] == 0, row
finally:
    source.write_text(original)
print(json.dumps(results, indent=2))
