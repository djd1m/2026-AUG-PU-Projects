import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readRuntimeConfig } from '../apps/web/src/lib/auth/config.js';

const require = createRequire(import.meta.url);
try {
  readRuntimeConfig(process.env);
  const mode = process.argv[2] ?? 'start';
  if (!['dev', 'start'].includes(mode)) throw new Error('invalid_mode');
  const port = process.env.PORT ?? '3000';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('invalid_port');
  const host = process.env.N3A_LISTEN_HOST ?? '127.0.0.1';
  if (!['127.0.0.1', '0.0.0.0'].includes(host)) throw new Error('invalid_listen_host');
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), mode, '--hostname', host, '--port', port], {
    cwd: fileURLToPath(new URL('../apps/web/', import.meta.url)),
    stdio: 'inherit',
    env: process.env,
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
  child.on('error', () => { console.error('web_start_failed'); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
} catch {
  console.error('runtime_configuration_invalid');
  process.exitCode = 1;
}
