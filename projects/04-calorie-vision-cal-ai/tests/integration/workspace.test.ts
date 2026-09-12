// Каркас монорепо (AC-foundation-1).

import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../', import.meta.url);

async function exists(relative: string): Promise<boolean> {
  try {
    await stat(fileURLToPath(new URL(relative, ROOT)));
    return true;
  } catch {
    return false;
  }
}

describe('монорепо', () => {
  it('чистый клон собирается и перечисляет ровно пять workspace', async () => {
    const manifest = JSON.parse(await readFile(fileURLToPath(new URL('package.json', ROOT)), 'utf8'));
    expect(manifest.workspaces).toEqual(['apps/*', 'packages/*']);

    const expected = ['apps/web', 'apps/api', 'apps/recognizer', 'packages/db', 'packages/shared'];
    for (const workspace of expected) {
      expect(await exists(`${workspace}/package.json`), workspace).toBe(true);
    }

    // Ровно пять и НИ ОДНОГО лишнего: шестой пакет, попавший под маску `apps/*`,
    // уехал бы в образ незамеченным.
    const { readdir } = await import('node:fs/promises');
    const apps = await readdir(fileURLToPath(new URL('apps', ROOT)));
    const packages = await readdir(fileURLToPath(new URL('packages', ROOT)));
    expect([...apps.map((n) => `apps/${n}`), ...packages.map((n) => `packages/${n}`)].sort()).toEqual([...expected].sort());

    // Локфайл ОДИН и в корне проекта: из подкаталога `npm ci` невозможен, и контекст
    // сборки образов поэтому — корень.
    expect(await exists('package-lock.json')).toBe(true);
    for (const workspace of expected) {
      expect(await exists(`${workspace}/package-lock.json`), workspace).toBe(false);
    }

    // Команды, на которые опираются ворота фазы.
    for (const script of ['build', 'test', 'lint', 'typecheck', 'migrate', 'test:integration']) {
      expect(Object.keys(manifest.scripts), script).toContain(script);
    }
  });
});
