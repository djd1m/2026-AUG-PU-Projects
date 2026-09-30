import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Стражи по исходнику (слой 1, 01_plan.md §9): свойства, которые обязаны держаться во ВСЁМ монорепо, а не в одном
// сценарии. Каждый страж — чистая функция над текстами; рядом прогон на заведомо плохом входе (guard-must-be-able-to-fail).

const ROOT = path.resolve(__dirname, '../../../..');
const SOURCE_DIRS = ['apps/web/src', 'apps/widget', 'services/worker/src', 'packages/db/src', 'packages/rag/src'];

type Files = Record<string, string>;

function collect(dir: string, out: Files = {}): Files {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const item of entries) {
    const full = path.join(dir, item);
    if (item === 'node_modules' || item === 'dist' || item === '.next' || item === 'tests') continue;
    if (statSync(full).isDirectory()) collect(full, out);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(item)) out[path.relative(ROOT, full)] = readFileSync(full, 'utf8');
  }
  return out;
}

const sources = (): Files => Object.assign({}, ...SOURCE_DIRS.map((d) => collect(path.join(ROOT, d))));

const PAID_CALL = 'packages/rag/src/paid-call.ts';
const PROVIDER_DIR = 'packages/rag/src/provider/';
const LIVE = 'packages/rag/src/provider/openrouter.ts';

