import type { Pool } from '@clipmaker/db';
import { findShowcase } from '@clipmaker/shared/showcase';
import { clientIp } from './ip';

// ТРЕТИЙ путь к файлу клипа (ADR-018, .claude/rules/security.md «Доступ к файлу клипа»): витрина лендинга.
// Граница: только клипы из закрытого набора SHOWCASE_CLIPS в коде; только чтение (GET); без сессии и без
// сведений о владельце; ни списков, ни мутаций. Код того же формата вне набора — 404, как и клип не `done`,
// без объекта, стёртый аккаунт, удалённая запись или отозванная короткая ссылка.
// Отдача — 302 на подписанную ссылку ≤ 900 с (как путь владельца в clip-file.ts), байты через web НЕ идут.
export interface ShowcaseFileDependencies {
  allowRead: (ip: string) => Promise<boolean>;
  trustedProxyHops: number;
  pool: Pick<Pool, 'query'>;
  sign: (key: string) => Promise<string>;
}
export function createShowcaseFileHandler(deps: ShowcaseFileDependencies, kind: 'file' | 'thumbnail') {
  return async (request: Request, code: string): Promise<Response> => {
    const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
    const missing = () => new Response('Клип витрины не найден', { status: 404, headers });
    try {
      if (!await deps.allowRead(clientIp(request.headers, deps.trustedProxyHops))) {
        return new Response('Слишком много запросов. Повторите через минуту', { status: 429, headers });
      }
      // Членство в наборе — ДО любого запроса к базе: чужой код не стоит ни одного обращения.
      const showcase = findShowcase(code);
      if (!showcase) return missing();
      const row = (await deps.pool.query<{ object_key: string | null; thumbnail_key: string | null }>(
        `SELECT c.object_key,c.thumbnail_key FROM clip c JOIN video v ON v.id=c.video_id JOIN account a ON a.id=v.account_id
         WHERE c.id=$1 AND c.status='done' AND v.deleted_at IS NULL AND a.status='active'
         AND EXISTS (SELECT 1 FROM clip_link l WHERE l.clip_id=c.id AND l.code=$2 AND l.revoked_at IS NULL)`,
        [showcase.clipId, showcase.code])).rows[0];
      const key = kind === 'file' ? row?.object_key : row?.thumbnail_key;
      if (!key) return missing();
      return new Response(null, { status: 302, headers: { ...headers, Location: await deps.sign(key) } });
    } catch (error) {
      console.error('Витрина: не удалось выдать файл', error);
      return new Response('Не удалось получить файл. Повторите позже', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
  };
}
