// из N4: projects/04-calorie-vision-cal-ai/apps/api/src/quota/keys.ts — переписано: идея «у анонима ДВА
// ключа — сессия и префикс адреса, плюс общий 'all'» и фиксированный порядок ключей взяты; scope, ключи
// и числа — канон N6 §7 (10 scope, 14 переменных, вид предела в scope_key — A-N6-020). Однооператорная
// форма списания донора N4 (check-and-consume.ts) НЕ взята — ADR-008, см. quota.ts.
import { readAccountPlan, moscowDay, moscowMonth, type Ceilings } from '@n6/rag';
import type { QuotaCharge } from './quota.js';

export const GLOBAL_KEY = 'all';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Префикс, выданный ip.ts (/24 или /48). Полный адрес сюда не попадает (152-ФЗ, CHECK session/visitor).
const IP_PREFIX = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.0\/24|[0-9a-f]{1,4}(:[0-9a-f]{1,4}){2}::\/48)$/;
// Сессия браузера предпросмотра: без «:», иначе суффикс вида предела можно было бы подделать.
const BROWSER_SESSION = /^[A-Za-z0-9_-]{16,128}$/;

function uuid(value: string, what: string): string {
  if (!UUID.test(value)) throw new Error(`Ключ квоты «${what}» непригоден: нужен UUID`);
  return value;
}
function prefix(value: string): string {
  if (!IP_PREFIX.test(value)) throw new Error('Ключ квоты «префикс IP» непригоден: нужен префикс /24 или /48');
  return value;
}
function browser(value: string): string {
  if (!BROWSER_SESSION.test(value)) throw new Error('Ключ квоты «сессия браузера» непригоден');
  return value;
}
// Предел — по паре (scope, вид предела) из LoadCeilings; отсутствующий ключ — отказ, не «без предела».
export function ceiling(ceilings: Ceilings, key: string): number {
  const value = ceilings[key];
  if (value === undefined || !Number.isSafeInteger(value) || value <= 0) throw new Error(`Предел ${key} не загружен: вызов не выполняется`);
  return value;
}
// План бота → вид предела. Строгое равенство (ADR-004): 'NOBADGE', ' nobadge', null → free (самое строгое).
export function planTier(plan: unknown): 'free' | 'paid' {
  const read = readAccountPlan(plan);
  return read === 'nobadge' || read === 'studio' ? 'paid' : 'free';
}

// FR-LIMIT-001: ПЯТЬ scope на каждый ответ посетителю виджета или демо-страницы. Порядок — от узкого
// к широкому; одинаков у всех вызывающих.
export function visitorAnswerCharges(ceilings: Ceilings, input: { visitorSession: string; ipPrefix: string; botId: string; plan: unknown; now: Date }): QuotaCharge[] {
  const day = moscowDay(input.now), month = moscowMonth(input.now), tier = planTier(input.plan);
  const bot = uuid(input.botId, 'бот');
  return [
    { scope: 'visitor_answers', scopeKey: uuid(input.visitorSession, 'сессия посетителя'), period: day, n: 1, limit: ceiling(ceilings, 'visitor_answers') },
    { scope: 'ip_answers', scopeKey: prefix(input.ipPrefix), period: day, n: 1, limit: ceiling(ceilings, 'ip_answers') },
    { scope: 'bot_day_answers', scopeKey: bot, period: day, n: 1, limit: ceiling(ceilings, `bot_day_answers:${tier}`) },
    { scope: 'bot_month_answers', scopeKey: bot, period: month, n: 1, limit: ceiling(ceilings, `bot_month_answers:${tier}`) },
    { scope: 'global_answers', scopeKey: GLOBAL_KEY, period: day, n: 1, limit: ceiling(ceilings, 'global_answers') },
  ];
}
// Тестовый чат владельца в кабинете (bot-cabinet, A-N6-033): ТРИ scope — суточный и месячный предел бота по плану
// и общий суточный. Владелец спрашивает своего бота из того же бюджета ответов, что и посетители (FR-TARIFF-003:
// «ответов в сутки на бота»): отдельного scope и переменной нет — канон §7 держит 10 scope и 14 переменных.
export function ownerAnswerCharges(ceilings: Ceilings, input: { botId: string; plan: unknown; now: Date }): QuotaCharge[] {
  const day = moscowDay(input.now), month = moscowMonth(input.now), tier = planTier(input.plan);
  const bot = uuid(input.botId, 'бот');
  return [
    { scope: 'bot_day_answers', scopeKey: bot, period: day, n: 1, limit: ceiling(ceilings, `bot_day_answers:${tier}`) },
    { scope: 'bot_month_answers', scopeKey: bot, period: month, n: 1, limit: ceiling(ceilings, `bot_month_answers:${tier}`) },
    { scope: 'global_answers', scopeKey: GLOBAL_KEY, period: day, n: 1, limit: ceiling(ceilings, 'global_answers') },
  ];
}
// FR-LIMIT-002: создание предпросмотра расходует ТОЛЬКО «:create» — ни одного из 10 ответов (SC-US-002-3).
export function previewCreateCharges(ceilings: Ceilings, input: { browserSession: string; ipPrefix: string; now: Date }): QuotaCharge[] {
  const day = moscowDay(input.now);
  return [
    { scope: 'preview_session', scopeKey: `${browser(input.browserSession)}:create`, period: day, n: 1, limit: ceiling(ceilings, 'preview_session:create') },
    { scope: 'ip_previews', scopeKey: prefix(input.ipPrefix), period: day, n: 1, limit: ceiling(ceilings, 'ip_previews') },
    { scope: 'global_previews', scopeKey: 'previews', period: day, n: 1, limit: ceiling(ceilings, 'global_previews:previews') },
  ];
}
export function previewAnswerCharges(ceilings: Ceilings, input: { browserSession: string; now: Date }): QuotaCharge[] {
  const day = moscowDay(input.now);
  return [
    { scope: 'preview_session', scopeKey: `${browser(input.browserSession)}:answers`, period: day, n: 1, limit: ceiling(ceilings, 'preview_session:answers') },
    { scope: 'global_previews', scopeKey: 'preview_answers', period: day, n: 1, limit: ceiling(ceilings, 'global_previews:preview_answers') },
  ];
}
// FR-LIMIT-003: токены пачки по оценке ДО отправки.
export function indexEmbedCharges(ceilings: Ceilings, input: { accountId: string; tokens: number; now: Date }): QuotaCharge[] {
  const day = moscowDay(input.now);
  return [
    { scope: 'account_embed_tokens', scopeKey: uuid(input.accountId, 'аккаунт'), period: day, n: input.tokens, limit: ceiling(ceilings, 'account_embed_tokens') },
    { scope: 'global_embed_tokens', scopeKey: GLOBAL_KEY, period: day, n: input.tokens, limit: ceiling(ceilings, 'global_embed_tokens') },
  ];
}
// Эмбеддинги предпросмотра: бюджет задачи (index_job.embed_budget, 40 000) проверяет index-job-core;
// здесь — общий суточный global_embed_tokens (канон §7).
export function previewEmbedCharges(ceilings: Ceilings, input: { tokens: number; now: Date }): QuotaCharge[] {
  return [{ scope: 'global_embed_tokens', scopeKey: GLOBAL_KEY, period: moscowDay(input.now), n: input.tokens, limit: ceiling(ceilings, 'global_embed_tokens') }];
}
