// из N5: projects/05-podcast-clips-opus/packages/shared/src/config.ts — required/url/loadConnectionConfig
// перенесены; потолки заменены 14 переменными QUOTA_* канона §7 (LoadCeilings, FR-LIMIT-004), добавлены
// модели из закрытого набора и попарная проверка «персональный ≤ общего»; S3, водяной знак и
// N5_TRUSTED_PROXY_HOPS убраны (у N6 их нет: дверь заменяет XFF одним адресом клиента).
import { ANSWER_MODELS, EMBED_MODELS } from './constants.js';
import { validateSpendPath } from './spend.js';

// Порядок и имена — канон §7 «Перечень переменных (14)»; tests/config.test.ts сверяет этот список
// с каноном, docker-compose.yml (x-quota-env) и .env.example, а не перепечатывает его.
export const QUOTA_NAMES = [
  'QUOTA_VISITOR_ANSWERS', 'QUOTA_IP_ANSWERS', 'QUOTA_BOT_DAY_FREE', 'QUOTA_BOT_DAY_PAID',
  'QUOTA_BOT_MONTH_FREE', 'QUOTA_BOT_MONTH_PAID', 'QUOTA_GLOBAL_ANSWERS', 'QUOTA_PREVIEW_SESSION_CREATE',
  'QUOTA_PREVIEW_SESSION_ANSWERS', 'QUOTA_IP_PREVIEWS', 'QUOTA_GLOBAL_PREVIEWS', 'QUOTA_GLOBAL_PREVIEW_ANSWERS',
  'QUOTA_ACCOUNT_EMBED', 'QUOTA_GLOBAL_EMBED',
] as const;
export type QuotaName = typeof QUOTA_NAMES[number];
export type Environment = Readonly<Record<string, string | undefined>>;

// Пара (scope, вид предела) — ключ таблицы пределов (Pseudocode LoadCeilings п.4). Предел — окружение,
// не колонка quota_counter (ADR-008).
export const CEILING_KEY: Readonly<Record<QuotaName, string>> = {
  QUOTA_VISITOR_ANSWERS: 'visitor_answers',
  QUOTA_IP_ANSWERS: 'ip_answers',
  QUOTA_BOT_DAY_FREE: 'bot_day_answers:free',
  QUOTA_BOT_DAY_PAID: 'bot_day_answers:paid',
  QUOTA_BOT_MONTH_FREE: 'bot_month_answers:free',
  QUOTA_BOT_MONTH_PAID: 'bot_month_answers:paid',
  QUOTA_GLOBAL_ANSWERS: 'global_answers',
  QUOTA_PREVIEW_SESSION_CREATE: 'preview_session:create',
  QUOTA_PREVIEW_SESSION_ANSWERS: 'preview_session:answers',
  QUOTA_IP_PREVIEWS: 'ip_previews',
  QUOTA_GLOBAL_PREVIEWS: 'global_previews:previews',
  QUOTA_GLOBAL_PREVIEW_ANSWERS: 'global_previews:preview_answers',
  QUOTA_ACCOUNT_EMBED: 'account_embed_tokens',
  QUOTA_GLOBAL_EMBED: 'global_embed_tokens',
};
// Какой платный вызов остаётся без предела — это и есть «внешнее последствие» (CFG-S1).
const calls: Readonly<Record<QuotaName, string>> = {
  QUOTA_VISITOR_ANSWERS: 'ответ модели посетителю одной сессии виджета',
  QUOTA_IP_ANSWERS: 'ответ модели посетителям одного префикса IP (смена сессии обходит предел)',
  QUOTA_BOT_DAY_FREE: 'суточные ответы модели бота на плане free',
  QUOTA_BOT_DAY_PAID: 'суточные ответы модели бота на платном плане',
  QUOTA_BOT_MONTH_FREE: 'месячные ответы модели бота на плане free',
  QUOTA_BOT_MONTH_PAID: 'месячные ответы модели бота на платном плане',
  QUOTA_GLOBAL_ANSWERS: 'все ответы модели за сутки (худшие сутки)',
  QUOTA_PREVIEW_SESSION_CREATE: 'создание предпросмотра одним браузером (краулинг и эмбеддинги)',
  QUOTA_PREVIEW_SESSION_ANSWERS: 'ответ модели в предпросмотре одного браузера',
  QUOTA_IP_PREVIEWS: 'создание предпросмотров с одного префикса IP',
  QUOTA_GLOBAL_PREVIEWS: 'все создания предпросмотра за сутки',
  QUOTA_GLOBAL_PREVIEW_ANSWERS: 'все ответы модели в предпросмотрах за сутки',
  QUOTA_ACCOUNT_EMBED: 'эмбеддинги индексации одного аккаунта',
  QUOTA_GLOBAL_EMBED: 'все эмбеддинги индексации и предпросмотра за сутки',
};
// «Персональный ≤ общего»: иначе персональный предел не сработает никогда (model-call-cost п.1).
export const CEILING_PAIRS: ReadonlyArray<readonly [QuotaName, QuotaName]> = [
  ['QUOTA_VISITOR_ANSWERS', 'QUOTA_IP_ANSWERS'],
  ['QUOTA_VISITOR_ANSWERS', 'QUOTA_GLOBAL_ANSWERS'],
  ['QUOTA_PREVIEW_SESSION_ANSWERS', 'QUOTA_GLOBAL_PREVIEW_ANSWERS'],
  ['QUOTA_PREVIEW_SESSION_CREATE', 'QUOTA_IP_PREVIEWS'],
  ['QUOTA_IP_PREVIEWS', 'QUOTA_GLOBAL_PREVIEWS'],
  ['QUOTA_BOT_DAY_FREE', 'QUOTA_BOT_MONTH_FREE'],
  ['QUOTA_BOT_DAY_PAID', 'QUOTA_BOT_MONTH_PAID'],
  ['QUOTA_ACCOUNT_EMBED', 'QUOTA_GLOBAL_EMBED'],
];

