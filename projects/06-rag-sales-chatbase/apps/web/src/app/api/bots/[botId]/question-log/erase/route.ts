// POST /api/bots/{bot_id}/question-log/erase { confirm: true } — стереть журнал вопросов бота (FR-AUTH-002, account-erasure).
import { createQuestionLogEraseHandler } from '../../../../../../server/account-handler';
import { getAccountDependencies } from '../../../../../../server/account-runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ botId: string }> }): Promise<Response> {
  return createQuestionLogEraseHandler(getAccountDependencies())(request, (await context.params).botId);
}
