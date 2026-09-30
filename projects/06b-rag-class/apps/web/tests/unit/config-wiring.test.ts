import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PENDING_DECISIONS, WEB_REQUIRED } from '@/server/config';

// Страж CFG-I5 (honest-configuration): переменная, проверяемая при старте, обязана читаться решением.
// «Читается» — имя встречается в исходниках apps/web/src вне config.ts как поле конфигурации (config.NAME).
// Переменные, чьё решение принадлежит следующей фиче, перечислены в PENDING_DECISIONS с id фичи дорожной карты.

const WEB_SRC = path.resolve(__dirname, '../../src');
const ROADMAP = path.resolve(__dirname, '../../../../.claude/feature-roadmap.json');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((item) => {
    const full = path.join(dir, item);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(item) && !full.endsWith(path.join('server', 'config.ts')) ? [full] : [];
  });
}

function readByDecision(name: string): boolean {
  const pattern = new RegExp(`\\bconfig\\.${name}\\b`);
  return sources(WEB_SRC).some((file) => pattern.test(readFileSync(file, 'utf8')));
}

describe('CFG-I5: каждая переменная старта читается решением', () => {
  const roadmapIds = new Set((JSON.parse(readFileSync(ROADMAP, 'utf8')) as { features: { id: string }[] })
    .features.map((f) => f.id));

  it.each(WEB_REQUIRED.map((v) => v.name))('%s: читается решением или названа фича, которая его подключит', (name) => {
    const pending = PENDING_DECISIONS[name];
    if (pending === undefined) {
      expect(readByDecision(name), `${name} проверяется при старте, но ни одно решение его не читает`).toBe(true);
    } else {
      expect(roadmapIds.has(pending), `${name}: фича ${pending} не существует в дорожной карте`).toBe(true);
      expect(readByDecision(name), `${name} уже читается решением — удалите его из PENDING_DECISIONS`).toBe(false);
    }
  });

  it('в PENDING_DECISIONS нет имён вне закрытого списка', () => {
    const names = new Set(WEB_REQUIRED.map((v) => v.name));
    expect(Object.keys(PENDING_DECISIONS).filter((n) => !names.has(n))).toEqual([]);
  });

  it('предел входа подключён: LIMIT_AUTH_ADDR_HOUR не в списке ожидания', () => {
    expect(PENDING_DECISIONS.LIMIT_AUTH_ADDR_HOUR).toBeUndefined();
  });
});
