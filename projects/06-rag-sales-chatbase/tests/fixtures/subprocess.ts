// из N5: projects/05-podcast-clips-opus/tests/config.test.ts (функция subprocess) — вынесена в фикстуру
import { spawnSync } from 'node:child_process';
import { mkdtempSync, openSync, closeSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export function subprocess(args: string[], env: NodeJS.ProcessEnv = process.env, timeout = 15000) {
  const dir = mkdtempSync(path.join(tmpdir(), 'n6-sub-'));
  const file = path.join(dir, 'output');
  const fd = openSync(file, 'w');
  try {
    // Файловые дескрипторы работают и в среде, где синхронные pipe запрещены.
    const result = spawnSync(process.execPath, args, { env, stdio: ['ignore', fd, fd], timeout });
    // Таймаут — законный исход для процесса, который должен ЖИТЬ (воркер после принятой конфигурации).
    const timedOut = (result.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT';
    if (result.error && !timedOut) throw result.error;
    return { status: result.status, signal: result.signal, timedOut, output: readFileSync(file, 'utf8') };
  } finally { closeSync(fd); rmSync(dir, { recursive: true, force: true }); }
}
