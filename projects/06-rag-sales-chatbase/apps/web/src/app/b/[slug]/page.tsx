// Демо-страница бота /b/{slug} без входа (фича public-page-and-summary; FR-GROWTH-005, SC-US-013-1/2/3; Pseudocode
// PublishPublicPage п.2–3). SSR: снятая публикация, неактивный бот или владелец, бот без контакта и непригодный слаг —
// notFound() → 404, одинаково с несуществующим. Индексация — только по явному флагу владельца: иначе
// <meta name="robots" content="noindex, nofollow"> (A-N6-038 (2): заголовок X-Robots-Tag ставит общий прокси стенда).
// Чат — тот же бандл виджета с data-open: CheckOrigin пропускает свой origin только при public_enabled (check-origin.ts),
// вопросы идут через /w/v1/ask с той же квотой из 5 scope; установкой свой origin не считается (SC-US-009-2).
import { cache } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { loadPublicPage, recordPublicPageView } from '@n6/db';
import { getRuntime } from '../../../server/runtime';
import { clientIp, ipPrefix } from '../../../server/ip';
import { readWidgetBundleFile } from '../../../server/widget-bundle';
import { requestTheme } from '../../theme-server';
import { PublicPageView, publicPageMetadata } from './PublicPageView';
export const dynamic = 'force-dynamic';

const load = cache(async (slug: string) => loadPublicPage(getRuntime().pool, slug));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return publicPageMetadata(await load((await params).slug));
}

export default async function PublicBotPage({ params }: { params: Promise<{ slug: string }> }) {
  const page = await load((await params).slug);
  if (!page) notFound();
  // Просмотр — одна строка на (бот, /24, сутки); сбой записи метрики страницу не отнимает.
  try { await recordPublicPageView(getRuntime().pool, page.botId, ipPrefix(clientIp(await headers()))); }
  catch { console.error('Демо-страница: событие public_page_view не записано'); }
  const bundle = await readWidgetBundleFile();
  if (!bundle) console.error('Демо-страница: бандл виджета не собран — чат на странице не появится');
  return <>
    <PublicPageView theme={await requestTheme()} slug={page.slug} companyName={page.companyName} greeting={page.greeting} />
    {bundle && <script src={`/w/${bundle}`} data-bot={page.publicKey} data-open="true" async />}
  </>;
}
