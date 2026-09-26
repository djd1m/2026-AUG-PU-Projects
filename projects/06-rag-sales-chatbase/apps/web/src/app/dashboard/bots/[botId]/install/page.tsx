// Экран «Установка» (FR-BOT-002, SC-US-005-1/2/3): InstallSnippet решает сервер — без контакта кода нет.
import { notFound } from 'next/navigation';
import { readBotCabinet } from '@n6/db';
import { installSnippet } from '@n6/rag/bot-settings';
import { currentAccountId } from '../../../../../server/cabinet-session';
import { getRuntime } from '../../../../../server/runtime';
import { readWidgetBundleFile } from '../../../../../server/widget-bundle';
import { InstallScreen } from './InstallScreen';
export const dynamic = 'force-dynamic';
export default async function InstallPage({ params }: { params: Promise<{ botId: string }> }) {
  const accountId = await currentAccountId();
  const { pool, config } = getRuntime();
  const bot = accountId ? await readBotCabinet(pool, (await params).botId, accountId) : null;
  if (!bot) notFound();
  const snippet = installSnippet({ contact: bot.contact, publicKey: bot.public_key, publicOrigin: config.publicOrigin, bundleFile: await readWidgetBundleFile() });
  return <InstallScreen botId={bot.bot_id} companyName={bot.company_name} snippet={snippet} origins={bot.origins} />;
}
