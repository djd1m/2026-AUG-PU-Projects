// Кабинет: боты аккаунта, их источники и состояние последней задачи индексации (фича index-jobs, SC-US-004-1…3).
// Сессия проверяется служебным пулом (таблица session кабинету не выдана), данные читаются пулом кабинета под RLS —
// колонку password_hash роль кабинета не видит (foundation F-4). Создание бота — следующие фичи дорожной карты.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { listCabinetBots, listCabinetSources, planOf, withTenant } from '@n6b/db';
import { SESSION_COOKIE, sessionTokenOrNull } from '@/server/auth-handler';
import { getRuntime } from '@/server/runtime';
import { publicationOrigins } from '@/server/origin';
import { publicationEmbedCode } from '@/server/publish-handler';
import { CreateBot } from './create-bot';
import { AddSource } from './add-source';
import { AddPdf } from './add-pdf';
import { JobStatus } from './job-status';
import { LogoutButton } from './logout-button';
import { BotInteractions } from './bot-interactions';
import { BadgeRemoval } from './badge-removal';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Кабинет — RAG-бот для сайта' };

export default async function CabinetPage() {
  const token = sessionTokenOrNull((await cookies()).get(SESSION_COOKIE)?.value);
  const { auth, tenantPool, config } = getRuntime();
  const accountId = token ? await auth.authenticate(token) : null;
  if (!accountId) redirect('/login');
  const account = await withTenant(tenantPool, accountId, async (c) => (await c.query<{ email: string | null; plan: string }>(
    'SELECT email, plan FROM account WHERE id = $1', [accountId])).rows[0]);
  if (!account) redirect('/login');
  const [publicationBots, sources] = await Promise.all([
    listCabinetBots(tenantPool, accountId), listCabinetSources(tenantPool, accountId),
  ]);
  const bots = publicationBots.map((bot) => ({ ...bot,
    sources: sources.filter((source) => source.bot_id === bot.id && source.source_id) }));

  return (
    <main className="cabinet">
      <header className="cabinet-head">
        <h1>Кабинет</h1>
        <LogoutButton />
      </header>
      <p>Вы вошли как <strong>{account.email ?? 'подаккаунт студии'}</strong>.</p>
      {planOf(account.plan) === 'free' && <BadgeRemoval />}
      <CreateBot />
      {bots.length === 0 && <p>Ботов пока нет. Укажите имя и адрес сайта выше.</p>}
      {bots.map((bot) => (
        <section key={bot.id} className="bot-card">
          <h2>{bot.name}</h2>
          {bot.sources.map((s) => (
            <div key={s.source_id} className="source-row">
              <p className="source-locator">{s.locator}</p>
              {s.job ? <JobStatus botId={bot.id} key={`${s.job.job_id}-${s.job.state}`} initial={s.job} />
                : <p className="job-detail">Задач индексации ещё не было.</p>}
            </div>
          ))}
          <AddSource botId={bot.id} busy={bot.sources.some((s) => s.job?.state === 'running')} />
          <AddPdf botId={bot.id} busy={bot.sources.some((s) => s.job?.state === 'running')}
            observedJobIds={bot.sources.flatMap((s) => s.job ? [s.job.job_id] : [])} />
          <BotInteractions initial={{ ...bot, embed_code: publicationEmbedCode(bot, config.PUBLIC_BASE_URL) }}
            proposedOrigins={publicationOrigins(bot)} />
        </section>
      ))}
    </main>
  );
}
