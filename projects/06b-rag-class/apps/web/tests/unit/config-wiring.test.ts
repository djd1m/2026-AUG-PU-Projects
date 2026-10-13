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

interface RoadmapFeature { id: string; status?: string }

/**
 * Нарушения списка ожидания (08_review.md F-6). Имя в PENDING_DECISIONS законно, только пока его фича существует и
 * НЕ закрыта; закрытая фича с непрочитанным именем — это молча нарушенный CFG-I5, а прочитанное имя в списке — ложь списка.
 */
export function pendingViolations(pending: Readonly<Record<string, string>>, features: readonly RoadmapFeature[],
  isRead: (name: string) => boolean): string[] {
  const byId = new Map(features.map((f) => [f.id, f]));
  const violations: string[] = [];
  for (const [name, featureId] of Object.entries(pending)) {
    const feature = byId.get(featureId);
    if (!feature) violations.push(`${name}: фича ${featureId} не существует в дорожной карте`);
    else if (feature.status === 'done') {
      violations.push(`${name}: фича ${featureId} закрыта (done), а имя всё ещё в ожидании — подключите решение`);
    }
    if (isRead(name)) violations.push(`${name} уже читается решением — удалите его из PENDING_DECISIONS`);
  }
  return violations;
}

describe('CFG-I5: каждая переменная старта читается решением', () => {
  const features = (JSON.parse(readFileSync(ROADMAP, 'utf8')) as { features: RoadmapFeature[] }).features;

  it.each(WEB_REQUIRED.map((v) => v.name))('%s: читается решением или названа незакрытая фича, которая его подключит',
    (name) => {
      if (PENDING_DECISIONS[name] === undefined) {
        expect(readByDecision(name), `${name} проверяется при старте, но ни одно решение его не читает`).toBe(true);
      } else {
        expect(pendingViolations({ [name]: PENDING_DECISIONS[name]! }, features, readByDecision)).toEqual([]);
      }
    });

  it('в PENDING_DECISIONS нет имён вне закрытого списка', () => {
    const names = new Set(WEB_REQUIRED.map((v) => v.name));
    expect(Object.keys(PENDING_DECISIONS).filter((n) => !names.has(n))).toEqual([]);
  });

  it('MIN_SIMILARITY is fulfilled and consumed by a runtime decision', () => {
    expect(PENDING_DECISIONS.MIN_SIMILARITY).toBeUndefined();
    expect(readByDecision('MIN_SIMILARITY')).toBe(true);
  });

  it('предел входа подключён: LIMIT_AUTH_ADDR_HOUR не в списке ожидания', () => {
    expect(PENDING_DECISIONS.LIMIT_AUTH_ADDR_HOUR).toBeUndefined();
  });

  // Страж обязан уметь падать (guard-must-be-able-to-fail): каждый прогон подаёт ему заведомо плохой вход.
  it('F-6: страж падает — фича закрыта, имя не читается', () => {
    expect(pendingViolations({ LIMIT_X: 'spend-ceilings' }, [{ id: 'spend-ceilings', status: 'done' }], () => false))
      .toEqual([expect.stringContaining('закрыта (done)')]);
  });

  it('F-6: страж падает — имя уже читается, но осталось в ожидании; и фича не существует', () => {
    expect(pendingViolations({ LIMIT_X: 'spend-ceilings' }, [{ id: 'spend-ceilings', status: 'blocked' }], () => true))
      .toEqual([expect.stringContaining('уже читается')]);
    expect(pendingViolations({ LIMIT_X: 'nope' }, [], () => false))
      .toEqual([expect.stringContaining('не существует')]);
  });

  it('F-6: страж молчит на корректном входе — фича не закрыта, имя не читается', () => {
    expect(pendingViolations({ LIMIT_X: 'spend-ceilings' }, [{ id: 'spend-ceilings', status: 'next' }], () => false))
      .toEqual([]);
  });
});
