// Экран бота (FR-BOT-001): чужой, удалённый и несуществующий бот — 404 (notFound), как на API.
import { notFound } from 'next/navigation';
import { readBotCabinet } from '@n6/db';
import { currentAccountId } from '../../../../server/cabinet-session';
import { getRuntime } from '../../../../server/runtime';
import { BotScreen } from './BotScreen';
export const dynamic = 'force-dynamic';
export default async function BotPage({ params }: { params: Promise<{ botId: string }> }) {
  const accountId = await currentAccountId();
  const bot = accountId ? await readBotCabinet(getRuntime().pool, (await params).botId, accountId) : null;
  if (!bot) notFound();
  return <BotScreen botId={bot.bot_id} companyName={bot.company_name} contact={bot.contact ?? ''} greeting={bot.greeting}
    sources={bot.sources.map((s) => ({ source_id: s.source_id, kind: s.kind, title: s.title, job: s.job }))} />;
}
