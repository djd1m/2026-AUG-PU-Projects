import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const repository = path.resolve(root, '../..');
const namespace = `n3a-foundation-${randomBytes(6).toString('hex')}`;
const runtime = await mkdtemp(path.join(tmpdir(), `${namespace}-`));
const env = { ...process.env,
  N3A_COMPOSE_PROJECT: namespace,
  N3A_DB_ADMIN_PASSWORD: randomBytes(32).toString('hex'),
  N3A_DB_APP_PASSWORD: randomBytes(32).toString('hex'),
  N3A_DB_MIGRATE_PASSWORD: randomBytes(32).toString('hex'),
  SESSION_SECRET: randomBytes(32).toString('base64url'),
  NEXT_TELEMETRY_DISABLED: '1',
};
// Retain a private, non-git handle for diagnosis; never put secrets in console output.
await writeFile(path.join(runtime, 'environment.json'), JSON.stringify(Object.fromEntries(Object.entries(env).filter(([key]) => key.startsWith('N3A_') || key === 'SESSION_SECRET'))), { mode: 0o600 });
function run(command, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
    child.on('error', () => reject(new Error('subprocess_unavailable')));
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`check_failed:${command}:${code}`)));
  });
}
const compose = ['compose', '-f', path.join(root, 'compose.yaml'), '-p', namespace];
let stackStarted = false;
try {
  await run('npm', ['run', 'typecheck']);
  await run('npm', ['run', 'build']);
  await run('node', ['scripts/check-foundation-infra.mjs']);
  await run('bash', ['scripts/check-port-conflicts.sh', path.join(root, 'compose.yaml')], repository);
  stackStarted = true;
  await run('docker', [...compose, 'up', '-d', '--wait', 'db']);
  await run('docker', [...compose, 'run', '--rm', '--no-deps', 'test', 'npm', 'run', 'db:migrate']);
  await run('docker', [...compose, 'run', '--rm', '--no-deps', 'test', 'npm', 'test']);
  if (process.argv.includes('--mutations')) {
    await mkdir(path.join(root, '.runtime'), { recursive: true });
    await run('docker', [...compose, 'run', '--rm', '--no-deps', 'test', 'node', '--import', 'tsx', 'scripts/mutation-check.mjs']);
  }
  await run('docker', [...compose, 'run', '--rm', '--no-deps', 'test', 'npm', 'run', 'test:integration']);
  if (process.argv.includes('--image')) {
    await run('docker', [...compose, 'build', 'web']);
    await run('docker', [...compose, 'up', '-d', '--no-build', '--wait', 'web']);
    await run('docker', [...compose, 'exec', '-T', 'web', 'node', '-e', `
      (async () => {
        let ready = false;
        for (let attempt = 0; attempt < 60; attempt++) {
          try {
            const response = await fetch('http://127.0.0.1:3000/api/health');
            if (response.status === 200 && response.headers.get('cache-control') === 'no-store' && (await response.json()).status === 'alive') { ready = true; break; }
          } catch {}
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        if (!ready) throw new Error('image_health_failed');
        const home = await fetch('http://127.0.0.1:3000/');
        if (home.status !== 200 || !(await home.text()).includes('Готовимся к открытию')) throw new Error('image_home_failed');
        if (process.getuid() === 0) throw new Error('image_runs_as_root');
        console.log('PASS built image startup, liveness, Russian home and non-root user');
      })().catch(() => { console.error('image_smoke_failed'); process.exitCode = 1; });
    `]);
  }
  console.log(`PASS foundation isolated PostgreSQL and built-workspace checks (${namespace})`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'foundation_verification_failed');
  process.exitCode = 1;
} finally {
  if (stackStarted) {
    // Exact random namespace created by this invocation only; no volumes are deleted.
    await run('docker', [...compose, 'down']).catch(() => { console.error('test_stack_cleanup_failed'); process.exitCode = 1; });
  }
  console.log(`Diagnostic handle: ${runtime}`);
}