export function required(env: Environment, name: string, consequence: string): string {
  const value = env[name];
  if (value === undefined) throw new Error(`${name} не задана: ${consequence}`);
  if (value.trim() === '') throw new Error(`${name} пустая строка: ${consequence}`);
  return value;
}

export type Ceilings = Readonly<Record<string, number>>;
// LoadCeilings (Pseudocode): отсутствие, пустота, не целое, ≤ 0 — отказ старта с именем переменной.
export function loadCeilings(env: Environment): Ceilings {
  const values = {} as Record<QuotaName, number>;
  for (const name of QUOTA_NAMES) {
    const consequence = `без неё вызов «${calls[name]}» не ограничен и оплачивается без предела`;
    const raw = required(env, name, consequence);
    const n = Number(raw);
    if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(n) || n > 2147483647) {
      throw new Error(`${name} непригодна («${raw.slice(0, 20)}»): ${consequence}; нужно положительное целое в диапазоне PostgreSQL int`);
    }
    values[name] = n;
  }
  for (const [narrow, wide] of CEILING_PAIRS) {
    if (values[narrow] > values[wide]) {
      throw new Error(`${narrow}=${values[narrow]} больше ${wide}=${values[wide]}: персональный предел выше общего не связывает ни одного вызова`);
    }
  }
  return Object.freeze(Object.fromEntries(QUOTA_NAMES.map((name) => [CEILING_KEY[name], values[name]])));
}

