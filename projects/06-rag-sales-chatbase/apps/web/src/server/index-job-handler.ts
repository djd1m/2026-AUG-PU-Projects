// ReadIndexJob → GET /api/index-jobs/{index_job_id} (Pseudocode «API Contracts»). Написано заново: у N5
// состояние видео читалось через tRPC. Форма ответа — { data } | { error } как у auth-handler N6.
// Доступ: сессия владельца; cookie предпросмотра — фича preview-flow (resolvePreviewBot пока null).
// Чужая и несуществующая задача — ОДИН ответ 404 (канон: «Чужой ресурс — 404»).
import type { IndexJobAccess, IndexJobView } from '@n6/db';
import { readSessionCookie } from './auth-handler';

export interface IndexJobHandlerDependencies {
  authenticate: (token: string) => Promise<{ account_id: string } | null>;
  resolvePreviewBot: (request: Request) => Promise<string | null>;
  read: (indexJobId: string, access: IndexJobAccess) => Promise<IndexJobView | null>;
}
const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const notFound = () => json({ error: { code: 'not_found', message: 'Задача не найдена' } }, 404);

export function createIndexJobReadHandler(deps: IndexJobHandlerDependencies) {
  return async (request: Request, indexJobId: string): Promise<Response> => {
    try {
      const token = readSessionCookie(request);
      const session = token ? await deps.authenticate(token) : null;
      const previewBotId = session ? null : await deps.resolvePreviewBot(request);
      if (!session && !previewBotId) return notFound();
      const view = await deps.read(indexJobId, session ? { accountId: session.account_id } : { previewBotId: previewBotId! });
      return view ? json({ data: view }) : notFound();
    } catch {
      // Недоступность БД — отказ 503, а не «выполняется» и не пустой прогресс.
      return json({ error: { code: 'unavailable', message: 'Состояние задачи временно недоступно. Повторите через минуту' } }, 503);
    }
  };
}
