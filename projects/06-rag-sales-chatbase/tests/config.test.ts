// Образец — N5 projects/05-podcast-clips-opus/tests/config.test.ts; перечень — канон N6 §7 (14 QUOTA_*).
// FR-LIMIT-004 / Pseudocode LoadCeilings: отсутствие ЛЮБОЙ из 14 переменных валит старт web и
// worker-index — 14 отдельных прогонов на КАЖДЫЙ процесс, по одному на ИМЯ, а не на scope.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CEILING_PAIRS, QUOTA_NAMES, loadCeilings, loadWebConfig, loadWorkerConfig } from '../packages/rag/src/config';
import { environment } from './fixtures/environment';
import { subprocess } from './fixtures/subprocess';

const WEB = ['apps/web/.next/preflight/preflight.js'];
const WORKER = ['apps/worker/dist/index.js'];
// Единственный источник имён и чисел — канон §7; список в коде и тесте с ним СВЕРЯЕТСЯ, а не перепечатывается.
function canonCeilings(): Map<string, string> {
  const line = readFileSync('docs/canon.md', 'utf8').split('\n').find((l) => l.startsWith('Перечень переменных (14):'));
  if (!line) throw new Error('В каноне не найден перечень переменных — проверка НЕ ВЫПОЛНЕНА');
  return new Map([...line.matchAll(/`(QUOTA_[A-Z_]+)`=(\d+)/g)].map((m) => [m[1]!, m[2]!]));
}
beforeAll(() => {
  for (const project of ['packages/rag/tsconfig.json', 'apps/worker/tsconfig.json', 'apps/web/tsconfig.preflight.json']) {
    const result = subprocess(['node_modules/typescript/bin/tsc', '-p', project], process.env, 60000);
    expect(result.status, result.output).toBe(0);
  }
});

