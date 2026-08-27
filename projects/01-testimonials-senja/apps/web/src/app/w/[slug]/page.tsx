// GET /w/<slug> — публичная «Стена любви» (FR-005, Pseudocode §6).
//
// Серверный рендер без клиентского JS: страница должна читаться поисковиком и открываться
// без гидратации. Экранирование — ЗДЕСЬ (приём хранит разметку побайтово, FR-NFR-SEC-002);
// весь авторский текст выводится через {}, что React экранирует сам. Единственное
// исключение — JSON-LD, см. safeJsonLd.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { findProjectBySlug } from '@/lib/project';
import { readBranding } from '@/lib/branding';
import { buildReviewJsonLd, getApprovedTestimonials, safeJsonLd } from '@/lib/wall';
import { baseUrl } from '@/lib/urls';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const project = await findProjectBySlug(slug);
  return {
    title: `Отзывы — ${slug}`,
    // noindex снимается только порогом содержательности (FR-GROWTH-005, ADR-004).
    robots: project?.noindex === false ? undefined : { index: false, follow: false },
    alternates: { canonical: `${baseUrl()}/w/${slug}` },
  };
}

export default async function WallPage({ params }: Params) {
  const { slug } = await params;
  const project = await findProjectBySlug(slug);

  // 404 ТОЛЬКО когда проекта нет. Проект без одобренных отзывов — пустое состояние,
  // и noindex тоже не значит 404: страница всегда доступна людям по прямой ссылке.
  if (!project) notFound();

  const items = await getApprovedTestimonials(project.id);
  const branding = readBranding(project.branding);
  const pageUrl = `${baseUrl()}/w/${project.slug}`;
  const accent = branding.accent_color;

  return (
    <main className="stage stage--mid">
      {items.length > 0 && (
        <script
          type="application/ld+json"
          // Единственный dangerouslySetInnerHTML в приложении. Безопасность держится
          // не на React, а на safeJsonLd — см. комментарий там и тесты wall.test.ts.
          dangerouslySetInnerHTML={{ __html: safeJsonLd(buildReviewJsonLd(project.slug, pageUrl, items)) }}
        />
      )}

      <header className="wallHead">
        {branding.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element -- логотип с произвольного домена
          <img src={branding.logo_url} alt="" className="wallHead__logo" />
        )}
        <p className="eyebrow" style={{ color: 'var(--on-ink-dim)' }}>Стена любви</p>
        <h1 className="wallHead__title">Что говорят клиенты</h1>
        <p className="wallHead__count">
          {items.length > 0
            ? `${items.length} ${plural(items.length, 'отзыв', 'отзыва', 'отзывов')}`
            : 'Пока ни одного одобренного отзыва'}
        </p>
      </header>

      {items.length === 0 ? (
        <div className="card">
          <div className="empty">
            <p style={{ margin: 0, fontWeight: 600, color: 'var(--text)' }}>
              Здесь появятся отзывы после проверки владельцем.
            </p>
            <p style={{ margin: '8px 0 0' }}>
              Оставить свой: <code>/f/{project.slug}</code>
            </p>
          </div>
        </div>
      ) : (
        <div className="wall">
          {items.map((item) => (
            <article
              key={item.id}
              className="quote"
              itemScope
              itemType="https://schema.org/Review"
              style={{ ['--quote-accent' as string]: accent }}
            >
              <span className="quote__mark" aria-hidden="true">“</span>

              {item.text && (
                <p itemProp="reviewBody" className="quote__body">{item.text}</p>
              )}

              {item.has_video && item.transcript && (
                <p className="quote__transcript">
                  <span className="chip chip--accent">🎥 расшифровка</span> {item.transcript}
                </p>
              )}
              {item.has_video && !item.transcript && (
                <p className="quote__transcript"><span className="chip">🎥 видео-отзыв</span></p>
              )}

              <footer
                itemProp="author"
                itemScope
                itemType="https://schema.org/Person"
                className="quote__author"
              >
                {item.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- отдаётся нашим
                  // роутом /api/photo с проверкой содержимого и nosniff; next/image
                  // потребовал бы отдельной конфигурации для собственного же пути.
                  <img
                    src={item.photo_url}
                    alt=""
                    className="quote__avatar quote__avatar--photo"
                    loading="lazy"
                    width={38}
                    height={38}
                  />
                ) : (
                  <span className="quote__avatar" aria-hidden="true">
                    {initial(item.author_name)}
                  </span>
                )}
                <span>
                  <strong itemProp="name">{item.author_name}</strong>
                  {item.author_role && (
                    <span itemProp="jobTitle" className="quote__role">{item.author_role}</span>
                  )}
                </span>
              </footer>
            </article>
          ))}
        </div>
      )}

      <p className="wallFoot">
        Собрано через <a href={baseUrl()}>Proofwall</a>
      </p>
    </main>
  );
}

/** Первая буква имени для аватара-заглушки. Имя авторское — берём безопасно. */
function initial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
