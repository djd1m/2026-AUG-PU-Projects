// Каркас фронта (AC-foundation-12).
//
// Страница отрисовывается в строку тем же React, что и на сервере: поднимать Next ради
// проверки разметки означало бы проверять Next, а не свой экран.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CameraFirstScreen from '../../apps/web/app/page.js';

const ROOT = new URL('../../', import.meta.url);

describe('экран камеры', () => {
  it('корневой маршрут отдаёт видоискатель и две подписи режимов', () => {
    const html = renderToStaticMarkup(<CameraFirstScreen />);

    expect(html).toContain('<video');
    expect(html).toContain('aria-label="видоискатель"');

    // РОВНО две подписи режимов, не больше: третий режим — это другой экран.
    const modes = html.match(/class="modes__item[^"]*">([^<]+)</g) ?? [];
    expect(modes).toHaveLength(2);
    expect(html).toContain('>съёмка<');
    expect(html).toContain('>галерея<');

    // Ни анкеты, ни регистрации до съёмки: форм на этом экране нет вовсе.
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<input');
    expect(html.toLowerCase()).not.toContain('регистрац');
  });
});

describe('исходники фронта', () => {
  // Проверка манифеста ПЕРЕЕХАЛА в tests/integration/web-manifest.test.ts и выполняется
  // теперь HTTP-запросом к собранному приложению: вызов функции `manifest()` оставался
  // зелёным при неверном HTTP-пути (RV-foundation-03), то есть проверял наш код, а не то,
  // что увидит браузер.

  it('в исходниках web нет ни одного секрета вызова наружу', async () => {
    // Сервис, которому нечем позвать модель, её не позовёт — и это проверяемо чтением.
    const { readdir } = await import('node:fs/promises');
    const base = fileURLToPath(new URL('apps/web', ROOT));
    const collected: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue;
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) await walk(full);
        else if (/\.(ts|tsx|js|mjs|json)$/.test(entry.name)) collected.push(await readFile(full, 'utf8'));
      }
    };
    await walk(base);

    for (const source of collected) {
      expect(source).not.toContain('ANTHROPIC_API_KEY');
      expect(source).not.toContain('TELEGRAM_BOT_TOKEN');
    }
  });
});