function url(env: Environment, name: string, protocols: string[], consequence: string): string {
  const value = required(env, name, consequence);
  try {
    const parsed = new URL(value);
    if (value !== value.trim() || /[\r\n\t]/.test(value) || !protocols.includes(parsed.protocol) || !parsed.hostname) throw new Error();
    return value;
  } catch {
    throw new Error(`${name} непригодна: ${consequence}; нужен URL с протоколом ${protocols.join(' или ')}`);
  }
}
export function loadConnectionConfig(env: Environment) {
  const redisUrl = url(env, 'REDIS_URL', ['redis:', 'rediss:'], 'ограничитель частоты и транспорт заданий будут недоступны');
  if (!new URL(redisUrl).password) throw new Error('REDIS_URL непригодна: очередь без пароля не поднимается (docker-ports, класс B)');
  return Object.freeze({
    databaseUrl: url(env, 'DATABASE_URL', ['postgres:', 'postgresql:'], 'сессии и атомарные квоты базы будут недоступны'),
    redisUrl,
  });
}
const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)$/i;
// Без значения по умолчанию (silent-fallbacks): origin определяет ссылку бейджа, демо-страницу,
// приглашения и границу «установка ≠ свой origin».
export function loadPublicOrigin(env: Environment): string {
  const dev = env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
  const consequence = 'он определяет ссылку бейджа, демо-страницу, приглашения и границу «установка ≠ свой origin»; с дефолтом все они вели бы в никуда';
  const value = url(env, 'N6_PUBLIC_ORIGIN', dev ? ['https:', 'http:'] : ['https:'], consequence);
  const parsed = new URL(value);
  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash || value.endsWith('/')) {
    throw new Error(`N6_PUBLIC_ORIGIN непригодна: ${consequence}; нужен origin без пути, завершающего слеша и учётных данных`);
  }
  if (!dev && LOOPBACK.test(parsed.hostname)) {
    throw new Error(`N6_PUBLIC_ORIGIN непригодна: ${consequence}; адрес петли вне development/test запрещён`);
  }
  return parsed.origin;
}
function oneOf(env: Environment, name: string, allowed: readonly string[], consequence: string): string {
  const value = required(env, name, consequence);
  if (!allowed.includes(value)) throw new Error(`${name} непригодна («${value.slice(0, 60)}»): допустимо только ${allowed.join(', ')}`);
  return value;
}
export function loadModelConfig(env: Environment) {
  const apiKey = required(env, 'OPENROUTER_API_KEY', 'ни эмбеддинги, ни ответы невозможны');
  if (/\s/.test(apiKey)) throw new Error('OPENROUTER_API_KEY непригодна: ключ содержит пробельные символы');
  return Object.freeze({
    apiKey,
    answerModel: oneOf(env, 'ANSWER_MODEL', ANSWER_MODELS, 'модель ответов не определена (канон §7)'),
    embedModel: oneOf(env, 'EMBED_MODEL', EMBED_MODELS, 'модель эмбеддингов не определена (канон §7, 1536 измерений)'),
  });
}
// Журнал попыток (NFR-OPS-001): без него платный вызов не выполняется — значит и процесс не стартует.
export function loadSpendLog(env: Environment): string {
  return validateSpendPath(required(env, 'N6_SPEND_LOG', 'без журнала попыток платный вызов нельзя учесть — вызовы не выполняются'));
}
export function loadWebConfig(env: Environment) {
  const ceilings = loadCeilings(env);
  const models = loadModelConfig(env);
  const spendLog = loadSpendLog(env);
  const publicOrigin = loadPublicOrigin(env);
  const connections = loadConnectionConfig(env);
  const sessionSecret = required(env, 'SESSION_SECRET', 'без секрета нельзя защитить хэши сессий и отозвать их ротацией');
  if (Buffer.byteLength(sessionSecret) < 32 || sessionSecret !== sessionSecret.trim()) {
    throw new Error('SESSION_SECRET непригодна: короткий секрет ослабляет защиту сессий; нужно не менее 32 байт без краевых пробелов');
  }
  return Object.freeze({ ...connections, ceilings, models, publicOrigin, sessionSecret, spendLog });
}
export type WebConfig = ReturnType<typeof loadWebConfig>;
// Разделение соответствует compose: worker-index не получает SESSION_SECRET.
export function loadWorkerConfig(env: Environment) {
  const ceilings = loadCeilings(env);
  const models = loadModelConfig(env);
  const publicOrigin = loadPublicOrigin(env);
  const spendLog = loadSpendLog(env);
  return Object.freeze({ ...loadConnectionConfig(env), ceilings, models, publicOrigin, spendLog, role: 'worker-index' as const });
}
export type WorkerConfig = ReturnType<typeof loadWorkerConfig>;
