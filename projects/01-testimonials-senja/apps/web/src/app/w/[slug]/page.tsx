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

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.25rem' }}>
      {items.length > 0 && (
        <script
          type="application/ld+json"
          // Единственный dangerouslySetInnerHTML в приложении. Безопасность держится
          // не на React, а на safeJsonLd — см. комментарий там и тесты wall.test.ts.
          dangerouslySetInnerHTML={{ __html: safeJsonLd(buildReviewJsonLd(project.slug, pageUrl, items)) }}
        />
      )}

      <header>
        {branding.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element -- логотип с произвольного домена
          <img src={branding.logo_url} alt="" style={{ maxHeight: 48, marginBottom: '1rem', display: 'block' }} />
        )}
        <h1 style={{ fontSize: '1.75rem', color: branding.accent_color, marginBottom: '0.25rem' }}>
          Отзывы
        </h1>
        <p style={{ color: '#666', marginTop: 0 }}>
          {items.length > 0 ? `${items.length} шт.` : 'Пока ни одного одобренного отзыва'}
        </p>
      </header>

      {items.length === 0 ? (
        <section
          style={{
            marginTop: '2rem',
            padding: '2rem',
            border: '1px dashed #d0d0d0',
            borderRadius: 12,
            textAlign: 'center',
            color: '#666',
          }}
        >
          <p style={{ margin: 0 }}>Здесь появятся отзывы после проверки владельцем.</p>
          <p style={{ margin: '0.5rem 0 0' }}>
            Оставить свой: <code>/f/{project.slug}</code>
          </p>
        </section>
      ) : (
        <div style={{ display: 'grid', gap: '1rem', marginTop: '2rem' }}>
          {items.map((item) => (
            <article
              key={item.id}
              itemScope
              itemType="https://schema.org/Review"
              style={{ border: '1px solid #e8e8e8', borderRadius: 12, padding: '1.25rem' }}
            >
              {item.text && (
                <p itemProp="reviewBody" style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '1.05rem' }}>
                  {item.text}
                </p>
              )}

              {item.has_video && item.transcript && (
                <p style={{ margin: item.text ? '0.75rem 0 0' : 0, color: '#555', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                  🎥 {item.transcript}
                </p>
              )}
              {item.has_video && !item.transcript && (
                <p style={{ margin: item.text ? '0.75rem 0 0' : 0, color: '#888' }}>🎥 Видео-отзыв</p>
              )}

              <footer
                itemProp="author"
                itemScope
                itemType="https://schema.org/Person"
                style={{ marginTop: '1rem', fontSize: '0.95rem' }}
              >
                <strong itemProp="name">{item.author_name}</strong>
                {item.author_role && (
                  <span itemProp="jobTitle" style={{ color: '#666' }}>
                    {' '}· {item.author_role}
                  </span>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
