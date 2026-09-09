import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { testUrls } from './helpers';

it('idle PostgreSQL disconnect cannot crash the process or expose connection diagnostics', async () => {
  const urls = testUrls();
  // No test error listener in the child: removing the production listener must crash it.
  const source = `
    import pg from 'pg';
    import { createRuntimePool } from './packages/db/src/pool.ts';
    const pool = createRuntimePool(process.env.TEST_DATABASE_URL);
    const { rows } = await pool.query('SELECT pg_backend_pid() AS pid');
    const other = new pg.Client({connectionString:process.env.TEST_DATABASE_URL});
    await other.connect();
    await other.query('SELECT pg_terminate_backend($1)', [rows[0].pid]);
    await new Promise(resolve => setTimeout(resolve, 300));
    await pool.query('SELECT 1');
    await other.end(); await pool.end();
    console.log('survived_idle_disconnect');
  `;
  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
      env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (value) => { stdout += value; });
    child.stderr.on('data', (value) => { stderr += value; });
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
  // Do not include a potentially sensitive raw error in assertion diagnostics.
  expect(result.code, 'idle-disconnect child must survive').toBe(0);
  expect(result.stdout.includes('survived_idle_disconnect')).toBe(true);
  expect(result.stderr.trim() === 'database_idle_connection_error').toBe(true);
  for (const sentinel of [urls.app, new URL(urls.app).password, process.env.SESSION_SECRET]) {
    if (sentinel) expect((result.stdout + result.stderr).includes(sentinel), 'sensitive diagnostic absent').toBe(false);
  }
});
