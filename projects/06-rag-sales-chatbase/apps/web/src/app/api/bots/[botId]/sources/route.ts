// POST /api/bots/{bot_id}/sources — CreateSource для PDF (фича pdf-source, FR-SOURCE-003, ADR-018).
// Оформление — как у GET /api/index-jobs/{id}: runtime nodejs, зависимости из getRuntime().
import { createPdfSource, findJobByIdempotencyKey, pdfLimitFor, readOwnedBotForPdf } from '@n6/db';
import { getIndexQueue, getRuntime } from '../../../../../server/runtime';
import { allowMutation } from '../../../../../server/rate-limit';
import { createSourceUploadHandler } from '../../../../../server/source-upload-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ botId: string }> }): Promise<Response> {
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
