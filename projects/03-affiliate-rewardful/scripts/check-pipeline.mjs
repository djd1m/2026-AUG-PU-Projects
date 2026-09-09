import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// p-replicator 1.13.2 expands PROJECT_COMPLETION twice (docs/docs/Completion.md).
// Keep every upstream check; correct only the path variable in an in-memory copy.
// Fail closed if the installed source changes, so an upgrade requires review.
const source = readFileSync(new URL('../node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh', import.meta.url), 'utf8');
const expected = '06e3dae22c533a81732b9870ae42d6b80b6e8419b3c90e11e1910e2a46888be8';
if (createHash('sha256').update(source).digest('hex') !== expected) {
  throw new Error('Pipeline checker changed; review or remove the 1.13.2 path compatibility fix');
}
const patched = source
  .replace('  PROJECT_COMPLETION="$DOCS_ROOT/$PROJECT_COMPLETION"', '  PROJECT_COMPLETION_FILE="$DOCS_ROOT/$PROJECT_COMPLETION"')
  .replace('[ -e "$PROJECT_COMPLETION" ] || [ -L "$PROJECT_COMPLETION" ]', '[ -e "$PROJECT_COMPLETION_FILE" ] || [ -L "$PROJECT_COMPLETION_FILE" ]');
const args = process.argv.slice(2);
const result = spawnSync('bash', ['-s', '--', ...(args.length ? args : ['.', '--traceability', '--report-revision', '--criterion-scenarios', '--completion'])],
  { input: patched, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error) throw result.error;
process.exitCode = result.status ?? 2;
