import { spawnSync } from 'node:child_process';
import { mkdtempSync, openSync, closeSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export function subprocess(args: string[], env: NodeJS.ProcessEnv = process.env, timeout = 15000) {
  const dir = mkdtempSync(path.join(tmpdir(), 'n5-process-'));
  const file = path.join(dir, 'output');
  const fd = openSync(file, 'w');
  try {
    const result = spawnSync(process.execPath, args, { env, stdio: ['ignore', fd, fd], timeout });
    if (result.error) throw result.error;
    return { status: result.status, signal: result.signal, output: readFileSync(file, 'utf8') };
  } finally { closeSync(fd); rmSync(dir, { recursive: true, force: true }); }
}
