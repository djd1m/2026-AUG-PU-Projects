// Boot config check процесса web — закрытый список 13 переменных из Pseudocode → «Boot config check».
// Каждая переменная обязана читаться решением (CFG-I5). Те, чьи решения живут в следующих фичах, перечислены в
// PENDING_DECISIONS с id фичи дорожной карты; страж tests/unit/config-wiring.test.ts требует удалить имя из
// списка, как только решение его читает, и падает, если имя не читает никто и в списке его нет.

import { type ConfigValues, type PairRule, type VarSpec, checkConfig, limitsFrom } from '@n6b/db';

export const WEB_REQUIRED: readonly VarSpec[] = [
  { name: 'OPENROUTER_API_KEY', kind: 'secret', consequence: 'ответы и эмбеддинги вопросов невозможны' },
  { name: 'SESSION_SECRET', kind: 'secret', consequence: 'сессии владельцев не подписать' },
  { name: 'VISITOR_SECRET', kind: 'secret', consequence: 'ключ посетителя и предел входа на адрес не построить' },
  { name: 'PUBLIC_BASE_URL', kind: 'base-url', consequence: 'от него строятся код вставки, ссылка бейджа и origin' },
  { name: 'MIN_SIMILARITY', kind: 'ratio', consequence: 'граница «не знаю» не определена' },
  { name: 'LIMIT_ANSWER_VISITOR_DAY', kind: 'limit', consequence: 'посторонний посетитель выставит счёт' },
  { name: 'LIMIT_ANSWER_BOT_DAY', kind: 'limit', consequence: 'ответы одного бота без суточного предела' },
  { name: 'LIMIT_ANSWER_GLOBAL_DAY', kind: 'limit', consequence: 'ответы без общего суточного потолка' },
  { name: 'LIMIT_SANDBOX_ACCOUNT_DAY', kind: 'limit', consequence: 'песочница аккаунта без предела' },
  { name: 'LIMIT_SANDBOX_GLOBAL_DAY', kind: 'limit', consequence: 'ферма аккаунтов расходует песочницу без потолка' },
  { name: 'LIMIT_EMBED_TOKENS_ACCOUNT_DAY', kind: 'limit', consequence: 'индексация аккаунта без предела токенов' },
  { name: 'LIMIT_EMBED_TOKENS_GLOBAL_DAY', kind: 'limit', consequence: 'индексация без общего потолка токенов' },
  { name: 'LIMIT_AUTH_ADDR_HOUR', kind: 'limit', consequence: 'перебор пароля не ограничен' },
];

/**
 * Не входят в 13 переменных Pseudocode, но без них процесс не может ответить ни на один запрос. Две строки — два
 * пользователя входа (002_rls.sql, 08_review.md F-3): кабинет не может стать n6b_service даже внедрённым SQL.
 */
export const WEB_CONNECTION: readonly VarSpec[] = [
  { name: 'DATABASE_URL_TENANT', kind: 'pg-url', user: 'n6b_app_tenant', consequence: 'кабинет не может обратиться к БД' },
  { name: 'DATABASE_URL_SERVICE', kind: 'pg-url', user: 'n6b_app_service',
    consequence: 'вход, регистрация и пределы попыток не могут обратиться к БД' },
];

export const WEB_PAIRS: readonly PairRule[] = [
  { personal: 'LIMIT_ANSWER_VISITOR_DAY', total: 'LIMIT_ANSWER_BOT_DAY' },
  { personal: 'LIMIT_ANSWER_BOT_DAY', total: 'LIMIT_ANSWER_GLOBAL_DAY' },
  { personal: 'LIMIT_SANDBOX_ACCOUNT_DAY', total: 'LIMIT_SANDBOX_GLOBAL_DAY' },
  { personal: 'LIMIT_EMBED_TOKENS_ACCOUNT_DAY', total: 'LIMIT_EMBED_TOKENS_GLOBAL_DAY' },
];

/** Переменные, проверяемые при старте, чьё решение реализует названная фича дорожной карты. */
export const PENDING_DECISIONS: Readonly<Record<string, string>> = {
};

export interface WebConfig {
  readonly DATABASE_URL_TENANT: string;
  readonly DATABASE_URL_SERVICE: string;
  readonly SESSION_SECRET: string;
  readonly VISITOR_SECRET: string;
  readonly PUBLIC_BASE_URL: string;
  readonly LIMIT_AUTH_ADDR_HOUR: number;
  readonly OPENROUTER_API_KEY: string;
  readonly LIMIT_ANSWER_VISITOR_DAY: number;
  readonly LIMIT_ANSWER_BOT_DAY: number;
  readonly LIMIT_ANSWER_GLOBAL_DAY: number;
  readonly LIMIT_SANDBOX_ACCOUNT_DAY: number;
  readonly LIMIT_SANDBOX_GLOBAL_DAY: number;
  readonly LIMIT_EMBED_TOKENS_ACCOUNT_DAY: number;
  readonly LIMIT_EMBED_TOKENS_GLOBAL_DAY: number;
  readonly MIN_SIMILARITY: number;
  readonly production: boolean;
  readonly all: ConfigValues;
}

export function loadWebConfig(env: Readonly<Record<string, string | undefined>> = process.env): WebConfig {
  const production = env.NODE_ENV === 'production';
  const all = checkConfig(WEB_REQUIRED, WEB_PAIRS, env, production);
  // Вся связка пределов, которую потом разбирает дверь (limitsFrom), — при старте, а не при первом запросе (08_review.md F-3).
  limitsFrom(all);
  const connection = checkConfig(WEB_CONNECTION, [], env, production);
  return {
    DATABASE_URL_TENANT: connection.DATABASE_URL_TENANT as string,
    DATABASE_URL_SERVICE: connection.DATABASE_URL_SERVICE as string,
    SESSION_SECRET: all.SESSION_SECRET as string,
    VISITOR_SECRET: all.VISITOR_SECRET as string,
    PUBLIC_BASE_URL: all.PUBLIC_BASE_URL as string,
    LIMIT_AUTH_ADDR_HOUR: all.LIMIT_AUTH_ADDR_HOUR as number,
    OPENROUTER_API_KEY: all.OPENROUTER_API_KEY as string,
    LIMIT_ANSWER_VISITOR_DAY: all.LIMIT_ANSWER_VISITOR_DAY as number,
    LIMIT_ANSWER_BOT_DAY: all.LIMIT_ANSWER_BOT_DAY as number,
    LIMIT_ANSWER_GLOBAL_DAY: all.LIMIT_ANSWER_GLOBAL_DAY as number,
    LIMIT_SANDBOX_ACCOUNT_DAY: all.LIMIT_SANDBOX_ACCOUNT_DAY as number,
    LIMIT_SANDBOX_GLOBAL_DAY: all.LIMIT_SANDBOX_GLOBAL_DAY as number,
    LIMIT_EMBED_TOKENS_ACCOUNT_DAY: all.LIMIT_EMBED_TOKENS_ACCOUNT_DAY as number,
    LIMIT_EMBED_TOKENS_GLOBAL_DAY: all.LIMIT_EMBED_TOKENS_GLOBAL_DAY as number,
    MIN_SIMILARITY: all.MIN_SIMILARITY as number,
    production,
    all,
  };
}
