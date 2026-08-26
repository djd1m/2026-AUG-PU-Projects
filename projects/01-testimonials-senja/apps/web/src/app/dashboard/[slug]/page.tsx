// GET /dashboard/<slug> — то, ради чего FR-001 существует: владелец видит три адреса
// и сниппет виджета сразу после регистрации.
//
// Дашборд-путь: withAccount → роль app_authenticated + SET LOCAL app.current_account_id,
// RLS фильтрует строки сама. Отдельного `where account_id = ...` здесь нет намеренно —
// это и есть проверка того, что политики работают (Architecture §3.1).

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { withAccount } from '@proofwall/db';
import { currentAccountId } from '@/lib/current-session';
import { buildProjectUrls } from '@/lib/urls';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Дашборд — Proofwall',
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ slug: string }> };

export default async function DashboardPage({ params }: Params) {
  const { slug } = await params;
  const accountId = await currentAccountId();
  if (!accountId) redirect('/');

  const project = await withAccount(accountId, async (client) => {
    const { rows } = await client.query<{ slug: string; tier: string }>(
      'select slug, tier from projects where slug = $1',
      [slug],
    );
    return rows[0] ?? null;
  });

  // Чужой проект RLS не вернёт — для владельца это неотличимо от «не существует».
  if (!project) notFound();

  const urls = buildProjectUrls(project.slug);

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.25rem' }}>
      <h1 style={{ fontSize: '1.5rem' }}>Проект {project.slug}</h1>
      <p style={{ color: '#666', marginTop: 0 }}>Тариф: {project.tier}</p>

      <h2 style={{ fontSize: '1.1rem', marginTop: '2rem' }}>Ссылки</h2>
      <dl>
        <dt style={{ fontWeight: 600 }}>Форма сбора</dt>
        <dd style={{ marginLeft: 0, marginBottom: '1rem' }}>
          <a href={urls.submission_form}>{urls.submission_form}</a>
        </dd>
        <dt style={{ fontWeight: 600 }}>Стена любви</dt>
        <dd style={{ marginLeft: 0, marginBottom: '1rem' }}>
          <a href={urls.wall_of_love}>{urls.wall_of_love}</a>
        </dd>
      </dl>

      <h2 style={{ fontSize: '1.1rem' }}>Виджет на свой сайт</h2>
      {/* Вставляется как текст через {}, React экранирует сам — угловые скобки сниппета
          не станут разметкой (правило экранирования при рендере, FR-002/005/006). */}
      <pre
        style={{
          background: '#f6f6f6',
          padding: '1rem',
          borderRadius: 8,
          overflowX: 'auto',
          fontSize: '0.85rem',
        }}
      >
        <code>{urls.widget_snippet}</code>
      </pre>
    </main>
  );
}
