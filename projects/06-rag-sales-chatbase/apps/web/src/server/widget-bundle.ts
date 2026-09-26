// Бандл виджета: имя для кода установки (Pseudocode InstallSnippet п.2: «hash — из манифеста сборки») и раздача
// `GET /w/widget.<hash>.js` (канон §5). Контракт с apps/widget/scripts/build.mjs: рядом с бандлом лежит
// manifest.json вида { "file": "widget.<hex>.js" } в apps/web/widget-bundle/ (НЕ public/, A-N6-034).
// Нет манифеста или он непригоден — null: экран установки говорит «виджет ещё не собран», а не выдаёт тег на
// несуществующий файл (silent-fallbacks), и маршрут бандла отвечает 404.
//
// СТАРЫЙ ХЭШ (carry_over bot-cabinet, решено до выпуска). Тег с хэшем уже вставлен на сайты клиентов; новый выпуск
// меняет хэш. Если бы старое имя давало 404, каждый выпуск молча снимал бы виджет со ВСЕХ сайтов. Поэтому любое
// имя формы widget.<hex>.js, кроме текущего, получает ТЕКУЩИЙ бандл с коротким кэшем (5 мин), а текущее — с
// `immutable` на год. API версионировано (/w/v1), так что старый тег с новым кодом совместим по построению.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WIDGET_BUNDLE_FILE } from '@n6/rag/bot-settings';

const CANDIDATES = ['apps/web/widget-bundle', 'widget-bundle'];
export interface WidgetBundle { file: string; code: Buffer }

async function readManifest(dir: string): Promise<string | null | undefined> {
  let text: string;
  try { text = await readFile(join(dir, 'manifest.json'), 'utf8'); } catch { return undefined; }
  try {
    const file: unknown = (JSON.parse(text) as { file?: unknown }).file;
    return typeof file === 'string' && WIDGET_BUNDLE_FILE.test(file) ? file : null;
  } catch { return null; }
}

export async function readWidgetBundleFile(cwd = process.cwd()): Promise<string | null> {
  for (const candidate of CANDIDATES) {
    const file = await readManifest(join(cwd, candidate));
    if (file !== undefined) return file;
  }
  return null;
}

export async function readWidgetBundle(cwd = process.cwd()): Promise<WidgetBundle | null> {
  for (const candidate of CANDIDATES) {
    const dir = join(cwd, candidate);
    const file = await readManifest(dir);
    if (file === undefined) continue;
    if (file === null) return null;
    try { return { file, code: await readFile(join(dir, file)) }; } catch { return null; }
  }
  return null;
}

const IMMUTABLE = 'public, max-age=31536000, immutable';
const SHORT = 'public, max-age=300';
export function createWidgetBundleHandler(read: () => Promise<WidgetBundle | null>) {
  return async (_request: Request, file: string): Promise<Response> => {
    if (!WIDGET_BUNDLE_FILE.test(file)) return new Response('Not found', { status: 404 });
    const bundle = await read();
    if (!bundle) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return new Response(new Uint8Array(bundle.code), { status: 200, headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': file === bundle.file ? IMMUTABLE : SHORT,
      // Хозяин с COEP require-corp иначе не загрузит скрипт другого origin.
      'Cross-Origin-Resource-Policy': 'cross-origin',
    } });
  };
}
