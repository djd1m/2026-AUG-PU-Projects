import { z } from 'zod';
import type { Pool } from '@clipmaker/db';
import { readSessionCookie } from './auth-handler';
import type { AuthService } from './auth';

export interface ClipFileDependencies {
  pool: Pick<Pool, 'query'>; auth: Pick<AuthService, 'authenticate'>;
  sign: (key: string, filename?: string) => Promise<string>;
  clock?: () => Date;
}
export function createClipFileHandler(deps: ClipFileDependencies, kind: 'file' | 'thumbnail' = 'file') {
  return async (request: Request, id: string): Promise<Response> => {
    const missing = () => new Response('Клип не найден или срок хранения истёк', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    try {
      const token = readSessionCookie(request);
      const session = token ? await deps.auth.authenticate(token) : null;
      if (!session || !z.string().uuid().safeParse(id).success) return missing();
      const row = (await deps.pool.query<{ status: string; object_key: string | null; thumbnail_key: string | null; title: string; expires_at: Date | null; finished_at: Date | null; plan: string }>(
        `SELECT c.status,c.object_key,c.thumbnail_key,c.title,c.expires_at,v.finished_at,a.plan FROM clip c
         JOIN video v ON v.id=c.video_id JOIN account a ON a.id=v.account_id
         WHERE c.id=$1 AND v.account_id=$2 AND v.deleted_at IS NULL AND a.status='active'`, [id, session.account_id])).rows[0];
      if (!row) return missing();
      if (row.status !== 'done') return missing();
      const now = (deps.clock ?? (() => new Date()))();
      const expires = row.expires_at ?? (row.plan !== 'paid' && row.finished_at ? new Date(row.finished_at.getTime() + 3 * 86400_000) : null);
      if (expires && expires <= now) return missing();
      const key = kind === 'file' ? row.object_key : row.thumbnail_key;
      if (!key) return missing();
      const filename = kind === 'file' && new URL(request.url).searchParams.get('download') === '1'
        ? `${row.title.replace(/[<>:"/\\|?*;\x00-\x1f]/g, '').trim().slice(0, 100) || 'clip'}.mp4` : undefined;
      return new Response(null, { status: 302, headers: { Location: await deps.sign(key, filename),
        'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
    } catch {
      return new Response('Не удалось получить файл. Повторите позже', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
  };
}
