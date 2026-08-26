// GET /f/<slug> — форма сбора отзыва.
//
// FR-001 требует, чтобы адрес работал сразу после создания проекта. Сами поля формы,
// приём текста и видео, брендирование и rate limit — FR-002 и FR-003.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { findProjectBySlug } from '@/lib/project';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  // Страница сбора не предназначена для поиска — она приходит по прямой ссылке от владельца.
  return { title: `Оставить отзыв — ${slug}`, robots: { index: false, follow: false } };
}

export default async function FormPage({ params }: Params) {
  const { slug } = await params;
  const project = await findProjectBySlug(slug);

  if (!project) notFound();

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '3rem 1.25rem' }}>
      <h1 style={{ fontSize: '1.5rem' }}>Оставить отзыв</h1>
      <p style={{ color: '#666' }}>Проект: {project.slug}</p>

      <section
        style={{
          marginTop: '2rem',
          padding: '2rem',
          border: '1px dashed #d0d0d0',
          borderRadius: 12,
          color: '#666',
        }}
      >
        <p style={{ margin: 0 }}>Форма приёма отзывов подключается в FR-002 (текст) и FR-003 (видео).</p>
      </section>
    </main>
  );
}
