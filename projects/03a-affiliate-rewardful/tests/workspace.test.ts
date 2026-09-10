import { it, expect } from 'vitest';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

it('built workspace serves isolated liveness contract', async () => {
  if (!existsSync('apps/web/.next/BUILD_ID')) throw new Error('Build required before workspace smoke');
  if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) throw new Error('Explicit test runtime environment required');
  const probe = createServer();
  probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const address = probe.address();
  if (typeof address !== 'object' || !address) throw new Error('port_allocation_failed');
  const port = address.port;
  await new Promise<void>((resolve, reject) => probe.close((err) => err ? reject(err) : resolve()));
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/start-web.ts'], {
    env: { ...process.env, PORT: String(port), N3A_LISTEN_HOST: '127.0.0.1', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = once(child, 'exit');
  let log = '';
  child.stdout.on('data', (data) => { log += data; });
  child.stderr.on('data', (data) => { log += data; });
  const origin = `http://127.0.0.1:${port}`;
  try {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error('built_web_exited');
      try { response = await fetch(`${origin}/api/health`); break; } catch { await delay(100); }
    }
    expect(response?.status).toBe(200);
    expect(response?.headers.get('cache-control')).toBe('no-store');
    expect(await response?.json()).toEqual({ status: 'alive' });
    const home = await fetch(origin);
    expect(home.status).toBe(200);
    const html = await home.text();
    expect(html).toContain('lang="ru"');
    expect(html).toContain('<main>');
    expect(html).toContain('Готовимся к открытию');
    for (const route of ['/api/auth/register', '/api/enrollment']) {
      expect((await fetch(`${origin}${route}`, { method: 'POST' })).status).toBe(404);
    }
    for (const route of ['/api/auth/login', '/api/auth/signup', '/api/auth/logout']) {
      const rejected = await fetch(`${origin}${route}`, { method: 'POST' });
      expect(rejected.status).toBe(403);
      expect(rejected.headers.get('cache-control')).toBe('no-store');
    }
    expect(log).not.toContain(process.env.SESSION_SECRET);
    expect(log).not.toContain(process.env.DATABASE_URL);
  } finally {
    child.kill('SIGTERM');
    await Promise.race([exited, delay(5000).then(() => { child.kill('SIGKILL'); })]);
  }
});
