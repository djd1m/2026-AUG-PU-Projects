import { z } from 'zod';
import type { Pool } from '@clipmaker/db';
import { readSessionCookie } from './auth-handler';
import type { AuthService } from './auth';
import { guestFileTicket, validGuestFileTicket } from './guest-file';

export interface ClipFileDependencies {
  pool: Pick<Pool, 'query'>; auth: Pick<AuthService, 'authenticate'>;
  sign: (key: string, filename?: string) => Promise<string>;
  clock?: () => Date;
  guestSecret?: string;
  stream?: (url: string, request: Request) => Promise<Response>;
}
export function createClipFileHandler(deps: ClipFileDependencies, kind: 'file' | 'thumbnail' = 'file') {
  return async (request: Request, id: string): Promise<Response> => {
    const missing = () => new Response('Клип не найден или срок хранения истёк', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    try {
      const token = readSessionCookie(request);
      const session = token ? await deps.auth.authenticate(token) : null;
      const url = new URL(request.url), code = url.searchParams.get('g');
      if ((!session && !code) || !z.string().uuid().safeParse(id).success) return missing();
      if (code !== null && !/^[A-Za-z0-9_-]{32}$/.test(code)) return missing();
      const now = (deps.clock ?? (() => new Date()))();
      const row = (await deps.pool.query<{ status: string; object_key: string | null; thumbnail_key: string | null; title: string; expires_at: Date | null; finished_at: Date | null; plan: string }>(
        `SELECT c.status,c.object_key,c.thumbnail_key,c.title,c.expires_at,v.finished_at,a.plan FROM clip c
         JOIN video v ON v.id=c.video_id JOIN account a ON a.id=v.account_id
         WHERE c.id=$1 AND v.deleted_at IS NULL AND a.status='active' AND (
           ($3::text IS NULL AND v.account_id=$2) OR
           ($3::text IS NOT NULL AND EXISTS (SELECT 1 FROM guest_pack p JOIN guest_pack_clip pc ON pc.guest_pack_id=p.id
             WHERE pc.clip_id=c.id AND p.video_id=v.id AND p.account_id=v.account_id AND p.code=$3
             AND p.revoked_at IS NULL AND p.sent_at IS NOT NULL AND p.expires_at>$4)))`, [id, session?.account_id ?? null, code, now])).rows[0];
      if (!row) return missing();
      if (row.status !== 'done') return missing();
      const expires = row.expires_at ?? (row.plan !== 'paid' && row.finished_at ? new Date(row.finished_at.getTime() + 3 * 86400_000) : null);
      if (expires && expires <= now) return missing();
      const key = kind === 'file' ? row.object_key : row.thumbnail_key;
      if (!key) return missing();
      const filename = kind === 'file' && new URL(request.url).searchParams.get('download') === '1'
        ? `${row.title.replace(/[<>:"/\\|?*;\x00-\x1f]/g, '').trim().slice(0, 100) || 'clip'}.mp4` : undefined;
      if (code) {
        if (!deps.guestSecret || !deps.stream) throw new Error('Guest file runtime unavailable');
        const signature = url.searchParams.get('sig'), until = url.searchParams.get('until');
        const download = url.searchParams.get('download') === '1';
        if (signature !== null || until !== null) {
          const expected = guestFileTicket(deps.guestSecret, id, kind, code, download, until ?? '');
          if (!signature || !until || !validGuestFileTicket(signature, expected, until, now)) return missing();
          return await deps.stream(await deps.sign(key, filename), request);
        }
        const deadline = String(now.getTime() + 900_000);
        const params = new URLSearchParams({ g: code, until: deadline,
          sig: guestFileTicket(deps.guestSecret, id, kind, code, download, deadline) });
        if (download) params.set('download', '1');
        return new Response(null, { status: 302, headers: { Location: `/api/clips/${id}/${kind}?${params}`,
          'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
      }
      return new Response(null, { status: 302, headers: { Location: await deps.sign(key, filename),
        'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
    } catch (error) {
      console.error('Выдача клипа: не удалось получить файл', error);
      return new Response('Не удалось получить файл. Повторите позже', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
  };
}
