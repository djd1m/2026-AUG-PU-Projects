// GET /f/<slug> — форма сбора отзыва (FR-002).
//
// Текст (FR-002) и видео (FR-003). Загрузка ФОТО к текстовому отзыву из AC FR-002
// ещё не реализована — колонка photo_url в схеме есть, интерфейс загрузки нет.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { findProjectBySlug } from '@/lib/project';
import { readBranding } from '@/lib/branding';
import { IntakeTabs } from './intake-tabs';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  // Страница сбора не для поиска — она приходит по прямой ссылке от владельца.
  return { title: `Оставить отзыв — ${slug}`, robots: { index: false, follow: false } };
}

export default async function FormPage({ params }: Params) {
  const { slug } = await params;
  const project = await findProjectBySlug(slug);
  if (!project) notFound();

  const branding = readBranding(project.branding);

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '3rem 1.25rem' }}>
      {branding.logo_url && (
        // eslint-disable-next-line @next/next/no-img-element -- логотип владельца с произвольного
        // домена; next/image потребовал бы заранее объявленного allowlist'а хостов.
        <img
          src={branding.logo_url}
          alt=""
          style={{ maxHeight: 48, marginBottom: '1rem', display: 'block' }}
        />
      )}
      {/* heading подставляется через {} — React экранирует его сам, разметка владельца
          не станет разметкой страницы. */}
      <h1 style={{ fontSize: '1.5rem', color: branding.accent_color }}>{branding.heading}</h1>

      <IntakeTabs slug={project.slug} branding={branding} />
    </main>
  );
}
