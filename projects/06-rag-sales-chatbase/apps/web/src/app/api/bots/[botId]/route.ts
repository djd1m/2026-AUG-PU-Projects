// PATCH /api/bots/{bot_id} — настройки бота: название, контакт для «не знаю», приветствие (FR-BOT-001).
import { getCabinetDependencies } from '../../../../server/cabinet-runtime';
import { createBotPatchHandler } from '../../../../server/cabinet-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function PATCH(request: Request, context: { params: Promise<{ botId: string }> }): Promise<Response> {
  return createBotPatchHandler(getCabinetDependencies())(request, (await context.params).botId);
}
