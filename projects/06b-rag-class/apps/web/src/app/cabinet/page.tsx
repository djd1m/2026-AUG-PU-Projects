// Кабинет: боты аккаунта, их источники и состояние последней задачи индексации (фича index-jobs, SC-US-004-1…3).
// Сессия проверяется служебным пулом (таблица session кабинету не выдана), данные читаются пулом кабинета под RLS —
// колонку password_hash роль кабинета не видит (foundation F-4). Создание бота — следующие фичи дорожной карты.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { type CabinetSource, listCabinetSources, withTenant } from '@n6b/db';
import { SESSION_COOKIE, sessionTokenOrNull } from '@/server/auth-handler';
import { getRuntime } from '@/server/runtime';
import { CreateBot } from './create-bot';
import { AddSource } from './add-source';
import { JobStatus } from './job-status';
import { LogoutButton } from './logout-button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Кабинет — RAG-бот для сайта' };

function byBot(rows: CabinetSource[]): Array<{ id: string; name: string; sources: CabinetSource[] }> {
  const bots = new Map<string, { id: string; name: string; sources: CabinetSource[] }>();
  for (const row of rows) {
    const bot = bots.get(row.bot_id) ?? { id: row.bot_id, name: row.bot_name, sources: [] };
    if (row.source_id) bot.sources.push(row);
    bots.set(row.bot_id, bot);
  }
  return [...bots.values()];
}

export default async function CabinetPage() {
  const token = sessionTokenOrNull((await cookies()).get(SESSION_COOKIE)?.value);
  const { auth, tenantPool } = getRuntime();
  const accountId = token ? await auth.authenticate(token) : null;
  if (!accountId) redirect('/login');
  const account = await withTenant(tenantPool, accountId, async (c) => (await c.query<{ email: string | null; plan: string }>(
    'SELECT email, plan FROM account WHERE id = $1', [accountId])).rows[0]);
  if (!account) redirect('/login');
  const bots = byBot(await listCabinetSources(tenantPool, accountId));

  return (
    <main className="cabinet">
      <header className="cabinet-head">
        <h1>Кабинет</h1>
        <LogoutButton />
      </header>
      <p>Вы вошли как <strong>{account.email ?? 'подаккаунт студии'}</strong>.</p>
      <CreateBot />
      {bots.length === 0 && <p>Ботов пока нет. Укажите имя и адрес сайта выше.</p>}
      {bots.map((bot) => (
        <section key={bot.id} className="bot-card">
          <h2>{bot.name}</h2>
          {bot.sources.map((s) => (
            <div key={s.source_id} className="source-row">
              <p className="source-locator">{s.locator}</p>
              {s.job ? <JobStatus key={`${s.job.job_id}-${s.job.state}`} initial={s.job} />
                : <p className="job-detail">Задач индексации ещё не было.</p>}
            </div>
          ))}
          <AddSource botId={bot.id} busy={bot.sources.some((s) => s.job?.state === 'running')} />
        </section>
      ))}
    </main>
  );
}
