// GET /api/bots/{bot_id}/summary — сводка «ответил / не знал» за 7 дней (FR-BOT-004, public-page-and-summary).
import { getCabinetDependencies } from '../../../../../server/cabinet-runtime';
import { createBotSummaryHandler } from '../../../../../server/cabinet-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ botId: string }> }): Promise<Response> {
  return createBotSummaryHandler(getCabinetDependencies())(request, (await context.params).botId);
}
