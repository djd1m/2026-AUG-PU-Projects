// GET /api/index-jobs/{index_job_id} — ReadIndexJob (фича index-job-core). Оформление маршрута — как у
// N5 apps/web/src/app/api/auth/*/route.ts: runtime nodejs, зависимости из getRuntime().
import { readIndexJob } from '@n6/db';
import { getRuntime } from '../../../../server/runtime';
import { createIndexJobReadHandler } from '../../../../server/index-job-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { pool, auth } = getRuntime();
  const handler = createIndexJobReadHandler({
    authenticate: (token) => auth.authenticate(token),
    resolvePreviewBot: async () => null,
    read: (id, access) => readIndexJob(pool, id, access),
  });
  return handler(request, (await context.params).id);
}