/** S-9: вызов порта (.embed( / .answer() и обращение к openrouter.ai — только в paid-call.ts и в адаптерах. */
export function providerCallViolations(files: Files): string[] {
  const out: string[] = [];
  for (const [file, text] of Object.entries(files)) {
    if (file === PAID_CALL || file.startsWith(PROVIDER_DIR)) continue;
    if (/\.(embed|answer)\s*\(/.test(text)) out.push(`${file}: вызов провайдера вне paid-call.ts`);
    if (/openrouter\.ai/.test(text)) out.push(`${file}: адрес провайдера вне адаптера`);
  }
  return out;
}

/** S-6: адаптер fake не импортируется боевым кодом (вне каталога провайдера) и не экспортируется из пакета. */
export function fakeImportViolations(files: Files): string[] {
  return Object.entries(files).filter(([file, text]) => !file.startsWith(PROVIDER_DIR)
    && /from\s+['"][^'"]*provider\/fake(\.js)?['"]|FakeProvider/.test(text)).map(([file]) => `${file}: fake в боевом коде`);
}

/** Код без комментариев: страж, читающий комментарий, зеленеет на декларации, а не на коде. */
const stripComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** S-5 и S-7: в live ровно один сетевой вызов, нет повторов; маршрутизация — константа, не окружение. */
export function liveAdapterViolations(source: string): string[] {
  const out: string[] = [];
  const text = stripComments(source);
  const fetchCalls = (text.match(/this\.#fetch\(/g) ?? []).length;
  if (fetchCalls !== 1) out.push(`S-5: вызовов fetch ${fetchCalls}, ожидался 1`);
  if (/retry|retries|attempts?\s*[<:=]|for\s*\(|while\s*\(/i.test(text)) out.push('S-5: признак повтора (retry/цикл)');
  if (!/allow_fallbacks:\s*false/.test(text)) out.push('S-7: нет allow_fallbacks: false');
  if (!/order:\s*Object\.freeze\(\['openai'\]\)/.test(text)) out.push("S-7: order не константа ['openai']");
  if (/process\.env/.test(text)) out.push('S-7: адаптер читает окружение');
  if ((text.match(/provider:\s*PROVIDER_ROUTING/g) ?? []).length !== 2) out.push('S-7: provider не в обоих телах');
  return out;
}

/** S-10: одна реализация инкремента квоты — второй «ON CONFLICT (scope, day)» в монорепо запрещён. */
export function quotaIncrementViolations(files: Files): string[] {
  const hits = Object.entries(files).flatMap(([file, text]) =>
    (text.match(/ON CONFLICT \(scope, day\)/g) ?? []).map(() => file));
  return hits.length === 1 && hits[0] === 'packages/db/src/quota.ts' ? [] : [`реализаций инкремента: ${hits.join(', ') || 'нет'}`];
}

/** Порядок paid-call: резерв и START в одной транзакции, провайдер — после её закрытия. */
export function paidCallOrderViolations(text: string): string[] {
  const out: string[] = [];
  const reserve = /await reserveQuota\(c, keys, day\);\s*return startCall\(c, kind, owner\);/;
  if (!reserve.test(text)) out.push('резерв и START не в одной транзакции (reserveQuota → startCall)');
  if (/withService\([^)]*\)[\s\S]{0,200}invoke\(/.test(text.replace(/\/\/.*$/gm, ''))) {
    out.push('вызов провайдера внутри транзакции');
  }
  if (/refund|used\s*-\s*|used = quota_counter\.used -/i.test(text)) out.push('возврат резерва (счёт не по попыткам)');
  return out;
}

describe('стражи по исходнику: боевое дерево чисто', () => {
  const files = sources();

  it('дерево исходников прочитано (страж на пустоте не зеленеет)', () => {
    expect(Object.keys(files).length).toBeGreaterThan(20);
    expect(files[PAID_CALL]).toBeDefined();
    expect(files[LIVE]).toBeDefined();
  });

  it('S-9: провайдер зовётся только из paid-call.ts', () => expect(providerCallViolations(files)).toEqual([]));
  it('S-6: fake не импортируется боевым кодом', () => expect(fakeImportViolations(files)).toEqual([]));
  it('S-5/S-7: один fetch, без повторов, исполнитель закреплён константой', () =>
    expect(liveAdapterViolations(files[LIVE]!)).toEqual([]));
  it('S-10: одна реализация инкремента квоты', () => expect(quotaIncrementViolations(files)).toEqual([]));
  it('порядок paid-call: резерв+START одной транзакцией, провайдер вне неё, без возвратов',
    () => expect(paidCallOrderViolations(files[PAID_CALL]!)).toEqual([]));
});

describe('стражи умеют падать (guard-must-be-able-to-fail)', () => {
  it('S-9 ловит вызов порта и адрес провайдера в маршруте', () => {
    expect(providerCallViolations({ 'apps/web/src/app/api/x/route.ts': 'await provider.answer(messages, s)' })).toHaveLength(1);
    expect(providerCallViolations({ 'services/worker/src/x.ts': "fetch('https://openrouter.ai/api/v1/embeddings')" }))
      .toHaveLength(1);
  });
  it('S-6 ловит импорт fake', () => {
    expect(fakeImportViolations({ 'apps/web/src/server/x.ts': "import { FakeProvider } from '@n6b/rag/src/provider/fake'" }))
      .toHaveLength(1);
  });
  it('S-5/S-7 ловят второй fetch, retry, allow_fallbacks: true и чтение окружения', () => {
    const good = readFileSync(path.join(ROOT, LIVE), 'utf8');
    expect(liveAdapterViolations(good.replace('res = await this.#fetch(', 'res = await this.#fetch(u, i); await this.#fetch(')))
      .not.toEqual([]);
    expect(liveAdapterViolations(good.replace('allow_fallbacks: false', 'allow_fallbacks: true'))).not.toEqual([]);
    expect(liveAdapterViolations(`${good}\nconst retries = 2;`)).not.toEqual([]);
    expect(liveAdapterViolations(good.replace("Object.freeze(['openai'])", 'process.env.ORDER'))).not.toEqual([]);
  });
  it('S-10 ловит вторую копию инкремента', () => {
    expect(quotaIncrementViolations({ 'packages/db/src/quota.ts': 'ON CONFLICT (scope, day)',
      'apps/web/src/server/x.ts': 'ON CONFLICT (scope, day)' })).toHaveLength(1);
  });
  it('порядок paid-call ловит START вне транзакции резерва', () => {
    const good = readFileSync(path.join(ROOT, PAID_CALL), 'utf8');
    expect(paidCallOrderViolations(good.replace('return startCall(c, kind, owner);', 'return undefined;'))).not.toEqual([]);
  });
});
