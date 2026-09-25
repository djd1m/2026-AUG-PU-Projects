import { headers } from 'next/headers';
import { themeFromCookie, type Theme } from '../lib/theme';
// Reads the raw Cookie header so the server and /c/, /g/ share one parser (themeFromCookie).
export async function requestTheme(): Promise<Theme> {
  return themeFromCookie((await headers()).get('cookie') ?? undefined);
}