describe('Перечень потолков — один источник', () => {
  it('14 имён кода = 14 имён канона §7, значения фикстуры = значения канона', () => {
    const canon = canonCeilings();
    expect(canon.size).toBe(14);
    expect([...QUOTA_NAMES].sort()).toEqual([...canon.keys()].sort());
    const env = environment();
    for (const [name, value] of canon) expect(env[name], name).toBe(value);
  });
  it('docker-compose.yml x-quota-env требует все 14 через ${VAR:?} и ни одной лишней', () => {
    const compose = readFileSync('docker-compose.yml', 'utf8');
    const block = compose.split('x-quota-env: &quota-env')[1]!.split('\nservices:')[0]!;
    const names = [...block.matchAll(/^\s+(QUOTA_[A-Z_]+): \$\{(QUOTA_[A-Z_]+):\?/gm)].map((m) => { expect(m[1]).toBe(m[2]); return m[1]!; });
    expect(names.sort()).toEqual([...QUOTA_NAMES].sort());
    // web и worker-index подключают этот якорь
    expect(compose.match(/<<: \[\*app-env, \*model-env, \*quota-env\]/g)).toHaveLength(2);
  });
  it('.env.example объявляет все 14 со значениями канона', () => {
    const example = readFileSync('.env.example', 'utf8');
    for (const [name, value] of canonCeilings()) expect(example).toMatch(new RegExp(`^${name}=${value}$`, 'm'));
  });
});

describe('Отказ старта: 14 прогонов web + 14 прогонов worker-index', () => {
  for (const [label, entry] of [['web', WEB], ['worker-index', WORKER]] as const) {
    for (const name of QUOTA_NAMES) {
      it(`${label} без ${name}: код 1, имя переменной и незащищённый вызов`, () => {
        const env = environment(); delete env[name];
        const result = subprocess(entry, env);
        expect(result.status, result.output).toBe(1);
        expect(result.output).toContain(`${label} не запущен`);
        expect(result.output).toContain(`${name} не задана`);
        expect(result.output).toContain('не ограничен и оплачивается без предела');
      });
    }
    // С фичи quota-and-spend старт включает пробу модели (EmbedProbe / проба ANSWER_MODEL): положительный
    // контроль идёт через подменный шлюз, настоящая сеть не вызывается (tests/probes.test.ts — отказы пробы).
    it(`${label}: положительный контроль — с полной конфигурацией процесс не отказывает`, () => {
      const result = subprocess(['--import', './tests/fixtures/fake-gateway.mjs', ...entry], { ...environment(), FAKE_GATEWAY: 'ok' }, 3000);
      if (label === 'web') expect(result.status, result.output).toBe(0);
      else { expect(result.timedOut, result.output).toBe(true); expect(result.output).toContain('конфигурация принята'); }
    });
    for (const name of ['ANSWER_MODEL', 'EMBED_MODEL', 'OPENROUTER_API_KEY', 'N6_PUBLIC_ORIGIN']) {
      it(`${label} без ${name}: код 1 и имя переменной`, () => {
        const env = environment(); delete env[name];
        const result = subprocess(entry, env);
        expect(result.status, result.output).toBe(1);
        expect(result.output).toContain(name);
      });
    }
  }
});

describe('LoadCeilings: пустое, мусор, ноль — отказ; пары «персональный ≤ общего»', () => {
  for (const name of QUOTA_NAMES) {
    // Сообщение сверяется целиком: «0» у общего предела иначе отвергалось бы попарной проверкой
    // чужой переменной, и тест зеленел бы при сломанной проверке положительности (найдено мутацией).
    it.each(['', ' '])(`${name}=«%s» — пустая строка`, (raw) => {
      expect(() => loadCeilings({ ...environment(), [name]: raw })).toThrow(`${name} пустая строка`);
    });
    it.each(['abc', '0', '-1', '1.5', '1e2', ' 20', '2147483648'])(`${name}=«%s» — непригодна`, (raw) => {
      expect(() => loadCeilings({ ...environment(), [name]: raw })).toThrow(`${name} непригодна`);
    });
  }
  it('таблица пределов индексирована парой (scope, вид предела), 14 ключей', () => {
    const table = loadCeilings(environment());
    expect(Object.keys(table)).toHaveLength(14);
    expect(table['preview_session:create']).toBe(1);
    expect(table['preview_session:answers']).toBe(10);
    expect(table['global_previews:previews']).toBe(200);
    expect(table['global_previews:preview_answers']).toBe(1000);
  });
  it.each(CEILING_PAIRS.map(([a, b]) => [a, b]))('%s выше %s — отказ', (narrow, wide) => {
    const env = environment();
    expect(() => loadCeilings({ ...env, [narrow]: String(Number(env[wide]) + 1) })).toThrow(`${narrow}=`);
  });
});

describe('Модели, origin, секреты', () => {
  it.each([['ANSWER_MODEL', 'anthropic/claude-sonnet-5'], ['ANSWER_MODEL', 'ANTHROPIC/CLAUDE-HAIKU-4.5'],
    ['EMBED_MODEL', 'openai/text-embedding-3-large'], ['EMBED_MODEL', ' openai/text-embedding-3-small']])('%s=%s вне закрытого набора — отказ', (name, value) => {
    expect(() => loadWorkerConfig({ ...environment(), [name]: value })).toThrow(name);
  });
  it.each(['https://sufler.ru/', 'https://sufler.ru/path', 'https://u:p@sufler.ru', 'ftp://sufler.ru', ' https://sufler.ru', 'https://sufler.ru?x=1'])(
    'N6_PUBLIC_ORIGIN «%s» не подчищается — отказ', (origin) => {
      expect(() => loadWebConfig({ ...environment(), N6_PUBLIC_ORIGIN: origin })).toThrow('N6_PUBLIC_ORIGIN');
    });
  it('вне development/test: только https и не петля', () => {
    for (const origin of ['http://sufler.ru', 'https://localhost', 'https://127.0.0.1']) {
      expect(() => loadWebConfig({ ...environment(), NODE_ENV: 'production', N6_PUBLIC_ORIGIN: origin }), origin).toThrow('N6_PUBLIC_ORIGIN');
    }
    expect(loadWebConfig({ ...environment(), NODE_ENV: 'production', N6_PUBLIC_ORIGIN: 'https://sufler.ru' }).publicOrigin).toBe('https://sufler.ru');
  });
  it.each(['DATABASE_URL', 'REDIS_URL', 'SESSION_SECRET'])('%s обязателен у web', (name) => {
    const env = environment(); delete env[name]; expect(() => loadWebConfig(env)).toThrow(`${name} не задана`);
    env[name] = ''; expect(() => loadWebConfig(env)).toThrow(`${name} пустая строка`);
  });
  it('REDIS_URL без пароля и короткий SESSION_SECRET — отказ', () => {
    expect(() => loadWebConfig({ ...environment(), REDIS_URL: 'redis://redis:6379' })).toThrow('REDIS_URL');
    expect(() => loadWebConfig({ ...environment(), SESSION_SECRET: 'short' })).toThrow('SESSION_SECRET');
  });
  it('worker-index не требует секрет сессий web', () => {
    const env = environment(); delete env.SESSION_SECRET;
    expect(loadWorkerConfig(env).role).toBe('worker-index');
  });
});
