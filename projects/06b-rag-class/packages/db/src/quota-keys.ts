// Наборы ключей попытки (Pseudocode «Answer question» шаг 2, «Chunk and embed» шаг 4; model-cost-contract.md).
// Единственное место, где пределы превращаются в ключи quota_counter. Порядок ключей ФИКСИРОВАН «частный → общий»:
// одинаковый у всех вызывающих, поэтому взаимной блокировки нет, а горячий общий ключ берётся последним и держится
// короче всего (01_plan.md §3). Меняется порядок только здесь.

import { ConfigError, type ConfigValues } from './boot-config.js';
import type { QuotaKey } from './quota.js';

/** Числа потолков; источник — только Boot config check (закрытый список LIMIT_*, CFG-I8). */
export interface Limits {
  readonly answerVisitorDay: number;
  readonly answerBotDay: number;
  readonly answerGlobalDay: number;
  readonly sandboxAccountDay: number;
  readonly sandboxGlobalDay: number;
  readonly embedTokensAccountDay: number;
  readonly embedTokensGlobalDay: number;
}

/** Имя переменной → поле Limits. Закрытое множество в коде: окружение выбирает число, но не список. */
export const LIMIT_VARIABLES: Readonly<Record<keyof Limits, string>> = {
  answerVisitorDay: 'LIMIT_ANSWER_VISITOR_DAY',
  answerBotDay: 'LIMIT_ANSWER_BOT_DAY',
  answerGlobalDay: 'LIMIT_ANSWER_GLOBAL_DAY',
  sandboxAccountDay: 'LIMIT_SANDBOX_ACCOUNT_DAY',
  sandboxGlobalDay: 'LIMIT_SANDBOX_GLOBAL_DAY',
  embedTokensAccountDay: 'LIMIT_EMBED_TOKENS_ACCOUNT_DAY',
  embedTokensGlobalDay: 'LIMIT_EMBED_TOKENS_GLOBAL_DAY',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VKEY_RE = /^[0-9a-f]{32}$/;
const INT4_MAX = 2_147_483_647;

/**
 * Пределы из уже проверенных значений Boot config check. Отсутствующее или не-число — ConfigError с именем (значение
 * проверки не выполнено), а не «без ограничений». Персональный > общего здесь тоже отказ: вызывающий мог собрать
 * значения в обход checkConfig.
 */
export function limitsFrom(values: ConfigValues): Limits {
  const read = (field: keyof Limits): number => {
    const name = LIMIT_VARIABLES[field];
    const value = values[name];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > INT4_MAX) {
      throw new ConfigError(name, `${name} не прошёл проверку конфигурации: потолок расходов не определён`);
    }
    return value;
  };
  const limits: Limits = {
    answerVisitorDay: read('answerVisitorDay'), answerBotDay: read('answerBotDay'),
    answerGlobalDay: read('answerGlobalDay'), sandboxAccountDay: read('sandboxAccountDay'),
    sandboxGlobalDay: read('sandboxGlobalDay'), embedTokensAccountDay: read('embedTokensAccountDay'),
    embedTokensGlobalDay: read('embedTokensGlobalDay'),
  };
  const pairs: Array<[keyof Limits, keyof Limits]> = [['answerVisitorDay', 'answerBotDay'],
    ['answerBotDay', 'answerGlobalDay'], ['sandboxAccountDay', 'sandboxGlobalDay'],
    ['embedTokensAccountDay', 'embedTokensGlobalDay']];
  for (const [p, t] of pairs) {
    if (limits[p] > limits[t]) {
      throw new ConfigError(LIMIT_VARIABLES[p],
        `${LIMIT_VARIABLES[p]} больше ${LIMIT_VARIABLES[t]}: персональный предел не сработает никогда`);
    }
  }
  return limits;
}

function uuid(value: string, what: string): string {
  if (!UUID_RE.test(value)) throw new Error(`${what} не uuid: ключ предела не построить`);
  return value.toLowerCase();
}

/** Ответ посетителю (виджет, демо): посетитель → бот → все. vkey — visitorKey(): 32 hex. */
export function answerKeys(limits: Limits, visitorKey: string, botId: string): QuotaKey[] {
  if (!VKEY_RE.test(visitorKey)) throw new Error('ключ посетителя непригоден: предел посетителя не построить');
  return [
    { scope: `answer:visitor:${visitorKey}`, limit: limits.answerVisitorDay },
    { scope: `answer:bot:${uuid(botId, 'bot_id')}`, limit: limits.answerBotDay },
    { scope: 'answer:global', limit: limits.answerGlobalDay },
  ];
}

/** Ответ в песочнице: аккаунт → все аккаунты (SC-US-016-4). */
export function sandboxKeys(limits: Limits, accountId: string): QuotaKey[] {
  return [
    { scope: `answer:sandbox:${uuid(accountId, 'account_id')}`, limit: limits.sandboxAccountDay },
    { scope: 'answer:sandbox:global', limit: limits.sandboxGlobalDay },
  ];
}

/** Токены эмбеддингов индексации: аккаунт → все. tokens — оценка ДО вызова, положительное целое. */
export function embedKeys(limits: Limits, accountId: string, tokens: number): QuotaKey[] {
  if (!Number.isSafeInteger(tokens) || tokens < 1 || tokens > INT4_MAX) {
    throw new Error('оценка токенов непригодна: резерв эмбеддингов не построить');
  }
  return [
    { scope: `embed:account:${uuid(accountId, 'account_id')}`, limit: limits.embedTokensAccountDay, n: tokens },
    { scope: 'embed:global', limit: limits.embedTokensGlobalDay, n: tokens },
  ];
}

/** Глобальные ключи — то, что показывает сводка расхода (spendToday). */
export function globalScopes(limits: Limits): QuotaKey[] {
  return [
    { scope: 'answer:global', limit: limits.answerGlobalDay },
    { scope: 'answer:sandbox:global', limit: limits.sandboxGlobalDay },
    { scope: 'embed:global', limit: limits.embedTokensGlobalDay },
  ];
}

/**
 * Закрытый список форм scope. Сброс оператором (reset-quota) принимает ТОЛЬКО один конкретный ключ одной из этих
 * форм — ни шаблонов, ни «всё» (OWN-06B-010).
 */
export const SCOPE_FORMS: readonly RegExp[] = [
  /^answer:visitor:[0-9a-f]{32}$/,
  /^answer:bot:[0-9a-f-]{36}$/,
  /^answer:global$/,
  /^answer:sandbox:[0-9a-f-]{36}$/,
  /^answer:sandbox:global$/,
  /^embed:account:[0-9a-f-]{36}$/,
  /^embed:global$/,
  /^auth:addr:[0-9a-f]{32}:\d{4}-\d{2}-\d{2}T\d{2}$/,
];

export function isKnownScope(scope: string): boolean {
  return SCOPE_FORMS.some((re) => re.test(scope));
}
