// POST /api/bots/{bot_id}/sources — CreateSource: PDF multipart (фича pdf-source, FR-SOURCE-003, ADR-018) или сайт
// JSON { url } (фича bot-cabinet, FR-SOURCE-001: CheckAddress в web ДО записи). Выбор — по Content-Type.
import { createPdfSource, findJobByIdempotencyKey, pdfLimitFor, readOwnedBotForPdf } from '@n6/db';
import { getIndexQueue, getRuntime } from '../../../../../server/runtime';
import { allowMutation } from '../../../../../server/rate-limit';
import { createSourceUploadHandler } from '../../../../../server/source-upload-handler';
import { getCabinetDependencies } from '../../../../../server/cabinet-runtime';
import { createSiteSourceHandler } from '../../../../../server/cabinet-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ botId: string }> }): Promise<Response> {
  if (request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return createSiteSourceHandler(getCabinetDependencies())(request, (await context.params).botId);
  }
  const { pool, auth, redis, config } = getRuntime();
  const handler = createSourceUploadHandler({
    publicOrigin: config.publicOrigin, uploadDir: config.uploadDir,
    authenticate: (token) => auth.authenticate(token),
    allowMutation: (ip, account) => allowMutation(redis, ip, config.sessionSecret, account),
    readOwnedBot: (botId, accountId) => readOwnedBotForPdf(pool, botId, accountId),
    pdfLimit: pdfLimitFor,
    findJob: (botId, key) => findJobByIdempotencyKey(pool, botId, key),
    createPdfSource: (input) => createPdfSource(pool, input),
    enqueue: (message) => getIndexQueue().enqueue(message),
  });
  return handler(request, (await context.params).botId);
}
