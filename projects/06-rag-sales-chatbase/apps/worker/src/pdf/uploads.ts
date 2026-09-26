// Том uploads (ADR-018): сырой PDF живёт только до конца индексации. Написано заново (у N5 — S3).
// removeUpload — после done И после failed (RunIndexJob, onSettled); sweepUploads — страховка для того,
// что закрылось мимо обработчика: сторож (stalled), исчерпанная серия, удалённый черновик, web, упавший
// между записью файла и коммитом задачи. Удаляется только файл с именем-UUID, чья задача завершена или
// не существует; свежие файлы (моложе minAgeMs) не трогаются — web пишет файл ДО коммита строки задачи.
import { lstat, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool } from '@n6/db';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const UPLOAD_SWEEP_MIN_AGE_MS = 10 * 60_000;
export const UPLOAD_SWEEP_BATCH = 1000;

export const uploadPath = (dir: string, indexJobId: string): string => {
  if (!UUID.test(indexJobId)) throw new Error('Непригодный index_job_id: путь в томе не строится');
  return join(dir, indexJobId.toLowerCase());
};

// Нет файла — не ошибка (задача сайта, уже удалён). Любая другая ошибка всплывает: вызывающий журналирует.
export async function removeUpload(dir: string, indexJobId: string): Promise<boolean> {
  try { await unlink(uploadPath(dir, indexJobId)); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

export async function sweepUploads(pool: Pool, dir: string, now = new Date(), minAgeMs = UPLOAD_SWEEP_MIN_AGE_MS): Promise<number> {
  let names: string[];
  try { names = await readdir(dir); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
  const candidates: string[] = [];
  for (const name of names) {
    if (candidates.length >= UPLOAD_SWEEP_BATCH) break;
    if (!UUID.test(name)) continue;
    const info = await lstat(join(dir, name)).catch(() => null);
    if (!info?.isFile() || now.getTime() - info.mtimeMs < minAgeMs) continue;
    candidates.push(name.toLowerCase());
  }
  if (!candidates.length) return 0;
  const alive = await pool.query<{ id: string }>(`SELECT id::text FROM index_job WHERE id = ANY($1::uuid[]) AND status IN ('queued', 'running')`, [candidates]);
  const keep = new Set(alive.rows.map((r) => r.id));
  let removed = 0;
  for (const id of candidates) {
    if (keep.has(id)) continue;
    if (await removeUpload(dir, id)) removed++;
  }
  return removed;
}
