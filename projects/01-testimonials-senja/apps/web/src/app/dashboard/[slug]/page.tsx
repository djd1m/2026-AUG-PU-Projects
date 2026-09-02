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
import { ModerationList, type Item } from './moderation-list';
import { ChangePassword } from './change-password';
import { PlatformForm } from './platform-form';
import { ImportForm } from './import-form';
import { ShareCta, type Install } from './share-cta';
import { isPaid, isTier, tierSummary } from '@/lib/tariff';
import { BillingBlock } from './billing-block';

/** Та же цена, что в /api/checkout: одно значение, читаемое из одного места. */
const PRICE_RUB = Number(process.env.PAID_TIER_PRICE_RUB ?? '990');

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Дашборд — Proofwall',
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ slug: string }> };

export default async function DashboardPage({ params }: Params) {
  const { slug } = await params;
  const accountId = await currentAccountId();
  // FR-009.3: без сессии — на вход, а не на витрину продукта. До FR-009 здесь стоял
  // redirect('/'), и владелец с истёкшей сессией просто попадал на лендинг без всякого
  // способа вернуться: входа не существовало.
  if (!accountId) redirect(`/login?next=/dashboard/${encodeURIComponent(slug)}`);

  // Обе выборки — в ОДНОЙ транзакции под app_authenticated: RLS фильтрует их сама,
  // отдельного `where account_id` нет намеренно (Architecture §3.1).
  const data = await withAccount(accountId, async (client) => {
    const { rows } = await client.query<{ id: string; slug: string; tier: string; paid_until: Date | null }>(
      'select id, slug, tier, paid_until from projects where slug = $1',
      [slug],
    );
    const project = rows[0] ?? null;
    if (!project) return null;

    const items = await client.query<Item>(
      `select id, status, author_name, author_role, text, transcript, photo_url,
              source, source_platform, source_url, screenshot_object_key,
              (video_object_key is not null) as has_video,
              created_at
         from testimonials
        where project_id = $1
        order by (status = 'pending') desc, created_at desc`,
      [project.id],
    );
    // Домены, где виджет уже отрендерился — источник share-CTA (FR-GROWTH-001).
    const installs = await client.query<Install>(
      `select domain, first_seen_at from widget_installs
        where project_id = $1 order by first_seen_at desc`,
      [project.id],
    );
    return { project, items: items.rows, installs: installs.rows };
  });

  const project = data?.project ?? null;

  // Чужой проект RLS не вернёт — для владельца это неотличимо от «не существует».
  if (!project) notFound();

  const urls = buildProjectUrls(project.slug);
  // Ярлык тарифа считается по ДЕЙСТВУЮЩЕЙ оплате, а не по одной колонке tier: просроченный
  // платный обязан выглядеть бесплатным везде, иначе кабинет утверждает одно, а виджет
  // показывает badge — и владелец узнаёт правду от клиента.
  const paidNow = isPaid(project.tier, project.paid_until);
  const tier = tierSummary(paidNow ? 'paid' : 'free');
  void isTier;
  const pending = data?.items.filter((i) => i.status === 'pending').length ?? 0;

  return (
    <main className="stage">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">◆</span>
        Proofwall
      </div>

      <div className="card">
        <div className="between">
          <div>
            <p className="eyebrow">Проект</p>
            <h1>{project.slug}</h1>
          </div>
          <span className={`chip ${paidNow ? 'chip--accent' : ''}`}>
            {tier.label}
          </span>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>{tier.badge}</p>

        <hr className="divider" />

        <h2>Ссылки</h2>
        <div className="links">
          <LinkRow label="Форма сбора" hint="дайте её клиенту" href={urls.submission_form} />
          <LinkRow label="Стена любви" hint="публичная страница" href={urls.wall_of_love} />
        </div>

        <h2 style={{ marginTop: 32 }}>Виджет на свой сайт</h2>
        <p className="small muted" style={{ marginTop: 6, marginBottom: 12 }}>
          Один тег в любое место разметки. Отзывы появятся там же, где вы его вставите.
        </p>
        {/* Вставляется как текст через {}, React экранирует сам — угловые скобки сниппета
            не станут разметкой (правило экранирования при рендере, FR-002/005/006). */}
        <pre className="snippet"><code>{urls.widget_snippet}</code></pre>

        <BillingBlock
          slug={project.slug}
          priceRub={PRICE_RUB}
          paidUntil={paidNow && project.paid_until
            ? new Date(project.paid_until).toLocaleDateString('ru-RU')
            : null}
        />

        <ShareCta slug={project.slug} wallUrl={urls.wall_of_love} installs={data?.installs ?? []} />

        <hr className="divider" />

        <div className="between" style={{ marginBottom: 16 }}>
          <h2>Отзывы</h2>
          {pending > 0 && <span className="chip chip--warn">{pending} на проверке</span>}
        </div>
        <ModerationList initial={data?.items ?? []} />

        <hr className="divider" />

        <h2>Пароль</h2>
        <p className="small muted" style={{ marginTop: 6 }}>
          Смена пароля завершает сессии на ВСЕХ устройствах, включая это, и тут же
          выдаёт этому браузеру новую. Так украденная cookie перестаёт работать.
        </p>
        <ChangePassword />

        <hr className="divider" />

        <h2>Отзыв с внешней площадки</h2>
        <p className="small muted" style={{ marginTop: 6 }}>
          Вам уже написали на Яндекс.Картах, в 2ГИС или где-то ещё? Перенесите отзыв сюда:
          укажите ссылку на него, приложите снимок экрана — или и то и другое. На карточке
          будет видно, откуда он, и ссылка на первоисточник. Отзыв попадёт в очередь на
          проверку, как и присланный через форму.
        </p>
        <PlatformForm slug={project.slug} />

        <hr className="divider" />

        <h2>Импорт отзывов</h2>
        <p className="small muted" style={{ marginTop: 6 }}>
          Загрузите CSV с отзывами, которые у вас уже есть. Сначала — предпросмотр: он
          покажет, что будет импортировано и что отклонено. Импортированное попадает в
          очередь на проверку, как и присланное через форму.
        </p>
        <ImportForm slug={project.slug} />
      </div>
    </main>
  );
}

function LinkRow({ label, hint, href }: { label: string; hint: string; href: string }) {
  return (
    <div className="linkRow">
      <div className="linkRow__meta">
        <strong>{label}</strong>
        <span className="small muted">{hint}</span>
      </div>
      <a href={href} className="linkRow__url">{href}</a>
    </div>
  );
}
