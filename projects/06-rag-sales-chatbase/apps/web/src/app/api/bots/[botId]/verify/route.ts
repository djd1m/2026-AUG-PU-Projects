// POST /api/bots/{bot_id}/verify { verified } — отметка «Я проверил ответы бота» (A-N6-035, visitor-ask-and-limits).
import { getCabinetDependencies } from '../../../../../server/cabinet-runtime';
import { createBotVerifyHandler } from '../../../../../server/cabinet-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ botId: string }> }): Promise<Response> {
  return createBotVerifyHandler(getCabinetDependencies())(request, (await context.params).botId);
}
