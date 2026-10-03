// Кабинет: боты аккаунта, их источники и состояние последней задачи индексации (фича index-jobs, SC-US-004-1…3).
// Сессия проверяется служебным пулом (таблица session кабинету не выдана), данные читаются пулом кабинета под RLS —
// колонку password_hash роль кабинета не видит (foundation F-4). Создание бота — следующие фичи дорожной карты.
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { listHandoverCandidates, listCabinetBots, listCabinetSources, planOf, readCabinetContext } from '@n6b/db';
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
import { StudioClients } from './studio-clients';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Кабинет — RAG-бот для сайта' };

export default async function CabinetPage({ searchParams }: {
  searchParams: Promise<{ account?: string | string[] }>;
}) {
  const token = sessionTokenOrNull((await cookies()).get(SESSION_COOKIE)?.value);
  const { auth, tenantPool, servicePool, config } = getRuntime();
  const accountId = token ? await auth.authenticate(token) : null;
  if (!accountId) redirect('/login');
  const selector = (await searchParams).account;
  if (selector !== undefined && (typeof selector !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selector))) notFound();
  const context = await readCabinetContext(tenantPool, accountId,
    typeof selector === 'string' ? selector.toLowerCase() : accountId);
  if (!context) notFound();
  const { actor: account, selected, clients } = context;
  const handoverCandidateIds = account.kind === 'studio' && account.parent_account_id === null
    ? await listHandoverCandidates(servicePool, accountId) : [];
  const [publicationBots, sources] = await Promise.all([
    listCabinetBots(tenantPool, accountId, selected.id), listCabinetSources(tenantPool, accountId, selected.id),
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
      {account.kind === 'studio' && account.parent_account_id === null &&
        <StudioClients handoverCandidateIds={handoverCandidateIds} clients={clients} selectedId={selected.id} actorId={accountId} />}
      {selected.id !== accountId && <p>Выбран клиент: {selected.email ?? `Клиент ${clients.findIndex((c) => c.id === selected.id) + 1}`}.</p>}
      {selected.id === accountId && planOf(account.plan) === 'free' && <BadgeRemoval />}
      <CreateBot accountId={selected.id} />
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
