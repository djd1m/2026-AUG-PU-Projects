// из N5: projects/05-podcast-clips-opus/apps/web/src/app/page.tsx (коммит 90fe80a) — + вход по бейджу / демо-странице
// (public-page-and-summary, FR-GROWTH-003): `?from=` принимается только закрытой формой (lib/arrival.ts); демо-страница —
// по имени компании, если она сейчас опубликована, иначе строки нет. Cookie прихода ставит middleware.ts.
import { loadPublicPage } from '@n6/db';
import { arrivalSlug, parseArrival } from '../lib/arrival';
import { getRuntime } from '../server/runtime';
import { Landing } from './Landing';
import { requestTheme } from './theme-server';

async function arrivalLine(raw: unknown): Promise<string | null> {
  const from = parseArrival(raw);
  if (!from) return null;
  const slug = arrivalSlug(from);
  if (!slug) return `Бот как на ${from} — для вашего сайта`;
  const page = await loadPublicPage(getRuntime().pool, slug).catch(() => null);
  return page ? `Бот как у «${page.companyName}» — для вашего сайта` : null;
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Landing theme={await requestTheme()} arrival={await arrivalLine((await searchParams).from)} />;
}
