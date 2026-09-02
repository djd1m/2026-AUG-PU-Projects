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
import { platformFrom } from '@/lib/platform-proof';

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

      {items.some((t) => t.source === 'demo') && (
        /* ОТМЕТКА ДЕМОНСТРАЦИИ. Не украшение и не перестраховка: сочинённый отзыв,
           выданный за настоящий, — это FTC Rule 16 CFR Part 465, до $53 088 за нарушение
           (см. .claude/rules/security.md §5). Отметка привязана к ДАННЫМ, а не к слагу
           проекта: убрали демо-строки — она исчезла сама, без правки кода, и наоборот
           не забудется, если демо-данные заведут в другом проекте. */
        <p
          className="small"
          role="note"
          style={{
            margin: '0 0 16px', padding: '10px 14px', borderRadius: 10,
            background: 'var(--accent-tint)', color: 'var(--ink)', fontWeight: 600,
          }}
        >
          Демонстрация. Отзывы ниже сочинены для показа витрины и не принадлежат реальным людям.
        </p>
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

              {item.screenshot_object_key && (
                // Снимок экрана — СОДЕРЖИМОЕ карточки, а не аватар: в слоте аватара
                // (38 пикселей, кружок) отзыв с чужой площадки превратился бы в нечитаемую
                // точку. Открывается в полный размер отдельной вкладкой.
                <a
                  className="quote__shot"
                  href={`/api/photo/${item.screenshot_object_key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- наш роут /api/photo:
                      тип определяется по сигнатуре содержимого и отдаётся с nosniff. */}
                  <img
                    src={`/api/photo/${item.screenshot_object_key}`}
                    alt="Снимок отзыва на площадке"
                    loading="lazy"
                  />
                </a>
              )}

              {item.source === 'platform' && (
                // Пометка источника стоит ВСЕГДА у перенесённого отзыва, даже когда ссылки
                // нет: читатель обязан понимать, что смотрит на перенесённое, а не на
                // написанное здесь. Ссылка делает пометку проверяемой, её отсутствие не
                // отменяет обязанности пометить.
                <p className="quote__origin">
                  {item.source_url ? (
                    <a href={item.source_url} target="_blank" rel="nofollow noopener noreferrer">
                      Отзыв с {platformFrom(item.source_platform) ?? 'внешней площадки'} →
                    </a>
                  ) : (
                    <>Отзыв с {platformFrom(item.source_platform) ?? 'внешней площадки'}</>
                  )}
                </p>
              )}

              {/* Блок автора пропускается целиком, когда имени нет: у отзыва, принесённого
                  снимком, автор виден НА СНИМКЕ, и пустая строка с инициалом-заглушкой
                  сообщала бы читателю несуществующего человека. */}
              {item.author_name !== '' && (
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
              )}
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
