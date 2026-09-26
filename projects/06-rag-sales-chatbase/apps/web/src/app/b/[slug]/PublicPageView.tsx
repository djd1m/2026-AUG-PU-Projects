// Разметка демо-страницы /b/{slug} (фича public-page-and-summary; FR-GROWTH-005, SC-US-013-1). Только разметка по
// пропсам: её же рендерит браузерный набор (tests/browser/public-page.test.ts). Текст страницы читается без JS
// (встроенные браузеры Telegram/VK); чат — тот же виджет, что на сайте клиента, открытый сразу (data-open), его тег
// ставит page.tsx. Кнопка «Сделать такого же» ведёт на лендинг с приходом from=b/{slug} (FR-GROWTH-006).
import type { Theme } from '../../../lib/theme';
import { SiteHeader } from '../../SiteHeader';

// SC-US-013-2: без явного флага владельца — noindex, nofollow; несуществующая страница — тоже закрыта от индекса.
// Тип структурный (совместим с Metadata Next): импорт типов next в модуль, который читают тесты, подмешивает в их
// программу глобальные типы Next (обязательный NODE_ENV) и ломает проверку чужого кода.
export interface PublicPageMetadata { title: string; robots: { index: boolean; follow: boolean } }
export function publicPageMetadata(page: { companyName: string; indexable: boolean } | null): PublicPageMetadata {
  if (!page) return { title: 'Страница не найдена — Суфлёр', robots: { index: false, follow: false } };
  return { title: `${page.companyName} — чат с ИИ-помощником`, robots: page.indexable ? { index: true, follow: true } : { index: false, follow: false } };
}

export interface PublicPageViewProps { theme: Theme; slug: string; companyName: string; greeting: string }
export function PublicPageView(p: PublicPageViewProps) {
  return <><SiteHeader theme={p.theme} />
    <main className="center container public-page stack">
      <p className="eyebrow">ИИ-помощник компании</p>
      <h1 className="page-title">{p.companyName}</h1>
      <p className="intro">Задайте вопрос в окне чата. Бот отвечает только по материалам компании и к каждому ответу показывает, откуда он взят.
        Если ответа в материалах нет — скажет «не знаю» и даст контакт компании.</p>
      {p.greeting && <p className="notice">{p.greeting}</p>}
      <noscript><p className="notice danger-notice">Чат работает с включённым JavaScript.</p></noscript>
      <p className="muted">Не сообщайте в чате паспортные и платёжные данные.</p>
      <section className="card stack" aria-labelledby="make-title">
        <h2 id="make-title">Нужен такой же бот для вашего сайта?</h2>
        <p>Вставьте адрес сайта — соберём бота по вашим страницам и покажем его в работе до регистрации.</p>
        <p><a className="button" href={`/?from=b/${p.slug}`}>Сделать такого же</a></p>
      </section>
    </main></>;
}
