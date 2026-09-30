// Кабинет-заглушка (08_review.md F-9): куда ведёт вход. Боты, источники и песочница — следующие фичи дорожной карты.
// Сессия проверяется служебным пулом (таблица session кабинету не выдана), e-mail читается пулом кабинета под RLS —
// колонку password_hash роль кабинета не видит (F-4).
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { withTenant } from '@n6b/db';
import { SESSION_COOKIE, sessionTokenOrNull } from '@/server/auth-handler';
import { getRuntime } from '@/server/runtime';
import { LogoutButton } from './logout-button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Кабинет — RAG-бот для сайта' };

export default async function CabinetPage() {
  const token = sessionTokenOrNull((await cookies()).get(SESSION_COOKIE)?.value);
  const { auth, tenantPool } = getRuntime();
  const accountId = token ? await auth.authenticate(token) : null;
  if (!accountId) redirect('/login');
  const account = await withTenant(tenantPool, accountId, async (c) => (await c.query<{ email: string | null; plan: string }>(
    'SELECT email, plan FROM account WHERE id = $1', [accountId])).rows[0]);
  if (!account) redirect('/login');

  return (
    <main className="cabinet">
      <header className="cabinet-head">
        <h1>Кабинет</h1>
        <LogoutButton />
      </header>
      <p>Вы вошли как <strong>{account.email ?? 'подаккаунт студии'}</strong>.</p>
      <p>Здесь появятся ваши боты: добавление сайта и PDF, песочница и код вставки.</p>
    </main>
  );
}
