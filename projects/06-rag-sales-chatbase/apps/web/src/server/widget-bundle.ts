// Имя собранного бандла виджета для кода установки (Pseudocode InstallSnippet п.2: «hash — из манифеста сборки»).
// Контракт с фичей widget-runtime-and-badge: сборка кладёт рядом с бандлом apps/web/public/w/manifest.json вида
// { "file": "widget.<hex>.js" }. Нет манифеста или он непригоден — null, и экран установки честно говорит «виджет
// ещё не собран», а не выдаёт тег на несуществующий файл (silent-fallbacks).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WIDGET_BUNDLE_FILE } from '@n6/rag/bot-settings';
const CANDIDATES = ['apps/web/public/w/manifest.json', 'public/w/manifest.json'];
export async function readWidgetBundleFile(cwd = process.cwd()): Promise<string | null> {
  for (const candidate of CANDIDATES) {
    let text: string;
    try { text = await readFile(join(cwd, candidate), 'utf8'); } catch { continue; }
    try {
      const file: unknown = (JSON.parse(text) as { file?: unknown }).file;
      return typeof file === 'string' && WIDGET_BUNDLE_FILE.test(file) ? file : null;
    } catch { return null; }
  }
  return null;
}
