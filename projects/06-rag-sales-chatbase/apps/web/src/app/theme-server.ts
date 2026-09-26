// из N5: projects/05-podcast-clips-opus/apps/web/src/app/theme-server.ts (коммит 90fe80a) — без изменений логики.
import { headers } from 'next/headers';
import { themeFromCookie, type Theme } from '../lib/theme';
// Читает сырой заголовок Cookie, чтобы сервер и будущие SSR-страницы (/b/{slug}) делили один разборщик.
export async function requestTheme(): Promise<Theme> {
  return themeFromCookie((await headers()).get('cookie') ?? undefined);
}
