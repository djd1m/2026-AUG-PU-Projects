import { it, expect } from 'vitest';
import { spawn } from 'node:child_process';

it('all declared serve commands reject missing and malformed runtime configuration', async () => {
  for (const args of [['run', 'dev'], ['start'], ['run', 'dev', '--workspace', '@n3a/web'], ['start', '--workspace', '@n3a/web']]) {
    for (const malformed of [false, true]) {
      const env: NodeJS.ProcessEnv = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
      delete env.PORT;
      delete env.DATABASE_URL;
      delete env.SESSION_SECRET;
      if (malformed) Object.assign(env, { DATABASE_URL: 'postgresql://n3a_app:%ZZ@db/n3a', SESSION_SECRET: 'invalid' });
      const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
        const child = spawn('npm', args, { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        const stop = () => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } };
        const timer = setTimeout(() => { stop(); reject(new Error('invalid_config_server_did_not_exit')); }, 4000);
        child.stdout.on('data', data => { output += data; });
        child.stderr.on('data', data => { output += data; });
        child.on('error', error => { clearTimeout(timer); stop(); reject(error); });
        child.on('exit', code => { clearTimeout(timer); stop(); resolve({ code, output }); });
      });
      expect(result.code).toBe(1);
      expect(result.output).toContain('runtime_configuration_invalid');
      expect(result.output).not.toContain('Ready in');
      expect(result.output).not.toContain('%ZZ');
    }
  }
}, 30000);
