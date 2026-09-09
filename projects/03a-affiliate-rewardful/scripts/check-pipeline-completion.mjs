/** Project-local adapter for one pinned upstream completion path defect.
 * No vendor files, document roles, criteria or validation rules are changed.
 */
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const UPSTREAM_VERSION = '1.13.2';
export const UPSTREAM_SHA256 = '06e3dae22c533a81732b9870ae42d6b80b6e8419b3c90e11e1910e2a46888be8';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = join(projectRoot, 'node_modules/@dzhechkov/p-replicator');

export function patchCompletionChecker(original) {
  if (!Buffer.isBuffer(original) || createHash('sha256').update(original).digest('hex') !== UPSTREAM_SHA256) {
    throw new Error('upstream_checker_sha_mismatch');
  }
  let corrected = original.toString('utf8');
  const substitutions = [
    ['  PROJECT_COMPLETION="$DOCS_ROOT/$PROJECT_COMPLETION"',
      '  PROJECT_COMPLETION_PATH="$DOCS_ROOT/$PROJECT_COMPLETION"'],
    ['     [ -e "$PROJECT_COMPLETION" ] || [ -L "$PROJECT_COMPLETION" ]; }; then',
      '     [ -e "$PROJECT_COMPLETION_PATH" ] || [ -L "$PROJECT_COMPLETION_PATH" ]; }; then'],
  ];
  for (const [before, after] of substitutions) {
    if (corrected.split(before).length !== 2) throw new Error('upstream_substitution_count_mismatch');
    corrected = corrected.replace(before, after);
  }
  const rawRoleCall = 'process_completion_contour project "$DOCS_ROOT" "$PROJECT_SPECIFICATION" "$PROJECT_COMPLETION"';
  if (corrected.split(rawRoleCall).length !== 2) throw new Error('upstream_role_call_mismatch');
  return corrected;
}

export function runCompletionChecker(args = []) {
  let temporary;
  try {
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
    if (manifest.version !== UPSTREAM_VERSION) throw new Error('upstream_version_mismatch');
    const sourcePath = join(packageRoot, 'scripts/check-pipeline-gaps.sh');
    if (!lstatSync(sourcePath).isFile()) throw new Error('upstream_checker_not_regular_file');
    const corrected = patchCompletionChecker(readFileSync(sourcePath));
    // Explicit caller arguments retain their order and meaning. Defaults only fill
    // the invocation and the repository's already-declared role-source locations.
    const forwarded = args.length ? [...args] : ['.', '--completion'];
    if (!forwarded.includes('--role-map-source')) {
      forwarded.push('--role-map-source', resolve(projectRoot, '../../.claude/commands/feature.md'));
    }
    if (!forwarded.includes('--project-role-map-source')) {
      forwarded.push('--project-role-map-source', resolve(projectRoot, '../../.claude/skills/sparc-prd-mini/SKILL.md'));
    }
    temporary = mkdtempSync(join(tmpdir(), 'n3a-completion-checker-'));
    const executable = join(temporary, 'check-pipeline-gaps.sh');
    writeFileSync(executable, corrected, { mode: 0o600, flag: 'wx' });
    const result = spawnSync('bash', [executable, ...forwarded], {
      stdio: 'inherit', timeout: 60_000,
    });
    if (result.error || result.signal || result.status === null) throw new Error('upstream_checker_execution_failed');
    return result.status;
  } catch (error) {
    const known = new Set(['upstream_checker_sha_mismatch', 'upstream_substitution_count_mismatch',
      'upstream_role_call_mismatch', 'upstream_version_mismatch', 'upstream_checker_not_regular_file',
      'upstream_checker_execution_failed']);
    const code = error instanceof Error && known.has(error.message) ? error.message : 'completion_adapter_unavailable';
    console.error(`NOT-ESTABLISHED ${code}`);
    return 2;
  } finally {
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCompletionChecker(process.argv.slice(2));
}
