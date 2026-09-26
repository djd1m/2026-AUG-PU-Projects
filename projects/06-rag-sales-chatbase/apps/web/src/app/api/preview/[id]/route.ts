// GET /api/preview/{index_job_id} — состояние предпросмотра для держателя токена (cookie), три состояния + «нет ответа».
import { getPreviewDependencies } from '../../../../server/preview-runtime';
import { createPreviewReadHandler } from '../../../../server/preview-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return createPreviewReadHandler(getPreviewDependencies())(request, (await context.params).id);
}
