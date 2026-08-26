// GET /f/<slug> — форма сбора отзыва (FR-002).
//
// Текст (FR-002) и видео (FR-003). Загрузка ФОТО к текстовому отзыву из AC FR-002
// ещё не реализована — колонка photo_url в схеме есть, интерфейса загрузки нет.

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
    <main className="stage stage--narrow">
      <div className="card" style={{ ['--brand' as string]: branding.accent_color }}>
        {branding.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element -- логотип владельца с произвольного
          // домена; next/image потребовал бы заранее объявленного allowlist'а хостов.
          <img src={branding.logo_url} alt="" className="formHead__logo" />
        )}
        {/* heading подставляется через {} — React экранирует его сам, разметка владельца
            не станет разметкой страницы. */}
        <h1 style={{ color: 'var(--brand)' }}>{branding.heading}</h1>
        <p className="lede" style={{ marginTop: 10 }}>
          Займёт минуту. Регистрироваться не нужно.
        </p>

        <IntakeTabs slug={project.slug} branding={branding} />
      </div>

      <p className="wallFoot">
        Отзывы собирает <a href="/">Proofwall</a>
      </p>
    </main>
  );
}
