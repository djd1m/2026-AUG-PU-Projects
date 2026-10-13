"""A narrow static guard for truthful mock labels and explicit public consent."""
from pathlib import Path
from html.parser import HTMLParser
import sys
import subprocess
import tempfile

class Guard(HTMLParser):
    def __init__(self):
        super().__init__(); self.consent = []; self.scripts = []; self.mock = False
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'input' and a.get('id') == 'publicConsent':
            self.consent.append(a)
        if tag == 'script' and 'src' in a:
            self.scripts.append(a['src'])
    def handle_data(self, data):
        if 'ИЛЛЮСТРАЦИИ / MOCK' in data:
            self.mock = True

def guard(source):
    p = Guard(); p.feed(source)
    errors = []
    if len(p.consent) != 1 or p.consent[0].get('type') != 'checkbox' or 'checked' in p.consent[0]:
        errors.append('public consent must be exactly one unchecked checkbox')
    if not p.mock:
        errors.append('visible illustrative/mock disclosure missing')
    if p.scripts or 'fetch(' in source or 'innerHTML' in source:
        errors.append('remote script/upload or unsafe DOM sink detected')
    return errors

def main():
    root = Path(__file__).parent
    sources = [Path(sys.argv[sys.argv.index('--file') + 1])] if '--file' in sys.argv else [root / f'variant-{v}.html' for v in 'abc']
    if any(not p.is_file() or not p.read_text().strip() for p in sources):
        print('Guard unavailable: required input absent', file=sys.stderr); return 2
    for path in sources:
        errors = guard(path.read_text())
        if errors:
            print(path.name, errors, file=sys.stderr); return 1
    if '--mutation' in sys.argv:
        source = sources[0].read_text()
        defects = [source.replace('id="publicConsent" type="checkbox"', 'id="publicConsent" type="checkbox" checked'),
                   source.replace('ИЛЛЮСТРАЦИИ / MOCK', 'READY')]
        with tempfile.TemporaryDirectory(prefix='guard-mutant-', dir=root) as tmp:
            for i, defect in enumerate(defects):
                mutant = Path(tmp) / f'mutant-{i}.html'; mutant.write_text(defect)
                result = subprocess.run([sys.executable, str(Path(__file__).resolve()), '--file', str(mutant)], capture_output=True, text=True)
                if result.returncode != 1:
                    print('Mutation not rejected with exit 1', file=sys.stderr); return 1
        print('PASS: 2 injected defects rejected by actual guard subprocess exit 1; original inputs unchanged')
    else:
        print('PASS: 3 variants; unchecked consent, visible mock disclosure, no unsafe/remote scripts')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
