// Экран бота (FR-BOT-001): чужой, удалённый и несуществующий бот — 404 (notFound), как на API.
// public-page-and-summary: сводка за 7 дней читается здесь же на сервере (FR-BOT-004); сбой сводки не роняет экран —
// блок показывает «временно недоступна», а не нули (CFG-I4).
import { notFound } from 'next/navigation';
import { ceiling, planTier, readBotCabinet, readBotSummary } from '@n6/db';
import { currentAccountId } from '../../../../server/cabinet-session';
import { getRuntime } from '../../../../server/runtime';
import { BotScreen } from './BotScreen';
export const dynamic = 'force-dynamic';
export default async function BotPage({ params }: { params: Promise<{ botId: string }> }) {
  const accountId = await currentAccountId();
  const { pool, config } = getRuntime();
  const bot = accountId ? await readBotCabinet(pool, (await params).botId, accountId) : null;
  if (!bot || !accountId) notFound();
  // Предел месяца — окружение (QUOTA_BOT_MONTH_FREE|PAID), вид — по плану строгим равенством (ceilings.ts).
  const limit = ceiling(config.ceilings, `bot_month_answers:${planTier(bot.plan)}`);
  const summary = await readBotSummary(pool, bot.bot_id, accountId).catch(() => null);
  const page = bot.public_page;
  return <BotScreen botId={bot.bot_id} companyName={bot.company_name} contact={bot.contact ?? ''} greeting={bot.greeting}
    answersVerified={bot.answers_verified} gate={{ resetAt: bot.verified_reset?.at ?? null, stubVisitors: bot.stub_visitors_7d }} monthAnswers={{ used: bot.month_answers_used, limit }} summary={summary}
    publicPage={{ ...page, url: page.slug ? new URL(`/b/${page.slug}`, config.publicOrigin).href : null }}
    sources={bot.sources.map((s) => ({ source_id: s.source_id, kind: s.kind, title: s.title, job: s.job, pages_truncated: s.pages_truncated }))} />;
}
