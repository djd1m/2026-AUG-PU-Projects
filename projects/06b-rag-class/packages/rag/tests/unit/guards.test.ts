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
const FACTORY = 'packages/rag/src/live.ts';
const RAG_INDEX = 'packages/rag/src/index.ts';

/**
 * S-9: вызов метода порта — только в paid-call.ts и в адаптерах. Ловит `.answer(`, `?.answer?.(`, `['answer'](`,
 * `answer.call(`/`.apply(`/`.bind(` и деструктуризацию `{ embed } =` (08_review.md F-2: четыре обхода валидатора).
 * Деструктуризация `answer` не запрещена: `const { answer } = await attempt.generate(…)` — поле результата, не метод.
 */
export function providerCallViolations(files: Files): string[] {
  const out: string[] = [];
  const call = /(?:\.|\?\.)\s*(?:embed|answer)\s*(?:\?\.)?\s*\(/;
  const bracket = /\[\s*['"`](?:embed|answer)['"`]\s*\]/;
  const indirect = /\b(?:embed|answer)\s*\.\s*(?:call|apply|bind)\s*\(/;
  const destructure = /\{[^{}]*\bembed\b[^{}]*\}\s*=(?![=>])/;
  for (const [file, text] of Object.entries(files)) {
    if (file === PAID_CALL || file.startsWith(PROVIDER_DIR)) continue;
    if (call.test(text) || bracket.test(text) || indirect.test(text) || destructure.test(text)) {
      out.push(`${file}: вызов провайдера вне paid-call.ts`);
    }
  }
  return out;
}

/**
 * S-11 (08_review.md F-2): провайдер недоступен в обход двери по УСТРОЙСТВУ кода. `new OpenRouterProvider(` и
 * `new PaidGateway(` — только в фабрике live.ts; имя OpenRouterProvider — только в адаптере и фабрике (вход пакета его не
 * экспортирует); адрес OpenRouter (литерал или OPENROUTER_BASE) — только в адаптере; `ModelProvider` вне пакета rag не
 * нужен никому. Не видит: провайдер, собранный из `globalThis.fetch` на адрес, склеенный по частям в рантайме.
 */
export function providerConstructionViolations(files: Files): string[] {
  const out: string[] = [];
  // R-2 (spend-ceilings 08_review.md): квалифицированное имя `new R.PaidGateway(` и адаптер по относительному пути
  // (`…/provider/openrouter.js`, затем имя класса, склеенное в рантайме). Путь к адаптеру — только в фабрике и входе пакета.
  const qualifiedNew = /new\s+[\w$.]*\b(?:OpenRouterProvider|PaidGateway)\s*\(/;
  const adapterSpecifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"`][^'"`]*provider\/(?:openrouter|fake)(?:\.[cm]?[jt]s)?['"`]/;
  for (const [file, raw] of Object.entries(files)) {
    const text = stripComments(raw);
    // paid-call.ts строит дверь сам (constructGateway с ключом модуля, index-jobs F-2) — это не вторая дверь.
    if (file !== FACTORY && file !== PAID_CALL && qualifiedNew.test(text)) {
      out.push(`${file}: провайдер или дверь создаются вне фабрики live.ts`);
    }
    if (file !== FACTORY && file !== RAG_INDEX && !file.startsWith(PROVIDER_DIR) && adapterSpecifier.test(text)) {
      out.push(`${file}: адаптер провайдера импортируется по пути вне фабрики и входа пакета`);
    }
    if (file !== FACTORY && file !== LIVE && /\bOpenRouterProvider\b/.test(text)) {
      out.push(`${file}: OpenRouterProvider вне адаптера и фабрики`);
    }
    if (file !== LIVE && /openrouter\.ai|\bOPENROUTER_BASE\b/i.test(text)) out.push(`${file}: адрес провайдера вне адаптера`);
    if (!file.startsWith('packages/rag/src/') && /\bModelProvider\b/.test(text)) {
      out.push(`${file}: тип провайдера вне пакета rag`);
    }
  }
  return out;
}

/**
 * S-12 (spend-ceilings 08_review.md R-1): фабрика живой двери зовётся только в названных местах создания двери, и
 * checkConfig — только в модулях конфигурации процессов. Вместе с isVerifiedConfig это закрывает «вторую дверь с
 * выдуманными пределами»: пределы приходят только из проверенной конфигурации, а проверенную конфигурацию делает только
 * старт процесса. Новое место создания двери (воркер chunk-embed) добавляется в список осознанно.
 */
export const GATEWAY_SITES = ['apps/web/src/server/paid.ts', 'services/worker/src/paid.ts'];
// live.ts проверяет окружение процесса сам (index-jobs F-2): фабрика не принимает конфигурацию извне.
export const CONFIG_SITES = ['packages/db/src/boot-config.ts', 'packages/db/src/ops-cli.ts', 'apps/web/src/server/config.ts',
  'services/worker/src/config.ts', FACTORY];
export function gatewaySiteViolations(files: Files): string[] {
  const out: string[] = [];
  for (const [file, raw] of Object.entries(files)) {
    const text = stripComments(raw);
    if (file !== FACTORY && !GATEWAY_SITES.includes(file) && /\bcreateLiveGateway\s*\(/.test(text)) {
      out.push(`${file}: живая дверь создаётся вне названных мест`);
    }
    if (!CONFIG_SITES.includes(file) && /\bcheckConfig\s*\(/.test(text)) {
      out.push(`${file}: checkConfig вне модулей конфигурации — проверенную конфигурацию можно было бы собрать из выдуманного окружения`);
    }
    if (/\blimits\s*:/.test(text) && /\bcreateLiveGateway\s*\(\s*\{[^}]*\blimits\s*:/.test(text)) {
      out.push(`${file}: пределы переданы фабрике числами, а не конфигурацией`);
    }
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
  // F-1: набор ключей сверяется с обязательным для вида вызова ДО резерва, и отказ — исключение.
  const checked = /const violation = keySetViolation\(kind, keys, this\.#deps\.limits\);\s*if \(violation\) throw [^;]+;\s*const day = /;
  if (!checked.test(text)) out.push('набор ключей не сверяется keySetViolation до резерва');
  if (!/constructor\(key: typeof GATEWAY_KEY, deps: PaidCallDeps\) \{\s*if \(key !== GATEWAY_KEY\) throw [^;]+;\s*assertLimits\(deps\.limits\);/.test(text)) out.push('пределы двери не проверяются при создании');
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
  it('S-11: провайдер и дверь создаются только фабрикой, адрес — только в адаптере', () => {
    expect(files[FACTORY]).toBeDefined();
    expect(providerConstructionViolations(files)).toEqual([]);
  });
  it('S-6: fake не импортируется боевым кодом', () => expect(fakeImportViolations(files)).toEqual([]));
  it('S-12: живая дверь и checkConfig — только в названных местах', () => {
    expect(files['apps/web/src/server/paid.ts']).toBeDefined();
    expect(gatewaySiteViolations(files)).toEqual([]);
  });
  it('S-5/S-7: один fetch, без повторов, исполнитель закреплён константой', () =>
    expect(liveAdapterViolations(files[LIVE]!)).toEqual([]));
  it('S-10: одна реализация инкремента квоты', () => expect(quotaIncrementViolations(files)).toEqual([]));
  it('порядок paid-call: резерв+START одной транзакцией, провайдер вне неё, без возвратов',
    () => expect(paidCallOrderViolations(files[PAID_CALL]!)).toEqual([]));
});

describe('стражи умеют падать (guard-must-be-able-to-fail)', () => {
  it('S-9 ловит вызов порта и четыре обхода валидатора (F-2)', () => {
    const route = 'apps/web/src/app/api/x/route.ts';
    for (const bad of ['await provider.answer(messages, s)', "await provider['answer'](m, s)",
      'const { embed } = p; await embed.call(p, texts, s)', 'const {embed}=p;', 'await provider?.answer?.(m, s)',
      'await p.embed (t, s)', 'const f = p.answer.bind(p)']) {
      expect(providerCallViolations({ [route]: bad }), bad).toHaveLength(1);
    }
    // Чистый случай: поле результата и вызовы попытки двери — не вызов провайдера.
    expect(providerCallViolations({ [route]: 'const { answer, cited_ids } = await attempt.generate(m); '
      + 'await attempt.embedQuestion(q); const x = { embed: 1 }; if (a == { embed } ) {}' })).toEqual([]);
  });
  it('S-11 ловит провайдер и дверь вне фабрики, экспорт адаптера и адрес провайдера (F-2)', () => {
    const route = 'apps/web/src/app/api/x/route.ts';
    for (const bad of ['new OpenRouterProvider(k)?.answer?.(m, s)', 'const gw = new PaidGateway({ pool, provider, limits })',
      "fetch(OPENROUTER_BASE + '/embeddings')", "fetch('https://OpenRouter.ai/api/v1/embeddings')",
      "import { OpenRouterProvider } from '@n6b/rag'", 'const p: ModelProvider = { embed, answer }']) {
      expect(providerConstructionViolations({ [route]: bad }), bad).not.toEqual([]);
    }
    const index = readFileSync(path.join(ROOT, RAG_INDEX), 'utf8');
    expect(providerConstructionViolations({ [RAG_INDEX]: index })).toEqual([]);
    expect(providerConstructionViolations({ [RAG_INDEX]: `${index}\nexport { OpenRouterProvider } from './provider/openrouter.js';` }))
      .not.toEqual([]);
  });
  it('R-2: S-11 ловит квалифицированное имя и адаптер по относительному пути', () => {
    const route = 'apps/web/src/app/api/x/route.ts';
    for (const bad of ["import * as R from '@n6b/rag'; new R.PaidGateway({ provider, limits })",
      'const gw = new rag.default.PaidGateway ({})',
      "import * as M from '../../../../packages/rag/src/provider/openrouter.js'; const P = M['OpenRouter' + 'Provider'];",
      "const M = await import('../../packages/rag/src/provider/openrouter')",
      "import { FakeProvider as F } from '@n6b/rag/src/provider/fake.ts'",
      "import '../../packages/rag/src/provider/openrouter.js'"]) {
      expect(providerConstructionViolations({ [route]: bad }), bad).not.toEqual([]);
    }
    // Порт провайдера по пути — не адаптер: paid-call.ts так и импортирует типы.
    expect(providerConstructionViolations({ [route]: "import type { ChatMessage } from '../provider/port.js'" })).toEqual([]);
  });
  it('S-12 ловит вторую дверь, checkConfig вне конфигурации и пределы числами (R-1)', () => {
    const worker = 'services/worker/src/embed.ts';
    for (const bad of ['const gw = createLiveGateway({ config, pool })',
      "const v = checkConfig(SPEC, [], { LIMIT_ANSWER_GLOBAL_DAY: '2147483647' }, true)"]) {
      expect(gatewaySiteViolations({ [worker]: bad }), bad).not.toEqual([]);
    }
    expect(gatewaySiteViolations({ 'apps/web/src/server/paid.ts': 'createLiveGateway({ limits: { a: 1 }, pool })' }))
      .not.toEqual([]);
    expect(gatewaySiteViolations({ 'apps/web/src/server/paid.ts': 'createLiveGateway({ pool })' })).toEqual([]);
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
  it('порядок paid-call ловит START вне транзакции резерва, снятую сверку набора и пределов', () => {
    const good = readFileSync(path.join(ROOT, PAID_CALL), 'utf8');
    expect(paidCallOrderViolations(good.replace('return startCall(c, kind, owner);', 'return undefined;'))).not.toEqual([]);
    expect(paidCallOrderViolations(good.replace('if (violation) throw', 'if (violation) console.warn'))).not.toEqual([]);
    expect(paidCallOrderViolations(good.replace('assertLimits(deps.limits);', ''))).not.toEqual([]);
  });
});
