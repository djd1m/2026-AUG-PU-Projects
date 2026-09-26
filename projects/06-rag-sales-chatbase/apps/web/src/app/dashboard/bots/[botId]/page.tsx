// Экран бота (FR-BOT-001): чужой, удалённый и несуществующий бот — 404 (notFound), как на API.
import { notFound } from 'next/navigation';
import { ceiling, planTier, readBotCabinet } from '@n6/db';
import { currentAccountId } from '../../../../server/cabinet-session';
import { getRuntime } from '../../../../server/runtime';
import { BotScreen } from './BotScreen';
export const dynamic = 'force-dynamic';
export default async function BotPage({ params }: { params: Promise<{ botId: string }> }) {
  const accountId = await currentAccountId();
  const bot = accountId ? await readBotCabinet(getRuntime().pool, (await params).botId, accountId) : null;
  if (!bot) notFound();
  // Предел месяца — окружение (QUOTA_BOT_MONTH_FREE|PAID), вид — по плану строгим равенством (ceilings.ts).
  const limit = ceiling(getRuntime().config.ceilings, `bot_month_answers:${planTier(bot.plan)}`);
  return <BotScreen botId={bot.bot_id} companyName={bot.company_name} contact={bot.contact ?? ''} greeting={bot.greeting}
    answersVerified={bot.answers_verified} monthAnswers={{ used: bot.month_answers_used, limit }}
    sources={bot.sources.map((s) => ({ source_id: s.source_id, kind: s.kind, title: s.title, job: s.job }))} />;
}
