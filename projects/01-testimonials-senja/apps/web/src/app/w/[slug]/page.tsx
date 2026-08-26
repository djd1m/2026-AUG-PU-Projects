// GET /w/<slug> — публичная «Стена любви».
//
// В рамках FR-001 страница обязана лишь СУЩЕСТВОВАТЬ с момента создания проекта и
// показывать пустое состояние, а не 404 (AC FR-001: «Все три доступны сразу, до первого
// отзыва»). Рендер одобренных отзывов, schema.org/Review и порог индексации — FR-005
// и FR-GROWTH-005, здесь намеренно не реализуются.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { findProjectBySlug } from '@/lib/project';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const project = await findProjectBySlug(slug);
  // noindex по умолчанию у нового проекта (FR-GROWTH-005): пустая стена не должна попадать
  // в индекс как страница-пустышка.
  return {
    title: `Отзывы — ${slug}`,
    robots: project?.noindex === false ? undefined : { index: false, follow: false },
  };
}

export default async function WallPage({ params }: Params) {
  const { slug } = await params;
  const project = await findProjectBySlug(slug);

  // 404 ТОЛЬКО когда проекта нет. Существующий проект без отзывов — это пустое состояние.
  if (!project) notFound();

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.25rem' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Отзывы</h1>
      <p style={{ color: '#666', marginTop: 0 }}>/w/{project.slug}</p>

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
        <p style={{ margin: 0 }}>Пока ни одного одобренного отзыва.</p>
        <p style={{ margin: '0.5rem 0 0' }}>
          Ссылка для сбора: <code>/f/{project.slug}</code>
        </p>
      </section>
    </main>
  );
}
