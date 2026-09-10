import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const root = fileURLToPath(new URL('../', import.meta.url));
const repository = path.resolve(root, '../..');
const namespace = `n3a-foundation-${randomBytes(6).toString('hex')}`;
const runtime = await mkdtemp(path.join(tmpdir(), `${namespace}-`));
const webPort = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const port = probe.address().port;
    probe.close((error) => error ? reject(error) : resolve(port));
  });
});
const browser = process.argv.includes('--browser');
const env = { ...process.env,
  N3A_COMPOSE_PROJECT: namespace,
  N3A_WEB_PORT: String(webPort),
  N3A_DB_ADMIN_PASSWORD: randomBytes(32).toString('hex'),
  N3A_DB_APP_PASSWORD: randomBytes(32).toString('hex'),
  N3A_DB_MIGRATE_PASSWORD: randomBytes(32).toString('hex'),
  SESSION_SECRET: randomBytes(32).toString('base64url'),
  IDENTITY_SECRET: randomBytes(32).toString('base64url'),
  ADMISSION_SECRET: randomBytes(32).toString('base64url'),
  APP_ORIGIN: `http://localhost:${webPort}`,
  NEXT_TELEMETRY_DISABLED: '1',
};
// Retain a private, non-git handle for diagnosis; never put secrets in console output.
await writeFile(path.join(runtime, 'environment.json'), JSON.stringify(Object.fromEntries(Object.entries(env).filter(([key]) => key.startsWith('N3A_') || ['SESSION_SECRET', 'IDENTITY_SECRET', 'ADMISSION_SECRET', 'APP_ORIGIN'].includes(key)))), { mode: 0o600 });
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
  if (process.argv.includes('--image') || browser) {
    if (browser) await run('docker', [...compose, 'run', '--rm', '--no-deps', 'test', 'node', '--import', 'tsx', 'scripts/prepare-onboarding-browser.mjs']);
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
    if (browser) {
      await run('python3', ['tests/onboarding-browser.py', path.join(root, '.runtime', namespace, 'browser-fixture.json'),
        env.APP_ORIGIN, path.join(root, '.runtime', namespace, 'browser-evidence')]);
      const fixture = JSON.parse(await readFile(path.join(root, '.runtime', namespace, 'browser-fixture.json'), 'utf8'));
      const logs = await new Promise((resolve, reject) => {
        const child = spawn('docker', [...compose, 'logs', '--no-color', 'web'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = ''; let oversized = false;
        for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
          output += chunk.toString(); if (output.length > 1024 * 1024) { oversized = true; child.kill(); }
        });
        child.on('error', () => reject(new Error('log_check_unavailable')));
        child.on('exit', code => code === 0 && !oversized ? resolve(output) : reject(new Error('log_check_unavailable')));
      });
      const sensitive = [fixture.grant_token, fixture.owner.identity, fixture.owner.password,
        fixture.partner.identity, fixture.partner.password, env.SESSION_SECRET, env.IDENTITY_SECRET,
        env.ADMISSION_SECRET, env.N3A_DB_APP_PASSWORD, env.N3A_DB_MIGRATE_PASSWORD];
      if (sensitive.some(value => typeof value === 'string' && value && logs.includes(value))) throw new Error('web_log_secret_exposure');
      await writeFile(path.join(root, '.runtime', namespace, 'browser-evidence', 'log-check.json'),
        JSON.stringify({ status: 'passed', synthetic_values_checked: sensitive.length, log_bytes: Buffer.byteLength(logs) }) + '\n');
      console.log('PASS built web logs contain no synthetic identities, credentials or runtime secrets');
    }
  }
  console.log(`PASS foundation isolated PostgreSQL and built-workspace checks (${namespace})`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'foundation_verification_failed');
  process.exitCode = 1;
} finally {
  if (stackStarted) {
    // Exact random namespace created by this invocation only; no volumes are deleted.
    await run('docker', [...compose, '--profile', 'app', '--profile', 'test', 'down']).catch(() => { console.error('test_stack_cleanup_failed'); process.exitCode = 1; });
  }
  console.log(`Diagnostic handle: ${runtime}`);
}
