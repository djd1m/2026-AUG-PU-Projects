// GET /dashboard — вход в кабинет без указания проекта.
//
// ЗАЧЕМ ОН НУЖЕН. Кабинет живёт по адресу /dashboard/<проект>, и без этой страницы голый
// /dashboard отдавал 404 «This page could not be found» — тупик без объяснения, ровно там, куда
// человек приходит по памяти или по закладке. Найдено владельцем продукта, а не проверкой:
// он открыл /dashboard/ и увидел 404 на работающем стенде.
//
// Класс тот же, что у BASE_URL и у ссылок на localhost: система ведёт себя «правильно» по
// каждому отдельному маршруту и неверно — по тому, который человек набирает руками.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';

import { withAccount } from '@proofwall/db';
import { currentAccountId } from '@/lib/current-session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Кабинет — Proofwall', robots: { index: false } };

// У проектов есть ТОЛЬКО slug — отдельного названия в схеме нет. Первая редакция
// запрашивала колонку name, которой не существует, и страница падала с 500 на живом
// стенде. Схему надо смотреть, а не помнить.
interface Row { slug: string }

export default async function DashboardIndex() {
  const accountId = await currentAccountId();
  // Адрес возврата сохраняется: после входа человек попадает туда, куда шёл, а не на главную.
  if (!accountId) redirect('/login?next=/dashboard');

  const projects = await withAccount(accountId, async (client) => {
    const { rows } = await client.query<Row>(
      'select slug from projects where account_id = $1 and deactivated = false order by created_at',
      [accountId],
    );
    return rows;
  });

  // Один проект — не показываем список из одного пункта, а ведём сразу в него: выбор без
  // альтернатив это не выбор, а лишний экран.
  if (projects.length === 1) redirect(`/dashboard/${projects[0]!.slug}`);

  if (projects.length === 0) {
    return (
      <main className="page">
        <h1>Кабинет</h1>
        <p>У вас пока нет ни одного проекта.</p>
        <p><Link href="/">Создать проект</Link></p>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Ваши проекты</h1>
      <ul className="stack">
        {projects.map((p) => (
          <li key={p.slug}>
            <Link href={`/dashboard/${p.slug}`}>{p.slug}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
